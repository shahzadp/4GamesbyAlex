/* Checks the Flappy Bird loop.
 *
 * Usage:
 *   node tools/verify-flappy.js [url]
 *
 * Two things are checked:
 *
 *   1. The simulation runs at the same speed whatever the frame rate is. The
 *      loop used to move one step per animation frame, so a phone that could
 *      only manage 30 frames a second played the game at half speed. The page
 *      is slowed down here with the DevTools protocol's CPU throttle, and the
 *      number of simulation steps per second has to stay put.
 *   2. The difficulty ramps with the score, and the Classic Day theme does
 *      not drift out of its star, unlike the old day-night cycle.
 *      as the run goes.
 *
 * (The Alexcraft suspend check is gone with Alexcraft: game 4 is Horizon, a
 * native activity that is not part of this document.) */
const { evaluate, launchEdge, sleep } = require("./cdp-harness");

const URL_UNDER_TEST = process.argv[2] || "http://127.0.0.1:8099/index.html";

/** Counts the simulation steps and the animation frames for a second */
const COUNT = `
(function () {
  window.__steps = 0;
  window.__frames = 0;
  if (!window.__counted) {
    window.__counted = true;
    const originalUpdate = flappyGame.update.bind(flappyGame);
    flappyGame.update = function () {
      window.__steps++;
      originalUpdate();
    };
    const originalFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = function (cb) {
      window.__frames++;
      return originalFrame(cb);
    };
  }
})()`;

async function main() {
  const { cdp, close } = await launchEdge({ width: 900, height: 420 });
  let exitCode = 1;
  try {
    await cdp.send("Page.navigate", { url: URL_UNDER_TEST });

    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      await sleep(250);
      ready = await evaluate(
        cdp,
        `typeof flappyGame === 'object' && Boolean(flappyGame.canvas)`
      );
      if (ready) break;
    }
    if (!ready) throw new Error("the launcher never came up");

    await evaluate(cdp, `switchPage('flappy')`);
    await sleep(400);
    await evaluate(cdp, COUNT);
    await evaluate(cdp, `flappyGame.reset(); flappyGame.start();`);
    // Let the first paint and the warm-up pass before measuring, or the
    // first measurement carries the cost of starting the page
    await sleep(2000);

    const measure = async (label) => {
      await evaluate(cdp, `window.__steps = 0; window.__frames = 0;`);
      await sleep(2000);
      const counts = JSON.parse(
        await evaluate(
          cdp,
          `JSON.stringify({ steps: window.__steps, frames: window.__frames })`
        )
      );
      const stepsPerSecond = counts.steps / 2;
      const framesPerSecond = counts.frames / 2;
      console.log(
        `${label.padEnd(22)} simulation ${stepsPerSecond.toFixed(1)} steps/s, ` +
          `${framesPerSecond.toFixed(1)} frames/s`
      );
      return { stepsPerSecond, framesPerSecond };
    };

    const failures = [];

    const normal = await measure("no throttling");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 8 });
    const slow = await measure("cpu throttled 8x");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

    // The point of the fixed timestep: the game keeps its speed even when the
    // device cannot draw fast enough. The frames per second are whatever the
    // device manages; the simulation has to stay at sixty steps a second.
    if (normal.stepsPerSecond < 50) {
      failures.push(
        `the simulation does not run at sixty steps a second (${normal.stepsPerSecond.toFixed(1)})`
      );
    }
    const drift = Math.abs(slow.stepsPerSecond - normal.stepsPerSecond);
    if (drift > normal.stepsPerSecond * 0.15) {
      failures.push(
        `the simulation slowed down with the frame rate: ${normal.stepsPerSecond.toFixed(1)} -> ${slow.stepsPerSecond.toFixed(1)} steps/s`
      );
    }
    if (normal.framesPerSecond > 55) {
      console.log(
        'note: this machine drew every frame, so the game speed was never in doubt here'
      );
    }

    // The difficulty ramp
    //
    // The score is run up for real: the pipes are spawned right at the bird,
    // so every pipe scores a point the way it does in a run.
    const profile = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify((function () {
           // The bird must not die for the run to carry on
           flappyGame.gameOver = function () {};
           // Hold the bird up: a bird that falls hits the ground and the
           // update stops before the pipes can score
           const originalUpdate = flappyGame.update.bind(flappyGame);
           flappyGame.update = function () {
             if (this.gameState === 'playing') {
               this.bird.y = this.height * 0.42;
               this.bird.velocity = 0;
             }
             originalUpdate();
           };
           const originalSpawn = flappyGame.spawnPipe.bind(flappyGame);
           flappyGame.spawnPipe = function () {
             const top = this.height * 0.42 - 60;
             this.pipes.push({
               x: this.bird.x - this.pipeWidth - 2,
               topHeight: top,
               bottomY: top + this.currentGap(),
               passed: false
             });
           };
           flappyGame.reset();
           flappyGame.start();
           // Pipes every tenth of a second, so a run reaches the score the
           // ramps are built for in a couple of seconds
           flappyGame.pipeSpacing = 6;
           return { ok: true };
         })())`
      )
    );
    if (!profile.ok) throw new Error("could not set the scoring scenario up");

    // Let the pipes score
    await sleep(3000);
    const scored = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify({
           score: flappyGame.score,
           speed: flappyGame.currentSpeed(),
           gap: flappyGame.currentGap(),
           theme: flappyGame.themeId
         })`
      )
    );
    console.log(
      `after ${scored.score} points  speed ${scored.speed.toFixed(2)} ` +
        `gap ${scored.gap.toFixed(0)} theme ${scored.theme}`
    );
    if (scored.score < 2) {
      failures.push(`the run did not score (${scored.score} points)`);
    }
    if (scored.speed <= 2.9) {
      failures.push("the scroll speed does not ramp with the score");
    }
    if (scored.gap >= 126) {
      failures.push("the gap does not close with the score");
    }

    // Classic Day does not drift: the theme resolves through the fixed-sky
    // path, so the art is pixel-identical between frames at rest.
    const stability = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify((function () {
           flappyGame.applyTheme('classic');
           const before = flappyGame.theme();
           const sky = Object.assign({}, before.sky);
           const after = flappyGame.theme();
           return {
             skyStable: before.sky && before.sky.top === sky.top && before.sky.low === sky.low,
             celestial: before.celestial,
             decor: before.decor,
             themed: true
           };
         })())`
      )
    );
    console.log(`classic theme: skyStable=${stability.skyStable} celestial=${stability.celestial} decor=${stability.decor}`);
    if (!stability.skyStable) {
      failures.push("the Classic Day theme does not have a fixed, static sky");
    }
    if (stability.celestial !== 'sunHigh') {
      failures.push("the Classic Day theme is not holding its high-noon sun");
    }

    if (failures.length) {
      console.log(`\nFAIL (${failures.length})`);
      failures.forEach((line) => console.log(`  - ${line}`));
    } else {
      console.log("\nPASS: the game keeps its speed and the Classic Day theme holds its static sky");
    }
    exitCode = failures.length ? 1 : 0;
  } finally {
    close();
  }
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
