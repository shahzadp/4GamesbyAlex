/* Rewire app.js for the Proto 2 embed.
 *
 * Three changes:
 *   1. Drop the `setupEconomyGame()` call. It is not optional — economy.js
 *      binds by bare id (`byId('econ-toggle').addEventListener(...)`) with no
 *      null checks, so with the old markup gone it throws on the first missing
 *      element. It runs inside DOMContentLoaded BEFORE the launch cards are
 *      wired, so the throw would silently kill every game in the launcher, not
 *      just game 4. This is the single most dangerous line to leave behind.
 *   2. Add mountProtoFrame(): attaches the iframe src on first entry, so the
 *      512 KB module graph is only fetched by a player who opens game 4.
 *   3. Call it from switchPage, plus a re-measure when the page becomes
 *      visible again.
 *
 * Idempotent: safe to run more than once.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', 'app', 'src', 'main', 'assets');
const p = path.join(ROOT, 'app.js');

let src = fs.readFileSync(p, 'utf8');
const original = src;
const notes = [];

/* ---- 1. remove the old init call --------------------------------------- */

const callRe = /^[ \t]*setupEconomyGame\(\);[ \t]*\r?\n/m;
if (callRe.test(src)) {
  src = src.replace(callRe, '');
  notes.push('removed setupEconomyGame() call');
} else if (!/setupEconomyGame\(\)/.test(src)) {
  notes.push('setupEconomyGame() call already absent');
}

/* ---- 2. hook switchPage ------------------------------------------------ */

const ANCHOR = '  playChime(targetPageId);';
if (!src.includes('ANCHOR_NOT_PRESENT') && src.includes(ANCHOR)) {
  if (!src.includes('mountProtoFrame')) {
    src = src.replace(ANCHOR, [
      ANCHOR,
      '',
      '  /* Game 4 is Proto 2 in an iframe: mount it on first entry and re-measure',
      '     when the page comes back. See the comment on mountProtoFrame below. */',
      '  mountProtoFrame(targetPageId);',
    ].join('\n'));
    notes.push('hooked mountProtoFrame into switchPage');
  } else {
    notes.push('mountProtoFrame already hooked');
  }
} else if (!src.includes(ANCHOR)) {
  console.error('FATAL: anchor playChime(targetPageId) not found in switchPage');
  process.exit(1);
}

/* ---- 3. append the loader ---------------------------------------------- */

const LOADER = `

// =======================================================
// PROTO 2 (GAME 4) — IFRAME MOUNT
// =======================================================

/* Lazily attach the iframe, once.
 *
 * The src is deliberately absent from the markup. Proto 2 is 15 files and about
 * 512 KB of ES modules, and three of the four games in this launcher have
 * nothing to do with it — so it is not fetched until the player actually opens
 * game 4. Setting it more than once would restart the app and throw away the
 * simulation, hence the guard.
 *
 * \`needsReflow\` covers a second case that is easy to miss: this launcher hides
 * pages with \`display: none\`, and an iframe at zero size gets no animation
 * frames and never receives a resize event when it is shown again. Proto 2
 * sizes its map canvas from its own clientWidth, so without a nudge it would
 * keep the 0x0 bitmap it built while hidden — a blank map, with no error
 * anywhere. Same-origin, so the child window is directly reachable. */
let protoFrameMounted = false;

function mountProtoFrame(pageId) {
  const frame = document.getElementById('proto-frame');
  if (!frame) return;

  const wantsProto = pageId === 'economy';

  if (wantsProto && !protoFrameMounted && !frame.getAttribute('src')) {
    frame.setAttribute('src', 'proto2/index.html');
    protoFrameMounted = true;
  }

  if (!wantsProto) return;

  /* Re-measure once the page is actually laid out. Two frames: the first runs
     after the class flip has been styled, the second after the iframe has been
     given a size by that layout. */
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try {
      const w = frame.contentWindow;
      if (!w) return;
      /* Proto 2 listens for resize to re-fit its canvas and to re-evaluate
         matchMedia for the rail/tab-bar layout switch. */
      w.dispatchEvent(new w.Event('resize'));
      if (w.app && typeof w.app.refreshCanvas === 'function') w.app.refreshCanvas();
    } catch (e) {
      /* Child not reachable yet; its own resize handler will catch up. */
    }
  }));
}
`;

if (!src.includes('function mountProtoFrame')) {
  src = src.replace(/\s*$/, '') + LOADER;
  notes.push('appended mountProtoFrame');
} else {
  notes.push('mountProtoFrame already present');
}

/* ---- write + verify --------------------------------------------------- */

if (src === original) {
  console.log('already up to date; no write');
} else {
  fs.writeFileSync(p, src);
  console.log('wrote ' + path.relative(process.cwd(), p));
}
notes.forEach(n => console.log('  - ' + n));

const checks = [
  ['setupEconomyGame() gone', !/setupEconomyGame\(\)/.test(src)],
  ['economy.js never referenced', !/setupEconomyGame/.test(src)],
  ['mountProtoFrame defined', /function mountProtoFrame/.test(src)],
  ['hooked into switchPage', /mountProtoFrame\(targetPageId\)/.test(src)],
  ['mounts only on the economy page', /wantsProto = pageId === 'economy'/.test(src)],
  ['guarded against remount', /!frame\.getAttribute\('src'\)/.test(src)],
  ['pokes child resize', /new w\.Event\('resize'\)/.test(src)],
  ['other games still initialised',
    /flappyGame\.init\(\)/.test(src) && /chessGame\.init\(\)/.test(src) && /setupVirtualPet\(\)/.test(src)],
  ['launch cards still wired', /app-launch-card/.test(src)],
  ['syntax plausible', (src.match(/{/g) || []).length >= (src.match(/}/g) || []).length],
];

let bad = 0;
for (const [label, ok] of checks) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label);
  if (!ok) bad++;
}
console.log(bad ? bad + ' CHECK(S) FAILED' : 'all ' + checks.length + ' checks passed');
process.exit(bad ? 1 : 0);