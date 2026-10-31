/* Checks the third-person camera against a running dev server:
 *
 *   - the body is shown and starts facing the view
 *   - dragging to look orbits the camera without turning the body
 *   - the joystick turns the body towards the direction it is pushed
 *   - orbiting while the stick is held keeps the character's heading
 *   - a fresh push after release re-aims at the current view
 *
 * Usage: node tools/verify-third-person.js [url]
 */
const { evaluate, launchEdge, sleep } = require("./cdp-harness");

const URL_UNDER_TEST =
  process.argv[2] || "http://127.0.0.1:5173/index.html?touch=1";

const normalise = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

async function main() {
  const { cdp, close } = await launchEdge({ port: 9341, width: 900, height: 420 });
  let failures = 0;
  const check = (ok, what, detail) => {
    console.log(
      `${ok ? "ok   " : "FAIL "} ${what}${detail ? `  ${detail}` : ""}`
    );
    if (!ok) failures++;
  };

  try {
    await cdp.send("Page.navigate", { url: URL_UNDER_TEST });

    let up = false;
    for (let attempt = 0; attempt < 160 && !up; attempt++) {
      await sleep(250);
      up = await evaluate(
        cdp,
        `(function () {
           const menu = document.getElementById('start-menu');
           return Boolean(menu) && getComputedStyle(menu).display === 'flex';
         })()`
      );
    }
    if (!up) throw new Error("the start page never came up");

    // Play, making a world first when the profile has none.
    await evaluate(cdp, `document.getElementById('start-play').click()`);
    await sleep(700);
    const worlds = await evaluate(
      cdp,
      `document.querySelectorAll('#world-list .world-open').length`
    );
    if (worlds === 0) {
      await evaluate(cdp, `document.getElementById('new-world').click()`);
      await sleep(200);
      await evaluate(cdp, `document.getElementById('new-world-create').click()`);
      await sleep(1200);
    }
    await evaluate(
      cdp,
      `(function () {
         const open = document.querySelector('#world-list .world-open');
         if (open) open.click();
       })()`
    );

    let inWorld = false;
    for (let attempt = 0; attempt < 240 && !inWorld; attempt++) {
      await sleep(250);
      inWorld = await evaluate(
        cdp,
        `(function () {
           const pause = document.getElementById('pause');
           return Boolean(pause) && getComputedStyle(pause).display === 'flex';
         })()`
      );
    }
    if (!inWorld) throw new Error("the world never finished loading");
    await evaluate(cdp, `document.getElementById('resume').click()`);
    await sleep(400);

    await evaluate(cdp, `window.game.setThirdPerson(true)`);
    await sleep(300);

    const before = await evaluate(
      cdp,
      `JSON.stringify({
         cameraYaw: window.game.player.yaw,
         bodyYaw: window.game.player.bodyYaw,
         moveYaw: window.game.player.moveYaw,
         modelYaw: window.game.playerModel.group.rotation.y,
         visible: window.game.playerModel.group.visible,
       })`
    ).then(JSON.parse);
    check(before.visible, "third-person body is visible");
    check(
      Math.abs(normalise(before.cameraYaw - before.bodyYaw)) < 1e-6,
      "body starts facing the view"
    );

    // Orbit roughly half a turn, which puts the camera in front of the body.
    await evaluate(cdp, `window.game.player.lookBy(-982, 0)`);
    await sleep(250);
    const afterLook = await evaluate(
      cdp,
      `JSON.stringify({
         cameraYaw: window.game.player.yaw,
         bodyYaw: window.game.player.bodyYaw,
         modelYaw: window.game.playerModel.group.rotation.y,
       })`
    ).then(JSON.parse);
    check(
      Math.abs(normalise(afterLook.cameraYaw - afterLook.bodyYaw)) > 2.5,
      "looking around orbits the camera but leaves the body alone"
    );
    check(
      Math.abs(normalise(afterLook.modelYaw - afterLook.bodyYaw)) < 1e-6,
      "the model keeps the body yaw"
    );

    const front = await evaluate(
      cdp,
      `(function () {
         const player = window.game.player;
         const yaw = player.bodyYaw;
         const fx = -Math.sin(yaw);
         const fz = -Math.cos(yaw);
         const dx = player.camera.position.x - player.renderFeet.x;
         const dz = player.camera.position.z - player.renderFeet.z;
         const len = Math.hypot(dx, dz) || 1;
         return (dx / len) * fx + (dz / len) * fz;
       })()`
    );
    check(front > 0.9, "the camera can sit in front of the body", `dot=${front.toFixed(3)}`);

    // Pushing forward must turn the body to the stick direction.
    await evaluate(cdp, `window.game.player.setTouchMove(0, 1)`);
    await sleep(1000);
    const afterWalk = await evaluate(
      cdp,
      `JSON.stringify({
         cameraYaw: window.game.player.yaw,
         bodyYaw: window.game.player.bodyYaw,
         moveYaw: window.game.player.moveYaw,
       })`
    ).then(JSON.parse);
    check(
      Math.abs(normalise(afterWalk.cameraYaw - afterWalk.bodyYaw)) < 0.05,
      "the joystick turns the body towards its direction"
    );

    // While the stick is held, orbiting must not steer the character.
    await evaluate(cdp, `window.game.player.lookBy(491, 0)`);
    await sleep(500);
    const afterOrbitHeld = await evaluate(
      cdp,
      `JSON.stringify({
         cameraYaw: window.game.player.yaw,
         bodyYaw: window.game.player.bodyYaw,
         moveYaw: window.game.player.moveYaw,
       })`
    ).then(JSON.parse);
    check(
      Math.abs(normalise(afterOrbitHeld.cameraYaw - afterOrbitHeld.bodyYaw)) > 1.2,
      "the camera still orbits while the stick is held"
    );
    check(
      Math.abs(normalise(afterOrbitHeld.bodyYaw - afterWalk.bodyYaw)) < 0.02,
      "the body keeps its heading while the stick is held"
    );
    check(
      Math.abs(normalise(afterOrbitHeld.moveYaw - afterWalk.moveYaw)) < 0.02,
      "movement keeps its heading while the stick is held"
    );

    // Releasing and pushing again should aim at the new view.
    await evaluate(cdp, `window.game.player.setTouchMove(0, 0)`);
    await sleep(1000);
    await evaluate(cdp, `window.game.player.setTouchMove(0, 1)`);
    await sleep(1000);
    await evaluate(cdp, `window.game.player.setTouchMove(0, 0)`);
    const afterRepress = await evaluate(
      cdp,
      `JSON.stringify({
         cameraYaw: window.game.player.yaw,
         bodyYaw: window.game.player.bodyYaw,
       })`
    ).then(JSON.parse);
    check(
      Math.abs(normalise(afterRepress.cameraYaw - afterRepress.bodyYaw)) < 0.05,
      "a fresh stick push re-aims the body at the current view"
    );

    if (failures) {
      console.log(`\nFAIL (${failures})`);
    } else {
      console.log(
        "\nPASS: camera orbit is independent and the joystick controls facing"
      );
    }
    process.exitCode = failures ? 1 : 0;
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
