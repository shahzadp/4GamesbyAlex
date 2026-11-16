// Headless end-to-end smoke test for the Lichess online mode.
//
//   node tools/lichess-smoke.js
//
// It serves the assets like serve-assets.cjs does, opens the chess page in
// Edge over CDP, replaces window.fetch with a scripted mock of lichess.org
// (account, seek, event stream, board stream, move/resign/draw/abort/claim),
// replaces the Android bridge with a recording mock, and then plays a whole
// game from matchmaking to checkmate through the real UI handlers.
//
// What it proves: the two choice buttons work, the module loads lazily,
// sign-in state renders, a seek posts the right form, the event stream
// adopts the game, the board mirror applies server moves, our move is
// posted as UCI, the game ends correctly, and the PGN is saved through the
// bridge with the right tags.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { Cdp, evaluate, launchEdge, sleep } = require('./cdp-harness');

const root = path.join(__dirname, '..', 'app', 'src', 'main', 'assets');
const port = 8099;
const ASSET_HOST_MARKER = 'lichess.org';

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// The mock page world: AndroidBridge + fetch for lichess.org.
const MOCK = `
(function () {
  var encoder = new TextEncoder();
  var streams = {};
  window.__mockStreams = streams;
  window.__savedPgn = [];
  window.__posts = [];
  window.__pushStream = function (key, obj) {
    var ctrl = streams[key];
    if (!ctrl) throw new Error('no mock stream for ' + key);
    ctrl.enqueue(encoder.encode(JSON.stringify(obj) + '\\n'));
  };

  window.AndroidBridge = {
    lichessHasToken: function () { return !window.__signedOut; },
    lichessToken: function () { return 'test-token'; },
    lichessSignIn: function () { window.__signInOpened = true; },
    lichessSignOut: function () { window.__signedOut = true; return true; },
    savePgn: function (name, content) {
      window.__savedPgn.push({ name: name, content: content });
      return 'Downloads/' + name;
    },
    exitToLauncher: function () { window.__exitCalled = true; },
    enterFullscreen: function () {},
    exitFullscreen: function () {},
    copyToClipboard: function () { return true; },
    saveCompanionName: function () {},
    speak: function () {},
    listenForPet: function () {},
    savePetApiKey: function () { return true; },
    hasPetApiKey: function () { return false; },
    removePetApiKey: function () { return true; },
    setPetLanguage: function () {},
    askPet: function () {}
  };

  function respondJson(obj, status) {
    var s = status || 200;
    return Promise.resolve({
      ok: s >= 200 && s < 300,
      status: s,
      text: function () { return Promise.resolve(JSON.stringify(obj)); },
      body: null,
      headers: {}
    });
  }
  function openStream(key) {
    var stream = new ReadableStream({
      start: function (controller) { streams[key] = controller; }
    });
    return Promise.resolve({
      ok: true,
      status: 200,
      body: stream,
      text: function () { return new Promise(function () {}); },
      headers: {}
    });
  }

  window.fetch = function (input, init) {
    var url = String(input);
    var method = (init && init.method) || 'GET';
    var body = init && init.body ? String(init.body) : '';
    if (url === 'https://lichess.org/api/account') {
      return respondJson({
        id: 'tester',
        username: 'AlexTester',
        perfs: {
          bullet: { rating: 1501, games: 12 },
          blitz: { rating: 1623, games: 40 },
          rapid: { rating: 1702, games: 33 },
          puzzle: { rating: 1400, games: 90 }
        }
      });
    }
    if (url === 'https://lichess.org/api/board/seek' && method === 'POST') {
      window.__seekBody = body;
      return openStream('seek');
    }
    if (url === 'https://lichess.org/api/stream/event') return openStream('event');
    var streamMatch = url.match(/^https:\\/\\/lichess\\.org\\/api\\/board\\/game\\/stream\\/([A-Za-z0-9]{8})$/);
    if (streamMatch) return openStream('board:' + streamMatch[1]);
    var actionMatch = url.match(/^https:\\/\\/lichess\\.org\\/api\\/board\\/game\\/([A-Za-z0-9]{8})\\/(move|resign|draw|abort|claim-victory)(?:\\/(yes|no))?(?:\\/([a-z0-9]+))?/);
    if (actionMatch && method === 'POST') {
      window.__posts.push({
        game: actionMatch[1],
        kind: actionMatch[2],
        suffix: actionMatch[3] || actionMatch[4] || null,
        url: url
      });
      return respondJson({ ok: true });
    }
    if (url === 'https://lichess.org/api/token') {
      return respondJson({ token_type: 'bearer', access_token: 'ignored', expires_in: 31536000 });
    }
    return respondJson({}, 404);
  };
})();
`;

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(root, rel);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (extra ? '  [' + extra + ']' : '')); }
}

(async () => {
  await new Promise((resolve, reject) => {
    server.listen(port, resolve);
    server.on('error', reject);
  });

  const { cdp, close } = await launchEdge({ width: 420, height: 800 });
  try {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: MOCK });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html#chess` });
    for (let i = 0; i < 40; i++) {
      const ready = await evaluate(cdp, '!!(window.chessGame && chessGame.state)');
      if (ready) break;
      await sleep(250);
    }

    console.log('=== 1. Two-button 2-player UI ===');
    ok('the choice row is visible in 2-player mode',
      await evaluate(cdp, "!document.getElementById('chess-choice-row').hidden"));
    ok('Pass & Play is the default choice',
      await evaluate(cdp, "document.getElementById('choice-passplay').classList.contains('active')"));
    ok('header arrows are gone from the chess page',
      await evaluate(cdp, "!document.querySelector('#page-chess [data-back]') && !document.querySelector('#page-chess .nav-quick-btn')"));
    ok('OTB flip class is applied to the board in Pass & Play',
      await evaluate(cdp, "document.getElementById('chessboard').classList.contains('otb-flip-black')"));
    ok('Lichess subtitle shows sync rating copy',
      (await evaluate(cdp, "document.getElementById('lichess-choice-sub').textContent")) === 'Sync rating & play online');
    ok('Lichess panel is hidden before being chosen',
      await evaluate(cdp, "!document.getElementById('chess-lichess-panel').classList.contains('active')"));

    console.log('=== 2. Lazy module load on Lichess tap ===');
    await evaluate(cdp, "document.getElementById('choice-lichess').click()");
    for (let i = 0; i < 40; i++) {
      if (await evaluate(cdp, 'typeof chessOnline !== "undefined" && chessOnline.loaded')) break;
      await sleep(250);
    }
    ok('lichess.js loaded lazily on tap',
      await evaluate(cdp, 'typeof chessOnline !== "undefined" && chessOnline.loaded === true'));
    await sleep(400);
    ok('panel becomes active',
      await evaluate(cdp, "document.getElementById('chess-lichess-panel').classList.contains('active')"));
    ok('OTB flip class is removed in the Lichess choice',
      await evaluate(cdp, "!document.getElementById('chessboard').classList.contains('otb-flip-black')"));
    ok('signed-in hub is shown (mock token)',
      await evaluate(cdp, "document.getElementById('lichess-hub').hidden === false"));
    ok('rating chips rendered for bullet / blitz / rapid',
      await evaluate(cdp, "document.querySelectorAll('#lichess-ratings .lichess-chip').length") === 3);
    ok('username shown',
      await evaluate(cdp, "document.getElementById('lichess-username').textContent") === '@AlexTester');
    const hubShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(os.tmpdir(), 'lichess-hub.png'), Buffer.from(hubShot.data, 'base64'));

    console.log('=== 3. Seek posts Rapid casual by default ===');
    await evaluate(cdp, "document.getElementById('btn-lichess-find').click()");
    await sleep(400);
    ok('seek used the default 10+0 casual preset',
      (await evaluate(cdp, 'window.__seekBody || ""')) === 'time=10&increment=0&rated=false',
      await evaluate(cdp, 'window.__seekBody || ""'));
    ok('searching UI is shown',
      await evaluate(cdp, "document.getElementById('lichess-searching').hidden === false"));

    console.log('=== 4. Event stream adopts the game ===');
    await evaluate(cdp, "window.__pushStream('event', { type: 'gameStart', game: { gameId: 'abcdefgh' } })");
    for (let i = 0; i < 40; i++) {
      if (await evaluate(cdp, 'chessOnline.match && !!chessOnline.match.id')) break;
      await sleep(250);
    }
    ok('match adopted from the event stream',
      (await evaluate(cdp, 'chessOnline.match && chessOnline.match.id')) === 'abcdefgh');

    console.log('=== 5. gameFull sets color, ratings, header ===');
    await evaluate(cdp, "window.__pushStream('board:abcdefgh', { type: 'gameFull', id: 'abcdefgh', variant: { key: 'standard', name: 'Standard', short: 'Std' }, clock: { initial: 600000, increment: 0 }, speed: 'rapid', perf: { name: 'Rapid' }, rated: false, createdAt: Date.now(), white: { id: 'oppo', name: 'Opponent', rating: 1811 }, black: { id: 'tester', name: 'AlexTester', rating: 1702 }, initialFen: 'startpos', state: { type: 'gameState', moves: '', wtime: 600000, btime: 600000, winc: 0, binc: 0, status: 'started' } })");
    await sleep(300);
    ok('we are black', (await evaluate(cdp, 'chessOnline.match.color')) === 'b');
    const liveShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(os.tmpdir(), 'lichess-game.png'), Buffer.from(liveShot.data, 'base64'));
    ok("opponent name rendered",
      (await evaluate(cdp, "document.getElementById('lichess-opponent-name').textContent")) === 'Opponent');
    ok('board is on White to move',
      (await evaluate(cdp, 'chessGame.state.turn')) === 'w');
    ok('clocks are shown',
      await evaluate(cdp, "document.getElementById('chess-clocks').classList.contains('active')"));
    ok('Reset is hidden in an online game',
      await evaluate(cdp, "document.getElementById('btn-reset-chess').hidden === true"));
    ok('Resign and Draw are shown',
      await evaluate(cdp, "!document.getElementById('btn-resign-online').hidden && !document.getElementById('btn-draw-online').hidden"));
    ok('turn line says opponent to move',
      (await evaluate(cdp, "document.getElementById('turn-text').textContent")) === "Opponent's move");

    console.log('=== 5b. Choice buttons are locked during a live match ===');
    ok('Pass & Play is disabled mid-match',
      await evaluate(cdp, "document.getElementById('choice-passplay').disabled === true"));
    await evaluate(cdp, "document.getElementById('choice-passplay').click()");
    await sleep(150);
    ok('clicking Pass & Play does not unlock the board',
      await evaluate(cdp, "chessGame.onlineActive === true && chessOnline.handlesBoardInput()"));
    await evaluate(cdp, "document.getElementById('chess-mode-stockfish').click()");
    await sleep(150);
    ok('Stockfish tab does not switch tabs mid-match',
      (await evaluate(cdp, 'chessGame.mode')) === 'local');

    console.log('=== 6. Opponent moves; then our move posts to Lichess ===');
    await evaluate(cdp, "window.__pushStream('board:abcdefgh', { type: 'gameState', moves: 'e2e4', wtime: 597000, btime: 600000, winc: 0, binc: 0, status: 'started' })");
    await sleep(300);
    ok('board re-synced to black to move',
      (await evaluate(cdp, 'chessGame.state.turn')) === 'b');
    ok('turn line says our move',
      (await evaluate(cdp, "document.getElementById('turn-text').textContent")) === 'Your move (Black)');
    ok("white's e4 is in the move log",
      await evaluate(cdp, "chessGame.moveLog[0] === 'e4'"));
    await evaluate(cdp, "(function () { var s = chessGame.state; var b = chessGenerateLegalMoves(s, 'b').find(m => m.from.r === 1 && m.from.c === 4 && m.to.r === 3 && m.to.c === 4); if (!b) throw new Error('e7e5 not found'); chessGame.playMove(b); })()");
    await sleep(250);
    ok('our e5 was posted as UCI e7e5',
      (await evaluate(cdp, "window.__posts.some(p => p.kind === 'move' && p.game === 'abcdefgh' && p.url.indexOf('/e7e5') !== -1)")));
    ok('our move is optimistic on the board',
      (await evaluate(cdp, 'chessGame.state.turn')) === 'w');

    console.log('=== 7. Full server echo reconciles cleanly ===');
    await evaluate(cdp, "window.__pushStream('board:abcdefgh', { type: 'gameState', moves: 'e2e4 e7e5', wtime: 597000, btime: 598000, winc: 0, binc: 0, status: 'started' })");
    await sleep(250);
    ok('move log is e4 e5', (await evaluate(cdp, 'chessGame.moveLog.join(" ")')) === 'e4 e5');

    console.log('=== 8. Checkmate ends the game; PGN saved through the bridge ===');
    await evaluate(cdp, "window.__pushStream('board:abcdefgh', { type: 'gameState', moves: 'f2f3 e7e5 g2g4 d8h4', wtime: 590000, btime: 591000, winc: 0, binc: 0, status: 'mate', winner: 'black' })");
    await sleep(400);
    ok('match is over', (await evaluate(cdp, 'chessOnline.match && chessOnline.match.over')) === true);
    ok('result headline says Victory',
      (await evaluate(cdp, "document.getElementById('lichess-result-text').textContent")) === 'Victory',
      await evaluate(cdp, "document.getElementById('lichess-result-text').textContent"));
    ok('detail line carries the win detail',
      /Won by checkmate/.test(await evaluate(cdp, "document.getElementById('lichess-pgn-note').textContent")),
      await evaluate(cdp, "document.getElementById('lichess-pgn-note').textContent"));
    ok("fool's mate SAN ends with #",
      (await evaluate(cdp, 'chessGame.moveLog[3]')) === 'Qh4#',
      await evaluate(cdp, 'chessGame.moveLog[3]'));
    ok('PGN saved through the bridge',
      (await evaluate(cdp, 'window.__savedPgn.length')) === 1);
    ok('PGN filename looks like lichess-<id>-<date>.pgn',
      /^lichess-abcdefgh-\d{8}\.pgn$/.test(await evaluate(cdp, 'window.__savedPgn[0].name')),
      await evaluate(cdp, 'window.__savedPgn[0].name'));
    const pgn = await evaluate(cdp, 'window.__savedPgn[0].content');
    ok('PGN has the right White tag (our opponent)', pgn.includes('[White "Opponent (1811)"]'), pgn);
    ok('PGN has the right Black tag (us)', pgn.includes('[Black "AlexTester (1702)"]'), pgn);
    ok('PGN result is 0-1', pgn.includes('[Result "0-1"]'), pgn);
    ok('PGN movetext replays the game', pgn.includes('1. f3 e5 2. g4 Qh4#'), pgn);
    ok('Resign/Draw hidden after game over',
      await evaluate(cdp, "document.getElementById('btn-resign-online').hidden && document.getElementById('btn-draw-online').hidden"));

    console.log('=== 8b. Lichess color words normalize (result mapping deps) ===');
    ok('white/black words map onto w/b',
      await evaluate(cdp, "normalizeLichessColor('white') === 'w' && normalizeLichessColor('black') === 'b' && normalizeLichessColor('w') === 'w' && normalizeLichessColor('b') === 'b' && normalizeLichessColor('nope') === null"));

    console.log('=== 9. Sign out returns to the sign-in screen ===');
    await evaluate(cdp, "document.getElementById('btn-lichess-back-to-hub').click()");
    await sleep(200);
    await evaluate(cdp, "document.getElementById('btn-lichess-signout').click()");
    await sleep(200);
    ok('sign-in box is shown again',
      await evaluate(cdp, "document.getElementById('lichess-signin-box').hidden === false"));
    ok('token was cleared via the bridge',
      (await evaluate(cdp, 'window.__signedOut')) === true);

    console.log('=== 10. Back to Pass & Play: flip class returns, board playable ===');
    await evaluate(cdp, "document.getElementById('choice-passplay').click()");
    await sleep(300);
    ok('flip class returns in Pass & Play',
      await evaluate(cdp, "document.getElementById('chessboard').classList.contains('otb-flip-black')"));
    ok('Reset is visible again',
      await evaluate(cdp, "document.getElementById('btn-reset-chess').hidden === false"));
    ok('Reset clears the board back to the initial position',
      await evaluate(cdp, "chessGame.moveLog.length === 0 && chessGame.state.turn === 'w'"));

    const shotPath = path.join(os.tmpdir(), 'lichess-smoke.png');
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
    console.log('screenshot saved to ' + shotPath);
  } finally {
    close();
    server.close();
  }

  console.log('');
  console.log('PASS: ' + pass + '   FAIL: ' + fail);
  if (fail > 0) {
    console.log('');
    console.log('Failures:');
    failures.forEach(f => console.log('  x ' + f));
    process.exit(1);
  }
})().catch(err => {
  console.error('probe failed:', err && err.message ? err.message : err);
  process.exit(1);
});
