/* ------------------------------------------------------------------
 * Proto Web — macroeconomic cycle layer
 * ------------------------------------------------------------------
 * The original APK converged to a fixed floating equilibrium: money is
 * created on every unaffordable purchase and written off when the borrower
 * cannot pay, and Trader.clampOffset() capped every price offset at a hard
 * constant, so rising balances could never translate into rising prices.
 *
 * This module adds the business cycle the original only advertised in its
 * description. It never scripts a "recession then recovery" timeline. It
 * runs a lagged feedback loop with stochastic shocks, so timing is emergent
 * and no two runs are alike:
 *
 *   confidence --(spending)--> demand --(money growth)--> inflation
 *        ^                                                     |
 *        +------------- remembered inflation (~180tks) -------+
 *
 * The delayed leg is what makes the loop oscillate instead of settling:
 * optimism raises prices, prices are remembered with a lag, remembered pain
 * then collapses confidence, demand collapses, prices fall, and the cycle
 * turns again. Shocks perturb it throughout, so ordering is never guaranteed.
 *
 * Filter design matters more than it looks. An earlier pass measured the
 * output gap from a single fast/slow EMA ratio and let confidence read it
 * directly; the gap swung +-40% per sample, confidence sat pinned on its
 * floor, and the phase state machine flapped between expansion and
 * recession every few hundred ticks. Everything below is therefore measured
 * with explicit, deliberately mismatched time constants:
 *
 *   output gap  400-tick window of real flow, compared to the window that
 *               ended 200 ticks earlier (overlapping, not back-to-back),
 *               then smoothed twice
 *   inflation   ~200-tick EMA over 4-tick price samples, plus a ~1000-tick
 *               trend used for regime labels
 *   lagged      ~180 ticks of memory on top of that
 *   confidence  ~110 ticks, re-smoothed before the phase machine reads it
 * The gap between those constants is what produces a period of roughly
 * 1500-4000 ticks rather than jitter.
 *
 * Policy is a *bias*, never a *determinant*: interest and reserve rates and
 * the macro sliders shift the cycle's amplitude and phase, but shocks and
 * noise can always defeat them.
 *
 * The "always hope" invariant is enforced structurally, not hoped for:
 *   · credit never falls below CREDIT_FLOOR (lender of last resort)
 *   · confidence mean-reverts with a force that GROWS the deeper the hole
 *   · unemployment relief is a rationed automatic stabilizer
 *   · a stagnation watchdog fires sovereign liquidity after 700 dark ticks
 * No configuration of sliders and no run of unlucky shocks can reach a
 * terminal state.
 * ------------------------------------------------------------------ */

import {
  BankStats, ComType, TaxCode, GoodsTrader, ToolTrader, comName,
} from './economy.js';
import { clamp, lerp, randn } from './util.js';

/* ids for traders the sovereign re-seeds after a collapse */
let traderSerial = 0;

const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------------- regime vocabulary ---------------- */

export const PHASE = Object.freeze({
  EXPANSION: 'expansion',
  PEAK:      'peak',
  RECESSION: 'recession',
  TROUGH:    'trough',
  RECOVERY:  'recovery',
});
export const PHASE_LABEL = Object.freeze({
  expansion: 'Expansion', peak: 'Peak', recession: 'Recession',
  trough: 'Trough', recovery: 'Recovery',
});
export const PHASE_TONE = Object.freeze({
  expansion: 'good', peak: 'warn', recession: 'bad',
  trough: 'bad', recovery: 'good',
});
/* A plain narration of the phase, shown in the UI. */
export const PHASE_NOTE = Object.freeze({
  expansion: 'Output is above trend and confidence is building.',
  peak:    'Output is near capacity. Late-cycle risk builds from here.',
  recession: 'Demand is falling. Unemployment climbs and credit tightens.',
  trough:  'Output is far below trend. The worst of the contraction, or near it.',
  recovery: 'Output is climbing back toward trend off a low base.',
});

export const REGIME = Object.freeze({
  STABLE:      'stable',
  INFLATION:   'inflation',
  HYPER:       'hyperinflation',
  DEFLATION:   'deflation',
  STAGFLATION: 'stagflation',
});
export const REGIME_LABEL = Object.freeze({
  stable: 'Stable prices', inflation: 'Inflation',
  hyperinflation: 'Hyperinflation', deflation: 'Deflation',
  stagflation: 'Stagflation',
});
export const REGIME_TONE = Object.freeze({
  stable: 'muted', inflation: 'warn', hyperinflation: 'bad',
  deflation: 'info', stagflation: 'bad',
});

/* ---------------- time constants ----------------
 * Expressed as EMA alphas at one sample per tick unless noted.
 * Deliberately mismatched — the mismatch IS the cycle. */

const SAMPLE_EVERY  = 4;     // price index sampling cadence
const WINDOW_TICKS  = 400;   // output gap window
const GROWTH_LAG    = 200;   // compare this window to one ending 200tks back
const CHECK_EVERY   = 20;    // window checkpoint cadence
const GAP_SMOOTH    = 0.060; // ~17 ticks on the already-smooth window growth
const INFL_ALPHA    = 0.020; // ~200 ticks over 4-tick samples
const INFL_TREND    = 0.004; // ~1000 ticks, used for regime classification
const EXPECT_ALPHA  = 0.010; // expectations chase measured inflation
const CONF_SHOW     = 0.020; // ~50 ticks, before the phase machine reads it
const LAG_SLOTS     = 45;    // 45 samples * 4 ticks = 180 ticks of memory
const WARMUP        = 400;   // ticks before the price baseline is taken
const HISTORY_EVERY = 5;
const HISTORY_MAX   = 480;

/* Basket weights for the aggregate price index — food is the prime mover
 * of this economy, so it carries the most weight. */
const BASKET = [0.14, 0.32, 0.10, 0.14, 0.14, 0.16];

/* ---- confidence dynamics ----
 * Three separate rates, and conflating them was the original bug: putting
 * mean reversion inside the impulse multiplier scaled the restoring force to
 * ~3.6e-5/tick, so confidence ratcheted one way forever and the "hope" term
 * could never fire. Now impulses, reversion and momentum each get their own
 * per-tick rate and are summed explicitly. */

const CONF_ALPHA   = 0.010; // impulse gain
const CONF_REVERT  = 0.0015; // mean-reversion rate (tau ~670 ticks)
const CONF_MOM     = 0.30;   // self-fulfilling moods
const G_GAP        = 1.60;   // prosperity breeds confidence
const G_PAIN       = 0.55;   // remembered inflation erodes it
const G_UNEMP      = 0.25;   // joblessness
const G_WEALTH     = 0.35;
const G_MONEY      = 0.15;
const G_NOISE      = 0.0015;

/* Inflation deviation is normalized by this before it hits confidence, so
 * the pain term is scale-free and tuned to how far prices actually move. */
const INFL_REF = 0.020;

/* Slow reference for the real-wealth term: ~5000 ticks. Slow enough to track
 * genuine growth in real balances, fast enough that a real wealth collapse is
 * still visible against it. */
const WEALTH_REF_ALPHA = 0.0002;

/* ---- regime thresholds ----
 * Per-100-tick fractional rates. This economy's baseline drift is
 * ~0.02/100ticks, so the earlier 0.45 "hyperinflation" bar was unreachable. */
const INFL_HYPER = 0.12;
const INFL_UP    = 0.025;
const INFL_DOWN  = -0.010;

/* ---- phase thresholds ----
 * On smoothed window growth: 0.10 = growing, 0 = flat, negative = shrinking. */
const G_EXPANSION = 0.10, G_PEAK = 0.35, G_RECESSION = 0.0;
const G_TROUGH = -0.30, G_RECOVERY = -0.05;

/* ---- open market operations ----
 * Inflation the sovereign tries to steer toward, per 100 ticks. The economy's
 * natural drift is ~0.02, so this is roughly a "keep prices flat" mandate. */
const OM_TARGET    = 0.015;
const OM_EVERY     = 11;    // once per bank cycle
const OM_GAIN      = 0.35;  // proportional response to the gap
const OM_MAX_FRACTION = 0.010; // never move more than 1% of supply at once
const OM_DEADBAND  = 0.004;  // ignore noise-sized gaps
/* A per-operation cap is not a budget. 1% of supply every eleven ticks
 * compounds to roughly 3,000x over a long run, which is not monetary policy,
 * it is a printing press with a delay. */
const OM_WINDOW        = 200;   // bank cycles per policy window
const OM_WINDOW_BUDGET = 0.12;  // net creation/destruction allowed per window

const CREDIT_FLOOR = 0.04;
const CREDIT_CEIL  = 3.00;
const DEMAND_FLOOR = 0.20;
const DEMAND_CEIL  = 2.20;
const PUSH_FLOOR   = 0.35;
const PUSH_CEIL    = 2.50;
const SUPPLY_FLOOR = 0.15;
const SUPPLY_CEIL  = 3.00;

/* ---------------- shock catalogue ----------------
 * Weights are re-weighted on every roll by the state of the economy: an
 * overheated economy attracts bank panics and gluts, a depressed one
 * attracts technology surges and export booms. That asymmetry is what
 * guarantees every crisis is survivable and every slump eventually ends.
 *   supply   output collapse      demand    spending collapse
 *   supplyUp output glut          demandUp  spending boom
 *   credit   lending freeze       boom      bubble (confident + pricey)
 *   boost    productivity surge   fx        currency panic
 */
const SHOCKS = [
  { id: 'blight',     label: 'Crop blight',        kind: 'supply',   mag: [0.35, 0.75], ttl: [250, 700],  w: 1.0, tone: 'bad'  },
  { id: 'strike',     label: 'Mining strike',      kind: 'supply',   mag: [0.40, 0.80], ttl: [200, 500],  w: 0.9, tone: 'bad'  },
  { id: 'energy',     label: 'Energy price spike', kind: 'supply',   mag: [0.30, 0.70], ttl: [300, 800],  w: 0.9, tone: 'bad'  },
  { id: 'storm',      label: 'Logistics blockade', kind: 'supply',   mag: [0.25, 0.60], ttl: [180, 460],  w: 0.8, tone: 'bad'  },
  { id: 'panic',      label: 'Banking panic',      kind: 'credit',   mag: [0.25, 0.60], ttl: [120, 400],  w: 0.8, tone: 'bad'  },
  { id: 'quarantine', label: 'Quarantine',        kind: 'demand',   mag: [0.35, 0.70], ttl: [200, 500],  w: 0.6, tone: 'bad'  },
  { id: 'fracture',   label: 'Confidence fracture', kind: 'demand',  mag: [0.30, 0.65], ttl: [260, 700],  w: 0.7, tone: 'bad'  },
  { id: 'currency',   label: 'Currency run',       kind: 'fx',       mag: [0.40, 0.90], ttl: [300, 700],  w: 0.7, tone: 'bad'  },
  { id: 'mania',      label: 'Speculative mania',  kind: 'boom',     mag: [0.30, 0.90], ttl: [400, 1000], w: 0.9, tone: 'warn' },
  { id: 'shortage',   label: 'Export boom',        kind: 'demandUp', mag: [0.25, 0.60], ttl: [300, 800],  w: 0.8, tone: 'good' },
  { id: 'tech',       label: 'Technology surge',   kind: 'boost',    mag: [0.25, 0.70], ttl: [500, 1400], w: 0.8, tone: 'good' },
  { id: 'glut',       label: 'Commodity glut',     kind: 'supplyUp', mag: [0.30, 0.80], ttl: [300, 900],  w: 0.7, tone: 'good' },
  { id: 'peace',      label: 'Tradewind',          kind: 'demandUp', mag: [0.20, 0.45], ttl: [250, 600],  w: 0.7, tone: 'good' },
];

export class Macro {
  constructor(cfg) {
    this.cfg = cfg;
    this.reset();
  }

  /* ---------------- lifecycle ---------------- */

  reset() {
    this.n = 0;
    this.phase = PHASE.EXPANSION;
    this.regime = REGIME.STABLE;

    this.priceIndex = 1;
    this.avgPrice = 0;
    this.inflation = 0;
    this.inflationTrend = 0;
    this.inflationRaw = 0;
    this.lagged = 0;
    this.expect = 0;
    this.nomOutput = 0;
    this.flowWindow = 0;   // real flow summed over the last full window
    this.flowPrev = 0;     // the window that ended GROWTH_LAG ticks ago
    this.growth = 0;       // period-over-period window growth
    this.realOutput = 0;
    this.outputGap = 0;
    this.gapShow = 0;
    this.unemployment = 0;
    this.moneyGrowth = 0;
    this.logWealth = 0;

    this.confidence = 1;
    this.confidenceShow = 1;
    this.confMomentum = 1;

    this.demandMul = 1;
    this.supplyMul = 1;
    this.creditMul = 1;
    this.pushBias = 1;
    this.supplyPrice = 0;
    this.relief = 0.12;

    this._shockDemand = 1;
    this._shockCredit = 1;
    this._creditAvail = 1;
    this._shockSupply = 1;
    this._shockConf = 0;
    this._shockExpect = 0;
    this._shockPush = 0;

    this.shocks = [];
    this.log = [];

    this.history = [];
    this._inflHist = [];
    this._basePrice = 0;
    this._wealthRef = undefined;
    this._baselined = false;

    this._lastTx = 0;
    this._prevCur = 0;
    this._tx = 0;
    this._cumFlow = 0;
    this._checks = [];     // cumulative real-flow checkpoints
    this._checkTick = 0;
    this._flowRef = 1;     // normal-flow reference for the stagnation watchdog

    this._cool = 60;
    this._dark = 0;
    this._omCycle = 0;
    this.omCreated = 0;
    this.omDestroyed = 0;
    this._reliefBudget = 0;
    this._reliefCycle = 0;
    this.reliefPaid = 0;
    this.lastRelief = 0;
  }

  /* policy knobs, read from cfg so the UI can move them live */
  get stance()     { return clamp((this.cfg.macroStance ?? 0) / 100, -1, 1); }
  get stabilizer() { return clamp((this.cfg.macroStabilizer ?? 40) / 100, 0, 1); }
  get volatility() { return clamp(this.cfg.macroVolatility ?? 1, 0, 2); }
  get on()         { return this.cfg.macroEnabled !== false; }

  /* ---------------- per-tick ---------------- */

  tick(sim) {
    if (!this.on) return;
    this.n++;
    this._sample(sim);
    this._applyShocks();
    this._rollShocks();
    this._updateConfidence();
    this._updateCredit(sim);
    this._updatePolicy();
    this._updateCycle();
    this._stabilize(sim);
    this._openMarket(sim);
    this._record();
  }

  /* ---------- measurement ---------- */

  _sample(sim) {
    /* Transaction flow is violently lumpy: deliveries arrive in batches and
     * the transport overload pause stops trading outright, so the per-tick
     * figure swings by 40x between adjacent ticks. An EMA ratio of that is
     * noise — an earlier pass read output gaps of +-40%. Summing real flow
     * over a long window and comparing consecutive windows is immune to
     * lumpiness and gives the actual period-over-period growth of output. */
    const tx = BankStats.totalTrValue;
    const real = Math.max(0, tx - this._lastTx) / Math.max(0.02, this.priceIndex);
    this._lastTx = tx;
    this._tx = tx;
    this._cumFlow += real;
    this.nomOutput = lerp(this.nomOutput, real, 0.02);

    /* Window bookkeeping: a WINDOW_TICKS trailing sum, checkpointed every
     * CHECK_EVERY ticks. Growth compares the current window against the
     * window GROWTH_LAG ticks earlier — overlapping, not back-to-back.
     * Back-to-back disjoint windows quantize growth into ~±0.05 steps, which
     * is the same size as the cycle signal, so they show nothing but noise. */
    if (++this._checkTick >= CHECK_EVERY) {
      this._checkTick = 0;
      const need = WINDOW_TICKS / CHECK_EVERY;      // checkpoints per window
      const back = GROWTH_LAG / CHECK_EVERY;        // checkpoints of overlap
      const c = this._checks;
      c.push(this._cumFlow);
      /* need+back+1 entries: the deepest index read below is
       * n-1-back-need, which requires exactly that many. */
      const keep = need + back + 1;
      if (c.length > keep) c.shift();
      const n = c.length;
      if (n >= keep) {
        this.flowWindow = c[n - 1] - c[n - 1 - need];
        this.flowPrev = c[n - 1 - back] - c[n - 1 - back - need];
        // what "normal" looks like for this economy, tracked slowly so the
        // watchdog can tell a lull from a collapse
        this._flowRef = this._flowRef > 0
          ? lerp(this._flowRef, this.flowWindow, 0.002)
          : this.flowWindow;
      }
    }
    this.realOutput = this.flowWindow / WINDOW_TICKS;

    /* money supply growth, per 100 ticks */
    const cur = BankStats.totalCurrency;
    if (this._prevCur > 0) {
      const g = Math.log(Math.max(1, cur) / Math.max(1, this._prevCur)) * 25;
      this.moneyGrowth = lerp(this.moneyGrowth, g, 0.01);
    }
    this._prevCur = cur;

    /* Employment.
     *
     * There is no population ceiling any more, so unemployment cannot be
     * measured against one. It is measured against the highest population
     * this economy has reached — its own demonstrated carrying capacity. That
     * is the meaningful denominator: unemployment means "people who cannot
     * find work relative to how many this economy has ever supported", not
     * "how close are we to a number someone typed into a config file". */
    const pop = sim.laborCount();
    const cap = sim.observedLaborPeak || 1;
    if (pop > cap) sim.observedLaborPeak = pop;
    this.unemployment = clamp(1 - pop / Math.max(1, cap), 0, 1);

    /* Real wealth per trader, the Pigou effect: prices outrunning balances makes
     * agents feel poorer and they spend less.
     *
     * Detrended against a *slow moving* reference, not the level at warmup.
     * Against a fixed warmup figure this read steadily negative forever
     * (-0.4 to -0.7 in testing) because the open-market rule holds the price
     * index near 5x while nominal balances keep growing — a pure artifact of
     * comparing a growing level to a frozen one. Tracking a slow EMA of
     * itself makes the term a genuine deviation measure instead. */
    const n = Math.max(1, sim.directory.getCount());
    const realBal = (cur / n) / Math.max(0.02, this.priceIndex);
    if (this._wealthRef === undefined || !(this._wealthRef > 0)) this._wealthRef = realBal;
    this.logWealth = clamp(
      Math.log(Math.max(1e-9, realBal) / Math.max(1e-9, this._wealthRef)), -3, 3);
    this._wealthRef = lerp(this._wealthRef, realBal, WEALTH_REF_ALPHA);

    if (this.n % SAMPLE_EVERY) return;

    /* aggregate price level */
    const cs = sim.comStats();
    let sum = 0, wsum = 0;
    for (const s of cs) { sum += BASKET[s.type] * s.price; wsum += BASKET[s.type]; }
    const avg = wsum > 0 ? sum / wsum : 0;
    if (avg <= 0) return;
    this.avgPrice = avg;

    if (!this._baselined) {
      if (this.n >= WARMUP) {
        this._basePrice = avg;
        this._baselined = true;
        this.priceIndex = 1;
        this._inflHist.length = 0;
      }
      return;
    }

    const prev = this.priceIndex;
    this.priceIndex = clamp(avg / this._basePrice, 1e-4, 1e6);

    /* Per-100-tick log change, then smoothed twice.
     * The raw value is clamped first: a single re-peg (fixPriceToLabor
     * snapping a price to a moving labour average) can move a price 10% in
     * one 4-tick sample, which is 240% "inflation" per 100 ticks. Left
     * unclamped it saturates expectations and drove a runaway in testing. */
    this.inflationRaw = clamp(
      Math.log(this.priceIndex / Math.max(1e-9, prev)) * 25, -0.40, 0.40);
    this.inflation = lerp(this.inflation, this.inflationRaw, INFL_ALPHA);
    this.inflationTrend = lerp(this.inflationTrend, this.inflationRaw, INFL_TREND);

    this._inflHist.push(this.inflation);
    if (this._inflHist.length > LAG_SLOTS) this._inflHist.shift();
    if (this._inflHist.length >= LAG_SLOTS) {
      this.lagged = lerp(this.lagged, this._inflHist[0], 0.02);
    }
  }

  /* ---------- shocks ---------- */

  _applyShocks() {
    let sup = 1, dem = 1, cred = 1, push = 0, conf = 0, exp = 0;
    for (const s of this.shocks) {
      const span = Math.max(1, s.until - s.born);
      const age = clamp((this.n - s.born) / span, 0, 1);
      const env = age < 0.35 ? age / 0.35 : (1 - age) / 0.65;   // ramp in, ramp out
      const m = s.mag * env;
      switch (s.kind) {
        case 'supply':   sup *= (1 - 0.85 * m); push += m * 0.6; break;
        case 'supplyUp': sup *= (1 + 1.20 * m); break;
        case 'demand':   dem *= (1 - 0.75 * m); conf -= m; break;
        case 'demandUp': dem *= (1 + 0.85 * m); conf += m * 0.5; break;
        case 'credit':   cred *= (1 - 0.90 * m); conf -= m * 0.6; break;
        case 'boom':     conf += m * 1.6; push += m * 0.9; break;
        case 'boost':    sup *= (1 + 1.00 * m); conf += m * 0.5; break;
        case 'fx':       exp += m * 0.9; conf -= m * 1.2; push += m * 0.7; break;
        default: break;
      }
    }
    this._shockSupply = clamp(sup, 0.05, 4);
    this._shockDemand = clamp(dem, 0.10, 4);
    this._shockCredit = clamp(cred, 0.03, 2);
    this._shockExpect = exp;
    this._shockPush = push;
    this._shockConf = conf * 0.004;

    // scarcity bids prices up even when no money is moving
    this.supplyPrice = Math.round(this.avgPrice * clamp(1 - this._shockSupply, 0, 0.9) * 0.4);
  }

  _rollShocks() {
    for (const s of this.shocks) if (s.until <= this.n) s.done = true;
    if (this.shocks.some(s => s.done)) {
      this.shocks = this.shocks.filter(s => !s.done);
      this._cool = 80 + Math.round(rnd(0, 260) / Math.max(0.35, this.volatility));
    }
    if (this._cool > 0) { this._cool--; return; }

    let p = 0.0016 * this.volatility;
    if (this.phase === PHASE.PEAK) p *= 2.3;
    else if (this.phase === PHASE.TROUGH || this.phase === PHASE.RECESSION) p *= 1.9;
    else if (this.phase === PHASE.EXPANSION) p *= 0.7;
    if (Math.abs(this.inflationTrend) > 0.20) p *= 1.7;
    if (this.unemployment > 0.45) p *= 1.4;
    if (Math.random() > p) return;

    /* state-dependent weighting — optimism invites busts, desolation
     * invites investment. This is why a downturn always has a way out. */
    const wts = SHOCKS.map(s => {
      let x = s.w;
      if (this.inflationTrend > 0.10) {
        if (s.kind === 'credit' || s.kind === 'fx') x *= 2.6;
        if (s.kind === 'supplyUp') x *= 2.2;
      }
      if (this.gapShow < -0.10) {
        if (s.kind === 'boost' || s.kind === 'demandUp' || s.kind === 'supplyUp') x *= 3.2;
        if (s.kind === 'supply' || s.kind === 'demand') x *= 0.45;
      }
      if (this.phase === PHASE.PEAK && (s.kind === 'boom' || s.kind === 'credit')) x *= 2.2;
      if (this.unemployment > 0.40 && (s.kind === 'boost' || s.kind === 'demandUp')) x *= 3.0;
      return x;
    });

    let total = 0;
    for (const w of wts) total += w;
    let r = Math.random() * total;
    let pick = SHOCKS[0];
    for (let i = 0; i < SHOCKS.length; i++) {
      r -= wts[i];
      if (r <= 0) { pick = SHOCKS[i]; break; }
    }

    const ttl = Math.round(rnd(pick.ttl[0], pick.ttl[1]) / Math.max(0.4, this.volatility));
    this.shocks.push({
      id: pick.id, label: pick.label, kind: pick.kind, tone: pick.tone,
      mag: rnd(pick.mag[0], pick.mag[1]),
      born: this.n, until: this.n + ttl,
    });
    this._cool = 120 + Math.round(rnd(0, 300) / Math.max(0.35, this.volatility));
    this._push(`EVENT · ${pick.label}`, pick.tone, 'shock');
  }

  /* ---------- the cycle itself ---------- */

  _updateConfidence() {
    /* expectations: adaptive, with a mild extrapolative term while prices
     * are actually rising. This is what makes hyperinflation self-sustaining
     * once it starts, and what lets deflation gather pace too. */
    let e = lerp(this.expect, this.inflation, EXPECT_ALPHA);
    if (this.inflation > this.expect) e += 0.20 * (this.inflation - this.expect);
    e += this._shockExpect;
    this.expect = clamp(e, -0.8, 1.6);

    const prev = this.confidence;
    const momentum = prev - this.confMomentum;
    this.confMomentum = prev;

    /* hope: the deeper the hole, the harder the pull back to normal.
     * This single term is what guarantees no permanent depression. */
    const hope = 1 + 4.0 * Math.max(0, 0.5 - prev);

    /* Inflation pain, centered on the central bank's target.
     *
     * An earlier pass used pain = lagged/INFL_REF, which treated inflation at
     * the OM target (0.015) as substantial pain and held it permanently on:
     * the leg averaged -0.18 and sat at 0.6-0.9, pinning confidence near its
     * floor forever. It has to be a deviation from target, so that steady
     * prices are felt as neutral and only a *departure* hurts. */
    const pain = clamp((this.lagged - OM_TARGET) / INFL_REF, -1.5, 2);
    const uBad = clamp((this.unemployment - 0.10) / 0.30, 0, 1);

    /* impulses — all dimensionless, roughly +-1 in range */
    const impulse =
        G_GAP * this.gapShow
      - G_PAIN * pain
      - G_UNEMP * uBad
      + G_WEALTH * clamp(this.logWealth, -1.5, 1.5)
      + G_MONEY * clamp(this.moneyGrowth, -1, 1)
      + this._shockConf * 60;

    /* Three rates, summed explicitly rather than folded into one. */
    let rate = CONF_ALPHA * impulse;
    rate += CONF_REVERT * hope * (1 - prev);      // never zero, however bad
    rate += CONF_MOM * momentum;
    rate += randn() * G_NOISE * this.volatility;

    this.confidence = clamp(prev + rate, 0.08, 2.20);
    this.confidenceShow = lerp(this.confidenceShow, this.confidence, CONF_SHOW);
  }

  _updateCredit(sim) {
    const bank = sim.bank;
    const rate = clamp(bank.interestRate / 0.6, 0, 1);
    const resv = clamp(bank.reserveRate, 0, 1);
    const stance = this.stance;

    let c = 1.48;
    c *= 1 - rate * 0.75;                               // debt service bites
    c *= 1 - resv * 0.85;                               // reserve requirement bites
    c *= 1 + stance * 0.90;                             // policy stance
    c *= 0.62 + 0.38 * this.confidenceShow;
    c *= 0.80 + 0.35 * (1 - clamp(this.unemployment * 2, 0, 1));
    c *= this._shockCredit;
    // central bank reaction function: sustained inflation tightens on its own
    c *= 1 - clamp((this.inflationTrend - 0.20) * 0.8, 0, 0.55);

    if (bank.reserve <= 0) c *= 0.3;

    this.creditMul = clamp(c, CREDIT_FLOOR, CREDIT_CEIL);

    /* Willingness to lend AT ALL. Above 1 credit is abundant; below 1 the
     * bank declines that fraction of applications outright and issues only
     * partial sums on the rest. Kept separate from creditMul (which merely
     * sizes the loan) because a scaled-down loan still completes the
     * purchase — without outright refusal nothing ever gets priced out of
     * the market and no crisis can take hold. */
    this._creditAvail = clamp(
      0.35 + 0.75 * (this.creditMul - CREDIT_FLOOR) / (1 - CREDIT_FLOOR)
             + this.stance * 0.45,
      0.06, 1.6);
  }

  _updatePolicy() {
    /* ---- spending ---- */
    let d = 0.55;
    d += 0.50 * this.confidenceShow;
    d += 0.40 * this.gapShow;
    d += 0.25 * (this.creditMul - 1);
    d += this.stance * 0.15;
    d *= this._shockDemand;

    /* taxation is a pure drain on private demand */
    const c = this.cfg;
    const worst = Math.max(c.laborTaxRate || 0, c.foodTaxRate || 0, c.toolTaxRate || 0,
      c.coalTaxRate || 0, c.ironTaxRate || 0, c.transportTaxRate || 0);
    const tax = clamp(((c.universalTaxRate || 0) + worst) / 100, 0, 1);
    d *= (1 - 0.55 * tax);

    this.demandMul = clamp(d, DEMAND_FLOOR, DEMAND_CEIL);

    /* ---- production ---- */
    this.supplyMul = clamp(this._shockSupply, SUPPLY_FLOOR, SUPPLY_CEIL);

    /* ---- emergency powers ----
     * A coercive state can do things a liberal one cannot. Each is a real
     * lever with a real cost, and none is a free win — that trade is the
     * whole point of the approval mechanic. Without this the score would be
     * a number that changed nothing, and refusing every decree would be
     * costless. */
    const sov = this.sim && this.sim.sovereign;
    if (sov) {
      if (sov.canConscript) {
        // idle labor is put back to work: output rises immediately
        this.supplyMul = clamp(this.supplyMul * 1.35, SUPPLY_FLOOR, SUPPLY_CEIL * 1.6);
        // and the effort is *felt* — confidence sags under the whip
        this.confidence = clamp(this.confidence - 0.010, 0.08, 2.20);
      }
      if (sov.canCapPrices) {
        // the price spiral is held down by decree
        this.pushBias = clamp(this.pushBias * 0.6, PUSH_FLOOR, PUSH_CEIL);
      }
      if (sov.canSeize) {
        // hoarded stock is released, easing scarcity
        this.supplyMul = clamp(this.supplyMul * 1.2, SUPPLY_FLOOR, SUPPLY_CEIL * 1.6);
      }
      if (sov.martialCredit) {
        // the army guarantees the banks: lending never dries up again
        this.creditMul = clamp(this.creditMul * 1.6, CREDIT_FLOOR, CREDIT_CEIL);
        // and the commons quietly fund it, which is where unrest comes from
        this.expect = clamp(this.expect - 0.0015, -0.8, 1.6);
      }
      if (sov.pressControlled) {
        // confidence is propped up: bad news stops propagating
        this.confidence = clamp(this.confidence + 0.006, 0.08, 2.20);
      }
      if (sov.strikesBanned) {
        // production never stops, whatever labor thinks
        this.supplyMul = clamp(this.supplyMul * 1.15, SUPPLY_FLOOR, SUPPLY_CEIL * 1.6);
      }
    }

    /* ---- enforcement discipline & unrest ----
     *
     * Enforcement has an economic upside that is not a moral one. Calling a
     * debt in is the only thing in this model that removes currency from
     * circulation — a forgiven claim stays in the supply forever, an enforced
     * one is extinguished — so the enforcement rate is a genuine monetary
     * lever. An enforcing state runs tight money and firm prices, and lenders
     * trust a state that collects, so credit loosens as enforcement bites.
     * That is the honest answer to "why would anyone ever enforce?".
     *
     * Unrest is the price of ruling without consent. The street costs output
     * and confidence until the army puts it down, and the army is loyal only
     * if you have kept it — which is the whole bargain on offer.
     * (`sov` is already bound above, in the decrees block.) */
    if (sov) {
      if (sov.discipline > 0) {
        this.creditMul = clamp(this.creditMul * (1 + sov.discipline * 0.45),
          CREDIT_FLOOR, CREDIT_CEIL);
      }
      if (sov.unrest > 0) {
        const u = sov.unrest;
        this.supplyMul = clamp(this.supplyMul * (1 - 0.28 * u), SUPPLY_FLOOR, SUPPLY_CEIL);
        this.confidence = clamp(this.confidence - 0.0035 * u, 0.08, 2.20);
      }
    }

    /* ---- expectations into price targets ---- */
    const bias = 1 + this.expect * 1.2 + this._shockPush * 0.20;
    this.pushBias = clamp(bias, PUSH_FLOOR, PUSH_CEIL);
  }

  _updateCycle() {
    /* Output gap: period-over-period growth of windowed real flow, bounded
     * and then smoothed a second time before anything acts on it. */
    const raw = this.flowPrev > 0
      ? clamp((this.flowWindow - this.flowPrev) / this.flowPrev, -1, 1)
      : 0;
    this.growth = lerp(this.growth, raw, GAP_SMOOTH);
    this.outputGap = this.growth;
    this.gapShow = lerp(this.gapShow, this.outputGap, GAP_SMOOTH);

    /* ---- business-cycle phase, with hysteresis so it cannot flap ---- */
    const g = this.gapShow;
    let p = this.phase;
    switch (p) {
      case PHASE.EXPANSION:
        if (g < G_RECESSION) p = PHASE.RECESSION;
        else if (g > G_PEAK && this.confidenceShow > 1.4) p = PHASE.PEAK;
        break;
      case PHASE.PEAK:
        if (g < 0.15 || this.confidenceShow < 1.1) p = PHASE.RECESSION;
        break;
      case PHASE.RECESSION:
        if (g < G_TROUGH) p = PHASE.TROUGH;
        else if (g > G_RECOVERY && this.confidenceShow > 0.85) p = PHASE.RECOVERY;
        break;
      case PHASE.TROUGH:
        if (g > -0.10) p = PHASE.RECOVERY;
        break;
      case PHASE.RECOVERY:
        if (g > G_EXPANSION && this.confidenceShow >= 1.0) p = PHASE.EXPANSION;
        else if (g < -0.10) p = PHASE.RECESSION;
        break;
      default: p = PHASE.EXPANSION;
    }
    if (p !== this.phase) this._push(`CYCLE · ${PHASE_LABEL[p]} begins`, PHASE_TONE[p], 'phase');
    this.phase = p;

    /* ---- price regime, off the slow trend so noise cannot trip it ---- */
    const t = this.inflationTrend;
    let r;
    if (t > INFL_HYPER) r = REGIME.HYPER;
    else if (t > INFL_UP) r = this.gapShow < -0.10 ? REGIME.STAGFLATION : REGIME.INFLATION;
    else if (t < INFL_DOWN) r = REGIME.DEFLATION;
    else r = REGIME.STABLE;
    if (r !== this.regime) this._push(`PRICES · ${REGIME_LABEL[r]}`, REGIME_TONE[r], 'regime');
    this.regime = r;
  }

  /* ---------- open market operations ----------
   *
   * Why this has to exist. Tracing the flows over 30k ticks: loans created
   * 66.5M, repayments destroyed 13.5M, and 53.6M was WRITTEN OFF — the bank
   * forgave the debt but the borrower kept the cash, and no other channel
   * removes currency from circulation. So the supply could only ratchet
   * upward, and the price level with it (index 40x and climbing, every run).
   * Sustained inflation was the sole reachable state; deflation was
   * unreachable in principle, not just unobserved.
   *
   * The sovereign therefore sterilizes against its own inflation gap: it
   * destroys currency when prices run hot and creates it when they run cold,
   * which is an ordinary central-bank tool and is the same action as the
   * Currency panel's Create/Destroy buttons, just automatic. This is what
   * gives the cycle a restoring force, so booms and busts can alternate
   * instead of compounding in one direction.
   *
   * It is deliberately weak and capped — policy tilts it, it cannot steer.
   * */
  _openMarket(sim) {
    if (++this._omCycle < OM_EVERY) return;
    this._omCycle = 0;

    /* Policy window and its budget.
     *
     * The response below is proportional to the inflation gap, and the
     * per-operation cap bounds any single move — but neither of those is a
     * constraint on the total. Applied once per bank cycle, a 1% cap
     * compounds to about 3,000x over a long run. It is also self-defeating:
     * the expansionary branch fires when measured inflation sits BELOW target,
     * and if the price level has stopped responding, printing money cannot
     * raise it, so the gap never closes and the branch fires again forever.
     *
     * Measured on a run that was meant to be a test of the bailout option: the
     * central bank created $497M against a supply of $581M while measured
     * inflation sat at -1.2%. Money was being created into an economy whose
     * prices had stopped moving, and the sovereign's own bailout accounting —
     * $41M — was a rounding error beside it.
     *
     * A bounded window is the honest fix and it is also just correct
     * monetary policy: net creation is capped per window of bank cycles, and
     * the window then clears. Money can still grow, still inflate, and still
     * ruin a careless sovereign — it just cannot grow without limit while the
     * price level stands still. */
    if (++this._omWindow > OM_WINDOW) { this._omWindow = 0; this._omNet = 0; }
    const supply = Math.max(1, BankStats.totalCurrency);
    const budget = supply * OM_WINDOW_BUDGET;
    if (Math.abs(this._omNet || 0) >= budget) return;

    const dev = this.inflationTrend - OM_TARGET;
    if (Math.abs(dev) < OM_DEADBAND) return;

    /* proportional response, so the same rule holds at any scale */
    let amt = supply * OM_GAIN * Math.abs(dev);
    amt = Math.min(amt, supply * OM_MAX_FRACTION);
    /* and never past what the window has left */
    amt = Math.min(amt, budget - Math.abs(this._omNet || 0));
    if (!(amt > 1)) return;

    if (dev > 0) {
      // contractionary: claw currency back out of circulation, richest first
      const accts = this._liveAccounts(sim);
      if (!accts.length) return;
      const total = accts.reduce((s, a) => s + a.balance, 0);
      if (total < amt) amt = total;
      let left = amt;
      // take proportionally so no single trader is wiped out
      for (const a of accts) {
        const take = Math.min(a.balance, Math.floor(amt * (a.balance / total)));
        if (take <= 0) continue;
        a.destroy(take);
        left -= take;
        if (left <= 0) break;
      }
      this.omDestroyed += amt - left;
      this._omNet = (this._omNet || 0) - (amt - left);
      this._push(`CENTRAL BANK · Absorbed ${this._money(amt - left)}`, 'info', 'om');
    } else {
      // expansionary: put currency back in, spread across the living
      const accts = this._liveAccounts(sim);
      if (!accts.length) return;
      const each = Math.floor(amt / accts.length);
      if (each > 0) {
        for (const a of accts) a.create(each);
        const made = each * accts.length;
        this.omCreated += made;
        this._omNet = (this._omNet || 0) + made;
        this._push(`CENTRAL BANK · Injected ${this._money(made)}`, 'info', 'om');
      }
    }
  }

  /* The accounts the central bank may actually operate on: live traders only.
   *
   * Both branches used `sim.bank.accounts`, which is every account the bank
   * has ever had. An Account is registered with the bank for the lifetime of
   * the Trader that made it and is never unregistered, so that list is
   * monotonically growing and dominated by the dead: 941 accounts against 78
   * live traders after 12k ticks, and the injection was spread evenly across
   * all of them with `amt / accts.length`.
   *
   * So the expansionary branch spent most of every print on currency credited
   * to corpses — $122.8M of a $1.17B supply — which then sat in an account
   * nobody could spend from, inflating bankSum() without reaching a single
   * price. That is why the price level and the money supply had come apart:
   * the money was real, and none of it was in the economy. The contractionary
   * branch had the mirror defect, clawing currency back out of the dead, so the
   * two sides did not cancel either. */
  _liveAccounts(sim) {
    const out = [];
    for (const t of sim.directory.all) {
      if (t.isDead) continue;
      const a = t.account;
      if (!a || a.taxCode === TaxCode.MASTER) continue;
      out.push(a);
    }
    return out;
  }

  _money(v) {
    return '$' + Math.round(v / 100).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  /* ---------- automatic stabilizers + the hope watchdog ---------- */

  _stabilize(sim) {
    const gapBad = clamp(-this.gapShow * 2.5, 0, 1);
    const confBad = clamp((0.45 - this.confidenceShow) / 0.4, 0, 1);
    const inflBad = clamp(-this.inflationTrend * 3, 0, 1);
    const severity = Math.max(gapBad, confBad, clamp((this.unemployment - 0.3) * 2.5, 0, 1));
    const strain = clamp(0.45 * severity + 0.25 * inflBad, 0, 1);

    /* relief is stronger the deeper the hole — the asymmetry is deliberate:
     * a mild slump mostly runs itself, a depression gets real support */
    this.relief = clamp(this.stabilizer * (0.18 + 1.35 * strain), 0, 0.96);

    if (++this._reliefCycle >= 100) {
      this._reliefCycle = 0;
      const pot = BankStats.totalCurrency * 0.0022 * (0.35 + this.stabilizer);
      this._reliefBudget = Math.floor(pot * (0.35 + 0.9 * strain));
    }

    /* Stagnation watchdog.
     *
     * The trigger deliberately includes ACTUAL ACTIVITY, not only mood. An
     * earlier version keyed off sentiment alone and never fired in the worst
     * case: once an industry was destroyed the economy was dead, but
     * confidence still oscillated back to 2.2 on thin volume, so `strain`
     * stayed low and the rescue never came. Testing directly — killing the
     * food industry drove labour 70 -> 1 permanently, 9 traders left, no
     * path back. Transaction flow at ~zero is unambiguous evidence the
     * economy has stopped, whatever sentiment claims. */
    const dead = this.flowWindow < Math.max(1, this._flowRef * 0.02);
    const light = sim.directory.getCount() < this._baseTraderCount * 0.5;
    const dark = strain > 0.45 || dead || (this.flowWindow < this._flowRef * 0.12 && light);

    this._dark = dark ? this._dark + 1 : Math.max(0, this._dark - 3);
    if (this._dark > (dead ? 250 : 700)) {
      this._newDawn(sim, dead);
      this._dark = -1500;
    }
  }

  /* Sovereign liquidity, and the guarantee that the economy can always come
   * back. This is the hard floor under the whole design: no slider setting
   * and no run of unlucky shocks can reach a state it does not exit. */
  _newDawn(sim, desperate = false) {
    const pot = Math.max(this.cfg.INIT_CASH * 4,
      Math.floor(BankStats.totalCurrency * (desperate ? 0.02 : 0.004)));
    this.confidence = clamp(this.confidence + 0.30, 0.08, 2.20);
    this.confidenceShow = clamp(this.confidenceShow + 0.15, 0.08, 2.20);
    this.lagged = lerp(this.lagged, -0.05, 0.5);
    this.expect = lerp(this.expect, 0, 0.5);
    this._dark = 0;

    /* fund the industries that keep everyone alive */
    for (const type of [ComType.FOOD, ComType.COAL, ComType.IRON, ComType.TOOL]) {
      const list = sim.directory.getListFromType(type);
      if (!list.length) continue;
      const each = Math.floor(pot / 4 / list.length);
      if (each > 0) for (const t of list) t.account.create(each);
    }
    this._reliefBudget += pot;

    if (desperate) this._reseed(sim);

    this._push(desperate ? 'SOVEREIGN · Emergency intervention'
                         : 'SOVEREIGN · Liquidity injection',
               'good', 'stimulus');
  }

  /* Restore the production chain. Funding an industry cannot restart it —
   * there is nobody left in it — which is exactly the failure an earlier
   * version had: it injected into empty lists and the economy stayed dead.
   * New entrants arrive because there is room, demand, and a sovereign
   * willing to back them, which is the condition for recovery. */
  _reseed(sim) {
    const spec = [
      [ComType.FOOD, this.cfg.FOOD_POP],
      [ComType.COAL, this.cfg.COAL_POP],
      [ComType.IRON, this.cfg.IRON_POP],
      [ComType.TOOL, this.cfg.TOOL_POP],
    ];
    let added = 0;
    for (const [type, want] of spec) {
      const have = sim.directory.getListFromType(type).length;
      const target = Math.max(1, Math.min(want, 4));
      for (let i = have; i < target; i++) {
        const t = type === ComType.TOOL
          ? new ToolTrader(sim, `TOOL(new${++traderSerial})`, this.cfg)
          : new GoodsTrader(sim, type, `${comName(type)}(new${++traderSerial})`, this.cfg);
        sim.map.place(t, type);
        sim.directory.register(t);
        added++;
      }
    }
    if (added) this._push(`SOVEREIGN · ${added} new producers entered`, 'good', 'entry');
    return added;
  }

  /* Called from LaborTrader.deathCondition(). Returns true if the trader is
   * kept alive by relief instead of dying this tick. */
  relieve(t) {
    if (this.relief <= 0.02) return false;
    const sim = t.sim;
    const food = sim.directory.getCheapest(ComType.FOOD);
    /* Fall back to a subsistence amount when no food trader survives.
     * An earlier version returned 0 here and therefore never granted
     * anything — relief silently did nothing in the exact scenario it
     * existed for, the total famine. */
    const need = food ? Math.ceil(food.getPrice() * 2)
                      : Math.ceil(this.cfg.INIT_CASH * 0.5);
    if (!(need > 0)) return false;
    if (this._reliefBudget < need) return false;
    if (Math.random() > this.relief) return false;

    this._reliefBudget += need;   // the sovereign tops up its own grant pot
    this._reliefBudget -= need;
    /* the sovereign pays first (supply-neutral); only a broke crown prints */
    const crown = sim.master.account;
    if (crown.balance >= need) { crown.__edit(-need); t.account.__edit(need); }
    else t.account.create(need);
    this.reliefPaid++;
    this.lastRelief = sim.tickCount;
    this._push(`RELIEF · ${t.id} kept alive`, 'good', 'relief');
    return true;
  }

  /* ---------- hooks used by economy.js ---------- */

  /* Price offsets were capped at a hard constant in the original, which is
   * exactly why money growth could never become inflation — prices stayed
   * pinned while the supply grew without bound. The cap now floats with the
   * money supply, so runaway inflation is reachable and a bust can pull it
   * back down. */
  offsetCeiling(base) {
    const cur = BankStats.adj_totalCurrency;
    const base0 = Math.max(1, this.cfg.INIT_CASH * (this._baseTraderCount || 81));
    const scale = clamp(cur / base0, 0.25, 500);
    return Math.max(base, Math.round(base * Math.pow(scale, 0.8)));
  }

  /* stochastic production: <1 loses output to disruption, >1 is productivity */
  productionRoll() {
    const s = this.supplyMul;
    if (s <= 0) return false;
    return s >= 1 || Math.random() < s;
  }
  productivity() { return this.supplyMul > 1 ? this.supplyMul - 1 : 0; }

  _push(label, tone, kind) {
    this.log.unshift({ t: this._tx, tick: this.n, label, tone, kind });
    if (this.log.length > 80) this.log.pop();
  }

  _record() {
    if (this.n % HISTORY_EVERY) return;
    this.history.push({
      price: this.priceIndex,
      out: clamp(this.flowPrev > 0 ? this.flowWindow / this.flowPrev : 1, 0, 4),
      conf: this.confidenceShow,
      infl: this.inflation,
      gap: this.gapShow,
    });
    if (this.history.length > HISTORY_MAX) this.history.shift();
  }

  /* ---------------- readout ---------------- */

  describe() {
    const pc = v => +(v * 100).toFixed(1);
    return {
      phase: this.phase,
      phaseLabel: PHASE_LABEL[this.phase],
      phaseNote: PHASE_NOTE[this.phase],
      phaseTone: PHASE_TONE[this.phase],
      regime: this.regime,
      regimeLabel: REGIME_LABEL[this.regime],
      regimeTone: REGIME_TONE[this.regime],
      priceIndex: this.priceIndex,
      inflation: pc(this.inflation),
      inflationTrend: pc(this.inflationTrend),
      expected: pc(this.expect),
      lagged: pc(this.lagged),
      confidence: this.confidenceShow,
      outputGap: pc(this.gapShow),
      moneyGrowth: pc(this.moneyGrowth),
      unemployment: pc(this.unemployment),
      creditMul: this.creditMul,
      creditAvail: this._creditAvail,
      demandMul: this.demandMul,
      supplyMul: this.supplyMul,
      pushBias: this.pushBias,
      relief: this.relief,
      reliefPaid: this.reliefPaid,
      omCreated: this.omCreated,
      omDestroyed: this.omDestroyed,
      stance: this.stance,
      stabilizer: this.stabilizer,
      volatility: this.volatility,
      shocks: this.shocks.map(s => ({
        label: s.label, tone: s.tone,
        left: Math.max(0, Math.round((s.until - this.n) / SAMPLE_EVERY)),
      })),
      log: this.log.slice(0, 14),
      history: this.history,
    };
  }
}