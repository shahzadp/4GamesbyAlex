/* Add the card-4 thumbnail CSS to the Proto 2 layout block in styles.css.
 *
 * `.card-thumb` is already width:100% / aspect-ratio:1/1 / overflow:hidden, and
 * the Proto 2 launcher icon is square, so the icon needs no sizing of its own
 * beyond filling that box. What it does need is the border and background from
 * the old .economy-thumb rules retired: those painted a green wash and a green
 * hairline, which is the wrong accent for a periwinkle-and-champagne mark.
 *
 * The accent is the icon's own crown colour (#FFDF94) rather than a new colour,
 * so the card's underline and its artwork are provably the same hue.
 *
 * Idempotent: rewritten into the existing Proto 2 block on every run. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', 'app', 'src', 'main', 'assets');
const p = path.join(ROOT, 'styles.css');

const BEGIN = '/* ================= PROTO 2 (GAME 4) LAYOUT =================';

const CARD_CSS = [
  '',
  '/* ---- launcher card artwork ---- */',
  '',
  '/* Card underline. Same hue as the crown in the icon below, so the accent and',
  '   the artwork cannot drift apart. */',
  '.proto2-card { border-bottom: 3px solid #ffdf94; }',
  '',
  '/* The thumbnail box: a hairline in the icon\'s own champagne, on the same',
  '   periwinkle the icon\'s background gradient starts from. */',
  '.proto2-thumb {',
  '  border: 1px solid rgba(255, 223, 148, .22);',
  '  background: #2a2f45;',
  '}',
  '',
  '/* The icon fills the 1:1 thumb. `object-fit` is irrelevant here — it is an',
  '   inline SVG, not a replaced image — so this is a plain fill, and the',
  '   thumb\'s own overflow:hidden + border-radius crop it to the card shape. */',
  '.proto2-thumb-icon {',
  '  width: 100%;',
  '  height: 100%;',
  '  display: block;',
  '}',
  '',
].join('\n');

let src = fs.readFileSync(p, 'utf8');
const original = src;

if (!src.includes(BEGIN)) {
  console.error('FATAL: Proto 2 layout block not found — run style-proto2.cjs first');
  process.exit(1);
}

/* Drop a previous copy of the card CSS if present. */
const priorCard = /\n\/\* ---- launcher card artwork ---- \*\/[\s\S]*?(?=\n\/\* =+|\n@|$)/;
if (priorCard.test(src)) {
  src = src.replace(priorCard, '\n');
  console.log('removed previous card CSS');
}

/* Insert just before the closing brace of the .proto-frame rule's sibling
   block — simplest reliable anchor: the end of the file's Proto 2 block, which
   is the animation reset rule. */
const ANCHOR = "body.theme-economy #page-economy.active {\n  animation: none;\n}";
if (!src.includes(ANCHOR)) {
  console.error('FATAL: animation-reset anchor not found in the Proto 2 block');
  process.exit(1);
}
src = src.replace(ANCHOR, ANCHOR + '\n' + CARD_CSS);

if (src !== original) {
  fs.writeFileSync(p, src);
  console.log('appended card CSS');
} else {
  console.log('card CSS already present');
}

const open = (src.match(/{/g) || []).length;
const close = (src.match(/}/g) || []).length;
const checks = [
  ['.proto2-card accent', /\.proto2-card\s*\{\s*border-bottom:\s*3px solid #ffdf94/.test(src)],
  ['.proto2-thumb rules', /\.proto2-thumb\s*\{/.test(src) && /\.proto2-thumb-icon\s*\{/.test(src)],
  ['icon fills the thumb', /\.proto2-thumb-icon\s*\{[\s\S]*?width:\s*100%/.test(src)],
  ['braces balanced', open === close],
  ['other cards keep their accents',
    /\.flappy-card\s*\{/.test(src) && /\.chess-card\s*\{/.test(src) && /\.pet-card\s*\{/.test(src)],
];
let bad = 0;
for (const [label, ok] of checks) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label);
  if (!ok) bad++;
}
console.log('braces: ' + open + ' / ' + close);
console.log(bad ? bad + ' CHECK(S) FAILED' : 'all ' + checks.length + ' checks passed');
process.exit(bad ? 1 : 0);