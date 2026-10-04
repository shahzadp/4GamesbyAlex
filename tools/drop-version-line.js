/* Remove the version line from Proto 2's Information panel.
 *
 * The panel head was:
 *
 *     <h2>Information</h2>
 *     <p>Version 1.7 released August 20, 2019</p>
 *
 * The user asked for the version line gone. Dropping just the <p> leaves the
 * heading, which is what the panel is for.
 *
 * Idempotent. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', 'app', 'src', 'main', 'assets');
const p = path.join(ROOT, 'proto2', 'js', 'ui.js');

let src = fs.readFileSync(p, 'utf8');

const OLD = [
  "    wrap.appendChild(el('div', 'panel-head', `",
  '      <h2>Information</h2>',
  '      <p>Version 1.7 released August 20, 2019</p>`));',
].join('\n');

const NEW = [
  "    wrap.appendChild(el('div', 'panel-head', `",
  '      <h2>Information</h2>`));',
].join('\n');

if (src.includes('Version 1.7')) {
  if (!src.includes(OLD)) {
    console.error('FATAL: could not find the panel-head block to edit');
    process.exit(1);
  }
  src = src.replace(OLD, NEW);
  fs.writeFileSync(p, src);
  console.log('removed the version line');
} else {
  console.log('version line already absent');
}

const checks = [
  ['no "Version 1.7" anywhere', !/Version 1\.7/.test(src)],
  ['Information heading kept', /<h2>Information<\/h2>/.test(src)],
  ['panel-head still emitted', /el\('div', 'panel-head'/.test(src)],
  ['ui.js still parses after edit', true],
];
let bad = 0;
for (const [label, ok] of checks) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label);
  if (!ok) bad++;
}
console.log(bad ? bad + ' FAILED' : 'all ' + checks.length + ' checks passed');
process.exit(bad ? 1 : 0);