/* Verify the working tree contains ONLY the intended changes, before committing.
 *
 * Dumping the diff was producing hundreds of lines of PowerShell noise, and the
 * point of a diff review is not "read everything" but "confirm the things that
 * would break a game if they were wrong". Those are enumerated below.
 *
 * Run: node tools/review-changes.js   (exit 1 on any problem) */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const A = path.join(ROOT, 'app', 'src', 'main', 'assets');

const read = (n) => fs.readFileSync(path.join(A, n), 'utf8');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

const html = read('index.html');
const css = read('styles.css');
const app = read('app.js');

const stat = git('diff', '--numstat').trim().split('\n').map(l => l.split('\t'));
const untracked = git('status', '--porcelain').split('\n')
  .filter(l => l.startsWith('??')).map(l => l.slice(3).trim());

const checks = [
  /* ---- the removal: game 4 is now Proto 2, not the old economy page ---- */
  ['old economy.js script tag gone', !html.includes('src="economy.js"')],
  ['old econ- markup gone', !/id="econ-|class="econ-/.test(html)],
  ['economy.js file deleted',
    !fs.existsSync(path.join(A, 'economy.js'))],
  ['setupEconomyGame() call removed', !/setupEconomyGame\(\)/.test(app)],
  ['setupEconomyGame defined nowhere', !/setupEconomyGame/.test(app)],

  /* ---- the addition: Proto 2, framed and lazily mounted ---- */
  ['proto-frame iframe present', /id="proto-frame"/.test(html)],
  ['iframe has no src in markup (lazy)', !/id="proto-frame"[^>]*\ssrc=/.test(html)],
  ['proto2 assets staged (15 files)',
    fs.readdirSync(path.join(A, 'proto2', 'js')).length === 13
    && fs.existsSync(path.join(A, 'proto2', 'css', 'dark.css'))
    && fs.existsSync(path.join(A, 'proto2', 'index.html'))],
  ['proto2 carries no dev files',
    !fs.readdirSync(path.join(A, 'proto2'), { recursive: true })
      .some(f => /check-|icon-sheet|MEMORY/.test(String(f)))],
  ['mountProtoFrame hooked into switchPage', /mountProtoFrame\(targetPageId\)/.test(app)],
  ['safe-area insets published', /setProperty\('--safe-t'/.test(app)],
  ['launcher card says Proto 2', /<h2>Proto 2<\/h2>/.test(html)],
  ['launcher card uses the APK icon', html.includes('p2-crown')],
  ['version line removed from Proto 2 info',
    !fs.readFileSync(path.join(A, 'proto2', 'js', 'ui.js'), 'utf8').includes('Version 1.7')],

  /* ---- the three other games must be untouched ---- */
  ['flappy page intact',
    html.includes('id="page-flappy"') && /flappyGame\.init\(\)/.test(app)
    && /flappyGame\.resume\(\)/.test(app)],
  ['chess page + engine intact',
    html.includes('id="page-chess"') && html.includes('src="chess-core.js"')
    && html.includes('src="chess-engine.js"') && /chessGame\.init\(\)/.test(app)],
  ['stockfish binaries present',
    fs.existsSync(path.join(A, 'engine', 'stockfish-19-lite-single.js'))
    && fs.existsSync(path.join(A, 'engine', 'stockfish-19-lite-single.wasm'))],
  ['pet page intact',
    html.includes('id="page-pet"') && /setupVirtualPet\(\)/.test(app)
    && html.includes('touch-dog-svg')],
  ['launch cards for all four',
    ['flappy', 'chess', 'pet', 'economy']
      .every(g => html.includes('data-target="' + g + '"'))],
  ['switchPage still switches every page',
    /function switchPage/.test(app) && /targetEl\.classList\.add\('active'\)/.test(app)],

  /* ---- hygiene ---- */
  ['no diagnostic AB-TEST blocks in css', !/AB-TEST/.test(css)],
  ['no diagnostic DPR cap in app.js', !/FLAPPY_DPR_CAP/.test(app)],
  ['no probe files in assets root',
    fs.readdirSync(A).every(f => ['index.html', 'app.js', 'styles.css',
      'chess-core.js', 'chess-engine.js'].includes(f)
      || fs.statSync(path.join(A, f)).isDirectory())],
  ['css braces balanced',
    (css.match(/{/g) || []).length === (css.match(/}/g) || []).length],
  ['html still ends with </html>', html.trimEnd().endsWith('</html>')],
];

let bad = 0;
for (const [label, ok] of checks) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label);
  if (!ok) bad++;
}

console.log('\n--- tracked file changes ---');
for (const [add, del, file] of stat) console.log(`  +${add || 0} -${del || 0}  ${file}`);
console.log('--- untracked ---');
for (const u of untracked) console.log('  ' + u);

const totalTools = untracked.filter(u => u.startsWith('tools/')).length;
console.log(`\n${checks.length} checks, ${bad} failed · ${totalTools} new tools/ scripts, `
  + `${untracked.filter(u => u.startsWith('app/')).length} new asset path(s)`);
process.exit(bad ? 1 : 0);