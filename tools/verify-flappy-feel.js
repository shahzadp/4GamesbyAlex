/* Measures how Flappy Bird feels and how much work a frame costs.
 *
 * Usage:
 *   node tools/verify-flappy-feel.js [url]
 *
 * Four things are checked:
 *
 *   1. The height of a jump. The bird used to leap most of the way up the
 *      screen, which made every tap an overshoot; a short hop is easier to
 *      place.
 *   2. How fast the bird falls. Without a limit on the fall a single late
 *      tap was the end of the run, because the bird dropped out of the
 *      screen before the player could tap again.
 *   3. How forgiving the hitbox is. The bird is drawn with a radius of
 *      fourteen pixels, but the box it is hit with is smaller than that.
 *   4. How much drawing a frame costs. The number of paint calls per frame
 *      is counted, and the frames per second are measured, so the cost of
 *      the day-night sky can be compared before and after.
 */
const fs = require("fs");
const path = require("path");
const { evaluate, launchEdge, sleep } = require("./cdp-harness");

const URL_UNDER_TEST = process.argv[2] || "http://127.0.0.1:8099/index.html";
const SHOT_DIR = path.join(__dirname, "..", "build", "flappy-shots");

/** Counts the paint calls of the canvas and the frames that go by */
const INSTRUMENT = `
(function () {
  const ctx = flappyGame.ctx;
  window.__paint = 0;
  window.__path = 0;
  window.__frames = 0;
  if (!window.__instrumented) {
    window.__instrumented = true;
    ['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'drawImage',
     'createLinearGradient'].forEach(name => {
      const original = ctx[name].bind(ctx);
      ctx[name] = function () {
        window.__paint++;
        return original.apply(null, arguments);
      };
    });
    ['beginPath', 'moveTo', 'lineTo', 'arc', 'rect', 'translate', 'rotate']
      .forEach(name => {
        const original = ctx[name].bind(ctx);
        ctx[name] = function () {
          window.__path++;
          return original.apply(null, arguments);
        };
      });
    const originalFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = function (cb) {
      window.__frames++;
      return originalFrame(cb);
    };
  }
})()`;

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
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
    await sleep(600);
    await evaluate(cdp, INSTRUMENT);

    const failures = [];

    // ---- The jump --------------------------------------------------------
    // The simulation is stepped by hand, so the measurement does not depend
    // on how fast the machine happens to be.
    const jump = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify((function () {
           flappyGame.pause();
           flappyGame.reset();
           flappyGame.start();
           const y0 = flappyGame.bird.y;
           flappyGame.jump();
           let peak = y0;
           let steps = 0;
           // The bird rises while its velocity is negative and falls again
           // once it turns, so the peak is the moment it turns.
           while (steps < 400) {
             flappyGame.update();
             steps++;
             if (flappyGame.bird.y < peak) peak = flappyGame.bird.y;
             if (flappyGame.bird.velocity >= 0) break;
           }
           return {
             height: y0 - peak,
             steps: steps,
             gravity: flappyGame.bird.gravity,
             jumpPower: flappyGame.bird.jumpPower
           };
         })())`
      )
    );
    console.log(
      `jump            ${jump.height.toFixed(1)}px up, ${jump.steps} steps ` +
        `(${(jump.steps / 60).toFixed(2)}s)  gravity ${jump.gravity} ` +
        `power ${jump.jumpPower}`
    );

    // ---- The fall --------------------------------------------------------
    const fall = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify((function () {
           flappyGame.pause();
           flappyGame.reset();
           flappyGame.start();
           let fastest = 0;
           let steps = 0;
           while (steps < 200) {
             flappyGame.update();
             steps++;
             if (flappyGame.bird.velocity > fastest) {
               fastest = flappyGame.bird.velocity;
             }
             if (flappyGame.gameState !== 'playing') break;
           }
           return {
             fastest: fastest,
             limit: flappyGame.bird.maxFallSpeed || 0,
             steps: steps
           };
         })())`
      )
    );
    console.log(
      `fall            fastest ${fall.fastest.toFixed(2)} px/step ` +
        `(${(fall.fastest * 60).toFixed(0)} px/s), limit ${fall.limit}`
    );

    // ---- The hitbox ------------------------------------------------------
    const hitbox = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify({
           radius: flappyGame.bird.radius,
           inset: flappyGame.bird.hitInset
         })`
      )
    );
    console.log(
      `hitbox          radius ${hitbox.radius}, inset ${hitbox.inset} ` +
        `(box ${hitbox.radius * 2 - hitbox.inset * 2}px)`
    );

    // ---- The frame is drawn between two steps ----------------------------
    // The bird has to be drawn where it is between the last two steps of the
    // game, or it jumps from one place to the next every time a frame is
    // late. An older build has no such step and is simply skipped.
    const hasStep = await evaluate(cdp, `typeof FLAPPY_STEP === 'number'`);
    if (!hasStep) {
      console.log("between steps   this build does not draw between steps");
    } else {
      const between = JSON.parse(
        await evaluate(
          cdp,
          `JSON.stringify((function () {
             flappyGame.pause();
             flappyGame.reset();
             flappyGame.start();
             flappyGame.update();
             // Half a step past the last one
             flappyGame.accumulator = FLAPPY_STEP * 0.5;
             let drawn = null;
             const ctx = flappyGame.ctx;
             const original = ctx.translate.bind(ctx);
             ctx.translate = function (x, y) {
               if (y > 1) drawn = y;
               return original(x, y);
             };
             flappyGame.draw();
             ctx.translate = original;
             return {
               prev: flappyGame.prevBirdY,
               current: flappyGame.bird.y,
               drawn: drawn
             };
           })())`
        )
      );
      const halfway = between.prev + (between.current - between.prev) * 0.5;
      console.log(
        `between steps   step ${between.prev.toFixed(2)} -> ` +
          `${between.current.toFixed(2)}, drawn ${between.drawn.toFixed(2)} ` +
          `(halfway ${halfway.toFixed(2)})`
      );
      if (between.drawn === null) {
        failures.push("the bird was not drawn at all");
      } else if (Math.abs(between.drawn - halfway) > 0.01) {
        failures.push(
          `the bird is drawn on the step and not between two steps (${between.drawn.toFixed(2)})`
        );
      }
    }

    // ---- The cost of a frame ---------------------------------------------
    await evaluate(
      cdp,
      `flappyGame.reset(); flappyGame.start(); flappyGame.pause();`
    );
    await evaluate(cdp, `flappyGame.resume();`);
    await sleep(500);
    await evaluate(cdp, `window.__paint = 0; window.__path = 0; window.__frames = 0;`);
    await sleep(2000);
    const cost = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify({
           paint: window.__paint,
           path: window.__path,
           frames: window.__frames
         })`
      )
    );
    const frames = Math.max(1, cost.frames);
    console.log(
      `frame cost      ${(cost.paint / frames).toFixed(1)} paint calls and ` +
        `${(cost.path / frames).toFixed(1)} path commands per frame ` +
        `(${cost.frames} frames in 2s)`
    );

    // ---- The pictures ----------------------------------------------------
    // The pictures are the proof that the art still looks the way it
    // should. The scene is laid out by hand and the clock is held still,
    // so two builds can be compared picture for picture.
    for (const phase of [0.16, 0.42, 0.93]) {
      const scene = await evaluate(
        cdp,
        `(function () {
         flappyGame.pause();
         flappyGame.reset();
         flappyGame.start();
         flappyGame.hideOverlay('flappy-start-screen');
         flappyGame.hideOverlay('flappy-gameover-screen');
         flappyGame.dayPhase = ${phase};
         flappyGame.bird.y = flappyGame.height * 0.42;
         // The bird is drawn between two steps, so the place it was at
         // before the last step is put where it is now: the picture is then
         // the same in every build
         flappyGame.prevBirdY = flappyGame.bird.y;
         flappyGame.prevBirdRotation = flappyGame.bird.rotation;
         // The wing flaps with the clock, so it is held still for the
         // picture: the two builds can then be compared exactly
         flappyGame.bird.wingAngle = 0.3;
         // The clouds drift with the game, so they are put back where they
         // start
         flappyGame.clouds = [
           { x: 30, y: 50, scale: 1 },
           { x: 190, y: 110, scale: 0.75 },
           { x: 290, y: 70, scale: 0.9 }
         ];
         flappyGame.pipes = [
           { x: 120, topHeight: 120, bottomY: 120 + flappyGame.currentGap(), passed: false, prevX: 120 },
           { x: 250, topHeight: 210, bottomY: 210 + flappyGame.currentGap(), passed: false, prevX: 250 }
         ];
         // The stars twinkle with the clock, so the clock is held still for
         // the picture
         const realNow = performance.now.bind(performance);
         try {
           performance.now = () => 12345.5;
           flappyGame.draw();
         } catch (e) {
           performance.now = realNow;
           return { error: String(e) };
         }
         performance.now = realNow;
         return { ok: true };
         })()`
      );
      if (scene && scene.error) {
        failures.push(`the scene could not be drawn (${scene.error})`);
        break;
      }
      await sleep(150);
      const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
      const file = path.join(SHOT_DIR, `flappy-${String(phase).replace(".", "-")}.png`);
      fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
      console.log(`picture         ${file}`);
    }

    if (failures.length) {
      console.log(`\nFAIL (${failures.length})`);
      failures.forEach((line) => console.log(`  - ${line}`));
    } else {
      console.log("\nPASS: the measurements were taken");
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
