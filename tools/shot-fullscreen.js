/* Takes a picture of the game in fullscreen on a phone shaped screen, so the
 * layout can be looked at rather than guessed at.
 *
 * Usage: node tools/shot-fullscreen.js [url] [width] [height]
 */
const fs = require("fs");
const path = require("path");
const { evaluate, launchEdge, sleep } = require("./cdp-harness");

const URL_UNDER_TEST = process.argv[2] || "http://127.0.0.1:8099/index.html";
const WIDTH = parseInt(process.argv[3] || "400", 10);
const HEIGHT = parseInt(process.argv[4] || "860", 10);
const OUT = path.join(__dirname, "..", "build", "flappy-shots");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { cdp, close } = await launchEdge({ width: WIDTH, height: HEIGHT });
  try {
    await cdp.send("Page.navigate", { url: URL_UNDER_TEST });
    for (let attempt = 0; attempt < 80; attempt++) {
      await sleep(250);
      const ready = await evaluate(
        cdp,
        `typeof flappyGame === 'object' && Boolean(flappyGame.canvas)`
      );
      if (ready) break;
    }

    await evaluate(cdp, `switchPage('flappy')`);
    await sleep(700);
    // Put a couple of pipes on the screen so there is something to look at
    await evaluate(
      cdp,
      `(function () {
         flappyGame.pause();
         flappyGame.start();
         flappyGame.hideOverlay('flappy-start-screen');
         flappyGame.hideOverlay('flappy-gameover-screen');
         flappyGame.dayPhase = 0.42;
         flappyGame.bird.y = flappyGame.height * 0.42;
         flappyGame.prevBirdY = flappyGame.bird.y;
         flappyGame.bird.wingAngle = 0.3;
         flappyGame.pipes = [
           { x: 120, topHeight: 120, bottomY: 120 + flappyGame.currentGap(), passed: false, prevX: 120 },
           { x: 250, topHeight: 210, bottomY: 210 + flappyGame.currentGap(), passed: false, prevX: 250 }
         ];
         flappyGame.draw();
       })()`
    );
    await sleep(300);

    // A browser cannot be shown fullscreen in a picture, and on Android the
    // fullscreen is the native one with the system bars hidden. The layout
    // of that is made here by hand: the class on the stage and the class on
    // the body are what the phone gets.
    await evaluate(
      cdp,
      `(function () {
         document.getElementById('stage-flappy').classList.add('fullscreen-active');
         document.body.classList.add('android-fullscreen');
         flappyGame.resize();
       })()`
    );
    await sleep(300);

    const layout = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify((function () {
           const stage = document.getElementById('stage-flappy');
           const cabinet = stage.querySelector('.arcade-cabinet');
           const canvas = flappyGame.canvas;
           const r = stage.getBoundingClientRect();
           const c = cabinet.getBoundingClientRect();
           const v = canvas.getBoundingClientRect();
           return {
             stage: [Math.round(r.width), Math.round(r.height)],
             cabinet: [Math.round(c.width), Math.round(c.height)],
             canvasBox: [Math.round(v.width), Math.round(v.height)],
             backing: [canvas.width, canvas.height],
             world: [flappyGame.width, flappyGame.height],
             viewport: [window.innerWidth, window.innerHeight]
           };
         })())`
      )
    );
    console.log(JSON.stringify(layout));

    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    const file = path.join(OUT, `fullscreen-${WIDTH}x${HEIGHT}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
    console.log(`picture         ${file}`);
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
