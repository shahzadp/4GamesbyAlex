/* Headless Edge over the DevTools protocol, shared by the probes in tools/.
 *
 * The game needs a landscape viewport with touch enabled, and the only way to
 * get both is a browser driven over CDP: WebGL runs on SwiftShader, so the
 * game boots without a GPU.
 */
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

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

/** Opens a headless Edge and returns the CDP connection for its page */
async function launchEdge({ port = 9333, width = 900, height = 420 } = {}) {
  const profile = path.join(os.tmpdir(), "alexcraft-cdp-profile");
  const child = spawn(
    EDGE,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu-sandbox",
      `--window-size=${width},${height}`,
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  let target = null;
  for (let attempt = 0; attempt < 60 && !target; attempt++) {
    try {
      const targets = await getJson(`http://127.0.0.1:${port}/json/list`);
      target = targets.find((t) => t.type === "page");
    } catch {
      // the browser has not opened its debugging port yet
    }
    if (!target) await sleep(250);
  }
  if (!target) {
    child.kill();
    throw new Error("Edge never exposed a page target");
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  const cdp = new Cdp(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: true,
    screenOrientation: { type: "landscapePrimary", angle: 90 },
  });
  await cdp.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 5,
  });
  await cdp.send("Emulation.setEmitTouchEventsForMouse", { enabled: false });

  return {
    cdp,
    close() {
      try {
        ws.close();
      } catch {
        // already gone
      }
      child.kill();
    },
  };
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

/** Evaluates an expression in the page and returns its value */
async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    const details = result.exceptionDetails;
    const why =
      details.exception?.description ??
      details.exception?.value ??
      details.text ??
      "unknown";
    throw new Error(`evaluate failed: ${why}`);
  }
  return result.result.value;
}

/** A finger tap */
async function tap(cdp, x, y) {
  const point = [{ x, y, id: 1, radiusX: 3, radiusY: 3, force: 1 }];
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: point,
  });
  await sleep(40);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(80);
}

/** A key press, for the keyboard controls */
async function key(cdp, code, type) {
  const key = code.replace("Key", "").toLowerCase();
  await cdp.send("Input.dispatchKeyEvent", {
    type,
    code,
    key,
    text: type === "keyDown" ? key : undefined,
    windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
  });
}

module.exports = { EDGE, Cdp, evaluate, key, launchEdge, sleep, tap };
