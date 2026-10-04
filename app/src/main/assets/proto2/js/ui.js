/* ------------------------------------------------------------------
 * Proto Web — UI shell
 * Dark-mode sidebar + panel router.
 *
 * Replaces the original's ActionBar-menu -> setContentView() navigation
 * (there was no sidebar in the APK) and converts every light surface:
 *   list_single white row, theme #fffafafa window, black EditTexts,
 *   spinner_big #ff000000, bank_panel buttonApply black text.
 * ------------------------------------------------------------------ */

import { icon, COM_ICON, COM_LABEL, PALETTE } from './icons.js';
import { LENDERS, setStandingLender, getStandingLender } from './credit.js';
import { PRESETS } from './config.js';
import * as Save from './save.js';

/* `short` is the label used in the phone's bottom tab bar, where the full
 * name does not fit across nine slots. Every screen has one — a tab labelled
 * with a truncated word is worse than a tab labelled with a smaller one. */
export const SCREENS = [
  { id: 'map',      label: 'Map',         short: 'Map',       icon: 'map',       mode: 'map'   },
  { id: 'graph',    label: 'Graph',       short: 'Graph',     icon: 'graph',     mode: 'graph' },
  { id: 'stats',    label: 'Statistics',  short: 'Stats',     icon: 'stats',     mode: 'stats' },
  { id: 'cycle',    label: 'Cycle',       short: 'Cycle',     icon: 'cycle',     panel: true },
  { id: 'state',    label: 'The State',   short: 'State',     icon: 'gavel',     panel: true },
  { id: 'trade',    label: 'Trade',       short: 'Trade',     icon: 'trade',     panel: true },
  { id: 'currency', label: 'Currency',    short: 'Money',     icon: 'currency',  panel: true },
  { id: 'bank',     label: 'Banking',     short: 'Bank',      icon: 'bank',      panel: true },
  { id: 'credit',   label: 'The Debt',    short: 'Debt',      icon: 'bond',      panel: true },
  { id: 'traders',  label: 'Traders',     short: 'Traders',   icon: 'list',      panel: true },
  { id: 'control',  label: 'Control',     short: 'Control',   icon: 'control',   panel: true },
  { id: 'info',     label: 'Information', short: 'Info',      icon: 'info',      panel: true },
];

export class UI {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.active = 'map';
    this.wide = window.matchMedia('(min-width: 900px)');
    /* Bound once and reused. Rebinding these on every _build() would attach a
     * new listener per layout change and leak the old ones. */
    this._onLayoutChange = () => {
      if (this._layout() === this._currentLayout) return;
      this._rebuild(this._layout());
    };
    /* Re-fit the topbar on any resize, not only when the layout class flips.
     *
     * The wide/phone predicate only changes at 900px, but the width available
     * to the stats row changes continuously — a split-screen resize, a browser
     * chrome collapse, a foldable opening. The fit is a measurement, so it has
     * to be re-taken when the thing it measures changes, and the case that
     * motivated it (a chip sliding under the tick counter) has nothing to do
     * with which of the two layouts is active. */
    this._onResize = () => this._fitStats();
    this._build();
  }

  _build() {
    const el = (tag, cls, html) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (html !== undefined) n.innerHTML = html;
      return n;
    };

    /* The rail, and the tab bar, are the same twelve screens.
     *
     * They used to be one nav element that CSS re-parented between the two
     * layouts. That was tidy on paper and wrong in practice: it kept the
     * *desktop* rail alive on a phone, where it exists only as a drawer behind
     * a hamburger button. Every destination was then reachable twice — once in
     * the bottom bar, once in the drawer — which is duplicated navigation, not
     * a layout. Worse, the tick readout and the transport controls lived in the
     * drawer, so "what time is it" and "pause the world" were both hidden behind
     * a menu you had to know was there.
     *
     * The rail is now built only where it earns its place: >=900px, where the
     * tab bar is hidden and the extra width pays for a permanent list of
     * destinations plus the tick readout. Under that width the phone gets the
     * tab bar and nothing else. `matchMedia` decides once at construction and
     * re-evaluates on change, so rotating a tablet or resizing a desktop window
     * rebuilds the correct layout rather than leaving a stale one.
     *
     * The tick counter moves to the topbar for phones, where it was always
     * wanted and never reachable. */
    const wide = this.wide;
    const layout = () => (wide.matches ? 'wide' : 'phone');
    this._layout = layout;

    this._currentLayout = layout();
    this.root.classList.add('layout-' + this._currentLayout);

    let sb = null;
    if (layout() === 'wide') {
      sb = el('aside', 'sidebar');
      sb.innerHTML = `
        <div class="brand">
          <span class="brand-mark">${icon('logo')}</span>
          <span class="brand-text">
            <strong>Proto</strong>
            <small>Economy Simulator</small>
          </span>
        </div>

        <nav class="nav" role="navigation"></nav>

        <div class="sb-foot">
          <div class="run-controls">
            <button class="ctrl play" data-act="play" title="Play / Pause">
              <span class="ctrl-ico">${icon('play')}</span>
              <span class="ctrl-label">Play</span>
            </button>
            <button class="ctrl" data-act="speed" title="Speed on/off">
              <span class="ctrl-ico">${icon('speed')}</span>
              <span class="ctrl-label">Speed</span>
            </button>
          </div>
          <div class="tick-readout"><span data-bind="tick">0</span> ticks</div>
        </div>`;

      const nav = sb.querySelector('.nav');
      for (const s of SCREENS) {
        const b = el('button', 'nav-item');
        b.dataset.screen = s.id;
        b.innerHTML = `<span class="nav-ico">${icon(s.icon)}</span><span class="nav-label">${s.label}</span>`;
        b.addEventListener('click', () => this.go(s.id));
        nav.appendChild(b);
      }

      sb.querySelector('[data-act="play"]').addEventListener('click', () => this.app.togglePlay());
      sb.querySelector('[data-act="speed"]').addEventListener('click', () => this.app.toggleSpeed());
    }
    this.sidebar = sb;

    /* ---- main ----
     *
     * On a phone the transport controls move OUT of the sidebar (which is now
     * a bottom bar) and into the topbar as a thumb-reachable pill. Both copies
     * exist in the DOM; CSS shows one and hides the other, and both are wired
     * to the same handlers, so the controls are never more than one tap away
     * regardless of orientation. */
    const main = el('main', 'main');
    /* Embedded mode: this build also ships inside another app's WebView, as a
     * same-origin iframe in a slot the host calls "game 4".
     *
     * There the crown in the corner is decoration, and a decoration is not a way
     * out — the player would have to know the Android back gesture exists. So
     * the mark becomes a real back button whenever the document is framed, and
     * stays a mark when it is not. Detected by frame comparison rather than a
     * build flag so the same asset works both ways with no configuration.
     *
     * `parent.switchPage` is the host's own navigation function. Same-origin, so
     * it is directly reachable; the fallbacks are for being embedded somewhere
     * that does not have it, where history.back() is the honest guess. */
    this.embedded = (() => {
      try { return window.self !== window.top; } catch (e) { return true; }
    })();
    const backBtn = this.embedded
      ? `<button class="brand-mark tb-mark tb-back" data-act="back" title="Back to the launcher"
           aria-label="Back">${icon('back')}</button>`
      : `<span class="brand-mark tb-mark">${icon('logo')}</span>`;

    main.innerHTML = `
      <header class="topbar">
        ${backBtn}
        <div class="tb-title" data-bind="title">Map</div>
        <div class="tb-transport">
          <button class="tb-btn tb-play" data-act="play2" title="Play / Pause"
            aria-label="Play">${icon('play')}</button>
          <button class="tb-btn" data-act="speed2" title="Speed on/off"
            aria-label="Speed">${icon('speed')}</button>
          <button class="tb-btn tb-ticks" data-bind="tick-wrap" hidden
            title="Elapsed ticks"><span data-bind="tick">0</span></button>
        </div>
        <div class="tb-stats" data-bind="stats-row">
          <span class="chip"><i>GDP</i><b data-bind="gdp">$0.00</b></span>
          <span class="chip"><i>Currency</i><b data-bind="currency">$0.00</b></span>
          <span class="chip"><i>Labor</i><b data-bind="labor">0</b></span>
          <span class="chip cycle-chip" data-bind="state" hidden></span>
        </div>
      </header>
      <div class="stage">
        <canvas class="canvas" data-bind="canvas"></canvas>
        <div class="panel-host" data-bind="panel" hidden></div>
      </div>
      <nav class="tabbar" role="navigation" aria-label="Screens"></nav>`;

    /* The tab bar is a mirror of the same SCREENS list — both are generated
     * from it so a new screen appears in both layouts automatically. */
    const tabs = main.querySelector('.tabbar');
    for (const s of SCREENS) {
      const b = el('button', 'tab');
      b.dataset.screen = s.id;
      b.innerHTML = `<span class="tab-ico">${icon(s.icon)}</span><span class="tab-label">${s.short || s.label}</span>`;
      b.addEventListener('click', () => this.go(s.id));
      tabs.appendChild(b);
    }

    if (sb) this.root.appendChild(sb);
    this.root.appendChild(main);

    this.canvas = main.querySelector('[data-bind="canvas"]');
    this.panelHost = main.querySelector('[data-bind="panel"]');
    /* Twelve tabs do not fit across a 390px bar, so it scrolls horizontally.
       Without this the active tab can sit off-screen with nothing indicating
       where you are — the single most disorienting thing a scrollable tab bar
       can do. */
    this.tabbar = tabs;

    this.bind = {};
    main.querySelectorAll('[data-bind]').forEach(n => { this.bind[n.dataset.bind] = n; });
    /* Both tick readouts exist and are driven from the same binding: the rail's
     * on a wide screen, the topbar chip's on a phone. updateHud writes through
     * whichever is present rather than caring which layout is live. */
    /* Two tick readouts can exist — the rail's on a wide screen, the topbar chip's
     * on a phone — but updateHud writes to whichever is present, and CSS shows
     * exactly one per layout. `tickEls` is the list of live ones so the writer
     * does not have to know which layout is active. */
    this.bind.tickEls = Array.from(
      this.root.querySelectorAll('[data-bind="tick"]'));
    this.bind.tickWrap = main.querySelector('[data-bind="tick-wrap"]');
    this.statsRow = main.querySelector('[data-bind="stats-row"]');
    /* The chips themselves, keyed by the binding they carry, so _fitStats can
     * drop them by usefulness without relying on nth-child. A reorder of the
     * markup cannot silently change which figure is sacrificed. */
    this.bind.chips = {};
    for (const k of ['gdp', 'currency', 'labor', 'state']) {
      const v = this.bind[k];
      const chip = v && v.closest('.chip');
      if (chip) this.bind.chips[k] = chip;
    }
    /* The chip is phone-only; the rail shows its own readout instead. */
    if (this.bind.tickWrap) {
      this.bind.tickWrap.hidden = !!(sb && sb.querySelector('[data-bind="tick"]'));
    }
    this.playBtn = sb ? sb.querySelector('[data-act="play"]') : null;
    this.speedBtn = sb ? sb.querySelector('[data-act="speed"]') : null;
    this.playBtn2 = main.querySelector('[data-act="play2"]');
    this.speedBtn2 = main.querySelector('[data-act="speed2"]');

    main.querySelector('[data-act="play2"]').addEventListener('click', () => this.app.togglePlay());
    main.querySelector('[data-act="speed2"]').addEventListener('click', () => this.app.toggleSpeed());

    /* Back out of the host, when framed. See the note on `embedded` above. */
    const back = main.querySelector('[data-act="back"]');
    if (back) {
      back.addEventListener('click', () => {
        /* Stop the clock on the way out. The host keeps this iframe alive, so
         * without this the simulation runs on at 8 ticks/second behind a page
         * nobody is looking at — burning battery and, because autosave fires
         * every second, writing to localStorage forever. */
        if (this.app.running) { this.app.running = false; this.setRunning(false); }
        let left = false;
        try {
          if (typeof window.parent.switchPage === 'function') {
            window.parent.switchPage('main');
            left = true;
          }
        } catch (e) { /* cross-origin host: fall through */ }
        if (!left) { try { window.parent.history.back(); } catch (e) { window.history.back(); } }
      });
    }

    /* Rebuild if the layout class of the device changes — a tablet rotating, a
     * desktop window dragged narrow. Cheap, and it happens a handful of times in
     * a session rather than continuously. The handler is the one bound in the
     * constructor, so repeated _build() calls do not stack listeners.
     *
     * MediaQueryList 'change' plus resize/orientation listeners, all running
     * the same idempotent predicate.
     *
     * The 'change' event alone is not enough: it is not delivered for every kind
     * of viewport change inside a WebView, and a host-driven resize in
     * particular can leave the layout stale with nothing indicating why. The
     * rAF poll that used to be here was worse than useless — a permanent
     * per-frame callback that could never be cancelled and burned a frame doing
     * nothing, in exchange for insurance nobody had verified.
     *
     * A resize listener is the honest second signal: it fires on the event that
     * actually causes the change, costs nothing when idle, and stops on its own
     * once the window is still. */
    wide.addEventListener('change', this._onLayoutChange);
    window.addEventListener('resize', this._onResize, { passive: true });
    window.addEventListener('orientationchange', this._onLayoutChange);
  }

  /* Swap between the rail layout and the phone layout in place.
   *
   * Rebuilding the whole shell is heavy-handed but honest: the two layouts
   * genuinely differ in which elements exist (the rail, its tick readout and its
   * transport pair are not in the DOM on a phone), so there is no CSS-only way
   * to get from one to the other. The active screen and run state are carried
   * across so the rebuild is invisible apart from the layout itself. */
  _rebuild(next) {
    const active = this.active;
    const wasRunning = this.app.running;
    this.root.innerHTML = '';
    this.root.classList.remove('layout-wide', 'layout-phone');
    this._currentLayout = next;
    this._build();
    this.go(active);
    this.setRunning(wasRunning);
  }

  setDrawer(open) {
    /* Kept as a no-op rather than deleted: the drawer markup is gone, so there
     * is nothing to open. ui.go() still calls this, and a stub that explains
     * itself beats a silent call into undefined. */
    this.drawerOpen = false;
  }

  /* `opts.force` re-renders even for a canvas screen, used after a save is
     * restored: the shell must repaint from the new sim rather than assume the
     * frame on screen still matches the data. */
  go(id, opts = {}) {
    if (!SCREENS.some(x => x.id === id)) return;
    this.active = id;
    const s = SCREENS.find(x => x.id === id);
    if (this.sidebar) {
      this.sidebar.querySelectorAll('.nav-item').forEach(n =>
        n.classList.toggle('is-active', n.dataset.screen === id));
    }
    const tabs = this.tabbar.querySelectorAll('.tab');
    tabs.forEach(n => n.classList.toggle('is-active', n.dataset.screen === id));
    /* Keep the selected tab on screen in the scrolling bar.
     *
     * Assignment, not scrollTo({behavior:'smooth'}): smooth scrolling inside a
     * hidden/offscreen iframe never advances, and more importantly it is
     * deferred to a compositor that may be throttled — so the tab can be
     * navigated to and still be sitting off-screen with nothing indicating
     * where you are. Direct assignment has no frame of latency and works in
     * every engine. The bar is short, so the jump is barely perceptible. */
    for (const t of tabs) {
      if (t.dataset.screen !== id) continue;
      const bar = this.tabbar;
      const left = t.offsetLeft - (bar.clientWidth - t.offsetWidth) / 2;
      bar.scrollLeft = Math.max(0, left);
      break;
    }
    this.bind.title.textContent = s.label;

    const showCanvas = !!s.mode;
    this.canvas.hidden = !showCanvas;
    this.panelHost.hidden = showCanvas;
    if (s.mode) {
      this.app.renderer.viewMode = s.mode;
      /* Force a repaint after a restore: the canvas still holds the previous
       * simulation's last frame, and the clock may be paused so the render loop
       * will not tick to correct it. Deferred to the next frame because the
       * canvas has only just been un-hidden and measures 0x0 until the browser
       * has laid it out — drawing inline here scaled the map to a negative size
       * and threw. */
      if (opts.force) this.app.refreshCanvas();
    } else {
      this.app.renderPanel(id);
    }
    this.setDrawer(false);
  }

  /* The rail's transport pair and the topbar pair are the same commands, so they
   * stay in sync. Whichever pair is absent for the current layout is null and
   * skipped — the rail only exists at >=900px, so on a phone these are null
   * guarded rather than styled away. */
  setRunning(on) {
    const glyph = icon(on ? 'pause' : 'play');
    if (this.playBtn) {
      this.playBtn.classList.toggle('is-on', on);
      this.playBtn.querySelector('.ctrl-ico').innerHTML = glyph;
      this.playBtn.querySelector('.ctrl-label').textContent = on ? 'Pause' : 'Play';
    }
    if (this.playBtn2) {
      this.playBtn2.classList.toggle('is-on', on);
      this.playBtn2.innerHTML = glyph;
      this.playBtn2.setAttribute('aria-label', on ? 'Pause' : 'Play');
    }
  }

  setSpeed(on) {
    if (this.speedBtn) {
      this.speedBtn.classList.toggle('is-on', on);
      this.speedBtn.title = on ? 'Speed on' : 'Speed off';
    }
    if (this.speedBtn2) {
      this.speedBtn2.classList.toggle('is-on', on);
      this.speedBtn2.title = on ? 'Speed on' : 'Speed off';
    }
  }

  /* Compact money for the HUD.
   *
   * The topbar has a fixed budget: crown, play, speed and the tick chip take
   * 194px of a 360px screen before any figure is drawn, leaving roughly 150px
   * for GDP, currency and the cycle chip. Anything wider than that does not
   * merely get clipped — `.tb-stats` is `justify-content: flex-end` with
   * `overflow: hidden`, so overflow escapes at the START edge and slides the
   * leftmost chip backwards, underneath the tick counter.
   *
   * Measured on an itel S685LN at 360dp: GDP of $968,371 rendered as
   * "$968,371", the row needed 209px against 152px available, and the GDP chip
   * was displaced 57px to the left. What showed on screen was a clipped dark
   * lozenge with the final "1" of the figure sitting immediately right of the
   * tick count — a stray "1" that read as a notification badge.
   *
   * So the widest branch of this function has to be the narrowest: thousands
   * are abbreviated, because at that magnitude the exact digit is the least
   * interesting thing about the number and the column width is the most
   * expensive thing on the screen. */
  _hudMoney(v) {
    const d = v / 100;
    const ab = Math.abs(d);
    if (ab >= 1e12) return '$' + (d / 1e12).toFixed(2) + 'T';
    if (ab >= 1e9) return '$' + (d / 1e9).toFixed(2) + 'B';
    if (ab >= 1e6) return '$' + (d / 1e6).toFixed(1) + 'M';
    /* Abbreviated, and deliberately without a grouping separator: "$968k" is
     * five characters against "$968,371"'s eight, and on a 360px topbar three
     * characters is the difference between fitting and overflowing. */
    if (ab >= 1e4) return '$' + Math.round(d / 1e3).toLocaleString() + 'k';
    return '$' + d.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  /* Hide the least important chips until the topbar row actually fits.
   *
   * A media query cannot do this. `@media (max-width: 420px)` hides the labour
   * count by `nth-child(3)`, which is a guess about how wide a number will be —
   * and it stops being true the moment the money supply grows a digit. What is
   * needed is a measurement, not a breakpoint, so this compares the row's real
   * scrollWidth against its real clientWidth and drops chips in reverse order
   * of usefulness until they agree.
   *
   * Priority is the reverse of the old nth-child hack: the cycle chip is never
   * a candidate, because it is the only glanceable statement of where the
   * economy is and it is tone-coloured so it reads without being read. Labour
   * goes first, then GDP; currency is kept because the panels key their
   * explanations to it.
   *
   * Runs after every HUD update and on resize. It bails out on the first check
   * that already fits, so the common cost is two property reads. */
  _fitStats() {
    const row = this.statsRow;
    if (!row || !this.bind.chips) return;
    const chips = this.bind.chips;
    /* Reset first, or a chip hidden at a narrow width stays hidden after a
     * rotate or a resize back to a wide layout. */
    for (const k of Object.keys(chips)) chips[k].hidden = false;

    /* The row's real width requirement, measured by summing its children.
     *
     * It is tempting to test `row.scrollWidth > row.clientWidth` here and that
     * was the first version of this function. It is wrong, and measurably so:
     * `scrollWidth` reports overflow in the INLINE-END direction only, and
     * because the row is `justify-content: flex-end` an over-wide row spills
     * out of its START edge instead — straight under the tick counter, where
     * scrollWidth reports nothing at all. Measured: chips spanning 185..354 in
     * a row of clientWidth 152, and scrollWidth === clientWidth === 152, i.e.
     * "no overflow" while 17px of GDP chip sat on top of the tick count.
     *
     * Summing the children has no blind spot: it asks how much room the chips
     * want, not which way they leaked. */
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    const required = () => {
      let w = 0, n = 0;
      for (const k of ['gdp', 'currency', 'labor', 'state']) {
        const c = chips[k];
        if (!c || c.hidden) continue;
        const cw = c.getBoundingClientRect().width;
        /* A chip the stylesheet has already hidden (labour, under 420px) has no
         * width and must not be counted as a member of the row. */
        if (cw <= 0) continue;
        w += cw; n++;
      }
      return n ? w + gap * (n - 1) : 0;
    };

    for (const k of ['labor', 'gdp', 'currency']) {
      if (required() <= row.clientWidth) break;
      chips[k].hidden = true;
    }
  }

  updateHud(st) {
    for (const el of this.bind.tickEls) el.textContent = st.tick.toLocaleString();
    this.bind.gdp.textContent = this._hudMoney(st.gdp);
    this.bind.currency.textContent = this._hudMoney(st.currency);
    this.bind.labor.textContent = st.laborPop;

    // cycle chip — visible from every screen, since the phase is the single
    // most important thing about the economy at any moment
    const m = st.macro;
    if (m) {
      const chip = this.bind.state;
      chip.hidden = false;
      chip.className = 'chip cycle-chip tone-' + m.phaseTone;
      chip.innerHTML = `<i>${m.phaseLabel}</i><b>${m.regimeLabel}</b>`;
      chip.title = m.phaseNote;
    }

    /* Last, because it measures what the chips above just became. The width of
     * the topbar row is a function of the money supply and the phase name, both
     * of which change while the game runs — so this cannot be done once at
     * startup or from a media query. */
    this._fitStats();
  }
}

/* ---------------- panel builders ---------------- */

/* Module-scope element factory: the panel helpers below (chart, sliders)
 * need it too, and keeping one definition avoids shadowing. */
function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
}

/* Money formatting. Module scope because renderDocket() and the panel
 * builders both need it. `money` in util.js is the compact variant used by
 * the macro log; this is the two-decimal form the original UI used. */
const money = v => '$' + (v / 100).toLocaleString(undefined, {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export function buildPanel(id, app) {
  const sim = app.sim;

  switch (id) {

  /* -------- The State: rulings, approval, security, decrees -------- */
  case 'state': {
    const wrap = el('div', 'panel');
    const p = sim.sovereign ? sim.sovereign.describe() : null;
    if (!p) return el('div', 'panel');

    wrap.appendChild(el('div', 'panel-head', `
      <h2>The State</h2>
      <p>Every unpaid debt is a case, and there are three ways to rule on one.
         Forgive it and the money stays in circulation and the firm survives.
         Enforce it and the claim is called in and the poor are liquidated.
         Bail it out and nobody loses anything today. Each ruling moves the
         balance of power between the interests — and what you are permitted to
         do grows as you lose their consent.</p>`));

    const body = el('div', 'panel-body');

    /* ---- approval ---- */
    const hero = el('section', 'card cycle-hero');
    const tierTone = TIER_TONE[p.tier] || 'muted';
    const toneWord = {
      consensus: 'Liberal · Consent governs',
      contested: 'Contested · The country is divided',
      strained: 'Strained · Institutions are fraying',
      authoritarian: 'Authoritarian · The state rules by decree',
      tyranny: 'Tyranny · Decree is all that remains',
    }[p.tier];
    const safe = p.coupProtected;
    hero.innerHTML = `
      <div class="cy-phase">
        <span class="cy-badge tone-${tierTone}">${p.approval.toFixed(0)}% Approval</span>
        <span class="cy-badge tone-muted">${toneWord.split('·')[0].trim()}</span>
        <span class="cy-badge tone-${safe ? 'good' : 'bad'}">${safe
          ? 'Protected from coup' : 'Coup risk'}</span>
        ${p.coups > 0 ? `<span class="cy-badge tone-bad">${p.coups} coup${p.coups === 1 ? '' : 's'}</span>` : ''}
      </div>
      <p class="cy-note">${toneWord.split('·')[1].trim()} Every ruling shifts power
         between the interests below. The army decides who is still standing, so
         its favour is what keeps you in the palace — while it holds, no coup is
         possible. Lose it and you keep the throne only because the army has
         nowhere better to go; that is not the same as being safe.</p>`;

    const gauge = el('div', 'approval-gauge');
    const fill = Math.max(0, Math.min(100, p.approval));
    gauge.innerHTML = `
      <div class="ag-track">
        <i class="ag-fill tone-bg-${tierTone}" style="width:${fill}%"></i>
        ${[18, 38, 58, 78].map(m => `<b class="ag-tick" style="left:${m}%"
           title="${TIER_NAME[m] || ''}"></b>`).join('')}
      </div>
      <div class="ag-scale">
        <span>Tyranny</span><span>Authoritarian</span><span>Strained</span>
        <span>Contested</span><span>Consensus</span>
      </div>`;
    hero.appendChild(gauge);
    body.appendChild(hero);

    /* ---- the three counters, and what each is worth ----
     *
     * All three are counted, not two. A bailout is neither a write-off nor an
     * insolvency, and folding it into either would hide the only number that
     * matters for judging a ruler: how much of the country's money the ruler
     * invented. */
    const wo = p.writeOffs, ins = p.insolvencies;
    const bo = sim.credit ? sim.credit.bailoutCount : 0;
    const totalRulings = wo + ins + bo;
    body.appendChild(el('div', 'stat-strip three', `
      <div class="ss"><i>Forgiven</i><b class="pos">${wo.toLocaleString()}</b></div>
      <div class="ss"><i>Enforced</i><b class="neg">${ins.toLocaleString()}</b></div>
      <div class="ss"><i>Bailed out</i><b class="tone-warn">${bo.toLocaleString()}</b></div>
      <div class="ss"><i>Absorbed</i><b>${money(p.forgivenTotal)}</b></div>
      <div class="ss"><i>Called in</i><b>${money(p.enforcedTotal)}</b></div>
      <div class="ss"><i>Printed</i><b class="tone-warn">${money(sim.credit ? sim.credit.bailedTotal : 0)}</b></div>`));

    /* ---- the election ----
     * The one place the ruler can be told, in public, that the country has
     * stopped believing the state. It never removes them — that is the promise
     * the whole political layer rests on — but it prices the standing they
     * keep. */
    const term = (sim.cfg.ELECTION_TERM_YEARS || 5);
    const until = Math.max(0, p.nextElectionYear - p.year);
    const elec = el('section', 'card');
    elec.innerHTML = `
      <h3>The next election</h3>
      <p class="hint">Year ${p.year} of ${p.nextElectionYear - term} —
         ${until === 0 ? 'the count is due now' : `${until} year${until === 1 ? '' : 's'} remain`}.
         You need <b>${sim.cfg.DEMOCRATIC_THRESHOLD}%</b> of the vote, and the vote is
         not the approval gauge: the electorate also prices the cost of living and
         your credit discipline. A ruler who is popular and printing will lose
         anyway.</p>
      <div class="el-count">
        <span><b>${until}</b><i>year${until === 1 ? '' : 's'} left</i></span>
        <span><b>${p.termsHeld}</b><i>term${p.termsHeld === 1 ? '' : 's'} served</i></span>
        <span><b>${p.defianceCount}</b><i>times you ruled on</i></span>
      </div>`;
    if (p.lastElection) {
      elec.appendChild(el('p', 'hint dim',
        `Last election, year ${p.lastElection.year}: <b>${p.lastElection.verdict}</b>
         at ${p.lastElection.effective.toFixed(0)}%${p.lastElection.defiant
           ? ' — and you overruled it' : ''}.`));
    }
    body.appendChild(elec);

    /* Both rulings have an argument. Forgiveness keeps firms and money alive;
     * enforcement destroys currency, which firms prices, and it wins the
     * lenders' trust. Showing the balance is the point — neither is free. */
    const led = el('section', 'card');
    const pct = n => totalRulings ? (n / totalRulings) * 100 : 0;
    const mix = pct(ins), forgive = pct(wo), bail = pct(bo);
    led.innerHTML = `
      <h3>The Ledger</h3>
      <p class="hint">${totalRulings
        ? `${mix.toFixed(0)}% enforced · ${forgive.toFixed(0)}% forgiven · ${bail.toFixed(0)}% bailed out.`
        : 'No rulings yet.'} Enforcement is not only a punishment: an extinguished
         claim never returns to circulation, so an enforcing state runs tight
         money and firm prices, and lenders trust a state that collects.
         Forgiveness keeps the currency circulating and the firms trading.
         A bailout is the third thing entirely — it settles the claim in full
         and is the only ruling that pleases every interest, which is why the
         cost of it has to be read off the inflation and not off the ledger.</p>
      <div class="ledger">
        <span class="ld-forgive" style="width:${totalRulings ? forgive || 0 : 34}%">Forgiven</span>
        <span class="ld-enforce" style="width:${mix}%">Enforced</span>
        <span class="ld-bailout" style="width:${bail}%">Bailed out</span>
      </div>
      <div class="ledger-note">
        <span class="tone-good">Tight money · creditor trust · the army and the houses</span>
        <span class="tone-bad">A living workforce · a circulating supply · the commons</span>
        <span class="tone-warn">Everybody's approval · everybody's inflation</span>
      </div>`;
    body.appendChild(led);

    /* ---- the three classes ---- */
    const pop = sim.directory.all.filter(t => !t.isDead && t.id !== 'MASTER');
    const cls = c => pop.filter(t => t.socialClass === c).length;
    const comm = cls('commons'), mid = cls('middle'), eli = cls('elite');
    const total = Math.max(1, comm + mid + eli);
    const society = el('section', 'card');
    society.innerHTML = `<h3>The Three Orders</h3>
      <p class="hint">Enforcement falls only on the commons. Middle-class firms are
         stripped of cash but survive on their plant and stock; the great houses
         barely feel it. The commons breed fast enough that a docket's worth of
         deaths is more than replaced before the next one opens — which is
         exactly why enforcement costs a ruler so little.</p>`;
    const stack = el('div', 'class-stack');
    stack.innerHTML = `
      <span class="cs-commons" style="width:${(comm / total) * 100}%">${comm}</span>
      <span class="cs-middle" style="width:${(mid / total) * 100}%">${mid}</span>
      <span class="cs-elite" style="width:${(eli / total) * 100}%">${eli}</span>`;
    society.appendChild(stack);
    const legend = el('div', 'class-legend');
    legend.innerHTML = `
      <span><i class="cs-commons"></i>Commons — ${comm} · killed by enforcement, breed fast</span>
      <span><i class="cs-middle"></i>Middle — ${mid} · survive enforcement, can found a house</span>
      <span><i class="cs-elite"></i>Houses — ${eli} · untouchable</span>`;
    society.appendChild(legend);
    if (sim.observedLaborPeak) {
      society.appendChild(el('p', 'hint',
        `Population has peaked at ${sim.observedLaborPeak}. There is no cap — growth `
        + `stops when the map fills or the bread runs out.`));
    }
    body.appendChild(society);

    /* ---- the great houses ---- */
    if (p.eliteHouses && p.eliteHouses.length) {
      const houses = el('section', 'card');
      houses.innerHTML = `<h3>The Great Houses</h3>
        <p class="hint">Enforcement cannot touch them. They were seeded with deep
           reserves precisely so that a ruling which spares the wealthy and
           buries the small is a ruling somebody wants. Their loyalty is the
           reason enforcement is politically possible at all.</p>`;
      const hl = el('div', 'faction-list');
      for (const h of p.eliteHouses) {
        const row = el('div', 'faction house');
        row.innerHTML = `
          <span class="fx-name"><i></i>${escapeHtml(h.name)}</span>
          <span class="fx-creed">${COM_LABEL[h.industry] || 'Mixed'} · ${h.stock.toLocaleString()} in stock${
            h.hits ? ` · survived ${h.hits.toLocaleString()} enforcement${h.hits === 1 ? '' : 's'}` : ''}</span>
          <span class="fx-bar"><i style="width:${Math.max(2, Math.min(100, h.wealth / Math.max(1, p.forgivenTotal + p.enforcedTotal + h.wealth) * 100))}%;background:#e0b64a"></i></span>
          <span class="fx-pow">${money(h.wealth)}</span>`;
        hl.appendChild(row);
      }
      houses.appendChild(hl);
      body.appendChild(houses);
    }

    /* ---- standing order ---- */
    const so = el('section', 'card');
    so.innerHTML = `<h3>Standing Order</h3>
      <p class="hint">Write-offs arrive about twice every bank cycle, far too
         often to judge each one. Set a default and the court rules on them
         automatically, or rule on every case yourself.</p>`;
    const sorow = el('div', 'choice-row');
    const mkChoice = (label, key, desc) => {
      const b = el('button', 'btn ' + (p.autoRule === key ? 'btn-accent' : 'btn-ghost'),
        label + (p.autoRule === key ? ' · active' : ''));
      b.addEventListener('click', () => {
        sim.sovereign.autoRule = key;
        app.flash(`Standing order: ${label}`);
        app.renderPanel('state');
      });
      sorow.appendChild(b);
      void desc;
    };
    mkChoice('Ask each time', null);
    mkChoice('Forgive', 'forgive');
    mkChoice('Enforce', 'enforce');
    mkChoice('Bail out', 'bailout');
    so.appendChild(sorow);
    /* Resolve the lender through the accessor rather than reading a property
     * off the module: the standing lender is module state in credit.js, and
     * `sim.credit.standingLender` was always undefined, so this crashed on
     * every render of The State the moment the bailout option was added. */
    const standing = LENDERS[sim.credit
      ? sim.credit.describe().standingLender
      : getStandingLender()] || LENDERS.imf;
    so.appendChild(el('p', 'hint dim',
      p.autoRule === 'bailout'
        ? `Bailouts draw on the ${standing.short} by default — change it on The Debt screen.`
        : 'A standing order of "bail out" is the popular choice and the one that prints the most money.'));
    if (p.autoRule) {
      so.appendChild(el('p', 'hint',
        `${p.claimsAuto.toLocaleString()} claims settled automatically under standing order, ` +
        `${p.claimsRuled.toLocaleString()} ruled by hand.`));
    }
    body.appendChild(so);

    /* ---- decrees ---- */
    const dec = el('section', 'card');
    dec.innerHTML = `<h3>Emergency Powers</h3>
      <p class="hint">Each decree is genuinely effective and genuinely
         corrosive. Every one of them costs approval continuously, so a
         government living by decree spends the consent that would let it
         govern without them.</p>`;
    const dlist = el('div', 'decree-list');
    for (const dz of p.decrees) {
      const row = el('div', 'decree' + (dz.active ? ' is-on' : ''));
      row.innerHTML = `
        <div class="dz-head">
          <b>${dz.name}</b>
          ${dz.active ? '<span class="dz-on">IN FORCE</span>' : ''}
        </div>
        <p class="dz-desc">${dz.desc}</p>
        <div class="dz-trade">
          <span class="dz-good">${dz.good}</span>
          <span class="dz-bad">${dz.bad}</span>
        </div>`;
      const btn = el('button', 'btn ' + (dz.active ? 'btn-danger' : 'btn-primary'),
        dz.active ? 'Repeal' : 'Enact');
      if (!dz.available && !dz.active) {
        btn.disabled = true;
        btn.textContent = `Needs ${dz.minApproval}% approval`;
        btn.className = 'btn btn-ghost';
      } else {
        btn.addEventListener('click', () => {
          if (sim.sovereign.toggleDecree(dz.id)) {
            app.flash(`${dz.name} ${dz.active ? 'repealed' : 'enacted'}`);
            app.renderPanel('state');
          }
        });
      }
      row.appendChild(btn);
      dlist.appendChild(row);
    }
    dec.appendChild(dlist);
    body.appendChild(dec);

    /* ---- interest groups ---- */
    const fac = el('section', 'card');
    fac.innerHTML = `<h3>The Interests</h3>
      <p class="hint">Their standing decides your approval. An interest that
         keeps losing organizes; one that wins becomes part of your
         government.</p>`;
    const fl = el('div', 'faction-list');
    for (const f of p.factions) {
      const row = el('div', 'faction');
      row.innerHTML = `
        <span class="fx-name"><i style="background:${f.color}"></i>${f.name}</span>
        <span class="fx-creed">${f.creed}</span>
        <span class="fx-bar"><i style="width:${Math.max(2, f.powerPct)}%;background:${f.color}"></i></span>
        <span class="fx-pow ${f.power >= 0 ? 'pos' : 'neg'}">${f.power >= 0 ? '+' : ''}${f.power.toFixed(2)}</span>`;
      fl.appendChild(row);
    }
    fac.appendChild(fl);
    body.appendChild(fac);

    /* ---- log ---- */
    const log = el('section', 'card');
    log.innerHTML = `<h3>Rulings</h3>`;
    const ol = el('ul', 'evlog');
    if (!p.log.length) ol.appendChild(el('li', 'hint', 'No rulings yet.'));
    for (const e of p.log) {
      ol.appendChild(el('li', `tone-${e.tone}`,
        `<span class="ev-t">t${e.tick.toLocaleString()}</span>
         <span><b>${e.head}</b> — ${e.body}</span>`));
    }
    log.appendChild(ol);
    body.appendChild(log);

    wrap.appendChild(body);
    return wrap;
  }

  /* -------- Business cycle (reimplementation; see js/macro.js) -------- */
  case 'cycle': {
    const wrap = el('div', 'panel');
    const m = sim.macro.describe();
    const st = sim.stats();

    wrap.appendChild(el('div', 'panel-head', `
      <h2>Business Cycle</h2>
      <p>The economy runs a lagged feedback loop with random shocks. Phases
         emerge from it — they are not scheduled, and no two runs play out
         the same way.</p>`));

    const body = el('div', 'panel-body');

    /* ---- current state ---- */
    const hero = el('section', 'card cycle-hero');
    hero.innerHTML = `
      <div class="cy-phase">
        <span class="cy-badge tone-${m.phaseTone}">${m.phaseLabel}</span>
        <span class="cy-badge tone-${m.regimeTone}">${m.regimeLabel}</span>
      </div>
      <p class="cy-note">${m.phaseNote}</p>`;

    const mgrid = el('div', 'meter-grid');
    const meter = (label, value, pctv, tone) => {
      const row = el('div', 'meter');
      row.innerHTML = `
        <span class="mt-label">${label}</span>
        <span class="mt-val tone-${tone}">${value}</span>
        <span class="mt-track"><i class="tone-bg-${tone}" style="width:${Math.max(0, Math.min(100, pctv))}%"></i></span>`;
      return row;
    };
    mgrid.append(
      meter('Confidence', m.confidence.toFixed(2), (m.confidence / 2.2) * 100,
        m.confidence > 1.2 ? 'good' : m.confidence < 0.7 ? 'bad' : 'warn'),
      meter('Output gap', sign(m.outputGap) + '%', 50 + m.outputGap * 2,
        m.outputGap > 4 ? 'good' : m.outputGap < -4 ? 'bad' : 'muted'),
      meter('Demand', m.demandMul.toFixed(2) + 'x', (m.demandMul / 2.2) * 100,
        m.demandMul > 1.05 ? 'good' : m.demandMul < 0.75 ? 'bad' : 'muted'),
      meter('Credit', m.creditMul.toFixed(2) + 'x', (m.creditMul / 3) * 100,
        m.creditMul > 1.1 ? 'good' : m.creditMul < 0.6 ? 'bad' : 'muted'),
      meter('Unemployment', m.unemployment.toFixed(0) + '%', m.unemployment,
        m.unemployment > 30 ? 'bad' : m.unemployment > 10 ? 'warn' : 'good'),
      meter('Price level', m.priceIndex.toFixed(2) + 'x',
        Math.min(100, Math.log(Math.max(0.01, m.priceIndex)) * 22),
        m.inflationTrend > 2 ? 'bad' : m.inflationTrend < -0.5 ? 'info' : 'muted'),
    );
    hero.appendChild(mgrid);
    body.appendChild(hero);

    /* ---- indicators ---- */
    body.appendChild(el('div', 'stat-strip', `
      <div class="ss"><i>Inflation</i><b class="${m.inflationTrend > 2 ? 'neg' : m.inflationTrend < -0.2 ? '' : ''}">${sign(m.inflationTrend)}%</b></div>
      <div class="ss"><i>Expected</i><b>${sign(m.expected)}%</b></div>
      <div class="ss"><i>Money growth</i><b>${sign(m.moneyGrowth)}%</b></div>
      <div class="ss"><i>Insolvencies</i><b class="${st.insolvency > 0 ? 'neg' : ''}">${st.insolvency.toLocaleString()}</b></div>`));

    /* ---- chart ---- */
    const chart = el('section', 'card');
    chart.innerHTML = `<h3>Recent history</h3>
      <p class="hint">Price level, confidence and the output gap, oldest at the left.</p>`;
    chart.appendChild(cycleChart(m.history));
    body.appendChild(chart);

    /* ---- active shocks ---- */
    const shocks = el('section', 'card');
    shocks.innerHTML = `<h3>Active events</h3>`;
    if (!m.shocks.length) {
      shocks.appendChild(el('p', 'hint', 'No exogenous shocks in progress.'));
    } else {
      const ul = el('ul', 'shock-list');
      for (const s of m.shocks) {
        ul.appendChild(el('li', `tone-${s.tone}`,
          `<b>${s.label}</b><span>~${s.left} periods left</span>`));
      }
      shocks.appendChild(ul);
    }
    body.appendChild(shocks);

    /* ---- policy ---- */
    const pol = el('section', 'card');
    pol.innerHTML = `<h3>Policy</h3>
      <p class="hint">These shift the cycle's amplitude and timing. They tilt
      the odds — shocks and investor sentiment keep the outcome uncertain, so
      no setting guarantees a good decade. Whatever happens, the economy can
      always recover.</p>`;
    const pgrid = el('div', 'field-grid two');
    pgrid.append(
      sliderField('Stance', sim.cfg.macroStance, -100, 100, 1, v => {
        sim.cfg.macroStance = v;
        return sim.cfg.macroStance === 0 ? 'Neutral'
          : sim.cfg.macroStance < 0 ? `Contractionary ${sim.cfg.macroStance}`
          : `Expansionary +${sim.cfg.macroStance}`;
      }, app),
      sliderField('Stabilizers', sim.cfg.macroStabilizer, 0, 100, 1, v => {
        sim.cfg.macroStabilizer = v;
        return `${v}% support`;
      }, app),
      sliderField('Shock volatility', sim.cfg.macroVolatility * 100, 0, 200, 1, v => {
        sim.cfg.macroVolatility = v / 100;
        return v === 0 ? 'Quiet — no shocks'
          : v < 60 ? `Calm ${v}%`
          : v < 140 ? `Normal ${v}%`
          : v < 190 ? `Rough ${v}%`
          : `Wild ${v}%`;
      }, app),
    );
    pol.appendChild(pgrid);
    body.appendChild(pol);

    /* ---- event log ---- */
    const log = el('section', 'card');
    log.innerHTML = `<h3>Timeline</h3>`;
    const ol = el('ul', 'evlog');
    if (!m.log.length) ol.appendChild(el('li', 'hint', 'Nothing has happened yet.'));
    for (const e of m.log) {
      ol.appendChild(el('li', `tone-${e.tone}`,
        `<span class="ev-t">t${e.tick.toLocaleString()}</span><span>${e.label}</span>`));
    }
    log.appendChild(ol);
    body.appendChild(log);

    wrap.appendChild(body);
    return wrap;
  }

  /* -------- Trader list (original: white list_single rows) -------- */
  case 'traders': {
    const wrap = el('div', 'panel panel-list');
    wrap.appendChild(el('div', 'panel-head', `
      <h2>Trader List</h2>
      <p>${sim.directory.getCount()} active traders · live</p>`));

    /* The header row is a desktop affordance and is hidden by CSS below
       620px, where each numeric cell carries its own label instead (the
       .tg-num::after rules). It is still emitted so the wide layout has
       column headings and so the two layouts cannot disagree about which
       field is which. */
    const grid = el('div', 'trader-grid');
    grid.innerHTML = `
      <div class="tg-head">
        <span>Trader</span><span>Type</span><span>Stock</span>
        <span>Sold</span><span>Price</span><span>Bank</span><span>Debt</span>
      </div>`;

    const rows = [...sim.directory.all]
      .filter(t => t.id !== 'MASTER')
      .sort((a, b) => a.comType - b.comType || a.id.localeCompare(b.id, undefined, { numeric: true }));

    for (const t of rows) {
      const r = el('div', 'tg-row');
      const comName = t.id === 'MASTER' ? 'Master' : COM_LABEL[t.comType];
      const flags = [
        t.freeze ? '<span class="flag bad">FROZE</span>' : '',
        t.isWaiting ? '<span class="flag warn">Traveling</span>' : '',
        !t.isStocked ? '<span class="flag">Out of stock</span>' : '',
      ].join('');
      /* `data-l` carries the field name for the phone layout's ::after label.
         Doing it this way rather than with four extra spans keeps the desktop
         markup clean and means the label can never drift from its value. */
      r.innerHTML = `
        <span class="tg-id"><i class="tg-ico c${t.comType}">${icon(COM_ICON[t.comType])}</i>
          <b>${escapeHtml(t.id)}</b></span>
        <span class="tg-type" style="color:${SERIES(t.comType)}">${comName}</span>
        <span class="tg-num" data-l="stk">${t.com.length}</span>
        <span class="tg-num" data-l="sld">${t.sale_count}</span>
        <span class="tg-num accent" data-l="prc">${money(t.getPrice())}</span>
        <span class="tg-num" data-l="bnk">${money(t.account.balance)}</span>
        <span class="tg-num ${t.account.debt > 0 ? 'neg' : ''}" data-l="dbt">${money(t.account.debt)}</span>
        <span class="tg-flags">${flags}</span>`;
      grid.appendChild(r);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  /* -------- Currency / taxation -------- */
  case 'currency': {
    const wrap = el('div', 'panel');
    wrap.appendChild(el('div', 'panel-head', `
      <h2>Currency Control</h2>
      <p>Set tax rates, create or destroy money, and distribute stimulus.</p>`));

    const st = sim.stats();
    const body = el('div', 'panel-body');

    body.appendChild(el('div', 'stat-strip', `
      <div class="ss"><i>Total currency</i><b>${money(st.currency)}</b></div>
      <div class="ss"><i>New money created</i><b class="pos">${money(st.created)}</b></div>
      <div class="ss"><i>Money destroyed</i><b class="neg">${money(st.destroyed)}</b></div>
      <div class="ss"><i>Transactions</i><b>${st.transactions.toLocaleString()}</b></div>`));

    // taxation
    const tax = el('section', 'card');
    tax.innerHTML = `<h3>Taxation</h3>
      <p class="hint">Total tax rate cannot exceed 100%.</p>`;
    const grid = el('div', 'field-grid');
    const rates = [
      ['universalTaxRate', 'Universal'], ['laborTaxRate', 'Labor'],
      ['foodTaxRate', 'Food'], ['toolTaxRate', 'Tools'],
      ['coalTaxRate', 'Coal'], ['ironTaxRate', 'Iron'],
      ['transportTaxRate', 'Shipping'],
    ];
    for (const [key, label] of rates) {
      const f = el('label', 'field');
      f.innerHTML = `<span>${label}</span>
        <input type="number" min="0" max="100" step="0.1" value="${sim.cfg[key]}" data-tax="${key}">
        <em>%</em>`;
      f.querySelector('input').addEventListener('change', e => {
        sim.cfg[key] = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
        validate();
      });
      grid.appendChild(f);
    }
    tax.appendChild(grid);

    const toggle = el('button', 'btn ' + (sim.cfg.collectTax ? 'btn-danger' : 'btn-primary'),
      sim.cfg.collectTax ? 'STOP TAXING' : 'START TAXING');
    toggle.addEventListener('click', () => {
      if (!sim.cfg.collectTax && !validate()) return;
      sim.cfg.collectTax = !sim.cfg.collectTax;
      toggle.textContent = sim.cfg.collectTax ? 'STOP TAXING' : 'START TAXING';
      toggle.className = 'btn ' + (sim.cfg.collectTax ? 'btn-danger' : 'btn-primary');
      app.flash(sim.cfg.collectTax ? 'Taxing started' : 'Taxing stopped');
    });
    tax.appendChild(toggle);
    const msg = el('p', 'form-msg');
    tax.appendChild(msg);
    body.appendChild(tax);

    function validate() {
      const u = sim.cfg.universalTaxRate;
      const worst = Math.max(sim.cfg.laborTaxRate, sim.cfg.foodTaxRate,
        sim.cfg.toolTaxRate, sim.cfg.coalTaxRate, sim.cfg.ironTaxRate,
        sim.cfg.transportTaxRate);
      const ok = u <= 100 && (u + worst) <= 100;
      msg.textContent = ok ? '' : 'Total tax rate cannot exceed 100%';
      msg.className = 'form-msg' + (ok ? '' : ' err');
      return ok;
    }

    // currency control
    const ctl = el('section', 'card');
    ctl.innerHTML = `<h3>Currency Control</h3>`;
    const row = el('div', 'inline-row');
    const amt = el('input', 'input');
    amt.type = 'number'; amt.min = '0'; amt.step = '0.01'; amt.placeholder = '0.00';
    const mk = (label, cls, fn) => {
      const b = el('button', 'btn ' + cls, label);
      b.addEventListener('click', () => {
        const v = Math.max(0, (parseFloat(amt.value) || 0) * 100);
        if (v <= 0) return app.flash('Enter a value above 0', true);
        fn(v);
        app.flash(`${label}: ${money(v)}`);
        app.renderPanel('currency');
      });
      return b;
    };
    row.append(amt,
      mk('Create', 'btn-primary', v => sim.master.account.create(v)),
      mk('Destroy', 'btn-danger', v => sim.master.account.destroy(v)));
    ctl.appendChild(row);
    body.appendChild(ctl);

    // stimulus
    const stim = el('section', 'card');
    stim.innerHTML = `<h3>Financial Stimulus</h3>`;
    const srow = el('div', 'inline-row');
    const samt = el('input', 'input');
    samt.type = 'number'; samt.min = '0'; samt.step = '0.01'; samt.placeholder = '0.00';
    const sel = el('select', 'select');
    for (let i = 0; i < 6; i++) {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = `Send stimulus to ${COM_LABEL[i]} industry`;
      sel.appendChild(o);
    }
    const sbtn = el('button', 'btn btn-primary', 'Distribute');
    sbtn.addEventListener('click', () => {
      const v = Math.max(0, (parseFloat(samt.value) || 0) * 100);
      if (v <= 0) return app.flash('Enter a value above 0', true);
      const type = parseInt(sel.value, 10);
      const targets = sim.directory.getListFromType(type);
      if (!targets.length) return app.flash('No traders in that industry', true);
      const each = Math.floor(v / targets.length);
      for (const t of targets) t.account.create(each);
      app.flash(`Distributed ${money(each * targets.length)} to ${COM_LABEL[type]}`);
      app.renderPanel('currency');
    });
    srow.append(samt, sel, sbtn);
    stim.appendChild(srow);
    body.appendChild(stim);

    wrap.appendChild(body);
    return wrap;
  }

  /* -------- Central bank -------- */
  case 'credit': {
    const credit = sim.credit;
    const c = credit.describe();
    const wrap = el('div', 'panel');
    wrap.appendChild(el('div', 'panel-head', `
      <h2>The Debt</h2>
      <p>What the crown owes, and what owing it has already cost. The country
         cannot default here: every instalment below is money the bank has to
         create, so this screen is really a receipt for inflation.</p>`));

    const body = el('div', 'panel-body');
    const supply = sim.bankSum();

    body.appendChild(el('div', 'stat-strip', `
      <div class="ss"><i>Sovereign debt</i><b class="neg">${money(c.totalDebt)}</b></div>
      <div class="ss"><i>Debt / supply</i><b class="${c.debtToSupply > 0.5 ? 'neg' : ''}">${(c.debtToSupply * 100).toFixed(1)}%</b></div>
      <div class="ss"><i>Minted for debt</i><b class="neg">${money(c.monetized)}</b></div>
      <div class="ss"><i>Yearly service</i><b class="${c.serviceRatio > 0.04 ? 'neg' : ''}">${(c.serviceRatio * 100).toFixed(2)}%</b></div>`));

    /* ---- the standing order for bailouts ---- */
    const lenderCard = el('section', 'card');
    lenderCard.innerHTML = `<h3>Your standing arrangement</h3>
      <p class="hint">Which lender the crown reaches for when it bails out a
        docket. Both will cover the claims. Neither will do it for free.</p>`;
    const lenderRow = el('div', 'lender-row');
    for (const id of ['imf', 'worldbank']) {
      const L = LENDERS[id];
      const b = el('button', 'lender' + (c.standingLender === id ? ' is-on' : ''));
      b.innerHTML = `
        <b>${L.short}</b>
        <span class="lr-rate">${(L.rate * 100).toFixed(1)}% · ${L.termYears}y</span>
        <span class="lr-creed">${L.creed}</span>
        <span class="lr-out tone-${c[id].outstanding > 0 ? 'bad' : 'muted'}">${
          c[id].outstanding > 0 ? money(c[id].outstanding) + ' outstanding' : 'nothing outstanding'}</span>`;
      b.addEventListener('click', () => {
        setStandingLender(id);
        app.flash(`${L.short} is now the standing arrangement`);
        app.renderPanel('credit');
      });
      lenderRow.appendChild(b);
    }
    lenderCard.appendChild(lenderRow);
    body.appendChild(lenderCard);

    /* ---- domestic bonds ---- */
    const bondCard = el('section', 'card');
    bondCard.innerHTML = `<h3>Domestic bonds</h3>
      <p class="hint">Borrowing from your own creditors. The money arrives now
        and is spent inside the country; the coupon is paid to lenders who then
        spend it again. Lenders charge a premium that rises with the debt load —
        currently <b>${(c.bondRate * 100).toFixed(2)}%</b>.</p>`;

    if (c.bonds > 0) {
      const list = el('div', 'bond-list');
      for (const b of credit.bonds) {
        const row = el('div', 'bond-row');
        const yrsLeft = Math.max(0, Math.ceil((b.maturesAt - credit._tick) / credit.ticksPerYear));
        row.innerHTML = `
          <div><b>${money(b.face)}</b><span>${(b.rate * 100).toFixed(2)}% · matures in ${yrsLeft}y</span></div>
          <span class="tone-muted">${money(Math.round(b.face * b.rate))}/yr</span>`;
        const red = el('button', 'btn btn-ghost', 'Redeem');
        red.addEventListener('click', () => {
          const r = credit.redeemBond(b.id);
          app.flash(r.ok ? `Redeemed ${money(r.amt)}` : 'Nothing to redeem');
          app.renderPanel('credit');
        });
        row.appendChild(red);
        list.appendChild(row);
      }
      bondCard.appendChild(list);
    } else {
      bondCard.appendChild(el('p', 'hint', 'No domestic debt outstanding.'));
    }

    const issueRow = el('div', 'issue-row');
    const amt = el('input', 'input');
    amt.type = 'number';
    amt.min = 0; amt.step = 1000;
    amt.placeholder = 'Face value';
    amt.value = c.bondCapacity;
    issueRow.appendChild(amt);
    const issue = el('button', 'btn btn-primary', 'Issue bonds');
    issue.disabled = !c.canIssue;
    issue.addEventListener('click', () => {
      const r = credit.issueBonds({ face: parseFloat(amt.value) || 0 });
      app.flash(r.ok
        ? `Issued ${money(r.face)} at ${(r.rate * 100).toFixed(2)}%`
        : r.reason);
      app.renderPanel('credit');
    });
    issueRow.appendChild(issue);
    bondCard.appendChild(issueRow);
    bondCard.appendChild(el('p', 'hint dim',
      `Lenders will take ${money(c.bondCapacity)} more before the ceiling is reached.`));
    body.appendChild(bondCard);

    /* ---- the bill ---- */
    const bill = el('section', 'card danger');
    bill.innerHTML = `<h3>What the bailouts have cost</h3>
      <p class="hint">Every number here is money that did not exist last year and
        exists now. None of it was taken from anyone; all of it is being paid
        for by the price of bread.</p>`;
    bill.appendChild(el('div', 'stat-strip', `
      <div class="ss"><i>Bailouts granted</i><b>${c.bailoutCount}</b></div>
      <div class="ss"><i>Total bailed</i><b>${money(c.bailedTotal)}</b></div>
      <div class="ss"><i>Coupons paid</i><b class="neg">${money(c.couponsPaid)}</b></div>
      <div class="ss"><i>Interest paid</i><b class="neg">${money(c.interestPaid)}</b></div>`));

    const table = el('table', 'dk-table');
    table.innerHTML = `
      <thead><tr><th>Lender</th><th class="num">Drawn</th><th class="num">Owed</th><th class="num">Repaid</th></tr></thead>
      <tbody>${['imf', 'worldbank'].map(id => `
        <tr><td><b>${LENDERS[id].short}</b></td>
          <td class="num">${money(c[id].drawn)}</td>
          <td class="num">${money(c[id].outstanding)}</td>
          <td class="num">${money(c[id].repaid)}</td></tr>`).join('')}</tbody>`;
    bill.appendChild(table);

    if (c.conditionality > 0.01) {
      bill.appendChild(el('p', 'hint tone-warn',
        `Outstanding programmes are suppressing the cycle by
         ${(c.conditionality * 100).toFixed(1)}%. The lenders' conditions bind
         whether or not you signed anything.`));
    }
    body.appendChild(bill);

    wrap.appendChild(body);
    return wrap;
  }

  case 'bank': {
    const wrap = el('div', 'panel');
    wrap.appendChild(el('div', 'panel-head', `
      <h2>Central Bank</h2>
      <p>All money originates from the bank. You can set the interest rate and reserve rate.</p>`));

    const body = el('div', 'panel-body');
    const st = sim.stats();

    body.appendChild(el('div', 'stat-strip', `
      <div class="ss"><i>Bank balance</i><b>${money(st.bankBalance)}</b></div>
      <div class="ss"><i>Bank reserve</i><b>${money(st.reserve)}</b></div>
      <div class="ss"><i>Debt holdings</i><b class="neg">${money(st.debt)}</b></div>
      <div class="ss"><i>Insolvency hits</i><b class="${st.insolvency > 0 ? 'neg' : ''}">${st.insolvency}</b></div>`));

    const card = el('section', 'card');
    card.innerHTML = `<h3>Policy</h3>
      <p class="hint">A reserve rate of 0% will virtually double the money supply.
      Every 11th tick the bank collects ${((sim.bank.minPayPercent) * 100).toFixed(0)}% of principal
      plus ${(sim.bank.interestRate * 100).toFixed(0)}% interest on all debt.</p>`;

    const grid = el('div', 'field-grid two');
    const mkField = (label, value, key, step) => {
      const f = el('label', 'field');
      f.innerHTML = `<span>${label}</span>
        <input type="number" min="0" max="100" step="${step}" value="${(value * 100).toFixed(1)}">
        <em>%</em>`;
      f.querySelector('input').addEventListener('change', e => {
        const v = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) / 100;
        sim.bank[key] = v;
        e.target.value = (v * 100).toFixed(1);
        app.flash(`${label} set to ${(v * 100).toFixed(1)}%`);
      });
      return f;
    };
    grid.append(
      mkField('Interest Rate', sim.bank.interestRate, 'interestRate', '0.1'),
      mkField('Reserve Rate', sim.bank.reserveRate, 'reserveRate', '0.1'),
      mkField('Minimum Payment', sim.bank.minPayPercent, 'minPayPercent', '0.1'),
    );
    card.appendChild(grid);
    body.appendChild(card);

    const info = el('section', 'card');
    info.innerHTML = `<h3>Bank Readout</h3>`;
    const pre = el('pre', 'readout');
    pre.textContent = [
      `Bank Balance        : ${money(st.bankBalance)}`,
      `Bank Reserve        : ${money(st.reserve)}`,
      `Debt Holdings       : ${money(st.debt)}`,
      `Minimum Payment     : ${(sim.bank.minPayPercent * 100).toFixed(1)}%`,
      `Interest Rate       : ${(sim.bank.interestRate * 100).toFixed(1)}%`,
      `Reserve Rate        : ${(sim.bank.reserveRate * 100).toFixed(1)}%`,
      `Insolvency Hits     : ${st.insolvency}`,
      st.insolvency > 0 ? '*BANK FAILURE*' : 'Solvent',
    ].join('\n');
    info.appendChild(pre);
    body.appendChild(info);

    wrap.appendChild(body);
    return wrap;
  }

  /* -------- Trade -------- */
  case 'trade': {
    const wrap = el('div', 'panel');
    wrap.appendChild(el('div', 'panel-head', `
      <h2>Trade</h2>
      <p>Place buy and sell orders against the market.</p>`));
    const body = el('div', 'panel-body two-col');

    const mkSide = (kind) => {
      const card = el('section', 'card');
      card.innerHTML = `<h3>${kind === 'buy' ? 'Select options to buy' : 'Select options to sell'}</h3>`;
      const f = el('div', 'field-stack');

      const comSel = el('select', 'select');
      for (let i = 0; i < 6; i++) {
        const o = document.createElement('option');
        o.value = i; o.textContent = COM_LABEL[i];
        comSel.appendChild(o);
      }

      const condSel = el('select', 'select');
      const buyConds = ['Now at market value', 'Price is below [set price]', 'Price is above [set price]'];
      const sellConds = [
        'Now at market value', 'Now at [set price]',
        'Now at [set price] above market value', 'Now at [set price] below market value',
        'Price is below [set price]', 'Price is above [set price]',
      ];
      (kind === 'buy' ? buyConds : sellConds).forEach((c, i) => {
        const o = document.createElement('option');
        o.value = i; o.textContent = c;
        condSel.appendChild(o);
      });

      const price = el('input', 'input');
      price.type = 'number'; price.step = '0.01'; price.value = '0.01';
      price.placeholder = 'Set Price';

      const qty = el('input', 'input');
      qty.type = 'number'; qty.min = '1'; qty.step = '1'; qty.value = '1';
      qty.placeholder = 'Quantity';

      f.appendChild(field('Commodity', comSel));
      f.appendChild(field('Condition', condSel));
      f.appendChild(field('Set Price', price));
      f.appendChild(field('Quantity', qty));
      card.appendChild(f);

      const btn = el('button', 'btn ' + (kind === 'buy' ? 'btn-primary' : 'btn-accent'),
        kind === 'buy' ? 'ORDER' : 'SELL');
      btn.addEventListener('click', () => {
        const type = parseInt(comSel.value, 10);
        const p = Math.max(0.01, parseFloat(price.value) || 0.01);
        const q = Math.max(1, parseInt(qty.value, 10) || 1);
        const ok = kind === 'buy' ? app.marketBuy(type, p, q) : app.marketSell(type, p, q);
        app.flash(ok
          ? `${kind === 'buy' ? 'Ordered' : 'Listed'} ${q} × ${COM_LABEL[type]} @ $${p.toFixed(2)}`
          : 'Insuffecient funds / no seller', !ok);
      });
      card.appendChild(btn);

      const log = el('div', 'order-log');
      log.dataset.log = kind;
      card.appendChild(log);
      return card;
    };

    const field = (label, node) => {
      const l = el('label', 'field col');
      l.innerHTML = `<span>${label}</span>`;
      l.appendChild(node);
      return l;
    };

    body.append(mkSide('buy'), mkSide('sell'));
    wrap.appendChild(body);
    return wrap;
  }

  /* -------- Control -------- */
  case 'control': {
    const wrap = el('div', 'panel');
    wrap.appendChild(el('div', 'panel-head', `
      <h2>Control</h2>
      <p>Load a preset economy or change simulation modes.</p>`));
    const body = el('div', 'panel-body');

    const cards = el('div', 'preset-grid');
    for (const [id, p] of Object.entries(PRESETS)) {
      const c = el('button', 'preset-card' + (app._preset === id ? ' is-on' : ''));
      c.innerHTML = `<b>${p.name}</b><span>${p.blurb}</span>`;
      c.addEventListener('click', () => app.loadPreset(id));
      cards.appendChild(c);
    }
    body.appendChild(cards);

    const modes = el('section', 'card');
    modes.innerHTML = `<h3>Pricing Model</h3>`;
    const mrow = el('div', 'inline-row');
    const priceBtn = el('button', 'btn ' + (sim.cfg.supplyAndDemandEnabled ? 'btn-accent' : 'btn-primary'),
      sim.cfg.supplyAndDemandEnabled ? 'Supply & Demand' : 'Standard');
    priceBtn.addEventListener('click', () => {
      sim.cfg.supplyAndDemandEnabled = !sim.cfg.supplyAndDemandEnabled;
      priceBtn.textContent = sim.cfg.supplyAndDemandEnabled ? 'Supply & Demand' : 'Standard';
      priceBtn.className = 'btn ' + (sim.cfg.supplyAndDemandEnabled ? 'btn-accent' : 'btn-primary');
      app.flash(`Pricing model: ${priceBtn.textContent}`);
    });
    const fullBtn = el('button', 'btn btn-ghost', sim.cfg.FULL_SCREEN ? 'Full Screen: On' : 'Full Screen: Off');
    fullBtn.addEventListener('click', () => {
      sim.cfg.FULL_SCREEN = !sim.cfg.FULL_SCREEN;
      fullBtn.textContent = sim.cfg.FULL_SCREEN ? 'Full Screen: On' : 'Full Screen: Off';
      document.body.classList.toggle('is-fullscreen', sim.cfg.FULL_SCREEN);
    });
    const warpBtn = el('button', 'btn btn-ghost', sim.cfg.warp ? 'Warp: On' : 'Warp: Off');
    warpBtn.addEventListener('click', () => {
      sim.cfg.warp = !sim.cfg.warp;
      warpBtn.textContent = sim.cfg.warp ? 'Warp: On' : 'Warp: Off';
      app.flash(sim.cfg.warp ? 'Warp enabled' : 'Warp disabled');
    });
    mrow.append(priceBtn, fullBtn, warpBtn);
    modes.appendChild(mrow);
    body.appendChild(modes);

    /* -------- autosave ---------
     * The save is not a hidden feature: the player needs to know it exists,
     * when it last ran, and how to throw it away on purpose. All three controls
     * live here rather than in a menu nobody opens. */
    const info = app._lastSave;
    const peeked = Save.peek();
    const save = el('section', 'card');
    const savedAt = peeked && peeked.savedAt
      ? new Date(peeked.savedAt).toLocaleString()
      : null;
    save.innerHTML = `<h3>Autosave</h3>
      <p class="hint">The country is saved every ${Math.round(Save.AUTOSAVE_INTERVAL / 1000)} seconds
        while running, and whenever the app goes into the background. Closing it
        does not lose the session.</p>`;
    const srow = el('div', 'inline-row');
    const saveBtn = el('button', 'btn btn-primary', 'SAVE NOW');
    saveBtn.addEventListener('click', () => app.saveNow());
    srow.appendChild(saveBtn);
    if (peeked) {
      const resumeBtn = el('button', 'btn', 'RESUME SAVED');
      resumeBtn.addEventListener('click', () => app.resumeFromSave());
      srow.appendChild(resumeBtn);
    }
    save.appendChild(srow);
    save.appendChild(el('p', 'hint', peeked
      ? `Last save: tick ${Number(peeked.tick).toLocaleString()} · ${savedAt}` +
        ` · ${(peeked.traders || 0).toLocaleString()} firms` +
        (info ? ` · last write at tick ${Number(info.tick).toLocaleString()}` : '')
      : 'No save yet. Start the clock and one is written shortly.'));
    body.appendChild(save);

    const danger = el('section', 'card danger');
    danger.innerHTML = `<h3>Danger Zone</h3>
      <p class="hint">Clears all state and restarts the simulation from scratch.
        This also discards the autosave.</p>`;
    const rb = el('button', 'btn btn-danger', 'RESET SIMULATOR');
    rb.addEventListener('click', () => app.reset());
    danger.appendChild(rb);
    if (peeked) {
      const forget = el('button', 'btn btn-danger', 'DISCARD SAVE ONLY');
      forget.addEventListener('click', () => { app.forgetSave(); app.renderPanel('control'); });
      danger.appendChild(forget);
    }
    body.appendChild(danger);

    wrap.appendChild(body);
    return wrap;
  }

  /* -------- Information -------- */
  case 'info': {
    const wrap = el('div', 'panel');
    wrap.appendChild(el('div', 'panel-head', `
      <h2>Information</h2>`));
    const body = el('div', 'panel-body');
    const card = el('section', 'card prose');
    card.innerHTML = infoHtml();
    body.appendChild(card);
    wrap.appendChild(body);
    return wrap;
  }
  }
  return el('div', 'panel');
}

/* ---------------- ruling modal ----------------
 * The one thing that stops the simulation. Rendered into its own overlay so
 * it reads as an interruption of the world rather than another panel. */

export function renderDocket(host, app) {
  const sim = app.sim;
  const sov = sim.sovereign;
  const d = sov && sov.pending;
  if (!d) { host.hidden = true; host.innerHTML = ''; return false; }

  /* Read the docket through describe(), which resolves industry labels and
   * notes. Reading `pending` raw printed "Primarily undefined" for every
   * claim: the raw docket carries only numeric comTypes, and only the
   * presenter knows how to name them. */
  const view = sov.describe().pending;

  const credit = sim.credit ? sim.credit.describe() : null;
  const lenderId = credit ? credit.standingLender : getStandingLender();
  const lender = LENDERS[lenderId] || LENDERS.imf;

  /* What the bailout will actually cost, priced before the player commits.
   * This is the number that has to be on screen: the third option has no
   * political downside at all, so its price is only legible if it is stated
   * in advance.
   *
   * The surcharge is what makes the button honest. The advance covers the
   * docket plus a spread for the emergency, so it is ALWAYS larger than the
   * total printed above it — the player can see that saving these firms now
   * costs more than the debt being saved, which is precisely what they are
   * agreeing to. */
  const spread = (sim.cfg.BAILOUT_SPREAD || 0) * 100;
  const drawn = view.total * (1 + (sim.cfg.BAILOUT_SPREAD || 0));
  /* Headroom is per-lender, so it is checked against the lender this button
   * will actually draw on — not the sum of both, which would report the button
   * as available when the standing lender is already exhausted and the ruling
   * would silently fall back to forgiveness. */
  const cap = credit ? credit[lenderId].capacity : Infinity;
  const bailTone = drawn > cap ? 'bad' : 'warn';

  /* Every ruling resumes the clock.
   *
   * App._loop sets `running = false` when it opens a docket, because the world
   * genuinely holds still until the sovereign rules. But nothing ever set it
   * back to true: closing the sheet left the game paused, and since the play
   * button had also been re-rendered to "Play" there was nothing on screen
   * saying why the country had stopped. Reported as "after a decision it doesn't
   * run the ticks anymore".
   *
   * `resume()` resumes only if it was running before the docket opened, so a
   * player who had deliberately paused does not get started by ruling on a case.
   * The flag is captured in _loop at the moment it stops. */
  const done = (msg) => {
    host.hidden = true; host.innerHTML = '';
    app.flash(msg);
    app.renderPanel(app.ui.active);
    app.resumeAfterModal();
  };

  const approve = () => {
    const n = view.count;
    sim.sovereign.rule(true);
    done(`${n} claim${n === 1 ? '' : 's'} forgiven`);
  };
  const deny = () => {
    const n = view.count;
    sim.sovereign.rule(false);
    done(`${n} default${n === 1 ? '' : 's'} enforced`);
  };
  /* The bailout button commits no lender id: settleDocket falls back to the
   * module-level standing arrangement, which is the single source of truth
   * for which lender the crown uses. Passing a stale copy from describe()
   * would let the button and the panel disagree about the same decision. */
  const bailout = () => {
    const n = view.count;
    const ok = sim.sovereign.ruleBailout();
    done(ok && sim.credit.bailoutCount > 0
      ? `${n} firm${n === 1 ? '' : 's'} bailed out — ${money(drawn)} of sovereign debt`
      : `${lender.short} declined. The claim was absorbed instead.`);
  };

  const claims = view.largest.map(c => `
    <tr>
      <td><b>${escapeHtml(c.saved.name)}</b><span>${c.industryLabel}</span></td>
      <td class="num">${money(c.amount)}</td>
      <td class="num">${(c.coverage * 100).toFixed(0)}%</td>
      <td class="verb">${c.saved.verb}</td>
    </tr>`).join('');

  host.hidden = false;
  host.innerHTML = `
    <div class="docket-scrim">
      <div class="docket" role="dialog" aria-modal="true" aria-label="Debt ruling">
        <header class="dk-head">
          <span class="dk-tag">Case file · tick ${view.tick.toLocaleString()}</span>
          <h2>${view.count} claim${view.count === 1 ? '' : 's'} for write-off</h2>
          <p class="dk-sum">
            <b>${money(view.total)}</b> owed against a currency supply of
            ${money(view.banks)}${view.shareOfSupply > 0.0001
              ? ` — ${(view.shareOfSupply * 100).toFixed(2)}% of everything in circulation`
              : ''}.
            Primarily <b>${view.industryLabel}</b>.
          </p>
          ${view.note ? `<p class="dk-note">${view.note}</p>` : ''}
        </header>

        <div class="dk-claims">
          <button class="dk-claims-toggle" type="button" aria-expanded="false">
            <span class="dk-sum-claim">Largest ${view.largest.length} claim${view.largest.length === 1 ? '' : 's'}</span>
            <span class="dk-rest">of ${view.count} · tap to name them</span>
          </button>
          <!-- Always emitted folded. CSS overrides this from 620px up, where
               there is room to show it without scrolling — so the default
               state is decided by available space rather than by a count
               that varies with how busy the docket happened to be. -->
          <div class="dk-table-wrap" hidden>
            <table class="dk-table">
              <thead><tr><th>Firm</th><th class="num">Owed</th><th class="num">Could pay</th><th>Claim</th></tr></thead>
              <tbody>${claims}</tbody>
            </table>
          </div>
        </div>

        <div class="dk-choice">
          <button class="dk-btn dk-forgive" data-ruling="forgive">
            <span class="dk-b">FORGIVE</span>
            <span class="dk-t">Absorb the loss. The money stays in circulation
            and the firms keep trading.</span>
            <span class="dk-c tone-good">pleases unions, commons · offends banks, the houses, the army</span>
          </button>
          <button class="dk-btn dk-enforce" data-ruling="enforce">
            <span class="dk-b">ENFORCE</span>
            <span class="dk-t">Call the debt in. The commons are liquidated; firms
            are stripped of cash but survive; the houses barely notice.</span>
            <span class="dk-c tone-bad">pleases banks, houses, army · kills only the poor</span>
          </button>
          <button class="dk-btn dk-bailout" data-ruling="bailout"
            ${drawn > cap ? 'disabled' : ''}>
            <span class="dk-b">BAIL OUT <em>${lender.short}</em></span>
            <span class="dk-t">${drawn > cap
              ? `${lender.name} will not extend this much — its programme is already exhausted.`
              : `${lender.name} covers it in full. Nobody is forgiven, nobody dies, the
                 creditors are paid — and the ${money(view.total)} becomes sovereign debt
                 at ${(lender.rate * 100).toFixed(1)}%${spread ? ` plus ${spread.toFixed(0)}% for the emergency` : ''}.`}</span>
            <span class="dk-c tone-${bailTone}">${drawn > cap
              ? `no headroom · ${lender.short} is owed ${money(credit ? credit[lenderId].outstanding : 0)}`
              : `pleases everyone · pays for itself in inflation, at ${money(drawn)}`}</span>
          </button>
        </div>

        <p class="dk-surety">
          <b>The country cannot default.</b> Every future instalment on this loan is
          currency the bank must create, so the bill arrives as a price level nobody
          agreed to — spread across everyone, none of whom are in this room.
        </p>

        <footer class="dk-foot">
          <span>Approval <b>${sov.approval.toFixed(0)}%</b> · <span class="tone-${TIER_TONE[sov.tier] || 'muted'}">${TIER_NAME[sov.tier] || sov.tier}</span></span>
          <span class="dk-keys">Esc forgive · <kbd>B</kbd> bail out · <kbd>↵</kbd> enforce</span>
        </footer>
      </div>
    </div>`;

  host.querySelector('[data-ruling="forgive"]').addEventListener('click', approve);
  host.querySelector('[data-ruling="enforce"]').addEventListener('click', deny);
  host.querySelector('[data-ruling="bailout"]').addEventListener('click', bailout);

  /* Disclosure for the claimant table. A button rather than <details> so the
   * collapsed state is an explicit attribute the CSS can override at wider
   * breakpoints — <details>'s open state is a property of the element and
   * cannot be forced open from a media query, which would have meant either
   * hiding the table on desktop or leaving it folded on a tablet. */
  const toggle = host.querySelector('.dk-claims-toggle');
  const body = host.querySelector('.dk-table-wrap');
  toggle.addEventListener('click', () => {
    const open = body.hasAttribute('hidden');
    if (open) body.removeAttribute('hidden'); else body.setAttribute('hidden', '');
    toggle.setAttribute('aria-expanded', String(open));
    host.querySelector('.dk-claims').classList.toggle('is-open', open);
  });
  return true;
}



const TIER_TONE = {
  consensus: 'good', contested: 'warn', strained: 'warn',
  authoritarian: 'bad', tyranny: 'bad',
};
const TIER_NAME = {
  consensus: 'Consensus', contested: 'Contested',
  strained: 'Strained', authoritarian: 'Authoritarian', tyranny: 'Tyranny',
};

function SERIES(i) {
  return [PALETTE.labor, PALETTE.food, PALETTE.tool,
          PALETTE.coal, PALETTE.iron, PALETTE.transport][i];
}

/* Signed percent, e.g. -2.4% / +0.0% */
function sign(v) {
  const r = Math.round(v * 10) / 10;
  return (r > 0 ? '+' : '') + r.toFixed(1);
}

/* A labelled range field: 0-100 tax rates don't want a raw slider, but the
   macro knobs span -100..+100 so a slider is the only honest control. */
function sliderField(label, value, min, max, step, read, app) {
  const f = el('label', 'field slider-field');
  const readout = el('span', 'sf-read', read(value));
  f.innerHTML = `<span>${label}</span>`;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = min; input.max = max; input.step = step;
  input.value = value;
  input.addEventListener('input', e => {
    readout.textContent = read(parseFloat(e.target.value));
  });
  input.addEventListener('change', () => app.flash(`${label}: ${readout.textContent}`));
  f.appendChild(input);
  f.appendChild(readout);
  return f;
}

/* Inline SVG chart of the macro history. Hand-authored rather than canvas so
   it scales with the panel and stays legible on a dark surface. */
function cycleChart(history) {
  const W = 640, H = 190, padL = 8, padR = 8, padT = 12, padB = 20;
  const n = Math.max(0, history.length);
  if (n < 2) {
    const d = el('p', 'hint', 'Gathering data…');
    return d;
  }
  const iw = W - padL - padR, ih = H - padT - padB;

  // price level is log-ish (it spans 1x..10x), everything else is signed
  const prices = history.map(h => h.price);
  const pmin = Math.min(...prices), pmax = Math.max(...prices);
  const gaps = history.map(h => h.gap);
  const gabs = Math.max(0.05, ...gaps.map(Math.abs));
  const confs = history.map(h => h.conf);

  const X = i => padL + (iw * i) / (n - 1);
  const Yp = v => padT + ih - ((v - pmin) / Math.max(1e-9, pmax - pmin)) * ih;
  const Yg = v => padT + ih / 2 - (v / gabs) * (ih / 2) * 0.92;
  const Yc = v => padT + ih - ((v - 0.08) / (2.2 - 0.08)) * ih;

  const path = (arr, Y) => arr.map((v, i) =>
    `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const area = (arr, Y) => path(arr, Y) +
    ` L${X(n - 1).toFixed(1)} ${(padT + ih).toFixed(1)} L${padL} ${(padT + ih).toFixed(1)} Z`;

  const confSeries = confs.map((_, i) => confs[i]);
  const showGap = gaps.some(v => Math.abs(v) > 0.01);

  return el('div', 'cy-chart-wrap', `
    <svg class="cy-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
         role="img" aria-label="Price level, confidence and output gap over time">
      <defs>
        <linearGradient id="cyg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#4f6bff" stop-opacity=".34"/>
          <stop offset="100%" stop-color="#4f6bff" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <line x1="${padL}" y1="${(padT + ih / 2).toFixed(1)}"
            x2="${W - padR}" y2="${(padT + ih / 2).toFixed(1)}"
            stroke="#26303f" stroke-width="1" stroke-dasharray="3 4"/>
      <path d="${area(prices, Yp)}" fill="url(#cyg)"/>
      <path d="${path(prices, Yp)}" fill="none" stroke="#4f6bff"
            stroke-width="2" stroke-linejoin="round"/>
      <path d="${path(confSeries, Yc)}" fill="none" stroke="#22e06a"
            stroke-width="1.5" stroke-linejoin="round" opacity=".85"/>
      ${showGap ? `<path d="${path(gaps, Yg)}" fill="none" stroke="#ffd43b"
            stroke-width="1.4" stroke-linejoin="round" opacity=".8"/>` : ''}
      <text x="${padL}" y="${H - 6}" fill="#6b7686" font-size="10"
            font-family="ui-monospace, monospace">${Math.max(1, (n * 5)).toLocaleString()} ticks ago</text>
      <text x="${W - padR}" y="${H - 6}" text-anchor="end" fill="#6b7686" font-size="10"
            font-family="ui-monospace, monospace">now</text>
    </svg>
    <div class="cy-legend">
      <span><i style="background:#4f6bff"></i>Price level ${pmin.toFixed(1)}–${pmax.toFixed(1)}x</span>
      <span><i style="background:#22e06a"></i>Confidence</span>
      ${showGap ? '<span><i style="background:#ffd43b"></i>Output gap</span>' : ''}
    </div>`);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Original R.string.info, with the design rules retained. */
function infoHtml() {
  return `
  <p><b>Proto is a micro-economy simulator</b> that allows you to experiment with inflation,
  deflation, trading, taxation, and interest rates. The economy is a stable chain reaction of
  transactions with elements that interact with a set of rules. Actions cascade through the
  reaction delivering interesting results.</p>

  <p>A central banking system is an integral part of the economy. All money originates from the
  bank. You can set interest rate and reserve rate. All accounts are part of the reserve,
  including the bank's own account.</p>

  <h4>The three elements</h4>
  <p>The economy consists of three elements: <b>commodities</b>, <b>currency</b>, and
  <b>traders</b>. Each element can be attributed with one or more of three properties:
  consumable, transferable, and operator. Commodities are consumable and transferable.
  Currency is transferable. Traders are operators.</p>

  <h4>Priming the system</h4>
  <p>In order for the system to operate it must be primed. Labor traders also start out with
  100 units of labor that can be traded for currency. A preset number of traders are created
  for each industry. Twenty-one labor traders are included in a fresh economy in order to
  quickly establish food production. Fewer initial labor traders would cause the economy to
  take longer to develop, and too few would cause a total collapse and a complete die-off of
  labor. The prime mover of this micro-economy is the need for the labor traders to buy and
  consume food.</p>

  <h4>Production chain</h4>
  <p>Commodities are produced by traders consuming other commodities. For a commodity to exist,
  one or more of other commodities must be consumed. Most commodities are produced from the
  consumption of labor; the exception being labor. The tool commodity can be consumed by the
  food traders to increase production of food by 2000%. All commodities with the exception of
  labor and transportation need to be transported by the transportation trader, which is
  represented by the warehouse icon.</p>
  <ul class="chain">
    <li><b>Labor</b> is produced by consuming food.</li>
    <li><b>Food</b> is produced by consuming labor, and more efficiently by also consuming tools.</li>
    <li><b>Tools</b> are produced by consuming labor, coal, and iron.</li>
    <li><b>Coal</b> and <b>iron</b> are produced by consuming labor.</li>
    <li><b>Transportation</b> is produced by consuming labor.</li>
  </ul>

  <h4>Currency</h4>
  <p>Currency is the life-blood of the system. Currency is constantly flowing throughout the
  economy in somewhat unpredictable ways. A floating equilibrium is established by each
  trader's competition to maintain a healthy bank balance. Traders act independently from each
  other; they will only purchase from a trader selling at the lowest price. Traders have a
  basic sense of the bank balances of other traders and will adjust their greed as a result of
  that sense. You have the ability to create, destroy, and distribute currency.</p>

  <h4>The sovereign</h4>
  <p>The master trader is sovereign and is the recipient of all tax revenue. Traders don't have
  a sense of the master trader's bank balance. The master trader has the ability to buy and sell
  all commodities except labor and transportation. This sovereign trader represents you and its
  location on the map is represented by a crown.</p>

  <h4>Two pricing modes</h4>
  <p>The system has two modes: standard and supply and demand. The standard mode pricing model
  places more emphasis on the price of labor. This mode is very stable. Supply and Demand mode
  is more volatile and interesting.</p>

  <h4>The sovereign's dilemma</h4>
  <p>Every eleventh tick the bank collects its debts. A trader who cannot pay
  can no longer be quietly forgiven — each such case is placed before you, naming
  the industry, the firm, what it owes, and how much of it could ever have paid.
  You rule either <b>forgive</b>, absorbing the loss so the money stays in
  circulation and the firm keeps trading, or <b>enforce</b>, calling the debt in
  and liquidating it. The two are counted separately, because they are opposite
  answers to one question.</p>
  <p>Cases arrive roughly twice per cycle, too often to judge individually, so
  a standing order can resolve them for you; the ones you take yourself pause
  the world until you rule.</p>
  <p>Each ruling is noticed, and the two answers have opposite constituencies.
  Creditor banks, the industrialists and the reformers want promises kept. So do
  the great houses — a handful of very wealthy firms that enforcement cannot
  touch, because they were seeded with deep reserves and always can pay. A ruling
  that spares the wealthy and buries the small is a ruling the wealthy have spent
  centuries buying. The unions and the commons would rather the hungry were
  forgiven than the indebted punished, and they are the ones who pay for
  enforcement in lost workplaces.</p>

  <h4>The three orders</h4>
  <p>Society is stratified, and enforcement falls almost entirely on the bottom of it.
  The <b>commons</b> are the labouring: they own nothing, and a claim called in
  against them is a death sentence. The <b>middle class</b> are the producers —
  the firms that actually make the food, the coal and the tools. They survive
  enforcement on their plant and stock even after their cash is taken. The
  <b>great houses</b> are barely touched by any ruling at all.</p>
  <p>And the commons are numerous, for they breed faster than any court can sit.
  An enforced docket may remove a dozen of them, and by the time the next docket
  opens the ranks are full again. This is why enforcement is so cheap for a ruler
  to choose and so expensive for the people it removes: the ledger balances
  itself, and the cost is invisible to everyone with a vote. There is no
  population ceiling either — the commons grow until they fill the available
  land or run out of bread, which is the only limit that was ever honest.</p>
  <p>The middle class is the only route to the top. A firm that accumulates capital
  in a healthy economy can found a house of its own, and the ruling elite grows
  from below rather than staying fixed. The movement is sticky in both directions —
  a house stripped of its fortune in a bad economy can lose its charter and fall
  back to being a middling firm — but it is never impossible, and a society with no
  route upward is not a society with a middle class at all.</p>

  <p>Enforcement is not only a punishment. Calling a debt in destroys currency —
  an extinguished claim never returns to circulation — so an enforcing state runs
  tight money, prices stay firm, and lenders trust a state that collects. It also
  wins the army, which is the heaviest interest there is and the only one that can
  hold the street. While the army is with you there is no coup. Let it turn and the
  palace is stormed: the treasury is skimmed, decrees are forced through without
  your consent, and the houses take their cut. You keep the office, because the
  army has nowhere better to put a puppet — which is not the same as being safe.</p>

  <p>So approval is not a score to please the poor. The commons matter, but the
  army matters more, and the great houses are heavy enough to swing a country on
  their own. Govern generously and you may keep the people's affection while
  losing the country. Govern hard, and you will be governed alongside those who
  already own it.</p>
  <p>You are never deposed. A government that mismanages the state will find
  itself ruling a poorer, angrier one — conscripts produce less and hate it, price
  controls bite only partly, an economy stripped of firms cannot be taxed, and the
  army collects what it likes — but the office holds. Tyranny is a condition, not
  a defeat.</p>

  <h4>The business cycle</h4>
  <p>The original economy settled into a fixed equilibrium: money was created on every
  unaffordable purchase and then forgiven when the buyer could not repay, and a hard cap
  kept every price pinned no matter how much currency circulated. This reimplementation adds
  the macroeconomy the original only advertised in its description.</p>
  <p>It is not a scripted schedule. Optimism makes agents spend more, spending makes prices
  rise, and prices are remembered with a delay — so the pain arrives late, confidence
  collapses, spending falls, and the cycle turns again. Random shocks (harvest failures, bank
  runs, speculative manias, technology booms) perturb it throughout, and the central bank,
  taxation, interest and reserve rates all shift its amplitude and timing. No setting makes
  the outcome certain, and no two runs play out the same way.</p>
  <p>Crises are real: credit can dry up, traders can go insolvent, and whole industries can
  fail. But the economy always recovers. Credit never dries up completely, relief is
  automatic and grows stronger the deeper the crisis goes, and a sovereign backstop
  intervenes if trading stops altogether — restarting even a collapsed industry with new
  producers. However dark a period gets, a better future stays possible.</p>`;
}
