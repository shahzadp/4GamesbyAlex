/* Takes pictures of the sun and the moon on their own, so the way they sit in
 * the sky can be looked at instead of guessed at.
 *
 * The body is placed at the same spot in every run, so two builds can be
 * compared pixel by pixel with tools/compare-shots.js.
 *
 * Usage: node tools/shot-celestial.js [url] [outDir]
 */
const fs = require("fs");
const path = require("path");
const { evaluate, launchEdge, sleep } = require("./cdp-harness");

const URL_UNDER_TEST =
  process.argv[2] || "http://127.0.0.1:8099/index.html";
const OUT =
  process.argv[3] || path.join(__dirname, "..", "build", "celestial-shots");

/** The times of day the body is looked at */
const PHASES = [
  ["dawn", 0.2],
  ["noon", 0.42],
  ["dusk", 0.66],
  ["night", 0.85],
];

/** How much of the sky around the body is kept */
const CROP = 150;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { cdp, close } = await launchEdge({ width: 400, height: 860 });
  try {
    await cdp.send("Page.navigate", { url: URL_UNDER_TEST });
    let ready = false;
    for (let attempt = 0; attempt < 80 && !ready; attempt++) {
      await sleep(250);
      ready = await evaluate(
        cdp,
        `typeof flappyGame === 'object' && Boolean(flappyGame.canvas)`
      );
    }
    if (!ready) throw new Error("the flappy game never came up");

    await evaluate(cdp, `switchPage('flappy')`);
    await sleep(600);
    await evaluate(
      cdp,
      `(function () {
         flappyGame.pause();
         flappyGame.start();
         flappyGame.hideOverlay('flappy-start-screen');
         flappyGame.hideOverlay('flappy-gameover-screen');
       })()`
    );
    await sleep(250);

    // A headless browser enters real fullscreen and leaves it again at a
    // moment of its own choosing, which moves the canvas around. The layout
    // of the phone is put on by hand instead, so two runs are laid out the
    // same way and can be compared.
    const layout = JSON.parse(
      await evaluate(
        cdp,
        `(function () {
           document.getElementById('stage-flappy').classList.add('fullscreen-active');
           document.body.classList.add('android-fullscreen');
           flappyGame.resize();
           const box = flappyGame.canvas.getBoundingClientRect();
           return JSON.stringify({
             world: [flappyGame.width, flappyGame.height],
             canvas: [Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height)]
           });
         })()`
      )
    );
    console.log(
      `layout          world ${layout.world.join("x")}, canvas ${layout.canvas.join(",")}`
    );
    await sleep(250);

    for (const [name, phase] of PHASES) {
      const info = JSON.parse(
        await evaluate(
          cdp,
          `(function () {
             flappyGame.dayPhase = ${phase};
             flappyGame.bird.y = flappyGame.height * 0.55;
             flappyGame.prevBirdY = flappyGame.bird.y;
             flappyGame.pipes = [];
             flappyGame.draw();

             const p = flappyGame.dayPhase;
             let t;
             let sun = true;
             if (p >= 0.18 && p < 0.70) {
               t = (p - 0.18) / 0.52;
             } else {
               sun = false;
               t = (p - 0.70) / 0.48;
               if (t < 0) t += 1;
             }
             const groundY = flappyGame.height - flappyGame.groundHeight;
             const x = t * flappyGame.width;
             const y = groundY * 0.6 - Math.sin(t * Math.PI) * groundY * 0.44;
             const box = flappyGame.canvas.getBoundingClientRect();
             const scale = box.width / flappyGame.width;
             return JSON.stringify({
               sun: sun,
               x: box.left + x * scale,
               y: box.top + y * scale
             });
           })()`
        )
      );
      await sleep(200);

      const clip = {
        x: Math.max(0, Math.round(info.x - CROP)),
        y: Math.max(0, Math.round(info.y - CROP)),
        width: CROP * 2,
        height: CROP * 2,
        scale: 1,
      };
      const shot = await cdp.send("Page.captureScreenshot", {
        format: "png",
        clip,
      });
      const file = path.join(OUT, `${name}.png`);
      fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
      console.log(
        `${name.padEnd(6)} phase ${phase}  ${info.sun ? "sun" : "moon"} at ` +
          `${Math.round(info.x)},${Math.round(info.y)}  ${file}`
      );
    }
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
