/* Tidy mountProtoFrame() in app.js.
 *
 * Two defects left behind by earlier tooling:
 *
 * 1. A comment explaining the iframe `load` hook appears THREE times. It was
 *    inserted by tools/safe-area-proto2.cjs, whose guard tested for the hook LINE
 *    and so stopped re-adding the hook while still re-adding the two comment
 *    lines above it. tools/dedupe-loadhook.cjs then removed the duplicated hooks
 *    and left the comments behind.
 *
 * 2. The doc comment above the function names a variable `needsReflow` that does
 *    not exist anywhere in the file. It describes an approach that the
 *    unconditional two-frame reflow replaced, and the prose was never updated.
 *    A reader would go hunting for it.
 *
 * Matching is on line arrays, not strings: app.js is mostly CRLF with bare-LF runs
 * where the earlier scripts spliced content in, so a literal multi-line string
 * match silently fails. (That is what made the first attempt of this script
 * report "already gone" for something plainly present.)
 *
 * Idempotent. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', 'app', 'src', 'main', 'assets');
const p = path.join(ROOT, 'app.js');

const raw = fs.readFileSync(p, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let lines = raw.split(/\r?\n/);

const trimmed = (l) => l.trim();
const countRun = (want, from = 0) => {
  let n = 0;
  for (let i = from; i + want.length <= lines.length; i++) {
    let hit = true;
    for (let j = 0; j < want.length; j++) if (trimmed(lines[i + j]) !== want[j]) { hit = false; break; }
    if (hit) n++;
  }
  return n;
};

/* ---- 1. collapse the triplicated comment ------------------------------ */

const NOTE = [
  '/* contentDocument is null until the child parses; on load is the first',
  'moment the document exists AND has the app mounted in it. */',
];

let runs = countRun(NOTE);
const noteRunsBefore = runs;
while (runs > 1) {
  /* keep the first, drop the next */
  for (let i = 0; i + NOTE.length <= lines.length; i++) {
    let hit = true;
    for (let j = 0; j < NOTE.length; j++) if (trimmed(lines[i + j]) !== NOTE[j]) { hit = false; break; }
    if (hit) { lines.splice(i, NOTE.length); break; }
  }
  runs = countRun(NOTE);
}
/* Report what was actually done, not merely the end state — a script that says
   "collapsed" when there was nothing to collapse is worse than no message. */
if (noteRunsBefore > 1) console.log('collapsed ' + (noteRunsBefore - 1) + ' extra comment copies to 1');
else if (runs === 0) console.log('comment not found (nothing to collapse)');
else console.log('comment already single');

/* ---- 2. the stale needsReflow paragraph ------------------------------- */

const STALE = [
  '* `needsReflow` covers a second case that is easy to miss: this launcher hides',
  '* pages with `display: none`, and an iframe at zero size gets no animation',
  '* frames and never receives a resize event when it is shown again. Proto 2',
  '* sizes its map canvas from its own clientWidth, so without a nudge it would',
  '* keep the 0x0 bitmap it built while hidden — a blank map, with no error',
  '* anywhere. Same-origin, so the child window is directly reachable. */',
];

const REPLACEMENT = [
  '* A second case is easy to miss, and is why the reflow below is unconditional:',
  '* this launcher hides pages with `display: none`, and an iframe at zero size',
  '* gets no animation frames and never receives a resize event when it is shown',
  '* again. Proto 2 sizes its map canvas from its own clientWidth, so without the',
  '* nudge it would keep the 0x0 bitmap it built while hidden — a blank map, and',
  '* no error anywhere to say why. Same-origin, so the child window is directly',
  '* reachable. */',
];

if (countRun(STALE) === 1) {
  for (let i = 0; i + STALE.length <= lines.length; i++) {
    let hit = true;
    for (let j = 0; j < STALE.length; j++) if (trimmed(lines[i + j]) !== STALE[j]) { hit = false; break; }
    if (hit) {
      const indent = lines[i].match(/^\s*/)[0];
      lines.splice(i, STALE.length, ...REPLACEMENT.map(l => indent + l));
      console.log('rewrote the stale needsReflow paragraph');
      break;
    }
  }
} else {
  console.log('stale needsReflow paragraph ' + (countRun(STALE) === 0 ? 'already gone' : 'AMBIGUOUS'));
}

fs.writeFileSync(p, lines.join(eol));

/* ---- verify ----------------------------------------------------------- */

const after = fs.readFileSync(p, 'utf8');
const a = after.split(/\r?\n/);
const runCount = (want) => {
  let n = 0;
  for (let i = 0; i + want.length <= a.length; i++) {
    let hit = true;
    for (let j = 0; j < want.length; j++) if (a[i + j].trim() !== want[j]) { hit = false; break; }
    if (hit) n++;
  }
  return n;
};

const checks = [
  ['comment appears exactly once', runCount(NOTE) === 1],
  ['load hook appears exactly once',
    (after.match(/addEventListener\('load', \(\) => publishSafeArea/g) || []).length === 1],
  ['no needsReflow reference', !after.includes('needsReflow')],
  ['braces balanced',
    (after.match(/{/g) || []).length === (after.match(/}/g) || []).length],
  ['mountProtoFrame intact', /function mountProtoFrame/.test(after)],
  ['switchPage still calls it', /mountProtoFrame\(targetPageId\)/.test(after)],
  ['other games still initialised',
    /flappyGame\.init\(\)/.test(after) && /chessGame\.init\(\)/.test(after)
    && /setupVirtualPet\(\)/.test(after)],
];
let bad = 0;
for (const [label, ok] of checks) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label);
  if (!ok) bad++;
}
console.log(bad ? bad + ' CHECK(S) FAILED' : 'all ' + checks.length + ' checks passed');
process.exit(bad ? 1 : 0);