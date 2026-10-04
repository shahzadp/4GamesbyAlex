/* Rewrite the host launcher's game-4 page.
 *
 * Replaces the old hand-rolled "Micro Economy" page with a same-origin iframe
 * hosting Proto 2, drops its script tag, and retitles the launcher card.
 *
 * Why an iframe rather than inlining the files:
 *   - Proto 2 is an ES-module app. Its graph is js/*.js with static imports,
 *     which cannot be folded into this page's classic <script> world.
 *   - It owns its own viewport (`100dvh`), canvas sizing and devicePixelRatio
 *     handling. Sharing this document would put two competing layout systems on
 *     one page, and this page's `.page { display:none }` visibility toggling
 *     would fight Proto 2's own canvas visibility flag.
 *   - The host already serves everything from
 *     https://appassets.androidplatform.net/ via WebViewAssetLoader, so the
 *     iframe gets a real secure origin. That is the actual requirement for
 *     modules to load at all — on file:// they fail with an opaque origin,
 *     which is why Proto 2's standalone wrapper needs its own AssetResolver.
 *
 * Run with: node tools/embed-proto2.cjs
 * Idempotent: it rebuilds the whole page-4 block from scratch every run, so
 * running it twice cannot leave two copies of anything behind.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'app', 'src', 'main', 'assets');
const html = path.join(ROOT, 'index.html');
const PAGE = 'economy';

const NEW_BLOCK = [
  '    <!-- ================= PAGE 4: PROTO 2 ================= -->',
  '    <!-- Proto 2, the economy simulator, running as a same-origin iframe so it keeps',
  '         its own document, module scope and 100dvh layout. See tools/embed-proto2.cjs',
  '         for why it is framed rather than inlined.',
  '',
  '         No src in the markup: app.js attaches it on first entry, so the whole module',
  '         graph (about 512 KB across 15 files) is not fetched by a player who only ever',
  '         opens the other three games. -->',
  `    <section id="page-${PAGE}" class="page" data-page="${PAGE}">`,
  '      <iframe class="proto-frame" id="proto-frame" title="Proto 2 economy simulator"',
  '              allow="autoplay"></iframe>',
  '    </section>',
];

let src = fs.readFileSync(html, 'utf8');
const original = src;
let lines = src.split('\n');

/* ---- 1. excise everything belonging to page 4 --------------------------
 *
 * Rebuilding the block wholesale is what makes this idempotent. Two earlier
 * attempts edited in place and left a duplicated banner comment behind, because
 * the walk-back stopped at a blank line it did not recognise as part of the
 * block. Deleting from the FIRST banner (or the section itself, if there is no
 * banner) through the section's matching close has no such blind spot: whatever
 * is there, including a previous run's output, is replaced by exactly one copy.
 */

const sectionRe = new RegExp(`<section id="page-${PAGE}"`);
const bannerRe = /<!-- =+[^>]*PAGE 4[^>]*=+ -->/i;

let sectionIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (sectionRe.test(lines[i])) { sectionIdx = i; break; }
}
if (sectionIdx < 0) {
  console.error('FATAL: no <section id="page-' + PAGE + '"> in index.html');
  process.exit(1);
}

/* Find the end by counting <section>/</section> on the page's own line. */
let depth = 0, endIdx = sectionIdx;
for (let i = sectionIdx; i < lines.length; i++) {
  for (const m of lines[i].matchAll(/<\/?section\b/g)) {
    depth += m[0][1] === '/' ? -1 : 1;
  }
  if (depth === 0) { endIdx = i; break; }
}

/* Start of the block: the first banner at or before the section.
   The banner pattern admits any character but the comment terminator, because
   the real text is "PAGE 4: MICRO ECONOMY" and a [ \w] class cannot match the
   colon. That mismatch did not throw — it silently skipped the banner and
   appended a fresh one on every run. */
/* Belongs to the banner block if it is blank, opens or closes a comment, or is
   an indented continuation. Testing indentation alone was not enough: the second
   line of the block is the comment's own opening delimiter and sits at four
   spaces, so the walk stopped one line short of the banner and every run
   appended another one. */
const inCommentBlock = (l) => l.trim() === ''
  || l.trim().startsWith('<!--') || l.trim().endsWith('-->')
  || /^\s{5,}/.test(l);

let startIdx = sectionIdx;
for (let i = sectionIdx - 1; i >= 0; i--) {
  if (bannerRe.test(lines[i])) { startIdx = i; break; }
  if (!inCommentBlock(lines[i])) break;
}
/* Swallow the blank line separating it from the previous page. */
if (startIdx > 0 && lines[startIdx - 1].trim() === '') startIdx--;

const removedCount = endIdx - startIdx + 1;
lines = lines.slice(0, startIdx).concat(NEW_BLOCK, lines.slice(endIdx + 1));
src = lines.join('\n');
console.log('page-' + PAGE + ': replaced lines ' + (startIdx + 1) + '-' + (endIdx + 1)
  + ' (' + removedCount + ') with ' + NEW_BLOCK.length);

/* ---- 2. drop the old implementation's script tag ----------------------- */

const scriptRe = /[ \t]*<script src="economy\.js"><\/script>\r?\n/;
if (scriptRe.test(src)) {
  src = src.replace(scriptRe, '');
  console.log('removed <script src="economy.js">');
} else {
  console.log('economy.js script tag already absent');
}

/* ---- 3. retitle the launcher card --------------------------------------- */

if (/<h2>Micro Economy<\/h2>/.test(src)) {
  src = src.replace(/(<!-- Card 4: )Micro Economy( -->)/, '$1Proto 2$2');
  src = src.replace('<h2>Micro Economy</h2>', '<h2>Proto 2</h2>');
  console.log('retitled launcher card to "Proto 2"');
} else {
  console.log('launcher card already retitled');
}

if (src === original) {
  console.log('already up to date; no write');
} else {
  fs.writeFileSync(html, src);
  console.log('wrote ' + path.relative(process.cwd(), html));
}

/* ---- 4. verify the invariants that actually matter --------------------- */

const block = src.split('\n').filter(l => /PAGE 4|Proto 2, the economy|proto-frame|page-economy/.test(l));

/* Asset-root hygiene.
 *
 * Everything under app/src/main/assets is packaged into the signed APK, so a
 * scratch file written there ships silently. This exists because exactly that
 * happened during this integration: a CDP probe, probe-frame.js, was written
 * into the assets root and ended up inside app-release.apk. Nothing broke, but a
 * probe can reference a WebView bridge that R8 strips, and a stray file in a
 * signed artefact is the kind of thing nobody notices until it matters.
 *
 * Expected entries: the five page files, plus the images/, engine/ and proto2/
 * directories (checked separately below). Anything else is reported by name. */
const ASSET_EXPECTED = new Set([
  'index.html', 'app.js', 'styles.css', 'chess-core.js', 'chess-engine.js',
]);
const ASSET_STRAYS = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter(d => d.isFile())
  .map(d => d.name)
  .filter(f => !ASSET_EXPECTED.has(f));
const checks = [
  ['page-economy section present', new RegExp(`id="page-${PAGE}"`).test(src)],
  ['iframe present', /id="proto-frame"/.test(src)],
  ['iframe lazy (no src in markup)', !/id="proto-frame"[^>]*\ssrc=/.test(src)],
  ['exactly ONE page-4 banner', (src.match(/PAGE 4: PROTO 2/g) || []).length === 1],
  ['exactly ONE iframe', (src.match(/id="proto-frame"/g) || []).length === 1],
  ['economy.js script gone', !/src="economy\.js"/.test(src)],
  ['no econ- markup left', !/id="econ-|class="econ-/.test(src)],
  ['card 4 says Proto 2', /<h2>Proto 2<\/h2>/.test(src)],
  ['other games still reachable',
    ['flappy', 'chess', 'pet'].every(g => src.includes('data-target="' + g + '"'))
    && /id="page-flappy"/.test(src) && /id="page-chess"/.test(src) && /id="page-pet"/.test(src)],
  ['chess scripts intact',
    /src="chess-core\.js"/.test(src) && /src="chess-engine\.js"/.test(src)],
  /* The Stockfish path is named in chess-engine.js (SCRIPT_PATH), not in the HTML,
     so searching index.html for it reported a false failure on an intact install. */
  ['stockfish assets on disk',
    fs.existsSync(path.join(ROOT, 'engine', 'stockfish-19-lite-single.js'))
    && fs.existsSync(path.join(ROOT, 'engine', 'stockfish-19-lite-single.wasm'))],
  ['stockfish path referenced',
    /engine\/stockfish-19-lite-single\.js/.test(
      fs.readFileSync(path.join(ROOT, 'chess-engine.js'), 'utf8'))],
  ['proto2 assets staged',
    fs.existsSync(path.join(ROOT, 'proto2', 'index.html'))
    && fs.existsSync(path.join(ROOT, 'proto2', 'css', 'dark.css'))
    && fs.existsSync(path.join(ROOT, 'proto2', 'js', 'app.js'))],
  ['app.js still loaded', /<script src="app\.js"><\/script>/.test(src)],

  ['no stray files in assets root (strays: '
    + (ASSET_STRAYS.length ? ASSET_STRAYS.join(', ') : 'none') + ')',
    ASSET_STRAYS.length === 0],
];

let bad = 0;
for (const [label, ok] of checks) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label);
  if (!ok) bad++;
}
console.log(bad ? bad + ' CHECK(S) FAILED' : 'all ' + checks.length + ' checks passed');
process.exit(bad ? 1 : 0);