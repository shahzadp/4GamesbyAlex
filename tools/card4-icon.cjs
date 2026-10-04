/* Use the Proto 2 launcher icon as the game-4 card artwork.
 *
 * The card lives in a WebView, so the icon cannot come from res/ — an Android
 * drawable is not addressable from the page. It is inlined as SVG instead,
 * transcribed from the same two vector drawables the Proto 2 APK ships
 * (ic_launcher_background.xml and ic_launcher_foreground.xml):
 *
 *   background  linear #3B4363 -> #5A5480 on the diagonal, plus a radial bloom
 *               centred at (30,26) r54 in #BFC6F5 at 40%, falling to transparent
 *   foreground  the crown, its 24-unit artwork scaled 2.2x and offset 27.6 so it
 *               lands in the middle of the 108 canvas — the same transform the
 *               adaptive icon uses to stay inside the 72dp safe zone
 *   ink         #A8801F, the stroke that keeps a champagne fill legible at 48dp
 *
 * Gradient ids are prefixed p2- because SVG ids are document-global on this
 * page, and the host already draws gradients for the other three card thumbs.
 *
 * Idempotent: replaces whatever is currently inside the card-4 thumb.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', 'app', 'src', 'main', 'assets');
const html = path.join(ROOT, 'index.html');

const THUMB_CLASS_OLD = 'card-thumb economy-thumb';
const THUMB_CLASS_NEW = 'card-thumb proto2-thumb';
const CARD_CLASS_OLD = 'app-launch-card economy-card';
const CARD_CLASS_NEW = 'app-launch-card proto2-card';

const ICON = [
  '          <div class="card-thumb proto2-thumb">',
  '            <!-- The Proto 2 adaptive launcher icon, transcribed from the APK\'s',
  '                 ic_launcher_background.xml + ic_launcher_foreground.xml. Inline SVG',
  '                 because a res/ drawable is not addressable from a WebView page. -->',
  '            <svg class="proto2-thumb-icon" viewBox="0 0 108 108" aria-hidden="true" focusable="false">',
  '              <defs>',
  '                <linearGradient id="p2-bg" x1="0" y1="0" x2="108" y2="108" gradientUnits="userSpaceOnUse">',
  '                  <stop offset="0" stop-color="#3B4363"/>',
  '                  <stop offset="1" stop-color="#5A5480"/>',
  '                </linearGradient>',
  '                <radialGradient id="p2-bloom" cx="30" cy="26" r="54" gradientUnits="userSpaceOnUse">',
  '                  <stop offset="0" stop-color="#BFC6F5" stop-opacity=".4"/>',
  '                  <stop offset="1" stop-color="#BFC6F5" stop-opacity="0"/>',
  '                </radialGradient>',
  '                <linearGradient id="p2-crown" x1="0" y1="0" x2="0" y2="24" gradientUnits="userSpaceOnUse">',
  '                  <stop offset="0" stop-color="#FFF2CD"/>',
  '                  <stop offset="1" stop-color="#FFDF94"/>',
  '                </linearGradient>',
  '              </defs>',
  '              <rect width="108" height="108" fill="url(#p2-bg)"/>',
  '              <rect width="108" height="108" fill="url(#p2-bloom)"/>',
  '              <g transform="translate(27.6 27.6) scale(2.2)">',
  '                <path d="M3.4 8.6l3.5 2.9L12 4.8l5.1 6.7 3.5-2.9-1.4 8.8H4.8L3.4 8.6z"',
  '                      fill="url(#p2-crown)" stroke="#A8801F" stroke-width="1.15" stroke-linejoin="round"/>',
  '                <path d="M5.2 15.4h13.6" fill="none" stroke="#A8801F" stroke-width="1.1" stroke-linecap="round"/>',
  '                <circle cx="12" cy="13.2" r="1.5" fill="#FFFAF0"/>',
  '                <circle cx="3.4" cy="8.6" r="1.5" fill="#FFF2CD"/>',
  '                <circle cx="20.6" cy="8.6" r="1.5" fill="#FFF2CD"/>',
  '                <circle cx="12" cy="4.8" r="1.6" fill="#FFFAF0"/>',
  '              </g>',
  '            </svg>',
  '          </div>',
].join('\n');

let src = fs.readFileSync(html, 'utf8');
const original = src;

/* Card class. */
if (src.includes(CARD_CLASS_OLD)) {
  src = src.replace(CARD_CLASS_OLD, CARD_CLASS_NEW);
  console.log('card class -> proto2-card');
} else if (src.includes(CARD_CLASS_NEW)) {
  console.log('card class already proto2-card');
}

/* Thumb contents. Matches the opening tag with either class and stops at the
   first line that is just a closing div, which is the thumb's own. */
const thumbRe = /[ \t]*<div class="card-thumb (?:economy|proto2)-thumb">[\s\S]*?\n[ \t]*<\/div>/;
if (thumbRe.test(src)) {
  const before = src.match(thumbRe)[0];
  if (before.includes('p2-crown')) {
    console.log('thumb icon already in place');
  } else {
    src = src.replace(thumbRe, ICON);
    console.log('thumb icon inserted');
  }
} else {
  console.error('FATAL: could not find the card-4 thumb block');
  process.exit(1);
}

if (src !== original) fs.writeFileSync(html, src);
console.log('wrote ' + path.relative(process.cwd(), html));

const checks = [
  ['card uses proto2-card', src.includes(CARD_CLASS_NEW)],
  ['old economy-card class gone', !src.includes(CARD_CLASS_OLD)],
  ['thumb uses proto2-thumb', src.includes(THUMB_CLASS_NEW)],
  ['icon svg present', src.includes('class="proto2-thumb-icon"')],
  ['crown path present', src.includes('M3.4 8.6l3.5 2.9L12 4.8')],
  ['adaptive-icon transform (2.2x, 27.6)', src.includes('translate(27.6 27.6) scale(2.2)')],
  ['ink stroke present', src.includes('#A8801F')],
  ['gradient ids namespaced', src.includes('p2-bg') && src.includes('p2-crown')],
  ['only one p2-crown def',
    (src.match(/id="p2-crown"/g) || []).length === 1],
  ['card 4 still launches game 4', /class="app-launch-card proto2-card" data-target="economy"/.test(src)],
  ['card title still Proto 2', /<h2>Proto 2<\/h2>/.test(src)],
  ['other three cards untouched',
    ['flappy-card', 'chess-card', 'pet-card'].every(c => src.includes(c))],
];
let bad = 0;
for (const [label, ok] of checks) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label);
  if (!ok) bad++;
}
console.log(bad ? bad + ' CHECK(S) FAILED' : 'all ' + checks.length + ' checks passed');
process.exit(bad ? 1 : 0);