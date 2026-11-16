/* =======================================================
   CHESS - LICHESS ONLINE (the "Lichess Sign-in" choice)
   =======================================================

   Lazily loaded by app.js the first time the Lichess choice is tapped, so
   players who only use the over-the-board mode never fetch or parse this
   file. It knows nothing this page did not hand it: sign-in goes through the
   native bridge (window.AndroidBridge), the token never touches
   localStorage, and JavaScript only holds it in memory for the life of the
   page.

   How a game works here:
     1. Sign in with Lichess in the real browser (PKCE authorization code
        flow, unregistered public client). The app only ever sees the one
        token Lichess returns, which the native side stores AES/GCM-encrypted.
     2. GET /api/account for the rating chips (bullet, blitz, rapid).
     3. Optionally seek a Rapid game (10+0, 15+10, 25+10). The seek holds an
        open streaming request - closing it cancels the search - and an event
        stream (GET /api/stream/event) is held open alongside it so our
        gameStart notification cannot be missed.
     4. The board mirrors GET /api/board/game/stream/{id}: the first line is
        gameFull (players, clock, initialFen, current state), every move is a
        gameState line. The whole move list is replayed through chess-core.js
        on each notification, so the local board is always a pure function of
        the server's truth - optimistic local application never diverges.
     5. Resign / draw / abort / claim-victory are one POST each. Chat lines
        carried by the stream are deliberately dropped: there is no chat UI
        on this page, by design.

   Rapid, casual games are the default; rated is opt-in. Engine assistance of
   any kind during a Lichess game is forbidden by their fair-play rules, so
   the Stockfish and quiz tabs are not reachable while a match is live (the
   app enforces this in chessGame.setMode).
*/

const chessOnline = {
  // 'idle' | 'hub' | 'searching' | 'live' | 'over'
  choice: 'passplay',   // 'passplay' | 'lichess'
  loaded: false,
  account: null,        // parsed /api/account
  token: null,          // in-memory bearer, never persisted by JS

  // Matchmaking
  seekController: null,
  eventAbort: null,
  eventRunning: false,
  seekTime: 10,
  seekIncrement: 0,
  seekRated: false,

  // The live match (null when there is none)
  match: null,
  clocks: { w: 0, b: 0 },
  clockAnchor: 0,
  tickTimer: null,
  accountBefore: null,  // perf ratings snapshot at match start, for deltas
  claimButton: null,
  reconnectTimer: null,
  reconnectAttempts: 0,
  boardStreamAbort: null,

  // --- Element cache -------------------------------------------------------
  el: {},

  init() {
    this.loaded = true;
    this.el = {
      choiceTitle: document.getElementById('lichess-choice-title'),
      choiceSub: document.getElementById('lichess-choice-sub'),
      panel: document.getElementById('chess-lichess-panel'),
      signinBox: document.getElementById('lichess-signin-box'),
      signinBtn: document.getElementById('btn-lichess-signin'),
      signinSub: document.querySelector('.lichess-signin-sub'),
      hub: document.getElementById('lichess-hub'),
      username: document.getElementById('lichess-username'),
      ratings: document.getElementById('lichess-ratings'),
      refreshBtn: document.getElementById('btn-lichess-refresh'),
      signoutBtn: document.getElementById('btn-lichess-signout'),
      setup: document.getElementById('lichess-setup'),
      presets: document.querySelectorAll('.lichess-preset'),
      rated: document.getElementById('lichess-rated'),
      findBtn: document.getElementById('btn-lichess-find'),
      searching: document.getElementById('lichess-searching'),
      cancelSearchBtn: document.getElementById('btn-lichess-cancel-search'),
      matchinfo: document.getElementById('lichess-matchinfo'),
      oppSide: document.getElementById('lichess-opponent-side'),
      oppName: document.getElementById('lichess-opponent-name'),
      oppRating: document.getElementById('lichess-opponent-rating'),
      matchnote: document.getElementById('lichess-matchnote'),
      abortBtn: document.getElementById('btn-lichess-abort'),
      result: document.getElementById('lichess-result'),
      resultText: document.getElementById('lichess-result-text'),
      pgnNote: document.getElementById('lichess-pgn-note'),
      backToHubBtn: document.getElementById('btn-lichess-back-to-hub'),
      clocksRow: document.getElementById('chess-clocks'),
      clockW: document.getElementById('chess-clock-white'),
      clockB: document.getElementById('chess-clock-black'),
      turnText: document.getElementById('turn-text'),
      resignBtn: document.getElementById('btn-resign-online'),
      drawBtn: document.getElementById('btn-draw-online'),
      declineDrawBtn: document.getElementById('btn-decline-draw-online')
    };

    // --- Sign in / out -----------------------------------------------------
    if (this.el.signinBtn) {
      this.el.signinBtn.addEventListener('click', () => this.startSignIn());
    }
    if (this.el.refreshBtn) {
      this.el.refreshBtn.addEventListener('click', () => this.syncAccount(true));
    }
    if (this.el.signoutBtn) {
      this.el.signoutBtn.addEventListener('click', () => this.signOut());
    }

    // --- Finding a game ------------------------------------------------------
    if (this.el.presets && this.el.presets.length) {
      this.el.presets.forEach(btn => {
        btn.addEventListener('click', () => {
          this.seekTime = parseInt(btn.dataset.time, 10) || 10;
          this.seekIncrement = parseInt(btn.dataset.inc, 10) || 0;
          this.el.presets.forEach(other => {
            const active = other === btn;
            other.classList.toggle('active', active);
            other.setAttribute('aria-checked', active ? 'true' : 'false');
          });
        });
      });
    }
    if (this.el.rated) {
      this.el.rated.addEventListener('change', () => {
        this.seekRated = !!this.el.rated.checked;
      });
    }
    if (this.el.findBtn) {
      this.el.findBtn.addEventListener('click', () => this.findGame());
    }
    if (this.el.cancelSearchBtn) {
      this.el.cancelSearchBtn.addEventListener('click', () => this.cancelSeek());
    }

    // --- Match controls -------------------------------------------------------
    if (this.el.abortBtn) {
      this.el.abortBtn.addEventListener('click', () => this.confirmAbort());
    }
    if (this.el.resignBtn) {
      this.el.resignBtn.addEventListener('click', () => this.confirmResign());
    }
    if (this.el.drawBtn) {
      this.el.drawBtn.addEventListener('click', () => this.offerOrAcceptDraw());
    }
    if (this.el.declineDrawBtn) {
      this.el.declineDrawBtn.addEventListener('click', () => this.declineDraw());
    }
    if (this.el.backToHubBtn) {
      this.el.backToHubBtn.addEventListener('click', () => this.backToHub());
    }

    // Bridges for the native side to reach us after the OAuth redirect.
    window.onLichessSignedIn = () => {
      this.token = null; // re-read from the bridge; nothing cached is trusted forever
      this.setStatusNote('Signed in to Lichess.');
      this.renderPanel();
      this.syncAccount(true);
    };
    window.onLichessAuthError = (message) => {
      this.setStatusNote(message || 'Lichess sign in failed.');
      this.renderPanel();
    };
    window.__lichessBack = () => this.handleBack();

    this.renderPanel();
    // A token stored from a previous session means the hub can show
    // straight away; sync fresh numbers in the background.
    if (this.isSignedIn()) {
      this.renderHub();
      this.syncAccount(false);
    }
  },

  // --- Identity & storage ---------------------------------------------------

  androidBridge() {
    try {
      return (typeof AndroidBridge !== 'undefined' && AndroidBridge) ? AndroidBridge : null;
    } catch (e) {
      return null;
    }
  },

  isSignedIn() {
    const bridge = this.androidBridge();
    if (!bridge) return false;
    try {
      return !!bridge.lichessHasToken();
    } catch (e) {
      return false;
    }
  },

  bearerToken() {
    if (this.token) return this.token;
    const bridge = this.androidBridge();
    if (!bridge) return '';
    try {
      this.token = bridge.lichessToken() || '';
    } catch (e) {
      this.token = '';
    }
    return this.token;
  },

  signOut() {
    if (this.matchLive()) {
      this.setMatchNote('Finish the game first - Resign is in the bottom bar.');
      return;
    }
    this.cancelSeek(true);
    this.stopEventStream();
    const bridge = this.androidBridge();
    try {
      if (bridge && bridge.lichessSignOut) bridge.lichessSignOut();
    } catch (e) { /* best effort; the token is unusable to this page either way */ }
    this.token = null;
    this.account = null;
    this.renderPanel();
    if (this.el.choiceTitle) this.el.choiceTitle.textContent = 'Lichess Sign-in';
    if (this.el.choiceSub) this.el.choiceSub.textContent = 'Sync rating & play online';
    this.setStatusNote('Signed out of Lichess.');
  },

  // --- HTTP helpers ---------------------------------------------------------

  async lichessFetch(path, options) {
    const opts = options || {};
    const headers = {};
    if (opts.auth !== false) {
      const token = this.bearerToken();
      if (token) headers['Authorization'] = 'Bearer ' + token;
    }
    if (opts.body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    const response = await fetch('https://lichess.org' + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body || undefined,
      signal: opts.signal || undefined
    });
    if (response.status === 204) return null;
    const text = await response.text();
    if (!response.ok) {
      let message = 'HTTP ' + response.status;
      try {
        const parsed = JSON.parse(text);
        if (parsed && parsed.error) message = parsed.error;
      } catch (e) { /* not JSON; keep the status line */ }
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    if (!text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  },

  // Opens an ndjson stream and invokes onLine for each object in it.
  // Returns an AbortController the caller can use to close the stream.
  openStream(path, onLine, onEnd, onError) {
    const controller = new AbortController();
    const token = this.bearerToken();
    fetch('https://lichess.org' + path, {
      headers: { 'Authorization': 'Bearer ' + token },
      signal: controller.signal
    }).then(async response => {
      if (!response.ok || !response.body || !response.body.getReader) {
        const error = new Error('HTTP ' + response.status);
        error.status = response.status;
        throw error;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 1);
          const trimmed = line.trim();
          if (!trimmed) continue; // keep-alive ping
          try {
            onLine(JSON.parse(trimmed));
          } catch (e) {
            // A single malformed line must not kill the game stream.
          }
        }
      }
      if (onEnd) onEnd();
    }).catch(err => {
      if (err && err.name === 'AbortError') return;
      if (onError) onError(err);
      else if (onEnd) onEnd();
    });
    return controller;
  },

  // --- Sign in / rating sync -------------------------------------------------

  startSignIn() {
    const bridge = this.androidBridge();
    this.setStatusNote('Opening lichess.org in your browser…');
    if (!bridge || !bridge.lichessSignIn) {
      this.setStatusNote('Sign in is only available inside the app.');
      return;
    }
    bridge.lichessSignIn();
  },

  syncAccount(report) {
    if (!this.isSignedIn()) {
      this.renderPanel();
      return;
    }
    this.lichessFetch('/api/account').then(account => {
      this.account = account;
      this.renderRatingChips();
      if (this.el.username) {
        this.el.username.textContent = '@' + (account.username || account.id || 'you');
      }
      if (report) this.setStatusNote('Ratings synced with Lichess.');
      this.renderChoiceButtons();
    }).catch(error => {
      if (error && error.status === 401) {
        // The token was revoked or expired on Lichess's side.
        this.signOutLocal();
        this.setStatusNote('Lichess session expired - please sign in again.');
        return;
      }
      this.setStatusNote('Could not reach Lichess for ratings. Check your connection.');
    });
  },

  signOutLocal() {
    const bridge = this.androidBridge();
    try {
      if (bridge && bridge.lichessSignOut) bridge.lichessSignOut();
    } catch (e) { /* best effort */ }
    this.token = null;
    this.account = null;
    this.renderPanel();
    if (this.el.choiceTitle) this.el.choiceTitle.textContent = 'Lichess Sign-in';
    if (this.el.choiceSub) this.el.choiceSub.textContent = 'Sync rating & play online';
  },

  perf(account, name) {
    const perfs = account && account.perfs;
    return perfs && perfs[name] ? perfs[name] : null;
  },

  // Same fetch as syncAccount, with an extra step: marks the result screen
  // with the points won in a rapid-game win. Losses show nothing at all -
  // the news a player needs from this screen is how good the game was.
  syncAccountAndReportDelta() {
    if (!this.isSignedIn()) return;
    this.lichessFetch('/api/account').then(account => {
      const before = this.accountBefore;
      this.account = account;
      this.renderRatingChips();
      if (this.el.username) {
        this.el.username.textContent = '@' + (account.username || account.id || 'you');
      }
      this.renderChoiceButtons();
      if (!before || !this.el.resultText || !this.match) return;
      const oldPerf = before.rapid;
      const newPerf = this.perf(account, 'rapid');
      const oldR = oldPerf && oldPerf.rating;
      const newR = newPerf && newPerf.rating;
      const gained = (typeof oldR === 'number' && typeof newR === 'number') ? newR - oldR : 0;
      // Points only when the player actually banked some; a minus sign
      // never appears on this screen.
      if (this.match.outcome === 'win' && gained > 0) {
        this.el.resultText.textContent = this.match.headline + '  ·  +' + gained + ' Rapid points';
      }
    }).catch(() => { /* a missed rating refresh is not an error worth showing */ });
  },

  renderRatingChips() {
    if (!this.el.ratings) return;
    const order = [
      { key: 'blitz', label: 'Blitz' },
      { key: 'rapid', label: 'Rapid' },
      { key: 'bullet', label: 'Bullet' }
    ];
    this.el.ratings.innerHTML = order.map(entry => {
      const perf = this.perf(this.account, entry.key);
      if (!perf) return '';
      const prov = perf.prov ? '<span class="lichess-chip-provisional-mark" title="Provisional rating"></span>' : '';
      const provClass = perf.prov ? ' lichess-chip-provisional' : '';
      return '<span class="lichess-chip' + provClass + '" title="' + entry.label +
        ' rating' + (perf.prov ? ' (provisional)' : '') + ' with ' +
        (perf.games || 0) + ' games">' +
        '<span class="lichess-chip-perf">' + entry.label + '</span>' +
        '<span class="lichess-chip-rating">' + (perf.rating || '—') + prov + '</span>' +
        '</span>';
    }).join('');
  },

  renderChoiceButtons() {
    if (!this.el.choiceTitle || !this.el.choiceSub) return;
    const rapid = this.perf(this.account, 'rapid');
    const blitz = this.perf(this.account, 'blitz');
    if (rapid || blitz) {
      const parts = [];
      if (rapid) parts.push('Rapid ' + rapid.rating);
      if (blitz) parts.push('Blitz ' + blitz.rating);
      this.el.choiceSub.textContent = parts.join(' · ');
      this.el.choiceTitle.textContent = 'Lichess · ' +
        (this.account && this.account.username ? '@' + this.account.username : 'Online');
    }
  },

  renderPanel() {
    const signedIn = this.isSignedIn();
    if (this.el.signinBox) this.el.signinBox.hidden = signedIn;
    if (this.el.hub) this.el.hub.hidden = !signedIn;
    this.renderHub();
  },

  renderHub() {
    const hub = this.match;
    const searching = !!this.seekController;
    const live = hub && !hub.over;
    const over = hub && hub.over;

    if (this.el.setup) this.el.setup.hidden = searching || live || over;
    if (this.el.searching) this.el.searching.hidden = !searching;
    if (this.el.matchinfo) this.el.matchinfo.hidden = !live;
    if (this.el.result) this.el.result.hidden = !over;

    if (this.el.findBtn) this.el.findBtn.disabled = searching || live;
    this.syncOnlineButtons();
    this.syncClocksVisibility();
  },

  // --- Panel visibility -------------------------------------------------------

  setChoice(choice) {
    this.choice = choice;
    chessGame.onlineActive = true;
    // Fresh board unless a match or result is on screen.
    if (!this.match) {
      chessGame.reset();
      chessGame.selected = null;
      chessGame.legalForSelected = [];
      chessGame.render();
      chessGame.updateUI();
    }
    if (this.el.panel) this.el.panel.classList.add('active');
    this.renderPanel();
    this.updateModeUi();
    // Opening the event stream here means a game already in progress on this
    // account (started on the website, or an interrupted app session) is
    // adopted and mirrored instead of stranded.
    if (this.isSignedIn() && !this.match) {
      this.ensureEventStream();
    }
    if (this.isSignedIn()) {
      this.setStatusNote(this.match
        ? 'Match in progress - good luck!'
        : 'Tap Find game to look for a Rapid opponent.');
    } else {
      this.setStatusNote('Sign in with Lichess to play online.');
    }
    this.setTurnText(this.match ? (this.match.over ? 'Game over' : this.turnLine()) : 'Lichess online');
  },

  hide() {
    this.choice = 'passplay';
    // No live match can survive hiding: the app refuses to leave the 2-player
    // tab mid-game, so this only ever tidies up idle or finished panels.
    if (!this.matchLive()) this.stopEventStream();
    this.syncClocksVisibility(true);
    if (this.el.panel) this.el.panel.classList.remove('active');
  },

  updateModeUi() {
    // app.js owns the choice buttons and panel visibility across tabs; this
    // only nudges it so labels/selectors line up right now.
    if (typeof chessGame !== 'undefined' && chessGame.updateModeUI) {
      chessGame.updateModeUI();
    }
  },

  setStatusNote(text) {
    // The status element belongs to the shared chess page; chessGame owns it.
    if (typeof chessGame !== 'undefined' && chessGame.setStatus) {
      chessGame.setStatus(text || '');
    }
  },

  setTurnText(text) {
    if (this.el.turnText) this.el.turnText.textContent = text || '';
  },

  setMatchNote(text) {
    if (this.el.matchnote) this.el.matchnote.textContent = text || '';
  },

  // --- Board input contract used by app.js ----------------------------------

  handlesBoardInput() {
    return this.choice === 'lichess' && chessGame.mode === 'local';
  },

  matchLive() {
    return !!(this.match && !this.match.over);
  },

  inputSide() {
    if (!this.matchLive()) return null;
    if (chessGame.state.turn !== this.match.color) return null;
    return this.match.color;
  },

  // --- Event stream ----------------------------------------------------------

  // Held open only while the Lichess panel is up and signed in, and always
  // before the seek - otherwise a gameStart can be missed.
  ensureEventStream() {
    if (this.eventRunning) return true;
    const controller = this.openStream('/api/stream/event',
      event => this.onStreamEvent(event),
      () => { this.eventRunning = false; },
      error => {
        this.eventRunning = false;
        if (error && error.status === 401) {
          this.signOutLocal();
          this.setStatusNote('Lichess session expired - please sign in again.');
        }
      });
    if (controller) {
      this.eventAbort = controller;
      this.eventRunning = true;
      return true;
    }
    return false;
  },

  stopEventStream() {
    if (this.eventAbort) {
      try { this.eventAbort.abort(); } catch (e) { /* already closing */ }
    }
    this.eventAbort = null;
    this.eventRunning = false;
  },

  onStreamEvent(event) {
    if (!event || typeof event !== 'object') return;
    if (event.type === 'gameStart' && event.game) {
      const id = event.game.gameId || event.game.id;
      if (id) this.adoptGame(id);
      return;
    }
    if (event.type === 'gameFinish') {
      // The board stream already carried the result; just re-sync ratings.
      setTimeout(() => this.syncAccount(false), 1500);
      return;
    }
    // challenge / challengeCanceled / challengeDeclined are deliberately
    // ignored: this page never issues or accepts challenges.
  },

  // --- Matchmaking -----------------------------------------------------------

  async findGame() {
    if (!this.isSignedIn()) {
      this.startSignIn();
      return;
    }
    if (this.seekController || this.matchLive()) return;
    if (navigator && navigator.onLine === false) {
      this.setStatusNote('You appear to be offline - connect and try again.');
      return;
    }

    // Snapshot ratings now so the result screen can show the delta.
    this.accountBefore = this.account ? this.account.perfs : null;

    this.ensureEventStream();

    const params = new URLSearchParams();
    params.set('time', String(this.seekTime));
    params.set('increment', String(this.seekIncrement));
    params.set('rated', this.seekRated ? 'true' : 'false');

    this.seekController = new AbortController();
    this.renderHub();
    this.setStatusNote('Looking for a Rapid opponent…');

    try {
      const response = await fetch('https://lichess.org/api/board/seek', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + this.bearerToken(),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString(),
        signal: this.seekController.signal
      });
      if (!response.ok) {
        let message = 'HTTP ' + response.status;
        try {
          const parsed = JSON.parse(await response.text());
          if (parsed && parsed.error) message = parsed.error;
        } catch (e) { /* keep the status line */ }
        throw new Error(message);
      }
      // The response stays open (empty keep-alive lines) until the seek is
      // accepted or expires. Drain it quietly.
      const reader = response.body && response.body.getReader ? response.body.getReader() : null;
      if (reader) {
        for (;;) {
          const { done } = await reader.read();
          if (done) break;
        }
      }
      // Stream ended without a gameStart: expired or unpaired.
      if (!this.matchLive()) {
        this.seekController = null;
        this.renderHub();
        this.setStatusNote('No opponent found - try again.');
      }
    } catch (error) {
      if (error && error.name === 'AbortError') {
        this.setStatusNote('Search cancelled.');
        return;
      }
      this.seekController = null;
      this.renderHub();
      this.setStatusNote('Could not start the search: ' + (error && error.message ? error.message : error));
    }
  },

  cancelSeek(silent) {
    if (this.seekController) {
      try {
        this.seekController.abort();
      } catch (e) { /* already torn down */ }
    }
    this.seekController = null;
    if (!silent) {
      this.renderHub();
      this.setStatusNote('Search cancelled.');
    } else {
      this.renderHub();
    }
  },

  // --- Adopting a game --------------------------------------------------------

  adoptGame(gameId) {
    if (this.matchLive()) return; // one game at a time
    this.openBoardStream(gameId, true);
  },

  openBoardStream(gameId, isNew) {
    if (this.boardStreamAbort) {
      try { this.boardStreamAbort.abort(); } catch (e) { /* moot */ }
    }
    let announced = false;
    const controller = this.openStream('/api/board/game/stream/' + gameId,
      event => this.onBoardEvent(gameId, event, () => { announced = true; }),
      () => {
        // Server closes at game end; mid-game closes mean trouble.
        if (this.match && !this.match.over) {
          this.scheduleReconnect(gameId);
        }
      },
      error => {
        if (error && error.status === 401) {
          this.signOutLocal();
          this.setStatusNote('Lichess session expired - please sign in again.');
          return;
        }
        if (!announced) {
          this.setStatusNote('Could not open the game stream: ' + (error && error.message ? error.message : error));
        }
        if (this.match && !this.match.over) {
          this.scheduleReconnect(gameId);
        }
      });
    this.boardStreamAbort = controller;
    if (!this.match || this.match.id !== gameId) {
      this.match = {
        id: gameId,
        color: null,          // set by gameFull
        opponent: null,
        perfName: 'Rapid',
        rated: false,
        over: false,
        outcome: null,        // 'win' | 'loss' | 'draw' | null while live
        statusLabel: '',
        initialFen: null,
        plies: 0,
        weOfferedDraw: false,
        theyOfferedDraw: false,
        isNew: isNew !== false
      };
    }
  },

  scheduleReconnect(gameId) {
    if (this.reconnectTimer) return;
    this.reconnectAttempts = (this.reconnectAttempts || 0) + 1;
    if (this.reconnectAttempts > 4) {
      this.setMatchNote('Connection lost - reconnecting failed. Check your connection; the Lichess clock keeps running.');
      return;
    }
    const attempt = this.reconnectAttempts;
    this.setMatchNote('Connection hiccup - reconnecting (' + attempt + '/4)…');
    const delay = Math.min(8000, 1000 * Math.pow(2, attempt - 1));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.matchLive()) return;
      this.boardStreamAbort = null;
      // Reopens the stream; the fresh gameFull rebuilds the board from the
      // full move list, so nothing is lost by not resuming mid-stream.
      this.openBoardStream(gameId, false);
    }, delay);
  },

  onBoardEvent(gameId, event, announceFull) {
    if (!event) return;
    if (event.type === 'gameFull') {
      this.onGameFull(event);
      if (announceFull) announceFull();
      return;
    }
    if (event.type === 'gameState') {
      this.applyGameState(event);
      return;
    }
    if (event.type === 'opponentGone') {
      const gone = !!event.gone;
      if (gone) {
        const wait = event.claimWinInSeconds;
        this.setMatchNote('Opponent left the game' +
          (typeof wait === 'number' ? ' — you can claim the win in ' + wait + 's.' : '.'));
        this.showClaimButton();
      } else {
        this.setMatchNote('Opponent is back.');
        this.hideClaimButton();
      }
      return;
    }
    // chatLine: no UI on this page, on purpose. Spectators can keep it.
  },

  onGameFull(gameFull) {
    // Lichess sends variant as an object ({key, name, short}). Be liberal:
    // accept a bare string too rather than reject the game.
    const rawVariant = gameFull ? gameFull.variant : null;
    let variantKey = 'standard';
    if (rawVariant) {
      variantKey = typeof rawVariant === 'string'
        ? rawVariant
        : String(rawVariant.key || rawVariant.name || 'standard');
    }
    if (variantKey !== 'standard') {
      this.abortStreamAndResetMatch();
      this.setStatusNote('That is a ' + variantKey + ' game, which this board cannot show.');
      return;
    }

    const id = gameFull.id;
    const speed = String(gameFull.speed || 'rapid');
    const perfName = (gameFull.perf && gameFull.perf.name) || speed;
    const rated = !!gameFull.rated;
    const initialFen = gameFull.initialFen;
    const state = gameFull.state || {};

    // Lichess seats the players as objects with flat id/name fields. Match
    // on id, then on name as a fallback. aiLevel players (challenges vs AI)
    // carry no id, so they never match us - they become the opponent.
    const acctId = this.account && this.account.id ? String(this.account.id).toLowerCase() : '';
    const acctName = this.account && this.account.username ? String(this.account.username).toLowerCase() : '';
    const whitePlayer = gameFull.white || {};
    const blackPlayer = gameFull.black || {};
    const sideIsUs = player => {
      const id = String(player.id || '').toLowerCase();
      const name = String(player.name || '').toLowerCase();
      return (acctId && id === acctId) || (acctName && name === acctName);
    };
    let color = null;
    if (sideIsUs(whitePlayer)) color = 'w';
    else if (sideIsUs(blackPlayer)) color = 'b';

    if (!color) {
      // Neither seat is us (shouldn't normally happen via seeking): watching
      // a game this board isn't designed for is worse than saying no.
      this.abortStreamAndResetMatch();
      this.setStatusNote('That game is not playable from this device.');
      return;
    }
    const weAre = color === 'b' ? blackPlayer : whitePlayer;
    const theyAre = color === 'b' ? whitePlayer : blackPlayer;
    const opponent = {
      name: theyAre.name || (theyAre.aiLevel ? 'Lichess AI' : 'Opponent'),
      rating: theyAre.rating || null,
      ai: !!theyAre.aiLevel
    };

    this.match = Object.assign(this.match || {}, {
      id: id,
      color: color,
      ourRating: weAre.rating || null,
      opponent: opponent,
      perfName: String(perfName || 'Rapid'),
      rated: rated,
      clockInitial: gameFull.clock ? gameFull.clock.initial : null,
      clockIncrement: gameFull.clock ? gameFull.clock.increment : null,
      initialFen: (initialFen && initialFen !== 'startpos') ? initialFen : null,
      over: false,
      outcome: null,
      plies: 0
    });

    this.renderMatchHeader();
    this.applyGameState(state);
    this.syncClocksVisibility();
    this.renderHub();
    this.setStatusNote(rated ? 'Rated ' + this.match.perfName + ' game on Lichess' : 'Casual ' + this.match.perfName + ' game on Lichess');
    this.setTurnText(this.turnLine());
  },

  renderMatchHeader() {
    const match = this.match;
    if (!match) return;
    if (this.el.oppSide) {
      this.el.oppSide.textContent = match.color === 'w' ? 'You are White' : 'You are Black';
    }
    if (this.el.oppName) this.el.oppName.textContent = match.opponent ? match.opponent.name : 'Opponent';
    if (this.el.oppRating) {
      this.el.oppRating.textContent = match.opponent && match.opponent.rating ? String(match.opponent.rating) : '';
    }
  },

  // Full rebuild from the server's move list. Idempotent by construction:
  // everything the page shows is derived from this one function.
  applyGameState(state) {
    if (!this.match || this.match.over) {
      // Still allow the terminal result to land once.
      if (state && state.status && state.status !== 'started' && state.status !== 'created') {
        this.finishMatch(state);
      }
      return;
    }
    if (!state) return;

    const plies = state.moves ? String(state.moves).split(' ').filter(Boolean) : [];

    // Base position.
    let base = null;
    if (this.match.initialFen) {
      base = chessFromFen(this.match.initialFen);
    }
    if (!base) base = chessInitialState();

    let sanList = [];
    let capturedWhite = [];
    let capturedBlack = [];
    let legal = true;
    let position = base;
    for (let i = 0; i < plies.length; i++) {
      const move = chessUciToMoveObj(plies[i], position);
      if (!move) { legal = false; break; }
      const san = chessMoveToSan(move, position);
      if (move.captured) {
        if (move.captured.c === 'w') capturedBlack.push(move.captured);
        else capturedWhite.push(move.captured);
      }
      chessApplyMove(position, move);
      sanList.push(san);
    }

    if (!legal) {
      // The server would never send an illegal move; if it does, log it and
      // keep the last good position rather than corrupt the board.
      console.warn('Lichess stream contained an unplayable move; board not updated.');
      return;
    }

    // Feed the rebuilt position into the shared board.
    //
    // SAN sound: if the ply count didn't grow since the last update the board
    // was showing the local player's own optimistic move, which already made
    // its sound in chessGame.playMove. Anything longer is the opponent's move.
    const pliesBefore = (chessGame.moveLog || []).length;
    chessGame.state = position;
    chessGame.moveLog = sanList;
    chessGame.capturedWhite = capturedWhite;
    chessGame.capturedBlack = capturedBlack;
    chessGame.selected = null;
    chessGame.legalForSelected = [];
    chessGame.pendingPromotion = null;
    chessGame.hidePromotion();

    this.match.plies = sanList.length;

    if (sanList.length > pliesBefore) {
      playChessMoveSound(false, false);
    }

    this.clocks.w = Math.max(0, state.wtime || 0);
    this.clocks.b = Math.max(0, state.btime || 0);
    this.clockAnchor = Date.now();
    this.startTicking();
    this.renderClocks();

    // Draw offers.
    this.match.weOfferedDraw = !!(this.match.color === 'w' ? state.wdraw : state.bdraw);
    this.match.theyOfferedDraw = !!(this.match.color === 'w' ? state.bdraw : state.wdraw);

    // The abort button only makes sense before anyone has moved.
    if (this.el.abortBtn) {
      this.el.abortBtn.hidden = !(sanList.length === 0 && (state.status === 'started' || state.status === 'created'));
    }

    // Terminal statuses end the match.
    if (state.status && state.status !== 'started' && state.status !== 'created') {
      this.finishMatch(state);
      return;
    }

    this.syncOnlineButtons();
    chessGame.updateUI();
    chessGame.render();
    this.setTurnText(this.turnLine());
  },

  turnLine() {
    if (!this.match) return 'Lichess online';
    const turn = chessGame.state.turn;
    if (turn === this.match.color) return 'Your move' + (chessGame.state.turn === 'w' ? ' (White)' : ' (Black)');
    return "Opponent's move";
  },

  // --- Clocks ------------------------------------------------------------------

  syncClocksVisibility(forceHide) {
    if (!this.el.clocksRow) return;
    const live = this.matchLive();
    this.el.clocksRow.classList.toggle('active', live && !forceHide);
  },

  startTicking() {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this.renderClocks(), 100);
  },

  stopTicking() {
    clearInterval(this.tickTimer);
    this.tickTimer = null;
  },

  clockText(ms) {
    const clamped = Math.max(0, ms);
    const minutes = Math.floor(clamped / 60000);
    const seconds = Math.floor((clamped % 60000) / 1000);
    const base = minutes + ':' + String(seconds).padStart(2, '0');
    if (clamped < 20000) return base + '.' + Math.floor((clamped % 1000) / 100);
    return base;
  },

  currentClock(side) {
    if (!this.matchLive()) return this.clocks[side];
    if (chessGame.state.turn !== side) return this.clocks[side];
    return Math.max(0, this.clocks[side] - (Date.now() - this.clockAnchor));
  },

  renderClocks() {
    if (!this.el.clockW || !this.el.clockB) return;
    if (!this.matchLive() && !(this.match && this.match.over)) return;
    const white = this.currentClock('w');
    const black = this.currentClock('b');
    this.el.clockW.textContent = this.clockText(white);
    this.el.clockB.textContent = this.clockText(black);
    const whiteWrap = this.el.clockW.parentNode;
    const blackWrap = this.el.clockB.parentNode;
    if (whiteWrap) {
      whiteWrap.classList.toggle('low', white < 20000);
      whiteWrap.classList.toggle('active', this.matchLive() && chessGame.state.turn === 'w');
    }
    if (blackWrap) {
      blackWrap.classList.toggle('low', black < 20000);
      blackWrap.classList.toggle('active', this.matchLive() && chessGame.state.turn === 'b');
    }
  },

  // --- Match actions -----------------------------------------------------------

  // The local player's move, dispatched from chessGame.playMove. Optimistic:
  // the board already shows it; the stream echo will reconcile.
  onLocalMovePlayed(move) {
    if (!this.matchLive() || !move) return;
    const uci = chessMoveToUci(move);
    this.lichessFetch('/api/board/game/' + this.match.id + '/move/' + uci, { method: 'POST' }).catch(error => {
      if (error && error.status === 400) {
        this.setMatchNote('Lichess rejected that move - re-syncing…');
        this.openBoardStream(this.match.id, false);
      } else if (error) {
        this.setMatchNote('Your move did not reach Lichess - check your connection.');
      }
    });
  },

  confirmResign() {
    if (!this.matchLive()) return;
    this.showConfirm({
      title: 'Resign this game?',
      body: 'The game ends and your opponent takes the point.',
      confirmLabel: 'Resign',
      danger: true,
      onConfirm: () => {
        this.lichessFetch('/api/board/game/' + this.match.id + '/resign', { method: 'POST' }).catch(error => {
          this.setMatchNote('Could not reach Lichess to resign: ' + (error && error.message ? error.message : error));
        });
      }
    });
  },

  confirmAbort() {
    if (!this.matchLive() || this.match.plies > 0) return;
    this.showConfirm({
      title: 'Abort this game?',
      body: 'Only possible while neither side has moved. The game is cancelled and does not affect ratings.',
      confirmLabel: 'Abort game',
      danger: false,
      onConfirm: () => {
        this.lichessFetch('/api/board/game/' + this.match.id + '/abort', { method: 'POST' }).catch(error => {
          this.setMatchNote('Could not reach Lichess to abort: ' + (error && error.message ? error.message : error));
        });
      }
    });
  },

  offerOrAcceptDraw() {
    if (!this.matchLive()) return;
    const path = '/api/board/game/' + this.match.id + '/draw/yes';
    if (this.match.theyOfferedDraw && !this.match.weOfferedDraw) {
      // Accepting.
      this.lichessFetch(path, { method: 'POST' }).catch(error => {
        this.setMatchNote('Could not accept the draw: ' + (error && error.message ? error.message : error));
      });
      return;
    }
    if (this.match.weOfferedDraw) return; // already sent; the button is disabled
    this.lichessFetch(path, { method: 'POST' }).then(() => {
      this.match.weOfferedDraw = true;
      this.syncOnlineButtons();
      this.setMatchNote('Draw offered - waiting for your opponent.');
    }).catch(error => {
      this.setMatchNote('Could not offer the draw: ' + (error && error.message ? error.message : error));
    });
  },

  declineDraw() {
    if (!this.matchLive()) return;
    this.lichessFetch('/api/board/game/' + this.match.id + '/draw/no', { method: 'POST' }).catch(error => {
      this.setMatchNote('Could not decline the draw: ' + (error && error.message ? error.message : error));
    });
  },

  claimVictory() {
    if (!this.match) return;
    this.lichessFetch('/api/board/game/' + this.match.id + '/claim-victory', { method: 'POST' }).catch(error => {
      this.setMatchNote('Claim failed: ' + (error && error.message ? error.message : error));
    });
  },

  showClaimButton() {
    if (this.claimButton || !this.el.matchinfo) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lichess-secondary-btn';
    button.textContent = 'Claim win (opponent gone)';
    button.addEventListener('click', () => this.claimVictory());
    this.el.matchinfo.appendChild(button);
    this.claimButton = button;
  },

  hideClaimButton() {
    if (this.claimButton && this.claimButton.parentNode) {
      this.claimButton.parentNode.removeChild(this.claimButton);
    }
    this.claimButton = null;
  },

  syncOnlineButtons() {
    const live = this.matchLive();
    if (this.el.resignBtn) this.el.resignBtn.hidden = !live;
    if (this.el.drawBtn) {
      this.el.drawBtn.hidden = !live;
      const label = this.el.drawBtn.querySelector('.btn-label');
      const we = this.match && this.match.weOfferedDraw;
      const they = this.match && this.match.theyOfferedDraw;
      this.el.drawBtn.classList.toggle('offer-pending', !!they && !we);
      this.el.drawBtn.disabled = !!(we && !they);
      if (label) {
        label.textContent = they && !we ? 'Accept Draw' : (we && !they ? 'Offer sent' : 'Offer Draw');
      }
    }
    if (this.el.declineDrawBtn) {
      const they = this.match && this.match.theyOfferedDraw;
      this.el.declineDrawBtn.hidden = !(live && they);
    }
    if (!live) this.hideClaimButton();
  },

  // --- Game over ----------------------------------------------------------------

  finishMatch(state) {
    if (!this.match || this.match.over) return;
    this.match.over = true;
    this.stopTicking();
    this.renderClocks();
    this.hideClaimButton();

    const status = String(state.status || 'unknownFinish');
    const winner = normalizeLichessColor(state.winner);
    const myColor = this.match.color;

    let outcome = 'draw';
    if (status === 'aborted' || status === 'noStart') {
      outcome = 'aborted';
    } else if (winner) {
      outcome = winner === myColor ? 'win' : 'loss';
    } else if (status === 'mate' || status === 'resign' || status === 'outoftime' || status === 'timeout') {
      // Mate and flag-fall name no winner in some payloads; the side to
      // move on the mirrored board is the side that lost.
      outcome = chessGame.state.turn === myColor ? 'loss' : 'win';
    }

    // Winning copy celebrates without borrowing the word for its opposite;
    // defeats read as a step, never as a verdict.
    const winReason = {
      mate: 'by checkmate',
      resign: 'by resignation',
      outoftime: 'on time',
      timeout: 'on time',
      stalemate: 'by stalemate',
      draw: 'by the rules',
      insufficientMaterialClaim: 'by insufficient material',
      variantEnd: 'by variant rules',
      cheat: 'after a fair-play violation'
    }[status] || '';
    const endPhrase = {
      mate: 'Checkmate.',
      resign: 'Resignation.',
      outoftime: 'On time.',
      timeout: 'On time.',
      stalemate: 'Stalemate.',
      draw: 'By the rules.',
      insufficientMaterialClaim: 'Insufficient material.',
      variantEnd: 'By variant rules.',
      cheat: 'After a fair-play violation.',
      unknownFinish: 'Game over.'
    }[status] || 'Game over.';

    // Winning copy rewards what just happened. A loss never wears its name.
    const headline = outcome === 'win'
      ? 'Victory'
      : outcome === 'loss'
        ? 'Good game'
        : outcome === 'aborted'
          ? 'Game aborted'
          : 'Half a point';
    const detail = outcome === 'win'
      ? (winReason ? 'Won ' + winReason + '. Nicely done.' : 'Nicely done.')
      : outcome === 'loss'
        ? endPhrase + ' The next one is yours.'
        : outcome === 'aborted'
          ? 'Both sides walk away clean.'
          : 'Drawn. Well fought.';

    this.match.outcome = outcome;
    this.match.headline = headline;
    this.match.detail = detail;
    this.setTurnText(outcome === 'win' ? 'Victory' : outcome === 'loss' ? 'Good game' : outcome === 'aborted' ? 'Aborted' : 'Half a point');

    if (this.el.resultText) this.el.resultText.textContent = headline;
    if (this.el.pgnNote) this.el.pgnNote.textContent = detail;

    // Save the PGN locally; it is the user's game record.
    const pgn = this.buildPgn(outcome);
    const bridge = this.androidBridge();
    if (bridge && bridge.savePgn && pgn) {
      const fileName = 'lichess-' + this.match.id + '-' + this.dateStamp() + '.pgn';
      let saved = '';
      try {
        saved = bridge.savePgn(fileName, pgn) || '';
      } catch (e) {
        saved = '';
      }
      if (this.el.pgnNote) {
        this.pgnLine = saved
          ? ' · PGN saved: ' + saved
          : ' · PGN could not be saved';
        this.el.pgnNote.textContent = detail + this.pgnLine;
      }
    } else if (this.el.pgnNote) {
      this.el.pgnNote.textContent = detail;
    }

    // Re-sync ratings shortly after the server has applied the result.
    setTimeout(() => this.syncAccountAndReportDelta(), 1500);

    // Close the seek and, shortly, the streams; the panel shows the result.
    this.cancelSeek(true);
    this.stopEventStream();
    if (this.boardStreamAbort) {
      try { this.boardStreamAbort.abort(); } catch (e) { /* already closed */ }
      this.boardStreamAbort = null;
    }

    this.renderHub();
    this.syncOnlineButtons();
    this.setStatusNote(headline + ' — game over');
    chessGame.updateUI();
    chessGame.render();
  },

  backToHub() {
    this.match = null;
    this.accountBefore = null;
    if (this.el.resultText) this.el.resultText.textContent = '';
    if (this.el.pgnNote) this.el.pgnNote.textContent = '';
    // Show the hub again but keep games off the board; find a new match
    // instead of resetting the finished position before the user reads it.
    this.renderPanel();
    this.renderHub();
    this.syncClocksVisibility();
    this.setStatusNote('Tap Find game to play again.');
    this.setTurnText('Lichess online');
  },

  // --- PGN ------------------------------------------------------------------

  dateStamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  },

  pgnDate() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
  },

  buildPgn(outcome) {
    const match = this.match;
    if (!match) return '';

    // Build both players from the color: the seat we occupy is ours, the
    // other is the opponent captured at gameFull time.
    const usName = (this.account && this.account.username) || 'Player';
    const oppName = (match.opponent && match.opponent.name) || 'Opponent';
    const oppRating = match.opponent && match.opponent.rating ? String(match.opponent.rating) : '?';
    const ourRating = match.ourRating ? String(match.ourRating) : '?';
    const clean = value => String(value).replace(/["'\\]/g, '');
    const usTag = clean(usName) + ' (' + ourRating + ')';
    const oppTag = clean(oppName) + ' (' + oppRating + ')';
    const whiteTag = match.color === 'w' ? usTag : oppTag;
    const blackTag = match.color === 'b' ? usTag : oppTag;

    const result = outcome === 'win'
      ? (match.color === 'w' ? '1-0' : '0-1')
      : outcome === 'loss'
        ? (match.color === 'w' ? '0-1' : '1-0')
        : '1/2-1/2';

    // Movetext: 1. e4 e5 2. Nf3 ...
    const moves = chessGame.moveLog.slice();
    const chunks = [];
    for (let i = 0; i < moves.length; i += 2) {
      const number = i / 2 + 1;
      chunks.push(number + '. ' + moves[i] + (moves[i + 1] ? ' ' + moves[i + 1] : ''));
    }
    const body = chunks.join(' ');

    const initial = match.initialFen || null;
    const timeInitial = (typeof match.clockInitial === 'number') ? Math.round(match.clockInitial / 1000) : (this.seekTime || 10) * 60;
    const increment = (typeof match.clockIncrement === 'number') ? Math.round(match.clockIncrement / 1000) : (this.seekIncrement || 0);

    const tags = [
      '[Event "' + (match.rated ? 'Rated ' : 'Casual ') + (match.perfName || 'Rapid') + ' game"]',
      '[Site "https://lichess.org/' + match.id + '"]',
      '[Date "' + this.pgnDate() + '"]',
      '[Round "-"]',
      '[White "' + whiteTag + '"]',
      '[Black "' + blackTag + '"]',
      '[Result "' + result + '"]',
      '[TimeControl "' + timeInitial + '+' + increment + '"]',
      '[Variant "Standard"]',
      '[Termination "' + (outcome === 'aborted' ? 'Abandoned' : 'Normal') + '"]'
    ];
    if (initial) {
      tags.push('[SetUp "1"]');
      tags.push('[FEN "' + initial + '"]');
    }

    return tags.join('\n') + '\n\n' + (body ? body + ' ' : '') + result + '\n';
  },

  // --- Confirm dialog -----------------------------------------------------------

  showConfirm(options) {
    const overlay = document.createElement('div');
    overlay.className = 'lichess-confirm-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const dangerClass = options.danger ? 'lichess-confirm-danger' : 'lichess-confirm-danger';
    overlay.innerHTML =
      '<div class="lichess-confirm-card">' +
        '<p class="lichess-confirm-title"></p>' +
        '<p class="lichess-confirm-body"></p>' +
        '<div class="lichess-confirm-actions">' +
          '<button type="button" class="lichess-secondary-btn lichess-confirm-cancel">Stay</button>' +
          '<button type="button" class="' + dangerClass + ' lichess-confirm-ok"></button>' +
        '</div>' +
      '</div>';
    overlay.querySelector('.lichess-confirm-title').textContent = options.title || '';
    overlay.querySelector('.lichess-confirm-body').textContent = options.body || '';
    const okButton = overlay.querySelector('.lichess-confirm-ok');
    okButton.textContent = options.confirmLabel || 'OK';

    const close = () => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });
    overlay.querySelector('.lichess-confirm-cancel').addEventListener('click', close);
    okButton.addEventListener('click', () => {
      close();
      if (options.onConfirm) options.onConfirm();
    });
    document.body.appendChild(overlay);
    okButton.focus();
  },

  // Hardware back press: claim it while a match is live, offer to resign.
  handleBack() {
    if (!this.matchLive()) return false;
    this.showConfirm({
      title: 'Leave the chess page?',
      body: 'The game stays on Lichess. Leaving without resigning means the clock keeps running and your opponent can claim the win.',
      confirmLabel: 'Resign & leave',
      danger: true,
      onConfirm: () => {
        this.lichessFetch('/api/board/game/' + this.match.id + '/resign', { method: 'POST' }).catch(() => {});
        const bridge = this.androidBridge();
        if (bridge && bridge.exitToLauncher) bridge.exitToLauncher();
      }
    });
    return true;
  },

  abortStreamAndResetMatch() {
    if (this.boardStreamAbort) {
      try { this.boardStreamAbort.abort(); } catch (e) { /* moot */ }
    }
    this.match = null;
    this.stopTicking();
    this.syncOnlineButtons();
    this.renderHub();
    this.syncClocksVisibility();
  }
};

/* Lichess sends GameColor as "white"/"black"; this app uses 'w'/'b'.
   Normalise once at the boundary instead of comparing raw strings. */
function normalizeLichessColor(value) {
  if (!value) return null;
  const s = String(value).toLowerCase();
  if (s === 'w' || s === 'white') return 'w';
  if (s === 'b' || s === 'black') return 'b';
  return null;
}
