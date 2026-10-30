/* Checks that a game takes the whole screen on its own and that the hard
 * mode is gone.
 *
 * Usage:
 *   node tools/verify-fullscreen.js [url]
 *
 * Three things are checked:
 *
 *   1. There is no fullscreen button left under the game. The game takes
 *      the screen on its own, so a button to turn that on would be in the
 *      way.
 *   2. Opening the game puts it in fullscreen on its own, and leaving it
 *      gives the screen back.
 *   3. There is no hard mode any more: no button, no second set of
 *      numbers, and the game plays the same whatever is asked of it.
 */
const { evaluate, launchEdge, sleep } = require("./cdp-harness");

const URL_UNDER_TEST = process.argv[2] || "http://127.0.0.1:8099/index.html";

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

    const failures = [];

    // ---- No button, no hard mode -----------------------------------------
    const dom = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify({
           fullscreenButtons: document.querySelectorAll('.btn-fullscreen').length,
           hardcoreButtons: document.querySelectorAll('.btn-hardcore').length,
           modeBadges: document.querySelectorAll('.flappy-mode-badge').length,
           flappyButtons: document.querySelectorAll('#stage-flappy button').length
         })`
      )
    );
    console.log(
      `buttons         fullscreen ${dom.fullscreenButtons}, hardcore ` +
        `${dom.hardcoreButtons}, mode badge ${dom.modeBadges}, ` +
        `left on the game ${dom.flappyButtons}`
    );
    if (dom.fullscreenButtons > 0) {
      failures.push("there is still a fullscreen button under the game");
    }
    if (dom.hardcoreButtons > 0) {
      failures.push("there is still a hard mode button");
    }
    if (dom.modeBadges > 0) {
      failures.push("there is still a mode badge on the start screen");
    }

    // ---- The game takes the screen on its own -----------------------------
    // A tap on the card is what the player does to get into the game, and
    // that is also the gesture the browser needs before it will go
    // fullscreen.
    const opened = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify((function () {
           switchPage('flappy');
           const stage = document.getElementById('stage-flappy');
           return {
             classOn: stage.classList.contains('fullscreen-active'),
             androidClass: document.body.classList.contains('android-fullscreen'),
             fixed: getComputedStyle(stage).position
           };
         })())`
      )
    );
    console.log(
      `opened          fullscreen-active ${opened.classOn}, ` +
        `android-fullscreen ${opened.androidClass}, position ${opened.fixed}`
    );
    if (!opened.classOn) {
      failures.push("the game did not take the whole screen when it was opened");
    }
    if (opened.fixed !== "fixed") {
      failures.push(`the game is not laid out over the screen (${opened.fixed})`);
    }

    // The canvas has to be measured again for the new size, or the game is
    // drawn in a corner of the screen.
    await sleep(400);
    const sized = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify({
           canvasWidth: flappyGame.canvas.width,
           stageWidth: document.getElementById('stage-flappy').getBoundingClientRect().width,
           cssWidth: flappyGame.width
         })`
      )
    );
    console.log(
      `sized           canvas ${sized.canvasWidth}px on a stage of ` +
        `${Math.round(sized.stageWidth)}px (game ${sized.cssWidth}px wide)`
    );
    if (sized.canvasWidth < sized.stageWidth * 1.5) {
      failures.push("the canvas was not measured for the size of the screen");
    }

    // ---- The game has to be playable in any shape ------------------------
    // A phone held sideways gives a wide and short space. The game has to
    // keep a play area that is taller than the gap between the pipes, or
    // the pipes have nowhere to go.
    const shapes = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify((function () {
           const results = [];
           const stage = document.getElementById('stage-flappy');
           const cabinet = stage.querySelector('.arcade-cabinet');
           const canvas = flappyGame.canvas;
           // The stage as it looks in fullscreen
           stage.classList.add('fullscreen-active');
           document.body.classList.add('android-fullscreen');
           for (const size of [[360, 780], [780, 360], [360, 520], [900, 420]]) {
             stage.style.width = size[0] + 'px';
             stage.style.height = size[1] + 'px';
             cabinet.style.width = size[0] + 'px';
             cabinet.style.height = size[1] + 'px';
             cabinet.style.maxWidth = 'none';
             flappyGame.resize();
             const gap = flappyGame.currentGap();
             const ground = flappyGame.groundHeight;
             const box = canvas.getBoundingClientRect();
             const scale = Math.min(box.width / flappyGame.width,
                                    box.height / flappyGame.height);
             results.push({
               size: size.join('x'),
               world: flappyGame.width + 'x' + flappyGame.height,
               canvas: canvas.width + 'x' + canvas.height,
               // The drawing has to fill the backing store exactly, or a
               // strip of empty canvas is left at the edge
               fills: Math.abs(canvas.width - flappyGame.width * scale * 2) < 2 &&
                      Math.abs(canvas.height - flappyGame.height * scale * 2) < 2,
               // The room a pipe has above the gap: without fifty pixels
               // of it the pipes cannot be placed at all
               pipeRoom: flappyGame.height - ground - gap - 100,
               gap: gap
             });
           }
           stage.style.width = '';
           stage.style.height = '';
           cabinet.style.width = '';
           cabinet.style.height = '';
           cabinet.style.maxWidth = '';
           stage.classList.remove('fullscreen-active');
           document.body.classList.remove('android-fullscreen');
           flappyGame.resize();
           return results;
         })())`
      )
    );
    shapes.forEach((shape) => {
      console.log(
        `shape           ${shape.size} -> world ${shape.world}, canvas ` +
          `${shape.canvas}, room for the pipes ${shape.pipeRoom} ` +
          `(gap ${shape.gap})`
      );
      if (shape.pipeRoom < 0) {
        failures.push(
          `the pipes do not fit on a ${shape.size} screen (${shape.pipeRoom} short)`
        );
      }
      if (!shape.fills) {
        failures.push(`the drawing does not fill the canvas on a ${shape.size} screen`);
      }
    });

    // ---- Leaving gives the screen back ------------------------------------
    const left = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify((function () {
           switchPage('main');
           const stage = document.getElementById('stage-flappy');
           return {
             classOn: stage.classList.contains('fullscreen-active'),
             androidClass: document.body.classList.contains('android-fullscreen'),
             position: getComputedStyle(stage).position
           };
         })())`
      )
    );
    console.log(
      `left            fullscreen-active ${left.classOn}, ` +
        `android-fullscreen ${left.androidClass}, position ${left.position}`
    );
    if (left.classOn) {
      failures.push("the game kept the whole screen after it was left");
    }
    if (left.androidClass) {
      failures.push("the launcher kept the fullscreen class after the game was left");
    }

    // ---- One game, one set of numbers -------------------------------------
    const difficulty = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify({
           profiles: flappyGame.DIFFICULTY ? Object.keys(flappyGame.DIFFICULTY) : null,
           hasHardcore: typeof flappyGame.hardcore !== 'undefined',
           toggle: typeof flappyGame.toggleHardcore,
           baseSpeed: flappyGame.baseSpeed,
           baseGap: flappyGame.baseGap,
           speedAtZero: flappyGame.currentSpeed(),
           gapAtZero: flappyGame.currentGap()
         })`
      )
    );
    console.log(
      `difficulty      profiles ${difficulty.profiles ? difficulty.profiles.join(',') : 'none'}, ` +
        `hardcore ${difficulty.hasHardcore}, speed ${difficulty.speedAtZero.toFixed(2)}, ` +
        `gap ${difficulty.gapAtZero.toFixed(0)}`
    );
    if (difficulty.profiles && difficulty.profiles.length > 1) {
      failures.push(`there is still more than one difficulty (${difficulty.profiles.join(',')})`);
    }
    if (difficulty.hasHardcore) {
      failures.push("the game still has a hard mode");
    }
    if (difficulty.toggle !== "undefined") {
      failures.push("the game still has a switch for the hard mode");
    }

    // The ramp has to still be there: one mode does not mean one setting.
    const ramped = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify((function () {
           flappyGame.score = 0;
           const slow = flappyGame.currentSpeed();
           const wide = flappyGame.currentGap();
           flappyGame.score = 30;
           const fast = flappyGame.currentSpeed();
           const narrow = flappyGame.currentGap();
           flappyGame.score = 0;
           return { slow: slow, fast: fast, wide: wide, narrow: narrow };
         })())`
      )
    );
    console.log(
      `ramp            speed ${ramped.slow.toFixed(2)} -> ${ramped.fast.toFixed(2)}, ` +
        `gap ${ramped.wide.toFixed(0)} -> ${ramped.narrow.toFixed(0)}`
    );
    if (ramped.fast <= ramped.slow) {
      failures.push("the game does not get faster with the score");
    }
    if (ramped.narrow >= ramped.wide) {
      failures.push("the gap does not close with the score");
    }

    if (failures.length) {
      console.log(`\nFAIL (${failures.length})`);
      failures.forEach((line) => console.log(`  - ${line}`));
    } else {
      console.log("\nPASS: the game takes the screen on its own and the hard mode is gone");
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
