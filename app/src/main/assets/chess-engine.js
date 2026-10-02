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

const chessEngine = {
  worker: null,
  ready: false,
  busy: false,
  loadFailed: false,
  listeners: [],
  pending: null,
  loadPromise: null,
  // Serialises searches so overlapping calls queue instead of colliding.
  queue: Promise.resolve(),
  // Handle for the active search timeout, cleared when a move arrives.
  searchTimer: null,
  engineName: 'Stockfish 19',
  searchDepth: null,
  lastScore: null,

  // Paths relative to index.html, which is where the WebView loads from.
  SCRIPT_PATH: 'engine/stockfish-19-lite-single.js',

  isSupported() {
    return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
  },

  onLine(fn) {
    this.listeners.push(fn);
  },

  emit(event) {
    this.listeners.forEach(fn => {
      try { fn(event); } catch (e) { console.warn('stockfish listener failed', e); }
    });
  },

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
        this.loadFailed = true;
        reject(new Error('Engine load timed out'));
      }, 20000);

      const finish = (ok, payload) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
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
      this._windowHandler = (e) => this.handleMessage(e.data, finish);
      window.addEventListener('message', this._windowHandler);

      this.cleanup = () => {
        if (this._windowHandler) {
          window.removeEventListener('message', this._windowHandler);
          this._windowHandler = null;
        }
      };

      this.post('uci');
    });

    return this.loadPromise;
  },

  post(cmd) {
    if (this.worker) this.worker.postMessage(cmd);
  },

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
  },

  // Asks the engine for a move. `depth` of 0 means "use the engine default",
  // which searches until it decides to stop.
  //
  // Searches are serialised through a queue rather than rejected when one is
  // already running. The UI already guards against overlapping calls, but an
  // explicit queue means a stray double call waits its turn instead of
  // throwing "Engine already searching" and leaving the bot stuck thinking
  // forever.
  async findBestMove(fen, depth) {
    await this.load();

    const run = async () => {
      this.busy = true;
      this.searchDepth = null;
      this.lastScore = null;

      const limit = Number(depth) > 0 ? String(depth) : '';
      this.post('stop');
      this.post('ucinewgame');
      this.post('isready');
      this.post('position fen ' + fen);
      this.post('go' + (limit ? ' depth ' + limit : ''));

      const result = await new Promise((resolve, reject) => {
        this.pending = { resolve, reject };
        // A hung engine must not leave the game locked on the bot's turn.
        this.searchTimer = setTimeout(() => {
          if (this.pending) {
            this.pending = null;
            this.busy = false;
            this.post('stop');
            reject(new Error('Engine search timed out'));
          }
        }, 20000);
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
  },

  setSkillLevel(level) {
    // Stockfish accepts 0-20. Below max it plays weaker, which keeps the bot
    // beatable for a casual player.
    const v = Math.max(0, Math.min(20, parseInt(level, 10) || 0));
    this.post('setoption name Skill Level value ' + v);
    this.post('isready');
  },

  // Frees the worker. Called when leaving the chess page so the engine is not
  // holding memory in the background.
  dispose() {
    if (this.cleanup) this.cleanup();
    if (this.worker) {
      try { this.worker.postMessage('quit'); this.worker.terminate(); } catch (e) { /* already gone */ }
      this.worker = null;
    }
    this.ready = false;
    this.busy = false;
    this.loadPromise = null;
  }
};
