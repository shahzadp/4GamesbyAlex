/* Cut the Virtual Pet page's CPU cost.
 *
 * MEASURED on an itel S685LN (Android 15). CPU as a percentage of one core,
 * averaged over 6-second windows read from /proc/<pid>/stat:
 *
 *     pet page, before       130%   <- 1.3 cores, on an otherwise idle page
 *     pet page, after        ~5%
 *     launcher                25%
 *     chess                    8%
 *     backgrounded idle        4%
 *
 * `top -b -n 1` reads anywhere from 0.0% to 87% for the same steady state on this
 * device, so every number here comes from tools/measure-cpu.js. That mattered:
 * the first two hypotheses were wrong because of it. The launcher's animated
 * pet-card emoji measured 23.9-26.4% with the animation ON and 24.7-25.3% with it
 * OFF — no effect at all — and the drop-shadow accounted for only ~15%.
 *
 * WHAT WAS ACTUALLY WRONG
 *
 * index.html carries a second, independent animation system: an inline <style>
 * block driving the inlined #touch-dog-svg by element ID —
 *
 *     #torso   breathe  3.0s infinite
 *     #head    bob      4.0s infinite
 *     #tail    tail     2.4s infinite
 *     #eyes    blink    4.5s infinite
 *     #pL,#pR  look     7.0s infinite
 *
 * plus `filter: drop-shadow(0 13px 12px rgba(0,0,0,.4))` on the SVG itself.
 *
 * A `transform` on an SVG *child* element cannot be composited by WebView: every
 * animated frame repaints the SVG's raster, and the 12px drop-shadow over it is
 * re-rasterised on each of those repaints. Five of them, permanently.
 *
 * styles.css has a parallel set — .pet-body, .pet-head, .pet-tail, .pet-ear-*,
 * .pet-blink — that targets a DIFFERENT avatar (chibi_dog_animated.svg) and
 * matches nothing on this page. That is why disabling those six selectors changed
 * nothing (130% -> 125%): they were already dead. Disabling every animation in
 * the subtree reached 1.7%, which located the cost in the ID-based rules.
 *
 * THE FIX
 *
 * Move the idle motion off the SVG's internals and onto the SVG element, which is
 * an HTML box and therefore compositor-accelerated. The dog still breathes and
 * sways — as one piece instead of six independently repainting parts.
 *
 * Left alone on purpose:
 *   - #eyes blink: its keyframe sits at rest for 92% of the cycle, so it repaints
 *     briefly and then not at all, and it is most of the dog's personality.
 *   - Every transient reaction (.bark, .giggle, .flap, .wag, .boop): the
 *     interaction payoff, short, and only running when the player acts.
 *   - The `.heart` floats, which are opacity:0 at rest and animate only under .wag.
 *
 * Also drops the drop-shadow, which restores the intent already written in the
 * comment above that rule ("drop the heavy shadow since it has its own art") — the
 * rule had re-added one.
 *
 * Idempotent.
 *
 * Matching is done on line arrays rather than with string or regex matching:
 * index.html is 482 CRLF lines and 43 bare-LF ones (styles.css 2292/76), because
 * the earlier embed scripts spliced their content in with '\n'. A literal
 * multi-line match therefore fails against the CRLF majority, and a regex needs
 * metacharacter escaping for blocks full of `#pL,#pR{...}`. Splitting on
 * /\r?\n/ sidesteps both. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', 'app', 'src', 'main', 'assets');
const CSS = path.join(ROOT, 'styles.css');
const HTML = path.join(ROOT, 'index.html');

/* Replace `count` consecutive lines equal to `want` (trimmed) with `repl`. */
function replaceLines(lines, want, repl, eol) {
  for (let i = 0; i + want.length <= lines.length; i++) {
    let hit = true;
    for (let j = 0; j < want.length; j++) {
      if (lines[i + j].trim() !== want[j].trim()) { hit = false; break; }
    }
    if (hit) {
      return lines.slice(0, i)
        .concat(repl.map(l => eol + l))
        .concat(lines.slice(i + want.length));
    }
  }
  return null;
}

function readParts(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  return { raw, eol, lines: raw.split(/\r?\n/) };
}
function writeParts(file, parts) {
  fs.writeFileSync(file, parts.lines.join(parts.eol));
}

/* ---- 1. the inline ID-based idle animations ---------------------------- */

const h = readParts(HTML);

const OLD_IDLE = [
  '#torso{transform-origin:200px 556px;animation:breathe 3s ease-in-out infinite}',
  '#head{transform-origin:200px 292px;animation:bob 4s ease-in-out infinite}',
  '#tail{transform-origin:282px 440px;animation:tail 2.4s ease-in-out infinite}',
  '#eyes{transform-origin:200px 202px;animation:blink 4.5s infinite}',
  '#pL,#pR{transition:transform .15s;animation:look 7s infinite}',
];

const NEW_IDLE = [
  '  /* Idle motion moved OFF the SVG internals and onto the SVG element, which is an',
  '     HTML box the compositor can animate. A transform on #torso/#head/#tail is NOT',
  '     compositable: each frame repainted the whole 400x600 raster and re-rasterised',
  '     the 12px drop-shadow over it. Five of those, permanently, cost 130% of a core',
  '     on an itel S685LN. As one container animation the dog still breathes and sways,',
  '     for about 5%. Measurements and method: tools/fix-pet-perf.js.',
  '',
  '     transform-origin stays on the individual parts: the transient reactions',
  '     (.bark, .flap, .wag, ...) still rotate and scale them from those points. */',
  '  #torso{transform-origin:200px 556px}',
  '  #head{transform-origin:200px 292px}',
  '  #tail{transform-origin:282px 440px}',
  '  #eyes{transform-origin:200px 202px;animation:blink 4.5s infinite}',
  '  #pL,#pR{transition:transform .15s}',
];

const h2 = replaceLines(h.lines, OLD_IDLE, NEW_IDLE, '');
if (h2) {
  h.lines = h2;
  writeParts(HTML, h);
  console.log('idle animations moved off the SVG internals');
} else if (/petIdle 5\.5s/.test(fs.readFileSync(CSS, 'utf8'))) {
  console.log('idle change already applied');
} else {
  console.error('FATAL: could not find the inline idle-animation block');
  process.exit(1);
}

/* ---- 2. drop the shadow, add the container animation ------------------ */

const c = readParts(CSS);

const OLD_SHADOW = [
  '/* Touch-dog renders inline; drop the heavy shadow since it has its own art. */',
  '.pet-avatar #touch-dog-svg {',
  '  display: block;',
  '  width: 100%;',
  '  height: 100%;',
  '  filter: drop-shadow(0 13px 12px rgba(0, 0, 0, 0.4));',
  '}',
];

const NEW_SHADOW = [
  '/* Touch-dog renders inline and carries its own shading, so there is no shadow here —',
  '   which is what the comment above this rule always said. The rule had re-added a',
  '   13px/12px drop-shadow, and because a transform animation inside the SVG repaints',
  '   its raster, that blur was re-rasterised on every frame of every idle loop. Worth',
  '   ~15% of a core on its own.',
  '',
  '   The one animation here is deliberately on the SVG ELEMENT and not on one of its',
  '   parts: an HTML box transform is compositor-accelerated, an SVG child transform is',
  '   not. See tools/fix-pet-perf.js for the measurements. */',
  '.pet-avatar #touch-dog-svg {',
  '  display: block;',
  '  width: 100%;',
  '  height: 100%;',
  '  animation: petIdle 5.5s ease-in-out infinite;',
  '  will-change: transform;',
  '  transform-origin: 50% 78%;',
  '}',
  '',
  '@keyframes petIdle {',
  '  0%, 100% { transform: translateY(0) scaleY(1); }',
  '  50%      { transform: translateY(-1.5px) scaleY(1.018); }',
  '}',
  '',
  '/* Honoured for the idle loops, not for the player-triggered reactions: if someone',
  '   has asked the system for less motion, a dog that breathes on its own forever is',
  '   exactly the thing they asked not to see. A tap still gets a bark. */',
  '@media (prefers-reduced-motion: reduce) {',
  '  .pet-avatar #touch-dog-svg, .pet-spark, .pet-card-emoji { animation: none !important; }',
  '  #eyes { animation: none !important; }',
  '}',
];

const c2 = replaceLines(c.lines, OLD_SHADOW, NEW_SHADOW, '');
if (c2) {
  c.lines = c2;
  writeParts(CSS, c);
  console.log('drop-shadow removed, container idle animation + reduced-motion added');
} else if (c.lines.some(l => l.includes('@keyframes petIdle'))) {
  console.log('shadow/container change already applied');
} else {
  console.error('FATAL: could not find the #touch-dog-svg rule');
  process.exit(1);
}

/* ---- checks ---------------------------------------------------------- */

const hAfter = fs.readFileSync(HTML, 'utf8');
const cAfter = fs.readFileSync(CSS, 'utf8');
const open = (cAfter.match(/{/g) || []).length;
const close = (cAfter.match(/}/g) || []).length;

const checks = [
  ['#torso idle loop removed', /#torso\{transform-origin:200px 556px\}/.test(hAfter)],
  ['#head idle loop removed', /#head\{transform-origin:200px 292px\}/.test(hAfter)],
  ['#tail idle loop removed', /#tail\{transform-origin:282px 440px\}/.test(hAfter)],
  ['#pL/#pR look loop removed', /#pL,#pR\{transition:transform \.15s\}/.test(hAfter)],
  ['blink kept', /#eyes\{[^}]*animation:blink/.test(hAfter)],
  ['transient reactions intact',
    ['.bark #head', '.flap #earL', '.wag #tail', '.boop #head']
      .every(s => hAfter.includes(s))],
  ['drop-shadow gone', !/drop-shadow\(0 13px 12px/.test(cAfter)],
  ['container idle animation present', /animation: petIdle 5\.5s/.test(cAfter)],
  ['petIdle keyframes defined', /@keyframes petIdle/.test(cAfter)],
  ['reduced-motion honoured for the pet',
    /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,240}#touch-dog-svg/.test(cAfter)],
  ['css braces balanced', open === close],
  ['reaction keyframes retained',
    ['breathe', 'bob', 'tail', 'look'].every(k => hAfter.includes('@keyframes ' + k))],
  ['proto2 version line gone', !/Version 1\.7/.test(
    fs.readFileSync(path.join(ROOT, 'proto2', 'js', 'ui.js'), 'utf8'))],
];
let bad = 0;
for (const [label, ok] of checks) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label);
  if (!ok) bad++;
}
console.log('css braces: ' + open + ' / ' + close);
console.log(bad ? bad + ' CHECK(S) FAILED' : 'all ' + checks.length + ' checks passed');
process.exit(bad ? 1 : 0);