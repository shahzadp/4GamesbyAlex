/* ------------------------------------------------------------------
 * Proto Web — application shell
 * Wires sidebar navigation, the tick loop, and panel routing.
 * ------------------------------------------------------------------ */

import { Simulator } from './simulator.js';
import { Renderer } from './render.js';
import { UI, buildPanel, renderDocket, SCREENS } from './ui.js';
import * as Save from './save.js';
import { TICK_RATE, PRESETS } from './config.js';
import { money, clamp } from './util.js';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
import { ComType } from './economy.js';
import { CAUSAL } from './map.js';

class App {
  constructor() {
    this.running = false;
    this.speedOn = false;
    this._acc = 0;
    this._last = performance.now();
    this._hudAcc = 0;
    this._panelAcc = 0;
    this._lastWarpRender = 0;

    this.sim = new Simulator();
    this.ui = new UI(document.getElementById('app'), this);
    this.renderer = new Renderer(this.ui.canvas);

    this._toastHost = document.getElementById('toasts');
    this.docketHost = document.getElementById('docket');
    this._lastScrollAt = 0;
    /* Track scroll activity on the panel host, passively, so the auto-refresh
     * paths can tell "the user is reading" from "the user is not looking".
     * Passive because a scroll listener that calls preventDefault would steal
     * the gesture; this one only records a timestamp. */
    this.ui.panelHost.addEventListener('scroll', () => {
      this._lastScrollAt = performance.now();
    }, { passive: true });
    this._wireKeys();
    this.ui.go('map');
    this._loop = this._loop.bind(this);
    this._schedule();

    /* Restore before autosave is armed, so the first write can never overwrite
     * a good save with the fresh world that lost the race. */
    this._restore();
    this._autosave = Save.attachAutosave(this, (st) => this._onSaveStatus(st));
    this._startWatchdog();
  }

  /* Single place that arms the next frame.
   *
   * The loop used to call requestAnimationFrame(this._loop) itself from three
   * branches, which meant the chain was only as reliable as all three agreeing.
   * Every reschedule now goes through here, so there is exactly one way the loop
   * continues and one place to watch it. */
  _schedule() {
    if (this._raf != null) return;          // already armed; never double-chain
    this._raf = requestAnimationFrame((t) => {
      this._raf = null;
      this._loop(t);
    });
  }

  /* Watchdog: if the rAF chain stops, restart it.
   *
   * rAF does stop being delivered — Android does not composite a WebView whose
   * screen is off or which is backgrounded — and when it resumes the app is
   * expected to pick up where it left off. It did not: measured on a handset,
   * the chain died and never recovered, so the clock showed "running" and did
   * nothing indefinitely, and every autosave rewrote the same tick.
   *
   * This checks cheaply that the loop has actually run recently. If it has not,
   * the chain is re-armed. Uses setInterval rather than rAF on purpose: a
   * watchdog that shares the broken mechanism cannot notice the breakage.
   *
   * It only re-arms, it never fabricates ticks, so a backgrounded app cannot
   * fast-forward itself on return — the dt clamp in _loop discards the gap. */
  _startWatchdog() {
    this._watchdog = setInterval(() => {
      if (!this.running) return;
      const quiet = performance.now() - this._last;
      if (quiet > 2000) {
        /* The chain is dead but the player believes it is running. Re-arm and
         * reset the clock so the accumulated gap is not paid back as a burst. */
        this._last = performance.now();
        this._acc = 0;
        this._schedule();
        this.flash('Clock recovered', true);
      }
    }, 1000);
  }

  /* Restore the previous session, if there is one.
   *
   * Deliberately NOT automatic-and-silent-fatal: a save that cannot be read
   * (format bumped, quota hit, hand-edited) starts a new game and says so,
   * rather than leaving the player staring at a half-restored economy with no
   * indication that anything went wrong. */
  _restore() {
    if (!Save.hasSave()) return false;
    const info = Save.peek();
    let restored = null, err = null;
    try {
      const r = Save.load();
      if (r && r.error) err = r.error;
      else if (r) restored = r;
    } catch (e) {
      err = String(e && e.message || e);
    }

    if (!restored) {
      this.flash(`Save could not be read (${err || 'unknown'}) — starting fresh`);
      Save.clear();
      return false;
    }

    /* Adopt the restored world. Everything holding a sim reference has to be
     * repointed: the renderer drew the old map, and the UI's canvases belong to
     * a shell that is about to be told about different data. */
    this.sim = restored;
    this.renderer.sim = restored;
    this.renderer.graphHistory = [];
    /* Re-stamp the clock on a restore. `_last` was set when the App was
     * constructed, which may be many minutes before this line, and `_acc` may
     * carry a surplus or a deficit from the session being replaced. Both are
     * reset here rather than being left for the first real frame to trip over. */
    this._last = performance.now();
    this._acc = 0;
    /* Return to the screen the app launches on, rather than jumping somewhere
     * arbitrary.
     *
     * This was `ui.go('info', {force:true})` and it is why Map and Graph came
     * up blank after a restore: `info` is a PANEL screen, so go() sets
     * panelHost.hidden = false and canvas.hidden = true. The canvases stayed
     * hidden until the player tapped a tab, so the app looked like it had lost
     * its map — reported as "it starts from the right tick but map and stat do
     * not appear".
     *
     * Landing on 'map' matches the constructor's initial ui.go('map') and gives
     * the player the same first screen whether they resumed or started fresh.
     * The force flag matters: the canvas is about to be drawn from a different
     * simulation, so the stale frame must be overwritten immediately rather
     * than whenever the clock next happens to tick — and the clock may well be
     * paused, in which case it never would. */
    this.ui.app = this;
    this.ui.go('map', { force: true });

    /* The canvas may be sized for a layout that is no longer current — a WebView
     * rotated while backgrounded, a window resized — and at the wrong size the
     * map scales into nothing. Re-measure before painting, or the first frame
     * after a resume is blank even though the simulation is healthy and the
     * clock is paused so nothing else will repaint it. */
    this.refreshCanvas();

    this.flash(`Resumed at tick ${this.sim.tickCount.toLocaleString()}` +
               (info && info.savedAt
                 ? ` · saved ${new Date(info.savedAt).toLocaleTimeString()}`
                 : ''));
    /* Drop any stale resume intent. A save written while a docket was open would
     * otherwise arrive with "resume after the ruling" still set, and the next
     * modal in a fresh session would start a clock the player never pressed. */
    this._resumeAfterModal = false;
    return true;
  }

  _onSaveStatus(st) {
    if (!st) return;
    if (st.ok === false) {
      /* Quota is the realistic failure and it must not be silent — otherwise the
       * player believes they have a save and do not. */
      this.flash(`Autosave failed: ${st.error}`, true);
      return;
    }
    this._lastSave = { tick: st.tick, bytes: st.bytes, at: Date.now(), why: st.why };
  }

  /* ---------------- transport ---------------- */
  togglePlay() {
    this.running = !this.running;
    this.ui.setRunning(this.running);
    /* Pressing Play must also restart the rAF chain. A modal or a stalled
     * frame can have left it un-armed, and the button would then show "running"
     * while nothing advanced — the failure the watchdog exists to catch, but
     * this is where it should never be needed. */
    if (this.running) {
      this._last = performance.now();
      this._acc = 0;
      this._schedule();
    }
    this.flash(this.running ? 'Simulation running' : 'Simulation paused');
  }

  toggleSpeed() {
    this.speedOn = !this.speedOn;
    this.ui.setSpeed(this.speedOn);
    this.flash(this.speedOn ? 'Speed on!' : 'Speed off');
  }

  /* Both of these throw away the current world, so both must also throw away the
   * save. Leaving it behind is worse than not having one: the next launch would
   * restore the game the player just discarded, which reads as the app ignoring
   * them. */
  reset() {
    const preset = this._preset || 'classic';
    this.sim.reset();
    this.renderer.graphHistory.length = 0;
    this.running = false;
    this.ui.setRunning(false);
    Save.clear();
    this._lastSave = null;
    this.flash('Simulator reset');
    this.renderPanel(this.ui.active);
    void preset;
  }

  loadPreset(id) {
    this._preset = id;
    const p = PRESETS[id];
    if (!p) return;
    this.sim = new Simulator({ cfg: { ...p.cfg } });
    this.sim._presetName = id;
    /* New world, new clock baseline. See the note in _restore. */
    this._last = performance.now();
    this._acc = 0;
    this.renderer.graphHistory.length = 0;
    this.running = false;
    this.ui.setRunning(false);
    Save.clear();
    this._lastSave = null;
    this.flash(`${p.name} loaded`);
    this.renderPanel(this.ui.active);
  }

  /* Resume after a modal that paused the clock.
   *
   * Both the docket and the election sheet stop the world: the sim genuinely
   * holds still until the sovereign rules. But nothing ever restarted it — the
   * handlers closed the sheet and left `running` false, and because the button
   * had also been re-rendered to "Play" there was nothing on screen explaining
   * why the country had gone quiet. Reported as "after a decision it doesn't run
   * the ticks anymore", which reads as a broken game rather than a paused one.
   *
   * Only resumes if it was running when the modal opened. A player who paused
   * deliberately, then had a case sealed, should stay paused. */
  resumeAfterModal() {
    if (!this._resumeAfterModal) return false;
    this._resumeAfterModal = false;
    if (this.running) return false;
    this.running = true;
    this.ui.setRunning(true);
    /* Discard the accumulated time so the world does not immediately fast-forward
     * by however long the ruling took — reading a case is not simulation. */
    this._acc = 0;
    /* The modal stopped the rAF chain on its way in, so start it again. Without
     * this the button showed "running" while nothing ticked, which is the
     * original "it never resumes" report arriving in a new disguise. */
    this._last = performance.now();
    this._schedule();
    return true;
  }

  /* Re-measure the canvas and repaint it.
   *
   * Needed after a restore: the canvas bitmap can be sized for a layout that is
   * no longer current (a rotated WebView, a resized window), and at the wrong
   * size the map scales into nothing. Since the clock may be paused after a
   * resume, nothing else would repaint it. */
  refreshCanvas() {
    this.renderer._resize();
    /* Deferred to the next frame, not drawn inline. The canvas was un-hidden
     * microseconds ago and has not been laid out, so measuring it here still
     * returns 0x0 and the map scale comes out negative. By the next frame the
     * browser has done layout and the measurement is real. `force` bypasses the
     * visibility guard for the same reason: this is precisely the one frame
     * where the guard would otherwise skip the paint. */
    requestAnimationFrame(() => {
      this.renderer._resize();
      this.renderer.render(this.sim, true);
    });
  }

  /* ---------------- explicit save controls ---------------- */

  saveNow() {
    const st = this._autosave ? this._autosave.now() : Save.save(this.sim);
    if (st.ok) this.flash(`Saved at tick ${this.sim.tickCount.toLocaleString()}`);
    else this.flash(`Save failed: ${st.error}`, true);
    return st;
  }

  resumeFromSave() {
    const info = Save.peek();
    if (!info) { this.flash('No save to resume from'); return false; }
    return this._restore();
  }

  forgetSave() {
    Save.clear();
    this._lastSave = null;
    this.flash('Save discarded — the next launch starts a new country');
  }

  /* ---------------- trading shortcuts for the Trade panel ---------------- */
  marketBuy(type, price, qty) {
    const sim = this.sim;
    const sellers = sim.directory.getListFromType(type)
      .filter(t => !t.isDead && t.com.length > 0 && t.getPrice() <= price);
    sellers.sort((a, b) => a.getPrice() - b.getPrice());
    if (!sellers.length) return false;

    const me = sim.master;   // player acts through the sovereign
    let got = 0;
    for (const s of sellers) {
      if (got >= qty) break;
      if (s.sellTo(me, me.account, qty - got)) got += s.quantity || 0;
    }
    return got > 0;
  }

  marketSell(type, price, qty) {
    const sim = this.sim;
    if (sim.master.accepts && !sim.master.accepts(type)) {
      this.flash('The sovereign cannot trade labor or shipping', true);
      return false;
    }
    const buyers = sim.directory.getListFromType(type)
      .filter(t => !t.isDead && t !== sim.master && t.account.balance > 0);
    if (!buyers.length) return false;

    // list the stock: give master units then let buyers pull at set price
    let remaining = qty;
    const master = sim.master;
    if (!master._holdings) master._holdings = {};
    if (!master._holdings[type]) master._holdings[type] = 0;
    master._holdings[type] += remaining;

    let sold = 0;
    for (const b of buyers) {
      if (remaining <= 0) break;
      if (b.buy(type, remaining)) { const c = remaining; remaining = 0; sold += c; }
    }
    master._holdings[type] = Math.max(0, master._holdings[type] - sold);
    return sold > 0;
  }

  /* Is a touch scroll still settling?
   *
   * `scroll` fires continuously during a fling and for a few frames after the
   * finger lifts, so the honest test is not "did the user just touch" but "has
   * the panel moved very recently". 220ms is long enough to cover the tail of
   * momentum scrolling on Android without feeling laggy in the data. */
  _scrollingRecently(window = 220) {
    return performance.now() - this._lastScrollAt < window;
  }

  _tradersSafeToRefresh() {
    const host = this.ui.panelHost;
    // scrolled into the list at all — at the top, live numbers are useful
    if (host.scrollTop < 24) return true;
    return !this._scrollingRecently() && !host.querySelector(':focus');
  }

  /* ---------------- panels ----------------
   *
   * `keepScroll` defaults to true because every automatic refresh goes through
   * here, and the previous unconditional `host.scrollTop = 0` meant the page
   * threw you back to the top roughly once a second while you were reading it.
   *
   * On a phone that was unusable rather than merely annoying: the Traders screen
   * re-rendered every 120ms (see the HUD block in _loop), so scrolling down and
   * trying to read a row was a fight — the list jumped to the top faster than a
   * thumb could settle. Reported as "it pushes me up after I scroll down".
   *
   * The subtlety is that a panel can also change HEIGHT between refreshes (a
   * trader goes bankrupt, a docket line appears). Restoring a raw pixel offset
   * then lands you somewhere arbitrary, so the scroll anchor is a fraction of
   * the scrollable range instead: stable while the content is the same size,
   * and proportional when it is not. Measured before this change: the Traders
   * list, 4000 ticks in, jumped to 0 on every one of ~33 refreshes per second.
   */
  renderPanel(id, keepScroll = true) {
    if (!SCREENS.find(s => s.id === id && s.panel)) return;
    const host = this.ui.panelHost;

    let ratio = 0, wasScrolled = false;
    if (keepScroll) {
      const range = host.scrollHeight - host.clientHeight;
      if (range > 1 && host.scrollTop > 1) {
        ratio = host.scrollTop / range;
        wasScrolled = true;
      }
    }

    host.innerHTML = '';
    const node = buildPanel(id, this);
    if (node) host.appendChild(node);

    if (wasScrolled) {
      const range = host.scrollHeight - host.clientHeight;
      // Restored after layout so the new height is known. Without the rAF the
      // offset is applied against the OLD height and silently clamps to 0,
      // which is the original bug wearing a different hat.
      requestAnimationFrame(() => {
        const r = host.scrollHeight - host.clientHeight;
        host.scrollTop = r > 1 ? ratio * r : 0;
      });
    } else {
      host.scrollTop = 0;
    }
  }

  flash(msg, isErr = false) {
    if (!this._toastHost) return;
    const t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' err' : '');
    t.textContent = msg;
    this._toastHost.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => {
      t.classList.remove('in');
      setTimeout(() => t.remove(), 260);
    }, 2200);
  }

  /* Force the next modal dismissal to resume, for callers outside the tick loop.
   *
   * The keyboard handler and the manual "seal a case" path both open the docket
   * without going through _loop, so they never recorded whether the clock was
   * running. Rather than have each guess, they declare it here. */
  armResume(wasRunning) {
    this._resumeAfterModal = !!wasRunning;
  }

  /* Dismiss the docket after a ruling, from either the buttons or the keyboard.
   *
   * Re-renders the docket rather than just hiding it, so if a second case was
   * sealed in the same bank cycle it is shown instead of silently dropped. */
  _closeDocket() {
    if (this.sim.sovereign.pending) {
      renderDocket(this.docketHost, this);
    } else {
      this.docketHost.hidden = true;
      this.docketHost.innerHTML = '';
      this.renderPanel(this.ui.active);
    }
    this.resumeAfterModal();
  }

  _wireKeys() {
    window.addEventListener('keydown', e => {
      // the ruling is modal: nothing else responds while a case is open
      if (this.sim.sovereign && this.sim.sovereign.pending) {
        /* The clock was running a moment ago — the sim only stops for a pending
         * case — so a ruling from here resumes it. `_loop` arms this itself;
         * this covers a case opened outside the loop. */
        this.armResume(true);
        /* B is deliberately NOT bound to any other action while a case is
         * open, so the third option is always one keystroke away. It is the
         * option a careful player reaches for and the one a careless one
         * should have to think about, so it does not get a quiet shortcut.
         *
         * All three go through the same close+resume helper as the on-screen
         * buttons. Ruling by keyboard left the clock paused exactly as ruling by
         * tap did — the same bug, one code path further from where the buttons
         * live, which is why it survived the first fix. */
        if (e.key === 'Escape' || e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          this.sim.sovereign.rule(true);
          this._closeDocket();
        } else if (e.key === 'b' || e.key === 'B') {
          e.preventDefault();
          this.sim.sovereign.ruleBailout();
          this._closeDocket();
        } else if (e.key === 'Enter' || e.key === 'e' || e.key === 'E') {
          e.preventDefault();
          this.sim.sovereign.rule(false);
          this._closeDocket();
        }
        return;
      }
      /* An election is a modal report, and Escape dismisses it. The world is
       * not stopped for it (see Sovereign.holdsTime) — the shell pauses the
       * clock while the popup is up, which is why this lives here and not in
       * the simulation. */
      if (this.sim.sovereign && this.sim.sovereign.election) {
        this.armResume(true);
        if (e.key === 'Escape') {
          e.preventDefault();
          this.answerElection(false);
        }
        return;
      }
      if (e.target.matches('input, select, textarea')) return;
      if (e.code === 'Space') { e.preventDefault(); this.togglePlay(); }
      else if (e.key === 's' || e.key === 'S') this.toggleSpeed();
      else if (e.key >= '1' && e.key <= '9') {
        const s = SCREENS[parseInt(e.key, 10) - 1];
        if (s) this.ui.go(s.id);
      }
    });
  }

  /* ---------------- elections ----------------
   *
   * A popup, and the player can always keep the chair. The office is
   * unconditional in this game, so the most the country can do is say no out
   * loud with numbers attached — and the button to overrule it is right there,
   * costing exactly what overruling it should cost.
   */
  renderElection() {
    const e = this.sim.sovereign.election;
    if (!e) return;
    const host = this.docketHost;
    const L = e.passed
      ? 'You are returned to office with a majority of the vote.'
      : 'The chamber has withdrawn its confidence in your government.';

    const rows = e.seats.map(s => `
      <div class="el-seat">
        <span class="el-bar" style="width:${(s.vote * 100).toFixed(1)}%;background:${s.color}"></span>
        <span class="el-name">${escapeHtml(s.short)}</span>
        <span class="el-num">${s.seats}</span>
      </div>`).join('');

    const costs = e.passed ? [] : [
      ['Legitimacy', 'the chamber is dissolved and the mandate is gone'],
      ['The street', 'unrest rises; the army is the only thing keeping the doors shut'],
      ['The next docket', 'claims arrive sooner and harder, with no cushion behind you'],
    ];

    host.hidden = false;
    host.innerHTML = `
      <div class="docket-scrim">
        <div class="docket election" role="dialog" aria-modal="true" aria-label="Election result">
          <header class="dk-head">
            <span class="dk-tag">General election · year ${e.year} · term ${e.term}<span class="dk-paused">· paused</span></span>
            <h2 class="${e.passed ? 'tone-good' : 'tone-bad'}">${e.verdict}</h2>
            <p class="dk-sum">${L}</p>
          </header>

          <div class="el-score">
            <div class="el-big">
              <span class="el-big-l">Vote</span>
              <b class="${e.passed ? 'tone-good' : 'tone-bad'}">${e.effective.toFixed(0)}%</b>
            </div>
            <div class="el-adjust">
              <div><span>Approval</span><b>${e.approval.toFixed(0)}%</b></div>
              ${e.pricePenalty > 0.05 ? `<div class="tone-bad"><span>Cost of living</span><b>−${e.pricePenalty.toFixed(0)}</b></div>` : ''}
              ${e.creditPenalty > 0.05 ? `<div class="tone-bad"><span>Credit discipline</span><b>−${e.creditPenalty.toFixed(0)}</b></div>` : ''}
              <div><span>Majority needed</span><b>${e.threshold}%</b></div>
            </div>
          </div>

          <div class="el-roster">
            <button class="el-roster-toggle" type="button" aria-expanded="false">
              <b>The chamber</b><span>${e.bloc} of 200 with the establishment</span>
            </button>
            <div class="el-roster-body" hidden>
              <h3 class="el-h">Seats by interest</h3>
              <div class="el-seats">${rows}</div>
              <p class="el-bloc">${e.bloc} of 200 seats held by the army, the houses,
                the banks, industry and the reformers.</p>
            </div>
          </div>

          ${costs.length ? `
            <div class="el-cost">
              <h3 class="el-h tone-bad">If you rule on anyway</h3>
              <ul>${costs.map(([k, v]) => `<li><b>${k}</b> — ${v}</li>`).join('')}</ul>
              <p class="el-cost-note">You will not be removed. That much is
                promised. Everything above is what the country will do instead.</p>
            </div>` : `
            <p class="el-mandate">Bread at ${(this.sim.cfg?.MIN_FOOD_SELL ?? 5)} a week,
              inflation at ${(e.inflation * 100).toFixed(1)}%,
              sovereign debt ${money(e.debt)} of which
              ${money(e.bailed)} was bailed out. The electorate has seen all of it
              and sent you back anyway.</p>`}

          <div class="dk-choice el-choice">
            ${!e.passed ? `<button class="dk-btn el-stepdown" data-el="stepdown">
              <span class="dk-b">STEP DOWN</span>
              <span class="dk-t">Leave office with the country's consent intact.
                The state survives; you do not govern it.</span>
            </button>` : ''}
            <button class="dk-btn ${e.passed ? 'dk-forgive' : 'dk-bailout'}" data-el="rule">
              <span class="dk-b">${e.passed ? 'SERVE THE TERM' : 'KEEP RULING ANYWAY'}</span>
              <span class="dk-t">${e.passed
                ? 'Accept the mandate and govern for the full term.'
                : 'Overrule the vote and keep the chair. The country will not forget it.'}</span>
            </button>
          </div>

          <footer class="dk-foot">
            <span>${this.sim.credit ? `Year ${this.sim.credit.year} · next in ${this.sim.sovereign.nextElectionYear - this.sim.credit.year}` : ''}</span>
            <span class="dk-paused">The country is paused until you answer</span>
          </footer>
        </div>
      </div>`;

    /* An election is answered by CONFIRMING, not by touching.
     *
     * Measured on the handset: the sheet went up at tick 3650, held the clock
     * dead for as long as it was on screen (verified — tick pinned at 3650
     * across 20s of polling, `running=false`), and then a single tap resolved
     * the whole thing with `defiant:true` and `responded:true`. Nothing had
     * clicked it but a thumb: the only two exits on the sheet were STEP DOWN and
     * KEEP RULING ANYWAY, and the third dismissal — "Esc: accept the result" —
     * is a key that does not exist on a phone. So on a handset the sheet could
     * not be dismissed without also taking a political decision, and the way a
     * player dismisses a panel is to tap it. That read as "the popup appears and
     * then disappears quickly".
     *
     * So the first tap on a choice arms it and the second commits. A stray tap
     * is now free; a deliberate one costs one extra press, and the armed button
     * says so in as many words before anything is recorded. */
    this._elArmed = null;
    const arm = (btn, defiant) => {
      if (this._elArmed && this._elArmed !== btn) this._disarmElection();
      if (this._elArmed === btn) {
        this._disarmElection();
        this.answerElection(defiant);
        return;
      }
      this._elArmed = btn;
      btn.classList.add('is-armed');
      btn.setAttribute('aria-pressed', 'true');
      const lab = btn.querySelector('.dk-b');
      btn.dataset.label = lab.textContent;
      lab.textContent = 'TAP AGAIN TO CONFIRM';
    };

    host.querySelector('[data-el="rule"]')
      .addEventListener('click', (ev) => arm(ev.currentTarget, !e.passed));
    const step = host.querySelector('[data-el="stepdown"]');
    if (step) step.addEventListener('click', (ev) => arm(ev.currentTarget, false));

    /* Tapping the sheet anywhere that is not a choice cancels the armed one.
     * Without this the first tap is a trap: the button reads CONFIRM, the
     * player cannot work out how to back out of it, and the only way onward is
     * the thing they were trying to avoid. Cancelling on any other tap makes
     * the first press obviously harmless instead of merely harmless. */
    host.querySelector('.docket.election').addEventListener('click', (ev) => {
      if (!ev.target.closest('.dk-btn')) this._disarmElection();
    });

    /* Same disclosure pattern as the docket's claimant table: folded on a
       phone, always shown from 620px up where there is height to spare. */
    const rt = host.querySelector('.el-roster-toggle');
    const rb = host.querySelector('.el-roster-body');
    rt.addEventListener('click', () => {
      const open = rb.hasAttribute('hidden');
      if (open) rb.removeAttribute('hidden'); else rb.setAttribute('hidden', '');
      rt.setAttribute('aria-expanded', String(open));
      host.querySelector('.el-roster').classList.toggle('is-open', open);
    });
  }

  /* Undo an armed election choice without answering it.
   *
   * Called when a different choice is armed, when the sheet is torn down, and
   * before every re-render. `dataset.label` is the button's own text, captured
   * when it was armed, so the label is restored rather than reconstructed —
   * a re-render between the two taps must not leave "TAP AGAIN TO CONFIRM" on
   * a button that is no longer armed. */
  _disarmElection() {
    const btn = this._elArmed;
    this._elArmed = null;
    if (!btn) return;
    btn.classList.remove('is-armed');
    btn.removeAttribute('aria-pressed');
    const lab = btn.querySelector('.dk-b');
    if (lab && btn.dataset.label) lab.textContent = btn.dataset.label;
  }

  answerElection(defiant) {
    this._disarmElection();
    this.sim.sovereign.answerElection(defiant);
    this.docketHost.hidden = true;
    this.docketHost.innerHTML = '';
    this._electionShown = false;
    const e = this.sim.sovereign.lastElection;
    if (e) {
      this.flash(defiant
        ? 'You rule on regardless. The country has been told.'
        : (e.passed ? `Returned with ${e.effective.toFixed(0)}% of the vote` : 'The result stands'));
    }
    this.renderPanel(this.ui.active);
    /* An election pauses the clock the same way a docket does, so it owes the
     * same resume. Without this the country stayed stopped for the rest of the
     * term after the player accepted or overrode the result. */
    this.resumeAfterModal();
  }

  /* ---------------- loop ---------------- */
  _loop(now) {
    /* Stamp the time ourselves rather than trusting the argument.
     *
     * rAF is supposed to hand back a DOMHighResTimeStamp, and it usually does,
     * but the chain below is self-rescheduling and a single frame with a bogus or
     * wildly stale stamp poisons `_last` permanently: every later frame then
     * computes a huge or negative dt. Measured on a handset (itel S685LN,
     * Android 15): the app's `_last` was **121 seconds** behind
     * performance.now() while rAF was firing 64 times a second and `running`
     * was true — the world looked paused, ticked nothing, and saved the same
     * tick forever. That is the whole of "it only saves half of what I closed
     * at": the clock had not merely drifted, it had stopped, and every autosave
     * after that wrote an unchanging state.
     *
     * performance.now() is the same timebase rAF uses and cannot be spoofed by a
     * caller, so the accumulator is fed from a source we control. The parameter
     * is kept only as a fallback for a synthetic call (tests drive this directly). */
    const stamp = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : (typeof now === 'number' ? now : 0);
    now = stamp;

    /* Both of these were unguarded, and either one freezes the clock FOREVER.
     *
     * `_last` is stamped once, in the constructor. Minutes later the first real
     * frame computes an enormous dt. That alone is survivable — the old
     * `Math.min(250, …)` capped it — but `_acc` is only ever decremented inside
     * the stepping loop, which is gated on `this.running`. A pause therefore
     * accumulates dt with nothing to spend it against, and the surplus is
     * carried into the next run as a burst of catch-up ticks.
     *
     * The fatal case is a NEGATIVE dt, which `Math.min` does not filter: any
     * frame that arrives with a timestamp older than `_last` (a restored
     * session, a device waking from sleep, an out-of-order callback) drives
     * `_acc` negative, and since a step only fires when `_acc >= 125`, a
     * sufficiently large negative value means the condition can never be met
     * again. The clock is dead, Play does nothing, and nothing on screen says
     * why. This is what the player saw on a real handset: ticks frozen at 7,
     * unkillable short of reinstalling.
     *
     * So: never let dt go negative, and clamp the accumulator to a small
     * multiple of one step so no amount of accumulated time can queue a burst.
     * Losing a little accumulated time is free; a dead clock is not. */
    let dt = now - this._last;
    if (!(dt >= 0) || !Number.isFinite(dt)) dt = 0;   // NaN, or a frame from the past
    dt = Math.min(dt, 250);                            // a sleep must not fast-forward
    this._last = now;
    if (this._acc < 0 || this._acc > 1000) this._acc = 0;

    /* `this.running` is the ONLY pause authority in the shell.
     *
     * This used to read `if (this.running && !this.sim.paused)`, and
     * Simulator's constructor set `paused = true` with nothing ever clearing it
     * — so the gate was permanently shut. Play was pressed, the button showed
     * Pause, the toast said "Simulation running", and tickCount never left 0.
     *
     * The simulator has its own stop condition, Sovereign.holdsTime(), which
     * halts the world when a ruling is owed, and that is checked below and
     * honoured properly. A second pause flag in the sim that nothing owned was
     * one more thing that could disagree with the button. */
    if (this.running) {
      const rate = this.speedOn ? TICK_RATE.fast : TICK_RATE.normal;
      this._acc += dt;
      const step = 1000 / rate;
      let guard = 0;
      while (this._acc >= step && guard++ < 8) {
        this.sim.next();
        this._acc -= step;
      }
      // a ruling is owed: stop stepping and show the case
      if (this.sim.sovereign && this.sim.sovereign.pending) {
        this._acc = 0;
        /* Remember that we were running. The ruling handlers cannot know, and
         * resuming unconditionally would start a game the player had paused. */
        this._resumeAfterModal = this.running;
        this.running = false;
        this.ui.setRunning(false);
        renderDocket(this.docketHost, this);
        /* The chain stops here on purpose — a docket owns the clock — so the
         * watchdog must not "recover" a game that is waiting for a ruling. It
         * only re-arms while running, which this has just made false. */
        this._last = performance.now();
        return;
      }
    }

    /* An election stops the clock here rather than in the simulation, for the
     * reason documented on Sovereign.holdsTime(): the sim must be free to run
     * unattended or a standing order deadlocks it. The shell is the only
     * layer that knows a human is watching.
     *
     * Checked outside the `running` guard, so an election is noticed even when
     * the sim is paused or was advanced in bulk by a test. Inside it, the
     * popup silently waited for the player to press play — and an election
     * nobody saw is indistinguishable from one that never happened. */
    if (this.sim.sovereign && this.sim.sovereign.election
        && !this._electionShown) {
      this._acc = 0;
      this._resumeAfterModal = this.running;
      this.running = false;
      this.ui.setRunning(false);
      /* The latch is set AFTER the render, not before.
       *
       * Measured: renderElection() referenced a bare `sim` (it needed
       * `this.sim`) inside the branch that only renders when the ruler WON —
       * so it threw `sim is not defined`. Because the latch was already true,
       * the condition above could never be true again, and the sheet was never
       * retried. The result on the handset was the worst possible failure: the
       * clock stopped dead, an election was pending in the simulation, and
       * nothing at all was on screen. From the player's side that is identical
       * to the bug this whole change set out to fix — an election that appears
       * never to happen — with the added problem that no error was reachable.
       *
       * Setting the latch last means a render that throws is retried, and its
       * error reaches the console instead of being swallowed into a latch. */
      this.renderElection();
      this._electionShown = true;
      /* Same as the docket: the election owns the clock until it is answered, so
       * leave the watchdog something recent to measure against. */
      this._last = performance.now();
    } else if (!this.sim.sovereign || !this.sim.sovereign.election) {
      this._electionShown = false;
    }

    /* HUD refresh ~8/s
     *
     * The Traders list used to re-render here, every 120ms, which was the
     * single worst offender for scroll stability — see renderPanel. It is now
     * gated on three conditions, all of which have to hold:
     *
     *   - the user is actually scrolled into the list, so a reader at the top
     *     sees live numbers and someone deep in the list is left alone;
     *   - the table is not being scrolled by touch right now. Touch scroll
     *     continues to emit scroll events for a few frames after the finger
     *     lifts, and rebuilding the DOM underneath a live fling is what makes a
     *     list feel like it is fighting you;
     *   - the panel is not holding focus, so an open <select> cannot have its
     *     options replaced under the user's thumb.
     *
     * renderPanel preserves the scroll anchor, so refreshing while scrolled is
     * now safe rather than something to avoid. */
    this._hudAcc += dt;
    if (this._hudAcc > 120) {
      this._hudAcc = 0;
      this.ui.updateHud(this.sim.stats());
      if (this.ui.active === 'traders' && this._tradersSafeToRefresh()) {
        this.renderPanel('traders');
      }
    }

    // panel auto-refresh (static panels only re-render on interaction)
    this._panelAcc += dt;
    if (this._panelAcc > 1500) {
      this._panelAcc = 0;
      if (['cycle', 'state', 'currency', 'bank'].includes(this.ui.active) &&
          !this.ui.panelHost.querySelector(':focus') &&
          !this._scrollingRecently()) {
        this.renderPanel(this.ui.active);
      }
    }

    // warp throttles rendering to 500ms, as in the original MainView
    const warp = this.sim.cfg.warp;
    if (warp && now - this._lastWarpRender < 500) {
      this._schedule();
      return;
    }
    if (warp) this._lastWarpRender = now;

    if (!this.canvasHidden()) {
      this.renderer.render(this.sim);
      this._wireBubbleMap();
    }

    this._schedule();
  }

  /* ---------------- bubble map interaction ----------------
   *
   * Hovering an industry dims everything else and spells out its causal links;
   * clicking pins it. Cheap hit-testing against the renderer's own geometry,
   * so there is no second layout to keep in sync.
   *
   * Touch has no hover, so a tap has to do two jobs at once: it pins the node
   * (which the mouse got from hover) and it opens the readout (which the mouse
   * got from the tooltip). A tap on empty space dismisses. Both listeners are
   * attached on the same events a mouse would use, and `pointerType` decides
   * whether the readout is a floating tooltip or a pinned card — which is what
   * makes the pin state necessary on touch rather than merely convenient. */
  _wireBubbleMap() {
    if (this.ui.active !== 'map') return;
    const cv = this.ui.canvas;
    if (!cv._wired) {
      cv._wired = true;

      cv.addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse') return;
        const r = cv.getBoundingClientRect();
        const id = this.renderer.nodeAt(e.clientX - r.left, e.clientY - r.top);
        this.renderer._hoverNode = id;
        cv.style.cursor = id != null ? 'pointer' : 'default';
        if (id !== this._lastHover) {
          this._lastHover = id;
          if (id != null) this._bubbleTip(id, e.clientX - r.left, e.clientY - r.top);
          else this._hideTip();
        }
      });

      cv.addEventListener('pointerleave', () => {
        this.renderer._hoverNode = null;
        this._lastHover = null;
        this._hideTip();
      });

      cv.addEventListener('pointerdown', e => {
        const r = cv.getBoundingClientRect();
        const id = this.renderer.nodeAt(e.clientX - r.left, e.clientY - r.top);
        this.renderer._focusNode = this.renderer._focusNode === id ? null : id;
        if (e.pointerType === 'mouse') return;
        /* touch: the readout becomes a real pinned card, because a floating
           tooltip under a lifted finger is unusable */
        if (id != null) this._pinCard(id);
        else this._hidePin();
      });
    }
  }

  _bubbleName(id) {
    const n = this.sim.map.nodes[id];
    return n ? n.label : 'industry';
  }

  /* The touch equivalent of the hover tooltip: a small anchored card that
   * stays until the node is tapped again. It reports the same facts, so a
   * player on a phone gets the same information density as one on a desktop. */
  _pinCard(id) {
    const node = this.sim.map.nodes[id];
    if (!node) return;
    let commons = 0, middle = 0, elite = 0, debt = 0;
    for (const t of node.members) {
      if (t.isDead) continue;
      if (t.socialClass === 'elite') elite++;
      else if (t.socialClass === 'middle') middle++;
      else commons++;
      debt += t.account.debt;
    }
    const causes = [];
    for (const [from, to, , note] of CAUSAL) {
      if (from === id) causes.push(`→ ${this.sim.map.nodes[to].label}: ${note}`);
      else if (to === id) causes.push(`← ${this.sim.map.nodes[from].label}: ${note}`);
    }

    /* Measure against the CANVAS, not the app.
     *
     * `this.w`/`this.h` were never defined on App — they live on the
     * renderer — so every clamp below compared against undefined. The result
     * was `Math.min(undefined - w - 8, left)`, i.e. NaN, and a card pinned at
     * x=0 that ran off the right edge of every screen: measured 7 of 7 nodes
     * placing their readout partly off-screen. Measuring the canvas is also
     * more correct than measuring the window, since the bubbles live inside
     * the canvas and the card is positioned in canvas coordinates. */
    const box = this.ui.canvas.getBoundingClientRect();
    const vw = box.width, vh = box.height;

    const card = document.getElementById('pin') || (() => {
      const d = document.createElement('div');
      d.id = 'pin';
      d.className = 'pin-card';
      document.body.appendChild(d);
      return d;
    })();
    const hit = (this.renderer._hit || []).find(h => h.id === id)
      || { x: vw / 2, y: 90, r: 40 };
    const r = hit.r;
    card.innerHTML = `
      <button class="pin-x" aria-label="Close">×</button>
      <b>${node.label}</b>
      <span class="pin-row">${node.count} firms · ${node.stock.toLocaleString()} in stock</span>
      <span class="pin-row">avg $${(node.price / 100).toFixed(2)} · sold ${node.sold.toLocaleString()}</span>
      <span class="pin-row">debt $${(debt / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
      <span class="pin-row pin-orders">${commons} commons · ${middle} middle · ${elite} houses</span>
      ${causes.length ? `<span class="pin-links">${causes.join('<br>')}</span>` : ''}`;
    card.hidden = false;

    /* Below the bubble if there is room, above it if not — and if neither
       fits, clamp to the canvas edge rather than trusting the arithmetic.
       The bubbles sit in the upper two thirds of a 9:16 screen, so "above"
       is the common case and "neither" is real for the tall seven-line card
       on a short phone. */
    const cw = card.offsetWidth || 240, ch = card.offsetHeight || 150;
    const left = clamp(hit.x - cw / 2, 8, Math.max(8, vw - cw - 8));
    let top = hit.y + r + 12;
    if (top + ch > vh - 8) top = hit.y - r - ch - 12;
    top = clamp(top, 8, Math.max(8, vh - ch - 8));
    /* the card is position:fixed, so offset by the canvas's own origin */
    card.style.left = `${box.left + left}px`;
    card.style.top = `${box.top + top}px`;

    card.querySelector('.pin-x').addEventListener('click', () => {
      this.renderer._focusNode = null;
      this._hidePin();
    });
  }

  _hidePin() {
    const card = document.getElementById('pin');
    if (card) card.hidden = true;
  }

  /* A small readout following the cursor: what this industry is, how big,
     and what it causes. */
  _bubbleTip(id, x, y) {
    const sim = this.sim;
    const node = sim.map.nodes[id];
    if (!node) return;
    let commons = 0, middle = 0, elite = 0, debt = 0;
    for (const t of node.members) {
      if (t.isDead) continue;
      if (t.socialClass === 'elite') elite++;
      else if (t.socialClass === 'middle') middle++;
      else commons++;
      debt += t.account.debt;
    }
    const causes = [];
    for (const [from, to, , note] of CAUSAL) {
      if (from === id) causes.push('→ ' + sim.map.nodes[to].label);
      if (to === id) causes.push('← ' + sim.map.nodes[from].label);
    }
    const tip = document.getElementById('tip') || (() => {
      const d = document.createElement('div');
      d.id = 'tip';
      d.className = 'bubble-tip';
      document.body.appendChild(d);
      return d;
    })();
    tip.innerHTML = `
      <b>${node.label}</b>
      <span class="tip-row">${node.count} firms · ${node.stock.toLocaleString()} in stock</span>
      <span class="tip-row">avg price $${(node.price / 100).toFixed(2)} · sold ${node.sold.toLocaleString()}</span>
      <span class="tip-row">banks $${(node.wealth / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} · debt $${(debt / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
      <span class="tip-row tip-orders">${commons} commons · ${middle} middle · ${elite} houses</span>
      ${causes.length ? `<span class="tip-links">${causes.join(' · ')}</span>` : ''}`;
    tip.hidden = false;
    /* Same fix as the pin card: clamp against the measured canvas, not against
     * an undefined this.w. The tooltip sits above-right of the cursor, so it
     * also needs a left-edge clamp when the cursor is near the right wall. */
    const box = this.ui.canvas.getBoundingClientRect();
    const w = tip.offsetWidth || 210, h = tip.offsetHeight || 90;
    const left = clamp(x + 16, 8, Math.max(8, box.width - w - 8));
    let top = y - h - 14;
    if (top < 8) top = y + 20;                       // no room above: drop below
    top = clamp(top, 8, Math.max(8, box.height - h - 8));
    tip.style.left = `${box.left + left}px`;
    tip.style.top = `${box.top + top}px`;
  }

  _hideTip() {
    const tip = document.getElementById('tip');
    if (tip) tip.hidden = true;
  }

  canvasHidden() { return this.ui.canvas.hidden; }
}

window.addEventListener('DOMContentLoaded', () => { window.app = new App(); });
