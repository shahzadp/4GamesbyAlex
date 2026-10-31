/* Throwaway: renders the inventory preview large with a strong pose so the
 * body can be looked at closely.
 *
 * Usage: node tools/shot-inventory-pose.js [url]
 */
const fs = require("fs");
const path = require("path");
const { evaluate, launchEdge, sleep } = require("./cdp-harness");

const URL_UNDER_TEST =
  process.argv[2] || "http://127.0.0.1:5173/index.html?touch=1";
const SHOT_DIR = path.join(__dirname, "..", "build", "alexcraft-shots");

async function main() {
  const { cdp, close } = await launchEdge({ width: 900, height: 420 });
  try {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await cdp.send("Page.navigate", { url: URL_UNDER_TEST });

    for (let attempt = 0; attempt < 160; attempt++) {
      await sleep(250);
      const ready = await evaluate(
        cdp,
        `getComputedStyle(document.getElementById('start-menu')).display === 'flex'`
      );
      if (ready) break;
    }
    await evaluate(cdp, `document.getElementById('start-play').click()`);
    await sleep(600);
    await evaluate(
      cdp,
      `(function () {
         const open = document.querySelector('#world-list .world-open');
         if (open) open.click();
       })()`
    );
    for (let attempt = 0; attempt < 240; attempt++) {
      await sleep(250);
      const inWorld = await evaluate(
        cdp,
        `getComputedStyle(document.getElementById('pause')).display === 'flex'`
      );
      if (inWorld) break;
    }
    await evaluate(cdp, `document.getElementById('resume').click()`);
    await sleep(400);
    await evaluate(cdp, `document.getElementById('touch-inventory').click()`);
    await sleep(800);

    // The pose to look at: a strong turn to the right
    const pose = JSON.parse(process.argv[3] || '{"bodyYaw":0.35,"headYaw":0.6,"headPitch":0}');
    await evaluate(
      cdp,
      `(function () {
         const tab = window.game.inventoryTab;
         tab.target.bodyYaw = ${pose.bodyYaw};
         tab.target.headYaw = ${pose.headYaw};
         tab.target.headPitch = ${pose.headPitch};
         tab.pose.bodyYaw = ${pose.bodyYaw};
         tab.pose.headYaw = ${pose.headYaw};
         tab.pose.headPitch = ${pose.headPitch};
       })()`
    );
    await sleep(400);

    const rect = JSON.parse(
      await evaluate(
        cdp,
        `(function () {
           const r = document.getElementById('inventory-canvas').getBoundingClientRect();
           return JSON.stringify({ x: r.left, y: r.top, w: r.width, h: r.height });
         })()`
      )
    );
    const shot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 6 },
    });
    const out = path.join(SHOT_DIR, "pose.png");
    fs.writeFileSync(out, Buffer.from(shot.data, "base64"));
    console.log(`pose      ${JSON.stringify(pose)}`);
    console.log(`picture   ${out}`);
  } finally {
    close();
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
