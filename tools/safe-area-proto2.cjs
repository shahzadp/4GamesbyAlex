/* Teach the host launcher to publish its safe-area insets into the Proto 2 iframe.
 *
 * The problem: Proto 2 lays itself out with
 *
 *     :root { --safe-t: env(safe-area-inset-top, 0px); --safe-b: ... }
 *     .topbar  { height: calc(var(--topbar-h) + var(--safe-t)); }
 *     .tabbar  { height: calc(var(--tabbar-h) + var(--safe-b)); }
 *
 * Safe-area insets are a property of the DISPLAY, not of a document, so they do
 * not cross an iframe boundary: inside a child document every env() resolves to
 * 0. Measured on the handset, that put Proto 2's topbar underneath the Android
 * status bar — the tick chip, the play button and the currency chips were all
 * sitting under the clock and the battery icon.
 *
 * The obvious fix, `padding-top: env(safe-area-inset-top)` on the iframe in the
 * host sheet, is geometrically equivalent but leaves Proto 2's own arithmetic
 * believing there is no inset — its topbar would be --topbar-h tall while the
 * space it occupies is --topbar-h plus the inset, and the same disagreement
 * applies to the tab bar. That drifts the moment the inset changes.
 *
 * So the host measures its own insets and writes them into the child document as
 * custom properties, which override the env() defaults on :root by being inline
 * styles. Proto 2 then lays out exactly as it does standalone, from the same two
 * variables, with nothing special-cased for the embedded case.
 *
 * Re-published on load, on resize and on orientation change, because the insets
 * change when the device rotates.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', 'app', 'src', 'main', 'assets');
const p = path.join(ROOT, 'app.js');

let src = fs.readFileSync(p, 'utf8');
const original = src;

/* ---- 1. add publishSafeArea + wiring ----------------------------------- */

const ANCHOR = '/* Back out of the host, when framed'; // not in this file; placeholder guard

if (!src.includes('function publishSafeArea')) {
  const HELPER = `
/* Write this document's safe-area insets into the Proto 2 child document.
 *
 * env() is measured with a throwaway probe element rather than guessed: there is
 * no JS API for safe-area insets, but a fixed-position element sized with
 * env(safe-area-inset-top) reports the real value through getBoundingClientRect.
 * One element, two reads, removed immediately. */
function readSafeAreaInsets() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;visibility:hidden;'
    + 'pointer-events:none;height:env(safe-area-inset-top,0px)';
  document.body.appendChild(probe);
  const top = probe.getBoundingClientRect().height;
  probe.style.height = 'env(safe-area-inset-bottom,0px)';
  const bottom = probe.getBoundingClientRect().height;
  probe.remove();
  return { top, bottom };
}

function publishSafeArea() {
  const frame = document.getElementById('proto-frame');
  if (!frame || !frame.getAttribute('src')) return;
  let doc = null;
  try { doc = frame.contentDocument; } catch (e) { return; }
  /* Not loaded yet, or a cross-origin document (impossible here — same origin). */
  if (!doc || !doc.documentElement) return;
  if (!doc.getElementById('app')) return;   // still parsing
  const { top, bottom } = readSafeAreaInsets();
  const root = doc.documentElement.style;
  root.setProperty('--safe-t', top + 'px');
  root.setProperty('--safe-b', bottom + 'px');
}
`;

  src = src.replace(/\s*$/, '') + HELPER;
  console.log('appended readSafeAreaInsets/publishSafeArea');
} else {
  console.log('publishSafeArea already present');
}

/* ---- 2. call it wherever the frame may need re-measuring -------------- */

const MOUNT_TAIL = `    } catch (e) {
      /* Child not reachable yet; its own resize handler will catch up. */
    }
  }));
}`;

const MOUNT_NEW = `    } catch (e) {
      /* Child not reachable yet; its own resize handler will catch up. */
    }
    /* Insets are a property of the display, so they arrive as 0 inside the
       frame; hand the child the real values. See publishSafeArea. */
    publishSafeArea();
  }));
}

/* The insets change when the device rotates, and the child is already mounted by
   then, so this has to be re-run outside the first-entry path. */
window.addEventListener('resize', () => publishSafeArea(), { passive: true });
window.addEventListener('orientationchange', () => publishSafeArea());`;

if (src.includes(MOUNT_TAIL)) {
  src = src.replace(MOUNT_TAIL, MOUNT_NEW);
  console.log('wired publishSafeArea into mountProtoFrame + orientation listeners');
} else if (src.includes('publishSafeArea();\n  }));\n}')) {
  console.log('publishSafeArea already wired');
} else {
  console.error('FATAL: could not find the tail of mountProtoFrame to wire into');
  process.exit(1);
}

/* ---- 3. also publish once the frame finishes loading ------------------ */

const LOAD_HOOK = `    frame.setAttribute('src', 'proto2/index.html');
    protoFrameMounted = true;`;

const LOAD_NEW = `    frame.setAttribute('src', 'proto2/index.html');
    protoFrameMounted = true;
    /* contentDocument is null until the child parses; on load is the first
       moment the document exists AND has the app mounted in it. */
    frame.addEventListener('load', () => publishSafeArea(), { once: true });`;

if (src.includes("frame.addEventListener('load', () => publishSafeArea()")) {
  console.log('load hook already present');
} else if (src.includes(LOAD_HOOK)) {
  src = src.replace(LOAD_HOOK, LOAD_NEW);
  console.log('added load hook');
} else {
  console.error('FATAL: could not find the src-setting line to add the load hook');
  process.exit(1);
}

if (src !== original) fs.writeFileSync(p, src);
console.log('wrote ' + path.relative(process.cwd(), p));

const checks = [
  ['readSafeAreaInsets defined', /function readSafeAreaInsets/.test(src)],
  ['publishSafeArea defined', /function publishSafeArea/.test(src)],
  ['probes env() via an element', /getBoundingClientRect\(\)\.height/.test(src)],
  ['sets --safe-t', /setProperty\('--safe-t'/.test(src)],
  ['sets --safe-b', /setProperty\('--safe-b'/.test(src)],
  ['waits for the app to mount', /getElementById\('app'\)/.test(src)],
  ['called from mountProtoFrame',
    /publishSafeArea\(\);\s*\n\s*\}\)\);/.test(src)],
  ['load hook added', /addEventListener\('load', \(\) => publishSafeArea\(\)/.test(src)],
  ['re-published on rotate', /orientationchange[\s\S]{0,60}publishSafeArea/.test(src)],
  ['braces balanced',
    (src.match(/{/g) || []).length === (src.match(/}/g) || []).length],
];
let bad = 0;
for (const [label, ok] of checks) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label);
  if (!ok) bad++;
}
console.log(bad ? bad + ' CHECK(S) FAILED' : 'all ' + checks.length + ' checks passed');
process.exit(bad ? 1 : 0);