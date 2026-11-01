/* Shows the third-person body from the side, standing and crouching, so the
 * direction of the crouch can be seen.
 *
 * Usage: node tools/shot-crouch.js [url]
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

    // Third person, with the camera behind and the body turned to the side,
    // so a lean forwards or backwards is plainly visible.
    // The player is put in the open first: a wall behind it would pull the
    // camera in so close that the body is hidden altogether.
    const moved = await evaluate(
      cdp,
      `(function () {
         const game = window.game;
         const world = game.world;
         const p = game.player.renderFeet;
         const clear = (x, y, z) => {
           const id = world.getBlock(x, y, z);
           return id === undefined || id === 0;
         };
         const fluid = (id) =>
           id === 14 || id === 15 || (id >= 200 && id <= 231);
         const dry = (x, y, z) => {
           const id = world.getBlock(x, y, z);
           return id === undefined || !fluid(id);
         };
         for (let r = 2; r < 24; r++) {
           for (let a = 0; a < 12; a++) {
             const x = Math.round(p.x + Math.cos((a / 12) * 6.283) * r);
             const z = Math.round(p.z + Math.sin((a / 12) * 6.283) * r);
             for (let y = world.chunkSize.height - 2; y > 1; y--) {
               if (clear(x, y, z)) continue;
               // the ground, with plenty of room above it and no water near
               let ok = true;
               for (let dy = 1; dy <= 6 && ok; dy++)
                 for (let dx = -2; dx <= 2 && ok; dx++)
                   for (let dz = -2; dz <= 2 && ok; dz++)
                     if (!clear(x + dx, y + dy, z + dz)) ok = false;
               for (let dy = 0; dy <= 2 && ok; dy++)
                 for (let dx = -4; dx <= 4 && ok; dx++)
                   for (let dz = -4; dz <= 4 && ok; dz++)
                     if (!dry(x + dx, y + dy, z + dz)) ok = false;
               if (ok) {
                 game.player.placeFeet(x + 0.5, y + 1, z + 0.5);
                 return [x, y + 1, z];
               }
               break;
             }
           }
         }
         return null;
       })()`
    );
    console.log(`moved      ${JSON.stringify(moved)}`);
    await sleep(1200);

    await evaluate(
      cdp,
      `(function () {
         const game = window.game;
         game.setThirdPerson(true);
         // The camera to the side of where the body will end up
         game.player.setLook(Math.PI / 2, 0);
         // A short push of the stick sets the heading of the body: the body
         // turns to face the way the stick was pushed, the camera does not.
         // Pushing it to the right leaves the body facing away from the
         // camera, so the crouch can be seen from the side.
         game.player.setTouchMove(1, 0);
       })()`
    );
    await sleep(300);
    await evaluate(cdp, `window.game.player.setTouchMove(0, 0)`);
    await sleep(1500);

    const shoot = async (name) => {
      const shot = await cdp.send("Page.captureScreenshot", {
        format: "png",
        clip: { x: 300, y: 20, width: 300, height: 380, scale: 3 },
      });
      const out = path.join(SHOT_DIR, name);
      fs.writeFileSync(out, Buffer.from(shot.data, "base64"));
      console.log(`picture    ${out}`);
    };

    const readPose = () =>
      evaluate(
        cdp,
        `(function () {
           const game = window.game;
           const model = game.playerModel;
           const cam = game.player.camera;
           const feet = game.player.renderFeet;
           return JSON.stringify({
             sneaking: game.player.isSneaking,
             inFluid: game.player.inFluid,
             flying: game.player.flying,
             torsoX: +model.torso.rotation.x.toFixed(4),
             torsoY: +model.torso.position.y.toFixed(4),
             headX: +model.head.rotation.x.toFixed(4),
             bodyYaw: +game.player.bodyYaw.toFixed(4),
             look: game.player.getLook(),
             feet: [+feet.x.toFixed(2), +feet.z.toFixed(2)],
             cam: [+cam.position.x.toFixed(2), +cam.position.z.toFixed(2)],
           });
         })()`
      );

    console.log(`standing   ${await readPose()}`);
    await shoot("crouch-standing.png");

    // Now crouch and let the body settle
    await evaluate(cdp, `window.game.player.setTouchSneak(true)`);
    await sleep(2500);
    console.log(`crouching  ${await readPose()}`);
    await shoot("crouch-crouching.png");

    await evaluate(cdp, `window.game.player.setTouchSneak(false)`);
    await sleep(1500);
    console.log(`standing   ${await readPose()}`);
  } finally {
    close();
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
