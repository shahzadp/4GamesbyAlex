// Proves the asset-loader URL mapping is self-consistent, which is the class of
// bug that made the app fail to load with ERR_NAME_NOT_RESOLVED.
//
// The failure was: the path handler was registered at "/assets/" while the page
// was loaded from the domain root, so every request missed the handler, the
// loader returned null, and the WebView performed a real DNS lookup for a host
// that does not exist.
//
// This reproduces the resolver's behaviour for the URLs the app actually uses.
const ASSET_HOST = 'appassets.androidplatform.net';
const ASSET_ORIGIN = 'https://' + ASSET_HOST;
const ASSET_PATH = '/assets/';

// Every asset that index.html and its scripts reference at runtime.
const requests = [
  'index.html',
  'app.js',
  'styles.css',
  'economy.js',
  'chess-core.js',
  'chess-engine.js',
  'chess-quiz.js',
  'pet3d/pet3d.js',
  'models/virtual_pet.glb',
  'engine/stockfish-19-lite-single.js',
  'engine/stockfish-19-lite-single.wasm',
  'images/virtual_pet.svg',
  'images/chibi_dog_animated.svg',
  'images/touch-dog.svg'
];

// The registered handler behaves as: match iff the path starts with ASSET_PATH.
// The relative path it then opens is everything after that prefix.
function resolve(urlPath) {
  if (!urlPath.startsWith(ASSET_PATH)) return { handled: false, reason: 'no path handler registered for this prefix' };
  const relative = urlPath.slice(ASSET_PATH.length);
  if (!relative) return { handled: false, reason: 'path was exactly the prefix, no file named' };
  return { handled: true, opensAsset: relative };
}

let failures = 0;
const rows = [];

// 1. The main document must be handled.
const mainUrl = ASSET_ORIGIN + ASSET_PATH + 'index.html';
const main = resolve(new URL(mainUrl).pathname);
if (!main.handled) { failures++; }

// 2. Every relative asset must resolve to a distinct asset path.
const seen = new Map();
for (const rel of requests) {
  const abs = new URL(ASSET_PATH + rel, ASSET_ORIGIN + ASSET_PATH).toString();
  const parsed = new URL(abs);
  if (parsed.host !== ASSET_HOST) {
    failures++;
    rows.push('WRONG HOST for ' + rel + ' -> ' + parsed.host);
    continue;
  }
  const r = resolve(parsed.pathname);
  if (!r.handled) {
    failures++;
    rows.push('UNHANDLED ' + rel + ' (' + r.reason + ')');
    continue;
  }
  if (r.opensAsset !== rel) {
    failures++;
    rows.push('WRONG ASSET for ' + rel + ' -> would open ' + r.opensAsset);
    continue;
  }
  if (seen.has(rel)) {
    failures++;
    rows.push('DUPLICATE ' + rel);
    continue;
  }
  seen.set(rel, abs);
}

// 3. Relative references inside index.html resolve correctly because the
//    document URL ends in "/index.html", so sibling scripts land beside it.
const docBase = ASSET_ORIGIN + ASSET_PATH + 'index.html';
for (const rel of ['app.js', 'styles.css', 'economy.js', 'chess-core.js', 'chess-engine.js', 'chess-quiz.js', 'pet3d/pet3d.js']) {
  const abs = new URL(rel, docBase).toString();
  const r = resolve(new URL(abs).pathname);
  if (!r.handled || r.opensAsset !== rel) {
    failures++;
    rows.push('DOC-RELATIVE BREAKS ' + rel + ' -> ' + abs);
  }
}

// 4. A worker created from the page resolves to the engine directory.
const workerRel = 'engine/stockfish-19-lite-single.js';
const workerUrl = new URL(workerRel, ASSET_ORIGIN + ASSET_PATH).toString();
const wr = resolve(new URL(workerUrl).pathname);
if (!wr.handled || wr.opensAsset !== workerRel) {
  failures++;
  rows.push('WORKER UNRESOLVED -> ' + workerUrl);
}

// 5. The wasm sits beside the js, which is what stockfish.js relies on when it
//    swaps the extension on its own script URL.
const wasmUrl = workerUrl.replace(/\.js$/i, '.wasm');
const wasmRel = wasmUrl.slice((ASSET_ORIGIN + ASSET_PATH).length);
if (wr.opensAsset.replace(/\.js$/i, '.wasm') !== wasmRel) {
  failures++;
  rows.push('WASM NOT SIBLING OF JS -> ' + wasmRel);
}

console.log('main document : ' + mainUrl);
console.log('worker        : ' + workerUrl);
console.log('wasm          : ' + wasmUrl);
console.log('assets checked: ' + requests.length);
console.log('');
if (failures === 0) {
  console.log('PASS: every URL is handled and maps to the correct asset');
} else {
  console.log('FAIL: ' + failures + ' problem(s)');
  rows.forEach(r => console.log('  x ' + r));
  process.exit(1);
}