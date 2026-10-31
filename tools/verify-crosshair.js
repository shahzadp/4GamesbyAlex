/* Measures the crosshair in a running game and saves a picture of it.
 *
 * Usage:
 *   node tools/verify-crosshair.js [url]
 */
const fs = require("fs");
const path = require("path");
const { evaluate, launchEdge, sleep } = require("./cdp-harness");

const URL_UNDER_TEST =
  process.argv[2] || "http://127.0.0.1:5173/index.html?touch=1";
const WIDTH = 900;
const HEIGHT = 420;
const SHOT_DIR = path.join(__dirname, "..", "build", "alexcraft-shots");

/** The crosshair used to be a 24x24 cross; it is now smaller and see-through */
const EXPECTED_SIZE = 16;
const EXPECTED_OPACITY = 0.55;

async function main() {
  const { cdp, close } = await launchEdge({ width: WIDTH, height: HEIGHT });
  let exitCode = 1;
  try {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await cdp.send("Page.navigate", { url: URL_UNDER_TEST });

    let ready = false;
    for (let attempt = 0; attempt < 160; attempt++) {
      await sleep(250);
      ready = await evaluate(
        cdp,
        `(function () {
           const start = document.getElementById('start-menu');
           if (!start) return false;
           return getComputedStyle(start).display === 'flex';
         })()`
      );
      if (ready) break;
    }
    if (!ready) throw new Error("the start page never came up");

    await evaluate(cdp, `document.getElementById('start-play').click()`);
    await sleep(600);
    await evaluate(
      cdp,
      `(function () {
         const open = document.querySelector('#world-list .world-open');
         if (open) open.click();
       })()`
    );

    let inWorld = false;
    for (let attempt = 0; attempt < 240; attempt++) {
      await sleep(250);
      inWorld = await evaluate(
        cdp,
        `(function () {
           const pause = document.getElementById('pause');
           return pause && getComputedStyle(pause).display === 'flex';
         })()`
      );
      if (inWorld) break;
    }
    if (!inWorld) throw new Error("the world never finished loading");
    await evaluate(cdp, `document.getElementById('resume').click()`);
    await sleep(600);

    const failures = [];
    const check = (ok, line) => {
      console.log(`${ok ? "OK  " : "FAIL"}  ${line}`);
      if (!ok) failures.push(line);
    };

    const cursor = JSON.parse(
      await evaluate(
        cdp,
        `(function () {
           const el = document.getElementById('cursor');
           if (!el) return JSON.stringify({ error: 'missing' });
           const r = el.getBoundingClientRect();
           const style = getComputedStyle(el);
           return JSON.stringify({
             width: Math.round(r.width),
             height: Math.round(r.height),
             opacity: style.opacity,
             blend: style.mixBlendMode,
             stroke: el.querySelector('path').getAttribute('stroke-width'),
             centreX: Math.round(r.left + r.width / 2),
             centreY: Math.round(r.top + r.height / 2),
           });
         })()`
      )
    );
    console.log(`crosshair  ${JSON.stringify(cursor)}`);

    check(!cursor.error, "the crosshair is on the page");
    check(
      cursor.width === EXPECTED_SIZE && cursor.height === EXPECTED_SIZE,
      `the crosshair is ${EXPECTED_SIZE}x${EXPECTED_SIZE} (${cursor.width}x${cursor.height})`
    );
    check(
      Math.abs(Number(cursor.opacity) - EXPECTED_OPACITY) < 0.001,
      `the crosshair is ${EXPECTED_OPACITY} opaque (${cursor.opacity})`
    );
    check(
      cursor.blend === "difference",
      `the crosshair still blends with the world (${cursor.blend})`
    );

    // The crosshair has to stay in the middle of the screen
    const middle = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify({
           w: window.innerWidth,
           h: window.innerHeight,
         })`
      )
    );
    check(
      Math.abs(cursor.centreX - middle.w / 2) <= 1 &&
        Math.abs(cursor.centreY - middle.h / 2) <= 1,
      `the crosshair sits in the middle (${cursor.centreX}, ${cursor.centreY})`
    );

    // A picture of it, so the size and the brightness can be seen
    const shot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      clip: {
        x: Math.max(0, cursor.centreX - 40),
        y: Math.max(0, cursor.centreY - 40),
        width: 80,
        height: 80,
        scale: 4,
      },
    });
    const shotPath = path.join(SHOT_DIR, "crosshair.png");
    fs.writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
    console.log(`picture    ${shotPath}`);

    if (failures.length) {
      console.log(`\nFAIL (${failures.length})`);
      failures.forEach((line) => console.log(`  - ${line}`));
    } else {
      console.log("\nPASS: the crosshair is smaller and half transparent");
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
