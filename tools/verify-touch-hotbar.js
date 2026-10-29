/* Taps the nine hotbar slots in a landscape touch viewport and reports which
 * slot ended up selected.
 *
 * Usage:
 *   node tools/verify-touch-hotbar.js [url]
 *
 * The browser tab of the IDE is not an option here: the game needs a
 * landscape viewport with touch enabled, and the only way to get both is a
 * headless Edge driven over the DevTools protocol. WebGL runs on SwiftShader,
 * so the game boots without a GPU.
 *
 * Before the taps the pause menu is dismissed with a real touch tap on
 * "Back to Game", which is the same path a player takes.
 */
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9333;
const URL_UNDER_TEST =
  process.argv[2] || "http://127.0.0.1:5173/index.html?touch=1";
const WIDTH = 900;
const HEIGHT = 420;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

async function waitForTarget() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const targets = await getJson(`http://127.0.0.1:${PORT}/json/list`);
      const page = targets.find((t) => t.type === "page");
      if (page) return page;
    } catch {
      // the browser has not opened its debugging port yet
    }
    await sleep(250);
  }
  throw new Error("Edge never exposed a page target");
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.events = new Map();
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
        return;
      }
      const handler = this.events.get(message.method);
      if (handler) handler(message.params);
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  on(method, handler) {
    this.events.set(method, handler);
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      `evaluate failed: ${result.exceptionDetails.text ?? "unknown"}`
    );
  }
  return result.result.value;
}

async function tap(cdp, x, y) {
  const point = [{ x, y, id: 1, radiusX: 3, radiusY: 3, force: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point });
  await sleep(40);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(80);
}

async function main() {
  const profile = path.join(os.tmpdir(), "alexcraft-touch-cdp");
  const edge = spawn(
    EDGE,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu-sandbox",
      `--window-size=${WIDTH},${HEIGHT}`,
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  let exitCode = 1;
  try {
    const target = await waitForTarget();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    const cdp = new Cdp(ws);

    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 2,
      mobile: true,
      screenOrientation: { type: "landscapePrimary", angle: 90 },
    });
    await cdp.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 5,
    });
    await cdp.send("Emulation.setEmitTouchEventsForMouse", { enabled: false });

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
    ws.close();
  } finally {
    edge.kill();
  }
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
