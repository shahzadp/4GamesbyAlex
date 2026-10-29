// =======================================================
// STOCKFISH 19 ENGINE CLIENT (UCI over a Web Worker)
// =======================================================
//
// Runs the bundled Stockfish 19 build in a worker so search never blocks the
// UI thread, and so a long think cannot freeze the board.
//
// Engine choice: the lite single-threaded build. Single-threaded is required
// here because the multi-threaded build needs SharedArrayBuffer, which in turn
// needs COOP/COEP cross-origin-isolation headers. This app is loaded from
// file:///android_asset inside a WebView with no such headers, and no header
// can be added to a local file, so the threaded build could never run.
// Lite is ~1.7 MB rather than ~94 MB, and is still far stronger than a
// human opponent.
//
// The loader resolves its own .wasm by swapping the extension on its own
// script URL, so both files must sit side by side in the assets folder. It
// also posts messages back to the page, so we watch window 'message' as well
// as the worker channel.
//
// MULTIPLE ENGINES
//
// This used to be a single object literal, which made one worker, one search
// slot and one "bestmove" listener for the whole app. The 2x Stockfish mode
// needs two genuinely independent engines playing each other, so the client
// is now a class and `chessEngine` is simply the first instance. Every
// previously public field (worker, ready, busy, pending, queue, engineName,
// searchDepth, lastScore, ...) is an instance field now, so the existing
// single-engine call sites in app.js are unchanged.
//
// Cross-talk is the one thing that genuinely had to be solved. UCI on the
// wire is anonymous: a "bestmove e2e4" line carries no idea which engine
// produced it. Through `worker.onmessage` there is no ambiguity, because each
// worker delivers only to its own listener. The `window` 'message' fallback
// is the one path where two engines could both see the same line and one
// would resolve the other's pending search. Verified in the shipped loader,
// `listener` calls the global `postMessage` from *inside* the worker, so it
// reaches `worker.onmessage` and never the window at all. The window fallback
// is therefore only attached by the first engine; secondary instances run
// worker-channel only.

class ChessEngineClient {
  constructor(label, options) {
    const opts = options || {};

    // Human-readable name, used in log/status messages only.
    this.label = label || 'engine';

    // Only the first engine attaches the window 'message' fallback. See the
    // cross-talk note above.
    this.useWindowFallback = opts.useWindowFallback !== false;

    this.worker = null;
    this.ready = false;
    this.busy = false;
    this.loadFailed = false;
    this.listeners = [];
    this.pending = null;
    this.loadPromise = null;
    this.cleanup = null;
    // Serialises searches so overlapping calls queue instead of colliding.
    this.queue = Promise.resolve();
    // Handle for the active search timeout, cleared when a move arrives.
    this.searchTimer = null;
    this.engineName = 'Stockfish 19';
    this.searchDepth = null;
    this.lastScore = null;

    // Paths relative to index.html, which is where the WebView loads from.
    this.SCRIPT_PATH = 'engine/stockfish-19-lite-single.js';
  }

  isSupported() {
    return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
  }

  onLine(fn) {
    this.listeners.push(fn);
  }

  emit(event) {
    this.listeners.forEach(fn => {
      try { fn(event); } catch (e) { console.warn('stockfish listener failed', e); }
    });
  }

  // Loads the engine once and resolves when it reports uciok. Safe to call
  // repeatedly: later calls await the first load.
  load() {
    if (this.loadPromise) return this.loadPromise;

    if (!this.isSupported()) {
      this.loadFailed = true;
      return Promise.reject(new Error('WebAssembly or Web Workers unavailable'));
    }

    this.loadPromise = new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this._loadTimer = null;
        this._loadReject = null;
        this.loadFailed = true;
        reject(new Error('Engine load timed out'));
      }, 20000);
      this._loadTimer = timer;
      this._loadReject = reject;

      const finish = (ok, payload) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this._loadTimer = null;
        this._loadReject = null;
        if (ok) { this.ready = true; resolve(payload); }
        else { this.loadFailed = true; reject(payload instanceof Error ? payload : new Error(String(payload))); }
      };

      try {
        this.worker = new Worker(this.SCRIPT_PATH);
      } catch (e) {
        finish(false, new Error('Could not start engine worker: ' + e.message));
        return;
      }

      this.worker.onerror = (e) => {
        this.loadFailed = true;
        finish(false, new Error('Engine worker error: ' + (e.message || 'unknown')));
      };

      this.worker.onmessage = (e) => this.handleMessage(e.data, finish);

      // The emscripten build posts some output straight to the page instead
      // of through the worker, so mirror the same handler onto window.
      // Deliberately skipped on secondary engines: see the cross-talk note.
      if (this.useWindowFallback) {
        this._windowHandler = (e) => this.handleMessage(e.data, finish);
        window.addEventListener('message', this._windowHandler);
      }

      this.cleanup = () => {
        if (this._windowHandler) {
          window.removeEventListener('message', this._windowHandler);
          this._windowHandler = null;
        }
      };

      this.post('uci');
    });

    return this.loadPromise;
  }

  post(cmd) {
    if (this.worker) this.worker.postMessage(cmd);
  }

  handleMessage(data, onUciOk) {
    if (typeof data !== 'string') return;
    const line = data.trim();
    if (!line) return;

    if (line.startsWith('id name')) {
      const m = line.match(/id name\s+(.+)/);
      if (m) this.engineName = m[1].trim();
      return;
    }

    if (line === 'uciok') {
      this.post('isready');
      return;
    }

    if (line === 'readyok') {
      if (onUciOk) onUciOk(true);
      return;
    }

    if (line.startsWith('info ') && this.pending) {
      // Pull depth and score out of the info stream so the UI can show how
      // hard the bot is thinking. Only emit when a search is genuinely in
      // flight, otherwise the engine's startup chatter produces spurious
      // depth and score readings.
      const dm = line.match(/\bdepth (\d+)/);
      const sm = line.match(/\bscore (?:cp|mate) (-?\d+)/);
      if (dm) this.searchDepth = parseInt(dm[1], 10);
      if (sm) this.lastScore = parseInt(sm[1], 10);
      if (dm || sm) {
        this.emit({ type: 'info', depth: this.searchDepth, score: this.lastScore });
      }
      return;
    }

    if (line.startsWith('bestmove')) {
      const parts = line.split(/\s+/);
      const uci = parts[1];
      // this.pending is a { resolve, reject } object, not the resolve function
      // itself, so it has to be unwrapped here. Calling it directly throws
      // "resolve is not a function" and the bot then waits forever, because
      // this.pending has already been cleared and the timeout sees nothing
      // left to reject.
      const pending = this.pending;
      this.pending = null;
      this.busy = false;
      if (this.searchTimer) {
        clearTimeout(this.searchTimer);
        this.searchTimer = null;
      }
      if (pending && typeof pending.resolve === 'function') {
        pending.resolve({
          uci,
          ponder: parts[2] && parts[2] !== '(none)' ? parts[2] : null
        });
      }
    }
  }

  // Asks the engine for a move.
  //
  //   depth    - integer; > 0 means "search this many plies". Kept as the
  //              positional argument because the 1x bot calls it that way.
  //   options  - { movetime, newGame }
  //                movetime - milliseconds of wall clock to search for. This
  //                           is what an engine-vs-engine clock needs: the
  //                           side to move gets a real time budget, not a
  //                           depth target that can run arbitrarily long.
  //                newGame  - pass false to keep the engine's transposition
  //                           table across moves of the same game. Defaults
  //                           to true so the existing 1x bot behaves exactly
  //                           as it did (it re-sends ucinewgame every move).
  //
  // Searches are serialised through a queue rather than rejected when one is
  // already running. The UI already guards against overlapping calls, but an
  // explicit queue means a stray double call waits its turn instead of
  // throwing "Engine already searching" and leaving the bot stuck thinking
  // forever.
  async findBestMove(fen, depth, options) {
    await this.load();

    const opts = options || {};
    const movetime = Number(opts.movetime);

    const run = async () => {
      this.busy = true;
      this.searchDepth = null;
      this.lastScore = null;

      const depthLimit = Number(depth) > 0 ? ' depth ' + Math.round(depth) : '';
      const timeLimit = movetime > 0 ? ' movetime ' + Math.round(movetime) : '';

      this.post('stop');
      if (opts.newGame !== false) {
        this.post('ucinewgame');
        this.post('isready');
      }
      this.post('position fen ' + fen);
      this.post('go' + depthLimit + timeLimit);

      const result = await new Promise((resolve, reject) => {
        this.pending = { resolve, reject };
        // A hung engine must not leave the game locked on the bot's turn. The
        // floor is the original 20s; a movetime search is allowed to overrun
        // by a fixed margin before it counts as hung, because "movetime 5000"
        // legitimately lands a little after 5s.
        const budget = movetime > 0 ? movetime + 15000 : 20000;
        this.searchTimer = setTimeout(() => {
          if (this.pending) {
            this.pending = null;
            this.busy = false;
            this.post('stop');
            reject(new Error('Engine search timed out'));
          }
        }, budget);
      });

      this.emit({ type: 'bestmove', ...result });
      return result;
    };

    // Chain onto whatever is already running, and clear the timer reference
    // once this search settles so a later timeout cannot fire into a
    // completed search.
    const chained = this.queue.then(run, run);
    this.queue = chained.then(() => {}, () => {});
    return chained;
  }

  setSkillLevel(level) {
    // Stockfish accepts 0-20. Below max it plays weaker, which keeps the bot
    // beatable for a casual player.
    const v = Math.max(0, Math.min(20, parseInt(level, 10) || 0));
    this.post('setoption name Skill Level value ' + v);
    this.post('isready');
  }

  // Full-strength play, used by the 2x match where neither side should be
  // handicapped.
  setFullStrength() {
    this.post('setoption name Skill Level value 20');
    this.post('isready');
  }

  // Frees the worker. Called when leaving the chess page so the engine is not
  // holding memory in the background.
  dispose() {
    if (this.cleanup) this.cleanup();
    if (this.worker) {
      try { this.worker.postMessage('quit'); this.worker.terminate(); } catch (e) { /* already gone */ }
      this.worker = null;
    }
    // A load still waiting for readyok will never finish now. Clear its timer
    // and settle it, otherwise the caller hangs for the full 20s timeout and
    // the timer keeps the engine closure alive in the meantime.
    if (this._loadTimer) {
      clearTimeout(this._loadTimer);
      this._loadTimer = null;
    }
    if (this._loadReject) {
      const rejectLoad = this._loadReject;
      this._loadReject = null;
      rejectLoad(new Error('Engine was disposed'));
    }
    // A search that was in flight when the engine was torn down will never
    // produce a bestmove now, so its promise has to be settled here. Without
    // this the caller waits for an answer that can never arrive, and the bot
    // then sits on the board thinking forever.
    if (this.pending) {
      const pending = this.pending;
      this.pending = null;
      if (typeof pending.reject === 'function') {
        pending.reject(new Error('Engine was disposed'));
      }
    }
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.ready = false;
    this.busy = false;
    this.loadPromise = null;
  }
}

// The 1x bot's engine. Keeps the window 'message' fallback.
const chessEngine = new ChessEngineClient('main');

// A second, independent engine for the 2x Stockfish mode. It gets no window
// fallback so its UCI stream cannot be confused with the first one's.
const chessEngineWhite = new ChessEngineClient('white', { useWindowFallback: false });
const chessEngineBlack = new ChessEngineClient('black', { useWindowFallback: false });