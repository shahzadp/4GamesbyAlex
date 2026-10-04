/* Add (or refresh) the Proto 2 layout overrides in styles.css.
 *
 * Two things are needed, and the second is the one that actually mattered.
 *
 * 1. `.proto-frame` — fills the page box. `border: 0` is load-bearing: the UA's
 *    default 2px inset border shrinks the content box by 4px, and Proto 2
 *    derives its canvas scale from its own clientWidth, so those 4px would
 *    mis-scale the map on every launch.
 *
 * 2. Undo the `body.theme-economy` overrides further up this file. They were
 *    written for the OLD economy page, which was a long scrolling document, and
 *    they are actively wrong for an embedded app that owns its own viewport:
 *
 *        body.theme-economy        { display: block; overflow-y: auto; }
 *        body.theme-economy #page-economy.active { flex: none; height: auto; }
 *
 *    `flex: none; height: auto` is what broke it. With the page not allowed to
 *    grow, the iframe's `flex: 1 1 auto` had nothing to grow into and collapsed
 *    to its intrinsic size — measured on the device at roughly 327x120 CSS px,
 *    i.e. the shell's content width but a sliver of height, with the rest of the
 *    screen showing the host's background. Nothing threw; the game simply
 *    rendered into a letterbox.
 *
 *    These must come AFTER the theme block in source order to win, which is why
 *    they are appended at the end rather than edited in place.
 *
 * Idempotent: removes any previous block of its own before appending.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', 'app', 'src', 'main', 'assets');
const p = path.join(ROOT, 'styles.css');

const BEGIN = '/* ================= PROTO 2 (GAME 4) LAYOUT =================';
const BLOCK = [
  BEGIN,
  ' * Proto 2 is a self-contained document with its own topbar, canvas and bottom',
  ' * tab bar, so it gets the whole page: no host chrome, and its own in-game back',
  ' * control where the brand mark would be. See tools/embed-proto2.cjs.',
  ' */',
  '',
  '/* The frame fills the page box. `.page.active` is a flex column, so flex:1 gives',
  '   the frame the full height between the status bar and the system nav bar. */',
  '.proto-frame {',
  '  flex: 1 1 auto;',
  '  width: 100%;',
  '  min-height: 0;',
  '  display: block;',
  '  border: 0;            /* the UA 2px inset border would shrink clientWidth by 4px */',
  '  background: #0b0e14;',
  '  color-scheme: dark;',
  '}',
  '',
  '/* Undo the old economy page\'s scrolling-page overrides (see header note). The old',
  '   rules made the body a scrolling block and stopped the page growing; an embedded',
  '   app wants the opposite — a fixed viewport that never scrolls the host document,',
  '   because the game scrolls its own panels. */',
  'body.theme-economy {',
  '  display: block;',
  '  height: 100vh;',
  '  height: 100dvh;',
  '  min-height: 0;',
  '  overflow: hidden;',
  '}',
  '',
  '/* The shell carries 1rem of horizontal padding and a safe-area bottom inset for the',
  '   other games, which sit inside a frame. Proto 2 draws its own edges and handles its',
  '   own safe areas, so both would show up as a dead border around the game. */',
  'body.theme-economy .mobile-app-shell {',
  '  height: 100%;',
  '  min-height: 0;',
  '  padding: 0;',
  '}',
  '',
  'body.theme-economy #page-economy.active {',
  '  flex: 1 1 auto;',
  '  height: auto;',
  '  min-height: 0;',
  '}',
  '',
  '/* The host\'s page-fade animation translates the page; on a canvas that reads as a',
  '   smear every time the game is entered, and it also creates a compositing layer',
  '   that makes the iframe repaint on the wrong cadence. */',
  'body.theme-economy #page-economy.active {',
  '  animation: none;',
  '}',
  '',
].join('\n');

let src = fs.readFileSync(p, 'utf8');
const original = src;

/* Remove a previous block of ours, from BEGIN to the next top-level marker. */
if (src.includes(BEGIN)) {
  const from = src.indexOf(BEGIN);
  const rest = src.slice(from + BEGIN.length);
  const nextMarker = rest.search(/\n\/\* =+[^*]*=+ \*\//);
  const end = nextMarker >= 0 ? from + BEGIN.length + nextMarker + 1 : src.length;
  src = src.slice(0, from) + src.slice(end);
  console.log('removed previous Proto 2 layout block');
}

src = src.replace(/\s*$/, '') + '\n\n' + BLOCK;
fs.writeFileSync(p, src);
console.log('appended Proto 2 layout block');

/* An unbalanced sheet silently drops rules after the damage. */
const open = (src.match(/{/g) || []).length;
const close = (src.match(/}/g) || []).length;

const checks = [
  ['.proto-frame present', /\.proto-frame\s*\{/.test(src)],
  ['frame border reset', /\.proto-frame\s*\{[\s\S]*?border:\s*0/.test(src)],
  ['frame flex fill', /\.proto-frame\s*\{[\s\S]*?flex:\s*1 1 auto/.test(src)],
  ['theme-economy overflow hidden',
    /body\.theme-economy\s*\{[\s\S]*?overflow:\s*hidden/.test(src)],
  ['page-economy allowed to grow',
    /#page-economy\.active\s*\{[\s\S]*?flex:\s*1 1 auto/.test(src)],
  ['shell padding removed',
    /body\.theme-economy \.mobile-app-shell\s*\{[\s\S]*?padding:\s*0/.test(src)],
  ['page fade animation disabled',
    /#page-economy\.active\s*\{[\s\S]*?animation:\s*none/.test(src)],
  ['braces balanced', open === close],
  ['other pages still styled',
    /\.mobile-stage-container\s*\{/.test(src) && /\.app-launch-card\s*\{/.test(src)],
];
let bad = 0;
for (const [label, ok] of checks) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label);
  if (!ok) bad++;
}
console.log('braces: ' + open + ' / ' + close);
console.log(bad ? bad + ' CHECK(S) FAILED' : 'all ' + checks.length + ' checks passed');
process.exit(bad ? 1 : 0);