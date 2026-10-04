/* A/B toggle for a CSS declaration, for the launcher/pet CPU investigation.
 *
 * Usage:
 *   node tools/ab-css.js on  <selector> <declarations>
 *   node tools/ab-css.js off
 *
 * Example:
 *   node tools/ab-css.js on ".pet-avatar #touch-dog-svg" "filter: none !important"
 *
 * Generic on purpose. The first investigation used a bespoke script for one
 * selector and it cost a build cycle to generalise; and because the declared
 * hypothesis turned out to be wrong, being able to flip any single declaration
 * quickly is what actually made progress.
 *
 * Measurement must go through tools/measure-cpu.js. `top -b -n 1` reads anywhere
 * from 0.0% to 87% for the same steady state on this device and would have
 * "confirmed" the first wrong hypothesis. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', 'app', 'src', 'main', 'assets');
const p = path.join(ROOT, 'styles.css');

const BEGIN = '/* AB-TEST */';
const END = '/* /AB-TEST */';

let src = fs.readFileSync(p, 'utf8');

/* Always clear first, so on/off is order-independent and idempotent. */
if (src.includes(BEGIN)) {
  const from = src.indexOf(BEGIN);
  const to = src.indexOf(END, from) + END.length;
  src = src.slice(0, from) + src.slice(to).replace(/^\r?\n/, '');
  fs.writeFileSync(p, src);
  console.log('override removed');
  if (process.argv[2] !== 'on') process.exit(0);
}

if (process.argv[2] === 'on') {
  const sel = process.argv[3];
  const decl = process.argv[4];
  if (!sel || !decl) {
    console.error('usage: ab-css.js on <selector> <declarations>');
    process.exit(1);
  }
  const block = [BEGIN, `${sel} {`, `  ${decl}`, '}', END, ''].join('\n');
  fs.writeFileSync(p, src.replace(/\s*$/, '') + '\n\n' + block);
  console.log(`override ADDED: ${sel} { ${decl} }`);
} else {
  console.log('nothing to do');
}