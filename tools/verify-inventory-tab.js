/* Opens the inventory tab in a landscape touch viewport and checks that the
 * player's own skin is standing in it and turns towards the place that is
 * touched.
 *
 * Usage:
 *   node tools/verify-inventory-tab.js [url]
 */
const fs = require("fs");
const path = require("path");
const { evaluate, key, launchEdge, sleep, tap } = require("./cdp-harness");

const URL_UNDER_TEST =
  process.argv[2] || "http://127.0.0.1:5173/index.html?touch=1";
const WIDTH = 900;
const HEIGHT = 420;
const SHOT_DIR = path.join(__dirname, "..", "build", "alexcraft-shots");

/** Reads the preview canvas and describes the body that is drawn in it */
const ANALYSE = `(function () {
  const canvas = document.getElementById('inventory-canvas');
  if (!canvas) return { error: 'no canvas' };
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) return { error: 'no gl context' };
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let opaque = 0, minX = w, maxX = -1, minY = h, maxY = -1, sumX = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] < 16) continue;
      opaque++;
      sumX += x;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return {
    w: w, h: h, opaque: opaque,
    minX: minX, maxX: maxX, minY: minY, maxY: maxY,
    centroidX: opaque ? +(sumX / opaque).toFixed(2) : 0,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
})()`;

/** Keeps the current frame so the next one can be compared with it */
const STORE = `(function () {
  const canvas = document.getElementById('inventory-canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  window.__prev = px;
  return { stored: px.length };
})()`;

/** Compares the current frame with the one that was stored */
const DIFF = `(function () {
  const canvas = document.getElementById('inventory-canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const before = window.__prev;
  if (!before || before.length !== px.length) return { error: 'no baseline' };
  let differing = 0, sum = 0, maxDelta = 0;
  for (let i = 0; i < px.length; i += 4) {
    const d = Math.max(
      Math.abs(px[i] - before[i]),
      Math.abs(px[i + 1] - before[i + 1]),
      Math.abs(px[i + 2] - before[i + 2]),
      Math.abs(px[i + 3] - before[i + 3]));
    if (d > 0) {
      differing++;
      sum += d;
      if (d > maxDelta) maxDelta = d;
    }
  }
  window.__prev = px;
  return {
    pixels: w * h,
    differing: differing,
    percent: +(differing / (w * h) * 100).toFixed(3),
    meanDelta: +(sum / Math.max(1, differing)).toFixed(2),
    maxDelta: maxDelta,
  };
})()`;

/** The angles the body is being asked to take */
const POSE = `(function () {
  const tab = window.game && window.game.inventoryTab;
  if (!tab) return { error: 'no tab' };
  const round = (v) => +Number(v).toFixed(4);
  return {
    pose: {
      bodyYaw: round(tab.pose.bodyYaw),
      headYaw: round(tab.pose.headYaw),
      headPitch: round(tab.pose.headPitch),
      lean: round(tab.pose.lean),
    },
    target: {
      bodyYaw: round(tab.target.bodyYaw),
      headYaw: round(tab.target.headYaw),
      headPitch: round(tab.target.headPitch),
      lean: round(tab.target.lean),
    },
  };
})()`;

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
           if (!document.body.classList.contains('touch-mode')) return false;
           return getComputedStyle(start).display === 'flex';
         })()`
      );
      if (ready) break;
    }
    if (!ready) throw new Error("the start page never came up");

    // Into the world
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

    // Back into play
    await evaluate(cdp, `document.getElementById('resume').click()`);
    await sleep(400);

    const failures = [];
    const check = (ok, line) => {
      console.log(`${ok ? "OK  " : "FAIL"}  ${line}`);
      if (!ok) failures.push(line);
    };

    // ------------------------------------------------------ the touch buttons
    const buttons = await evaluate(
      cdp,
      `JSON.stringify({
         inventory: Boolean(document.getElementById('touch-inventory')),
         fly: Boolean(document.getElementById('touch-fly')),
         badge: Boolean(document.getElementById('touch-fly-badge')),
         inventoryText: document.getElementById('touch-inventory')
           ? document.getElementById('touch-inventory').textContent.trim()
           : '',
       })`
    );
    console.log(`buttons    ${buttons}`);
    const buttonInfo = JSON.parse(buttons);
    check(buttonInfo.inventory, "the touch overlay has an Inventory button");
    check(!buttonInfo.fly, "the Fly button is gone");
    check(buttonInfo.badge, "the flight badge is there");
    check(
      buttonInfo.inventoryText === "Inventory",
      `the button reads "Inventory" (${buttonInfo.inventoryText})`
    );

    // ------------------------------------------------------------ open the tab
    const inventoryButton = JSON.parse(
      await evaluate(
        cdp,
        `(function () {
           const el = document.getElementById('touch-inventory');
           const r = el.getBoundingClientRect();
           return JSON.stringify({
             x: r.left + r.width / 2,
             y: r.top + r.height / 2,
             w: Math.round(r.width),
             h: Math.round(r.height),
           });
         })()`
      )
    );
    await tap(cdp, inventoryButton.x, inventoryButton.y);
    await sleep(500);

    const opened = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify({
           tab: getComputedStyle(document.getElementById('inventory')).display,
           touchUi: getComputedStyle(document.getElementById('touch-ui')).display,
           slots: document.querySelectorAll('#inventory-hotbar .inventory-slot').length,
           preview: (function () {
             const r = document.getElementById('inventory-preview').getBoundingClientRect();
             return { x: Math.round(r.left), y: Math.round(r.top),
                      w: Math.round(r.width), h: Math.round(r.height) };
           })(),
         })`
      )
    );
    console.log(`opened     ${JSON.stringify(opened)}`);
    check(opened.tab === "flex", "the tab is on the screen");
    check(opened.touchUi === "none", "the touch overlay is hidden behind it");
    check(opened.slots === 9, `the tab carries the 9 hotbar slots (${opened.slots})`);
    check(
      opened.preview.w > 40 && opened.preview.h > 80,
      `the preview has room for the body (${opened.preview.w}x${opened.preview.h})`
    );

    // ------------------------------------------------------- the body is drawn
    await sleep(400);
    const neutral = await evaluate(cdp, ANALYSE);
    console.log(`neutral    ${JSON.stringify(neutral)}`);
    check(!neutral.error, "the preview can be read");
    check(
      neutral.opaque > 500,
      `the skin is drawn in the preview (${neutral.opaque} pixels)`
    );
    check(
      neutral.height > neutral.width,
      `the body stands upright (${neutral.width}x${neutral.height})`
    );
    await evaluate(cdp, STORE);

    // -------------------------------------------------------------- the tilts
    const preview = opened.preview;
    const touchAt = async (fx, fy, holdMs) => {
      const x = preview.x + preview.w * fx;
      const y = preview.y + preview.h * fy;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y, id: 3, radiusX: 3, radiusY: 3, force: 1 }],
      });
      await sleep(holdMs);
      return { x, y };
    };

    // Left
    await touchAt(0.08, 0.5, 700);
    const leftPose = await evaluate(cdp, POSE);
    const leftDiff = await evaluate(cdp, DIFF);
    const leftPixels = await evaluate(cdp, ANALYSE);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    console.log(`left       pose=${JSON.stringify(leftPose.pose)}`);
    console.log(`left       diff=${JSON.stringify(leftDiff)}`);
    if (!leftPose.error) {
      check(
        leftPose.target.headYaw < -0.4,
        `touching the left turns the head left (${leftPose.target.headYaw})`
      );
      check(
        leftPose.target.bodyYaw < -0.2,
        `the body follows (${leftPose.target.bodyYaw})`
      );
    } else {
      console.log("skip      the angles are only readable in the dev build");
    }
    check(
      leftDiff.percent > 1,
      `the picture changed (${leftDiff.percent}% of the pixels)`
    );
    check(
      leftPixels.width > neutral.width,
      `the body turned and got wider (${neutral.width} -> ${leftPixels.width})`
    );

    // Back to the middle, then right
    await sleep(700);
    await evaluate(cdp, STORE);
    await touchAt(0.92, 0.5, 700);
    const rightPose = await evaluate(cdp, POSE);
    const rightDiff = await evaluate(cdp, DIFF);
    const rightPixels = await evaluate(cdp, ANALYSE);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    console.log(`right      pose=${JSON.stringify(rightPose.pose)}`);
    console.log(`right      diff=${JSON.stringify(rightDiff)}`);
    if (!rightPose.error) {
      check(
        rightPose.target.headYaw > 0.4,
        `touching the right turns the head right (${rightPose.target.headYaw})`
      );
      check(
        rightPose.target.bodyYaw > 0.2,
        `the body follows (${rightPose.target.bodyYaw})`
      );
    }
    check(
      rightDiff.percent > 1,
      `the picture changed (${rightDiff.percent}% of the pixels)`
    );
    check(
      rightPixels.width > neutral.width,
      `the body turned and got wider (${neutral.width} -> ${rightPixels.width})`
    );
    if (!rightPose.error) {
      check(
        Math.abs(leftPose.target.headYaw + rightPose.target.headYaw) < 0.001,
        "the left and the right turns are mirror images"
      );
    }

    // Up
    await sleep(700);
    await touchAt(0.5, 0.06, 700);
    const upPose = await evaluate(cdp, POSE);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    console.log(`up         pose=${JSON.stringify(upPose.pose)}`);
    if (!upPose.error) {
      check(
        upPose.target.headPitch > 0.3,
        `touching the top looks up (${upPose.target.headPitch})`
      );
    }

    // Letting go brings the body back to standing straight
    await sleep(900);
    const restPose = await evaluate(cdp, POSE);
    console.log(`rest       pose=${JSON.stringify(restPose.pose)}`);
    if (!restPose.error) {
      check(
        Math.abs(restPose.pose.headYaw) < 0.05 &&
          Math.abs(restPose.pose.headPitch) < 0.05,
        `the body stands straight again (${restPose.pose.headYaw}, ${restPose.pose.headPitch})`
      );
    }

    // ---------------------------------------------------------- the hotbar tab
    const slot = JSON.parse(
      await evaluate(
        cdp,
        `(function () {
           const el = document.querySelectorAll('#inventory-hotbar .inventory-slot')[4];
           const r = el.getBoundingClientRect();
           return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
         })()`
      )
    );
    await tap(cdp, slot.x, slot.y);
    await sleep(300);
    const picked = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify({
           selected: window.game
             ? window.game.player.hotbar.selected
             : parseInt(
                 getComputedStyle(document.getElementById('toolbar'))
                   .getPropertyValue('--selected'), 10),
           border: getComputedStyle(document.getElementById('toolbar'))
             .getPropertyValue('--selected').trim(),
           marked: Array.from(
             document.querySelectorAll('#inventory-hotbar .inventory-slot')
           ).findIndex((s) => s.classList.contains('selected')),
         })`
      )
    );
    console.log(`slot 5     ${JSON.stringify(picked)}`);
    check(picked.selected === 4, "the slot in the tab picks the block");
    check(picked.border === "4", "the hotbar of the game follows");
    check(picked.marked === 4, "the tab shows which slot is chosen");
    // --------------------------------------------------------------- the close
    const close = JSON.parse(
      await evaluate(
        cdp,
        `(function () {
           const el = document.getElementById('inventory-close');
           const r = el.getBoundingClientRect();
           return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
         })()`
      )
    );
    await tap(cdp, close.x, close.y);
    await sleep(400);
    const closed = JSON.parse(
      await evaluate(
        cdp,
        `JSON.stringify({
           tab: getComputedStyle(document.getElementById('inventory')).display,
           touchUi: getComputedStyle(document.getElementById('touch-ui')).display,
         })`
      )
    );
    console.log(`closed     ${JSON.stringify(closed)}`);
    check(closed.tab === "none", "the Close button shuts the tab");
    check(closed.touchUi === "block", "the touch overlay comes back");

    // ------------------------------------------------------ the keyboard path
    await key(cdp, "KeyE", "keyDown");
    await key(cdp, "KeyE", "keyUp");
    await sleep(400);
    const withKey = await evaluate(
      cdp,
      `getComputedStyle(document.getElementById('inventory')).display`
    );
    check(withKey === "flex", "the E key opens the tab");
    // Escape is not a printable key, so it is sent without a text payload
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      code: "Escape",
      key: "Escape",
      windowsVirtualKeyCode: 27,
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      code: "Escape",
      key: "Escape",
      windowsVirtualKeyCode: 27,
    });
    await sleep(400);
    const afterEscape = await evaluate(
      cdp,
      `getComputedStyle(document.getElementById('inventory')).display`
    );
    check(afterEscape === "none", "Escape closes the tab");

    // The pause menu must still be behind the tab and not take over
    const pauseAfter = await evaluate(
      cdp,
      `getComputedStyle(document.getElementById('pause')).display`
    );
    check(pauseAfter === "none", "the pause menu did not open on the way");

    // ------------------------------------------------------------- the picture
    await evaluate(cdp, `document.getElementById('resume') && null`);
    await tap(cdp, inventoryButton.x, inventoryButton.y);
    await sleep(600);

    const shoot = async (name) => {
      const shot = await cdp.send("Page.captureScreenshot", {
        format: "png",
        clip: {
          x: Math.max(0, preview.x - 60),
          y: Math.max(0, preview.y - 40),
          width: Math.min(WIDTH - preview.x + 60, preview.w + 120),
          height: Math.min(HEIGHT - preview.y + 40, preview.h + 80),
          scale: 2,
        },
      });
      const shotPath = path.join(SHOT_DIR, name);
      fs.writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
      console.log(`picture    ${shotPath}`);
    };

    await shoot("inventory.png");

    // The same picture with the finger held to the right of the preview
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        {
          x: preview.x + preview.w * 0.92,
          y: preview.y + preview.h * 0.35,
          id: 4,
          radiusX: 3,
          radiusY: 3,
          force: 1,
        },
      ],
    });
    await sleep(800);
    await shoot("inventory-tilt.png");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(200);

    if (failures.length) {
      console.log(`\nFAIL (${failures.length})`);
      failures.forEach((line) => console.log(`  - ${line}`));
    } else {
      console.log("\nPASS: the tab opens, the skin is in it and it turns to the touch");
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
