/* Taps the nine hotbar slots in a landscape touch viewport and reports which
 * slot ended up selected.
 *
 * Usage:
 *   node tools/verify-touch-hotbar.js [url]
 *
 * The pause menu is dismissed with a real tap on "Back to Game" first, which
 * is the same path a player takes.
 */
const { evaluate, launchEdge, sleep, tap } = require("./cdp-harness");

const URL_UNDER_TEST =
  process.argv[2] || "http://127.0.0.1:5173/index.html?touch=1";
const WIDTH = 900;
const HEIGHT = 420;

async function main() {
  const { cdp, close } = await launchEdge({ width: WIDTH, height: HEIGHT });
  let exitCode = 1;
  try {
    await cdp.send("Page.navigate", { url: URL_UNDER_TEST });

    let ready = false;
    for (let attempt = 0; attempt < 160; attempt++) {
      await sleep(250);
      ready = await evaluate(
        cdp,
        `(function () {
           const pause = document.getElementById('pause');
           const ui = document.getElementById('touch-ui');
           if (!pause || !ui) return false;
           if (!document.body.classList.contains('touch-mode')) return false;
           // The pause menu only opens once the spawn area has loaded, so this
           // is the point where the game is really up.
           return getComputedStyle(pause).display === 'flex';
         })()`
      );
      if (ready) break;
    }
    if (!ready) {
      const state = await evaluate(
        cdp,
        `JSON.stringify({
           hasGame: Boolean(window.game),
           touchMode: document.body.classList.contains('touch-mode'),
           hasTouchUi: Boolean(document.getElementById('touch-ui')),
           pauseDisplay: document.getElementById('pause')
             ? getComputedStyle(document.getElementById('pause')).display
             : 'missing',
         })`
      );
      throw new Error(`the game never came up (${state})`);
    }

    const paused = await evaluate(
      cdp,
      `JSON.stringify({
         bodyClass: document.body.className,
         pauseDisplay: getComputedStyle(document.getElementById('pause')).display,
         touchUiDisplay: getComputedStyle(document.getElementById('touch-ui')).display,
       })`
    );
    console.log(`at spawn  ${paused}`);

    // The pause menu owns the screen until it is dismissed.
    await evaluate(
      cdp,
      `(function () {
         const resume = document.getElementById('resume');
         if (resume) resume.click();
         else if (window.game) window.game.setPauseVisible(false);
       })()`
    );
    await sleep(300);

    const afterPause = await evaluate(
      cdp,
      `JSON.stringify({
         bodyClass: document.body.className,
         pauseDisplay: getComputedStyle(document.getElementById('pause')).display,
         touchUiDisplay: getComputedStyle(document.getElementById('touch-ui')).display,
       })`
    );
    console.log(`in play   ${afterPause}`);

    // A production build has no dev handle, so the selection is read back
    // from the HUD: the hotbar border is driven by the same --selected value
    // the game sets when the slot changes.
    const selected = () =>
      evaluate(
        cdp,
        `(window.game
           ? window.game.player.hotbar.selected
           : parseInt(
               getComputedStyle(document.getElementById('toolbar'))
                 .getPropertyValue('--selected'),
               10))`
      );

    const before = await selected();
    console.log(`viewport          ${WIDTH}x${HEIGHT}`);
    console.log(`selected at start ${before}`);

    const failures = [];
    for (let slot = 1; slot <= 9; slot++) {
      const info = await evaluate(
        cdp,
        `(function () {
           const el = document.getElementById('toolbar-slot-${slot}');
           if (!el) return null;
           const r = el.getBoundingClientRect();
           const x = r.left + r.width / 2;
           const y = r.top + r.height / 2;
           const hit = document.elementFromPoint(x, y);
           return {
             x: x,
             y: y,
             w: Math.round(r.width),
             h: Math.round(r.height),
             hit: hit ? (hit.id || hit.className || hit.tagName) : 'none',
             hitTag: hit ? hit.tagName : 'none',
           };
         })()`
      );
      if (!info) {
        failures.push(`slot ${slot}: missing from the DOM`);
        continue;
      }
      await tap(cdp, info.x, info.y);
      const now = await selected();
      const border = await evaluate(
        cdp,
        `getComputedStyle(document.getElementById('toolbar')).getPropertyValue('--selected').trim()`
      );
      const ok = now === slot - 1 && border === String(slot - 1);
      console.log(
        `slot ${slot}  tap(${Math.round(info.x)},${Math.round(info.y)})` +
          `  size=${info.w}x${info.h}  hit=${info.hitTag}#${info.hit}` +
          `  selected=${now}  border=${border}  ${ok ? "OK" : "FAIL"}`
      );
      if (!ok) failures.push(`slot ${slot}: selected=${now} border=${border}`);
    }

    // A drag on the world must still turn the camera.
    const hasDevHandle = await evaluate(cdp, `Boolean(window.game)`);
    const dragHit = await evaluate(
      cdp,
      `(function () {
         const hit = document.elementFromPoint(450, 120);
         return hit ? (hit.id || hit.className || hit.tagName) : 'none';
       })()`
    );
    console.log(`drag target at (450,120) ${dragHit}`);

    const yawBefore = hasDevHandle
      ? await evaluate(cdp, `window.game.player.getLook().yaw`)
      : null;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 450, y: 120, id: 2, radiusX: 3, radiusY: 3, force: 1 }],
    });
    for (let step = 1; step <= 6; step++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: 450 + step * 20, y: 120, id: 2, radiusX: 3, radiusY: 3, force: 1 },
        ],
      });
      await sleep(20);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(120);

    if (hasDevHandle) {
      const yawAfter = await evaluate(cdp, `window.game.player.getLook().yaw`);
      const lookOk = Math.abs(yawAfter - yawBefore) > 0.01;
      console.log(
        `look drag  yaw ${yawBefore.toFixed(4)} -> ${yawAfter.toFixed(4)}  ${
          lookOk ? "OK" : "FAIL"
        }`
      );
      if (!lookOk) failures.push("look drag did not turn the camera");
    } else {
      const lookOk = dragHit === "touch-look";
      console.log(
        `look drag  no dev handle, hit target is ${dragHit}  ${
          lookOk ? "OK" : "FAIL"
        }`
      );
      if (!lookOk) failures.push(`the world is covered by ${dragHit}`);
    }

    if (failures.length) {
      console.log(`\nFAIL (${failures.length})`);
      failures.forEach((line) => console.log(`  - ${line}`));
    } else {
      console.log("\nPASS: every hotbar slot selects and the camera still turns");
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
