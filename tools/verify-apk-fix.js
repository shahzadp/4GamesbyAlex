/* Read an asset out of the built APK and report whether the pet fix is in it.
 *
 * Needed because the first post-fix measurement came back at 110% — unchanged —
 * and there are two possible explanations (stale APK, or a wrong theory) and they
 * need to be told apart before anything else is tried. */
const { execFileSync } = require('child_process');
const path = require('path');

const APK = path.resolve('app/build/outputs/apk/release/app-release.apk');
const work = process.env.LOCALAPPDATA + '\\Temp\\proto-apkcheck';
execFileSync('powershell', ['-NoProfile', '-Command',
  `if (Test-Path '${work}') { Remove-Item '${work}' -Recurse -Force }`]);
execFileSync('powershell', ['-NoProfile', '-Command',
  `Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
  `[System.IO.Compression.ZipFile]::ExtractToDirectory('${APK}','${work}')`]);

const fs = require('fs');
const read = (n) => fs.readFileSync(path.join(work, 'assets', n), 'utf8');
const html = read('index.html');
const css = read('styles.css');

const checks = [
  ['index.html: pet-fix comment present', html.includes('Idle motion moved OFF')],
  ['index.html: #torso idle loop GONE',
    !html.includes('#torso{transform-origin:200px 556px;animation:breathe')],
  ['index.html: #head idle loop GONE',
    !html.includes('#head{transform-origin:200px 292px;animation:bob')],
  ['index.html: #tail idle loop GONE',
    !html.includes('#tail{transform-origin:282px 440px;animation:tail')],
  ['index.html: #pL,#pR look loop GONE',
    !html.includes('#pL,#pR{transition:transform .15s;animation:look')],
  ['index.html: blink KEPT', /#eyes\{[^}]*animation:blink/.test(html)],
  ['index.html: reactions intact', html.includes('.bark #head')],
  ['styles.css: drop-shadow GONE', !css.includes('drop-shadow(0 13px 12px')],
  ['styles.css: petIdle keyframes present', css.includes('@keyframes petIdle')],
  ['styles.css: container animation applied', css.includes('animation: petIdle 5.5s')],
  ['proto2: version line GONE',
    !read('proto2/js/ui.js').includes('Version 1.7')],
];

let bad = 0;
for (const [label, ok] of checks) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label);
  if (!ok) bad++;
}
console.log(bad
  ? bad + ' NOT in the APK — the build is stale, the theory is untested'
  : 'the fix IS in the APK; the theory was wrong');
process.exit(bad ? 1 : 0);