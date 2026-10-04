/* ------------------------------------------------------------------
 * Proto Web — the sovereign's dilemma
 * ------------------------------------------------------------------
 * Every 11th tick the bank collects debt. Traders who cannot pay it have
 * their loans written off — and that used to be automatic. This module
 * turns each of those into a ruling the player must actually make:
 *
 *   FORGIVE   the loss is absorbed, the money stays in circulation,
 *             the trader survives, creditors eat it
 *   ENFORCE   the trader defaults, the debt is called in, and it counts
 *             as an insolvency
 *   BAIL OUT  the foreign lenders cover it. Nobody is forgiven, nobody is
 *             liquidated, the creditors are actually paid — and the claim
 *             becomes sovereign debt that cannot default
 *
 * The first two are counted separately (BankStats.writeOffs vs
 * BankStats.insolvencies) because they are opposite answers to the same
 * question, and because each one moves approval among the interest groups
 * whose members live with the consequences. The third is the trap: it is the
 * only ruling that pleases every interest at once, so it has no political
 * cost to press and only an economic one. See js/credit.js for where that
 * cost goes, and _creditFactions below for why every faction gains from it.
 *
 * Approval is not a score to maximise. It is the balance of power between
 * organized interests, and each ruling transfers a little of it. As it
 * falls, the state becomes more authoritarian and more militarized: it can
 * then do things it otherwise cannot — conscript labor, seize stocks,
 * impose wage ceilings, silence strikes — each of which is genuinely
 * effective and genuinely corrosive. At 0% the sovereign is a tyrant whose
 * decrees still run but whose country is hollowed out. That is the failure
 * state, and the player is never deposed: there is no path where the
 * government loses office, only the one where it hollows itself out. Loss is
 * a slow, legible consequence, never a game over. The five-year election
 * makes the same promise in a louder voice — the country can tell you it no
 * longer believes you, and you can rule on regardless, and it will cost you
 * everything except the chair.
 * ------------------------------------------------------------------ */

import { BankStats, ComType } from './economy.js';
import { clamp, lerp, money } from './util.js';

/* ---------------- interest groups ----------------
 * Each has an appetite for the two rulings and a `cap` giving it a share of
 * political weight.
 *
 * Two structural facts about this roster are deliberate, and both are the
 * point of the design rather than balance accidents:
 *
 * 1. The enforcement coalition outweighs the forgiveness coalition. That is
 *    what makes enforcing the path to power and forgiving the path to
 *    tyranny: forgive everyone and you lose the banks, the great houses, the
 *    industrialists, the reformers AND the army. Earlier versions tried to
 *    balance the coalitions and a ruler who gave the poor everything could
 *    not be popular, which inverted the intended politics.
 *
 * 2. The military is the heaviest single interest by a wide margin, and the
 *    army's weight rises as the state turns authoritarian. Consent is worth
 *    something, but consent is not security: the army is the only faction
 *    that can hold the street and keep the sovereign in office, so it is the
 *    one whose displeasure is dangerous. Losing the commons costs you
 *    approval; losing the army costs you the country.
 *
 * The great houses are likewise heavier than the commons. They hold the
 * wealth, they are untouchable by enforcement, and a ruling that spares
 * them while it buries the small is precisely the ruling they want. */

export const FACTIONS = Object.freeze({
  military: {
    id: 'military', name: 'The Military', short: 'Military',
    color: '#ff5a5f',
    creed: 'Order first. We decide who is still standing.',
    forgive: -3.6, enforce: +3.0,
    power: 0, cap: 2.00, coalition: 'enforce',
    // the army is the arbiter: its standing gates riots and coups
    arbiter: true,
  },
  elite: {
    id: 'elite', name: 'The Great Houses', short: 'Houses',
    color: '#e0b64a',
    creed: 'We are never liquidated. We are the ones you need.',
    forgive: -3.4, enforce: +3.4,
    power: 0, cap: 1.50, coalition: 'enforce',
  },
  banks: {
    id: 'banks', name: 'Creditor Banks', short: 'Banks',
    color: '#4f6bff',
    creed: 'A loan is a promise. Forgiveness rewards dishonesty.',
    forgive: -3.2, enforce: +2.4,
    power: 0, cap: 0.80, coalition: 'enforce',
  },
  labour: {
    id: 'labour', name: 'Labour Unions', short: 'Unions',
    color: '#22e06a',
    creed: 'A man who cannot eat is not a debtor, he is a victim.',
    forgive: +3.4, enforce: -3.0,
    power: 0, cap: 1.15, coalition: 'forgive',
  },
  industry: {
    id: 'industry', name: 'Industrialists', short: 'Industry',
    color: '#ff9f43',
    creed: 'Every closed mill is a rival that wins by default.',
    forgive: -1.6, enforce: +2.6,
    power: 0, cap: 0.70, coalition: 'enforce',
  },
  commons: {
    id: 'commons', name: 'The Commons', short: 'Commons',
    color: '#3fd8ff',
    creed: 'Bread before contracts.',
    forgive: +2.2, enforce: -1.4,
    power: 0, cap: 1.00, coalition: 'forgive',
  },
  reform: {
    id: 'reform', name: 'Reformers', short: 'Reformers',
    color: '#ffd43b',
    creed: 'Rule the same law for the solvent and the ruined.',
    forgive: -0.6, enforce: +1.4,
    power: 0, cap: 0.45, coalition: 'enforce',
  },
});

/* ---------------- decree pool ----------------
 * Emergency powers scale with how little the country trusts its government.
 * Each one is a genuine lever with a genuine cost — that is the whole point.
 * None of them is a free win. */

export const DECREES = Object.freeze({
  laborDraft: {
    id: 'laborDraft', name: 'Conscript Labour',
    desc: 'Idle hands report for work. Output rises, and so does resentment.',
    minApproval: 55, cost: 11,
    good: 'Production is forced back up during a slump.',
    bad: 'Every conscript resents it, and resentment is approval you lose later.',
  },
  priceCeiling: {
    id: 'priceCeiling', name: 'Wage Ceilings',
    desc: 'Prices are held down by decree. Complaints end.',
    minApproval: 50, cost: 9,
    good: 'Deflation is arrested and the commons are placated.',
    bad: 'Traders stop producing at a loss; goods dry up and shortages follow.',
  },
  seizeStock: {
    id: 'seizeStock', name: 'Seize Speculative Stock',
    desc: 'Hoarded goods are requisitioned and released at a fixed price.',
    minApproval: 45, cost: 8,
    good: 'Famine is broken by force within a single cycle.',
    bad: 'Traders hide stock rather than risk it being taken.',
  },
  banStrikes: {
    id: 'banStrikes', name: 'Outlaw Strikes',
    desc: 'Walkouts are criminal. Wages hold.',
    minApproval: 35, cost: 14,
    good: 'Production never stops, whatever labour thinks.',
    bad: 'The unions are destroyed, and with them the only thing left that opposes you.',
  },
  pressCensorship: {
    id: 'pressCensorship', name: 'Censor the Press',
    desc: 'Bad news stops spreading. Confidence stops falling.',
    minApproval: 30, cost: 12,
    good: 'Confidence is propped up artificially, smoothing the worst of a crash.',
    bad: 'You stop hearing what is actually wrong with the economy.',
  },
  martialAid: {
    id: 'martialAid', name: 'Martial Aid to the Banks',
    desc: 'The army guarantees creditor claims in full.',
    minApproval: 25, cost: 10,
    good: 'Credit never freezes again, and lending recovers at once.',
    bad: 'Debt is enforced at gunpoint; the commons will not forgive that.',
  },
});

/* ---------------- docket templates ----------------
 * Each generates a differently-framed claim so the docket never reads the
 * same twice. The framing changes what the claim *seems* to be about while
 * the underlying economics stay honest.
 *
 * (House names live in simulator.js, where the houses are seeded.) */

/* Industry labels, keyed by ComType.
 *
 * NB: claims carry `comType`, not `taxCode`, and the two use the same
 * numeric space with different meanings — TaxCode.LABOR is 1 while
 * ComType.LABOR is 0. Keying this table on the wrong one silently produced
 * "Primarily undefined" for every labor claim in the docket. */
const LABELS = {
  0: 'Labor', 1: 'Food', 2: 'Tools', 3: 'Coal', 4: 'Iron', 5: 'Shipping',
};
const label = t => LABELS[t] || 'Mixed';

const FIRM_ROOTS = ['Ashford', 'Brightwater', 'Coldharbour', 'Dunmore', 'Eastvale',
  'Fairhaven', 'Greyport', 'Hollowfield', 'Ironbridge', 'Juniper', 'Kingsmoor',
  'Larkhall', 'Merewood', 'Northgate', 'Oakhurst', 'Pinecrest', 'Quarrylane',
  'Redmill', 'Stonebridge', 'Thornbury', 'Underhill', 'Westmarch', 'Yarrowfield',
  'Alderwick', 'Bexley', 'Carrick', 'Dalemoor', 'Elmsworth'];

const CLAIM_KINDS = [
  { id: 'bailout', verb: 'Emergency Support', tone: 'industry' },
  { id: 'strikeFund', verb: 'Strike Support', tone: 'labour' },
  { id: 'deferment', verb: 'Deferment', tone: 'banks' },
  { id: 'settlement', verb: 'Compensation Claim', tone: 'commons' },
  { id: 'nationalise', verb: 'Acquisition', tone: 'military' },
  { id: 'amnesty', verb: 'Penalty Forgiven', tone: 'reform' },
];

const INDUSTRY_NOTE = {
  0: 'Labor is the resource every other commodity is made from. A lost worker is a hole in everything.',
  1: 'Food is the chain the whole economy eats from. Losing producers here is never only about them.',
  2: 'Tools multiply every other commodity twentyfold. A lost tool works is twentyfold lost.',
  3: 'Coal feeds the tool works, which feed the food works.',
  4: 'Iron feeds the tool works, which feed the food works.',
  5: 'Shipping is what makes every trade physical rather than notional.',
};

/* Faction whose constituency a given industry depends on most, used to
 * sharpen their reaction to a docket that names them. */
const SECTOR_OWNER = {
  0: 'labour', 1: 'commons', 2: 'industry', 3: 'industry', 4: 'industry', 5: 'industry',
};

/* Deterministic-ish but varied picker. */
function pick(arr, rand) { return arr[Math.floor(rand() * arr.length) % arr.length]; }

/* How often social class is reviewed. Slow on purpose: a house should be a
 * life event, not a coin flip every few seconds. */
const MOBILITY_EVERY = 55;

/* Names for houses founded from the middle class. */
const HOUSE_NAMES = ['Ashgrove & Co.', 'Bexworth & Sons', 'Coldstream Ltd.',
  'Draymoor Holdings', 'Elmsworth Trust', 'Fenwick Partners', 'Grimsby Corp.',
  'Hartley & Co.', 'Ingram Holdings', 'Jessamine Group', 'Kelvin Ltd.',
  'Lansdowne Partners', 'Marchmont Trust', 'Northcliffe Ltd.',
  'Ottersby & Co.', 'Pemberton Holdings', 'Quarrenden Ltd.', 'Ravensworth Trust',
  'Stanmore Group', 'Thorncastle & Co.'];

let docketSeq = 0;

export class Sovereign {
  constructor(cfg, sim) {
    this.cfg = cfg;
    this.sim = sim;
    this.reset();
  }

  reset() {
    for (const f of Object.values(FACTIONS)) f.power = 0;
    this.approval = 50;
    this.tier = 'contested';
    this.pending = null;         // the docket awaiting a ruling
    /* Claims waiting for the court. The court sits on its own cadence and reads
     * these; nothing is presented to the player the moment a firm defaults. */
    this._file = null;
    this.autoRule = null;        // null = ask, 'forgive' | 'enforce' | 'bailout'
    this.log = [];
    this.decrees = new Set();
    this.law = { draft: false, ceiling: false, seize: false, strikes: false,
                 press: false, martial: false };
    this.forgivenTotal = 0;
    this.enforcedTotal = 0;
    this.claimsRuled = 0;
    this.claimsAuto = 0;
    this.forcedForgive = 0;
    this._crisisTicks = 0;
    this._coupPressure = 0;
    this.coups = 0;
    this.discipline = 0;
    this._discWindow = [];
    this._rand = Math.random;

    /* ---- elections ---- */
    this.election = null;          // the result awaiting the player's answer
    this.lastElection = null;
    this.electionHistory = [];
    this.termsHeld = 0;
    this.defianceCount = 0;        // times the ruler ignored a no-confidence
    this._nextElectionYear = (this.cfg.ELECTION_TERM_YEARS || 5);
    this._electionMarks = { phase: null, approval: 50, inflation: 0 };
  }

  /* ---------------- approval & regime ---------------- */

  /* The world stops for a docket and for nothing else.
   *
   * An election does NOT stop it here, and this is a deliberate correction
   * rather than an oversight. The docket belongs in the simulation because
   * the court has genuinely no procedure until the sovereign rules: sealing
   * the claims IS the bank cycle, and skipping it would corrupt the ledger.
   * An election is only a report — the year closed on schedule whether or not
   * anyone was reading it.
   *
   * Gating the clock on it deadlocked the whole game. The election fired on
   * schedule at year five, set `this.election`, and `holdsTime()` then returned
   * true forever, because the only thing that clears it is the player clicking
   * a button in a modal — and a standing order deliberately routes dockets
   * away from the player entirely. Every automated run froze on the same tick:
   * money supply dead at $1,681,398 from tick 6000 through 20000, under every
   * ideology, which read exactly like an economy failure and was nothing of
   * the kind.
   *
   * So the sim reports the result and keeps running; the shell decides to
   * stop the clock while the popup is up, which is where a pause belongs. */
  holdsTime() { return !!this.pending; }

  /* Approval is the balance of the organized interests. Rulings move each
   * faction's power; power sets approval; approval decides what the state is
   * permitted to do.
   *
   * Three modelling notes, each from something that measured wrong:
   *
   * 1. A plain average of faction power cannot work. The interests are
   *    near-symmetric by design — capital wants enforcement, labour wants
   *    forgiveness — so they cancel, and approval stayed pinned near 60 no
   *    matter how extreme the player's ideology.
   *
   * 2. Approval must not be a function of how busy the docket is. A player
   *    who enforces every claim liquidates the firms that generate further
   *    claims, so the flow stops, the factions stop reacting, and every
   *    power decayed to zero — reading 100% CONSENSUS in a wasteland with 9
   *    traders and 2 workers left. Legitimacy is a persistent political
   *    fact; it cannot evaporate because the economy died, and a
   *    government that liquidates its own economy is not popular.
   *
   * 3. So power is a *standing* accumulated reaction, decayed slowly and
   *    never faster than the state can plausibly recover, and approval is
   *    driven by the strength of opposition rather than by docket volume. */
  _recomputeApproval() {
    /* Legitimacy is the *weighted balance* of the interests, not a yes/no
     * tally of who is opposed, so the whole 0-100 range is reachable.
     *
     * Weighting note: the military is not a fixed bloc. Its weight rises as
     * the state turns authoritarian and falls as it recovers consent — the
     * army is a tool of government, and it follows whoever is in charge.
     * Without this the enforce coalition carried a permanent structural
     * majority (it has four members to forgiveness's two), so both extremes
     * of player behaviour measured within a few points of each other and
     * always landed near 33%. A sovereign who governs generously must be
     * able to be genuinely and legitimately popular. */
    const authoritarian = clamp(1 - this.approval / 100, 0, 1);
    let balance = 0, cap = 0;
    for (const f of Object.values(FACTIONS)) {
      let w = f.cap;
      /* The military's weight rises as the state turns authoritarian and falls as
     * it recovers consent — the army follows whoever is in charge. The swing
     * is kept modest: at 1.55x it became the single heaviest bloc by a wide
     * margin, so a government that had lost the commons found the army
     * *punishing* it for losing consent, which is a runaway — measured 41.7%
     * approval for ruling generously versus 55.6% for ruling ruthlessly. */
      if (f.id === 'military') w *= 0.55 + 0.75 * authoritarian;
      balance += f.power * w;
      cap += w;
    }
    const mean = cap > 0 ? balance / cap : 0;    // -1 .. +1
    const target = clamp(50 + mean * 50, 0, 100);
    this.approval = lerp(this.approval, target, 0.10);
    this.approval = clamp(this.approval, 0, 100);

    const a = this.approval;
    this.tier = a >= 78 ? 'consensus'
      : a >= 58 ? 'contested'
      : a >= 38 ? 'strained'
      : a >= 18 ? 'authoritarian'
      : 'tyranny';
    return a;
  }

  /* Effective powers of the state. Read by the economy. */
  get authority() { return clamp(1 - this.approval / 100, 0, 1); }

  /* The army's standing. It is the only faction that can hold the street and
   * keep the sovereign in office, so it is the one whose displeasure is
   * dangerous rather merely unpopular. */
  get military() { return FACTIONS.military.power; }
  get elite() { return FACTIONS.elite.power; }

  /* The army suppresses unrest, and while it is loyal it prevents a coup. */
  get protectedFromCoup() { return FACTIONS.military.power > 0.15; }
  get unrestSuppressed() { return FACTIONS.military.power > 0; }

  /* Unrest rises as the commons and labour turn against the state, and it
   * costs the economy directly — output and confidence — until the army puts
   * it down. Ruling without consent is not free even for a tyrant. */
  get unrest() {
    const disaffection = clamp(-(FACTIONS.commons.power * 0.6 + FACTIONS.labour.power * 0.5), 0, 1.3);
    const street = FACTIONS.military.power > 0 ? 0.75 : 1;
    return clamp(disaffection * street, 0, 1);
  }

  get canConscript() { return this.law.draft && this.approval >= DECREES.laborDraft.minApproval; }
  get canCapPrices() { return this.law.ceiling && this.approval >= DECREES.priceCeiling.minApproval; }
  get canSeize() { return this.law.seize && this.approval >= DECREES.seizeStock.minApproval; }
  get strikesBanned() { return this.law.strikes && this.approval >= DECREES.banStrikes.minApproval; }
  get pressControlled() { return this.law.press && this.approval >= DECREES.pressCensorship.minApproval; }
  get martialCredit() { return this.law.martial && this.approval >= DECREES.martialAid.minApproval; }

  /* ---------------- the docket ---------------- */

  /* Bank.act() calls this instead of writing off silently.
   *
   * Claims ACCUMULATE here; they are not presented to the player yet. That
   * distinction is the whole fix.
   *
   * This used to open `pending` the moment a single firm defaulted, which
   * effectively bypassed the court's schedule entirely: a docket was live almost
   * every bank cycle, so the `DOCKET_PERIOD_TICKS` cadence in Simulator.next()
   * had no visible effect. Measured, 183 rulings in 3,800 ticks — one every 21
   * ticks, with the mean docket carrying ~3 claims because several defaults
   * landed in the same cycle. At 8 ticks/second that is a button every two and a
   * half seconds, and an election 1,825 ticks out was genuinely unreachable.
   *
   * Now a default is a note in a file, and the court reads the file when it
   * sits. Nothing is lost: every claim still carries its Account, and a firm
   * that defaults waits to be ruled on rather than escaping the ruling.
   *
   * A standing order (autoRule) is unaffected — sealDocket() still applies it,
   * it just no longer has to interrupt anything to do so. */
  requestWriteOff(acct, trader) {
    const amount = Math.round(acct.debt);
    if (!(amount > 0)) return;

    if (!this._file) {
      this._file = {
        id: ++docketSeq,
        tick: this.sim.tickCount,
        claims: [],
        total: 0,
        banks: Math.round(this.sim.bankSum()),
      };
    }
    this._file.total += amount;
    this._file.claims.push({
      acct,                      // kept so the ruling can actually be applied
      amount,
      type: acct.taxCode,
      industry: trader ? trader.comType : null,
      traderId: trader ? trader.id : 'UNKNOWN',
      balance: Math.round(acct.balance),
      // share of the obligation the firm could actually have met
      coverage: acct.balance + acct.debt > 0
        ? clamp(acct.balance / (acct.balance + acct.debt), 0, 1) : 0,
      saved: this._describe(acct, trader),
    });
    this._file.count = (this._file.count || 0) + 1;
  }

  /* The court sits. Move the accumulated claims into `pending` and settle them.
   *
   * Called from Simulator.next() on the DOCKET_PERIOD_TICKS cadence, not on
   * every bank cycle — see the note on requestWriteOff for why that matters.
   * Anything already pending is left alone so an unread case is never replaced
   * by a newer one (the same rule _electionCycle follows). */
  sealDocket() {
    if (this.pending) return null;                 // a case is already open
    const file = this._file;
    this._file = null;
    if (!file || !file.claims.length) return null; // nothing to rule on

    this.pending = file;
    const d = this.pending;
    d.total = d.claims.reduce((s, c) => s + c.amount, 0);
    d.industry = this._dominantIndustry(d.claims);
    d.shareOfSupply = d.banks > 0 ? d.total / d.banks : 0;

    // rank: the largest claims are the ones a sovereign actually rules on
    d.claims.sort((a, b) => b.amount - a.amount);
    d.largest = d.claims.slice(0, 3);
    d.docketTotal = d.count;

    /* Auto-rule routine claims so only the consequential ones reach the player.
     *
     * NB: the standing order is a STRING ('forgive' | 'enforce' | 'bailout') and
     * must be converted to a boolean here. Passing it straight through is a
     * silent disaster: 'enforce' is a truthy string, so a player who had chosen
     * to liquidate defaulters got forgiveness instead — every default forgiven,
     * insolvencyHits stuck at 0, and approval climbing to 100 no matter what
     * the player's actual ideology was. Both rulings looked identical.
     *
     * forcedForgive overrides the standing order for a while: that is the
     * survival instinct in _stabilize() overriding an unsustainable policy. */
    if (this.forcedForgive > 0) {
      this.forcedForgive--;
      this._applyRuling(d, true, d.claims.length, true);
      this.claimsAuto += d.claims.length;
      this.pending = null;
      return null;
    }
    if (this.autoRule) {
      if (this.autoRule === 'bailout') {
        const credit = this.sim.credit;
        const res = credit ? credit.settleDocket({ ...d }) : { ok: false };
        if (res.ok) {
          this.claimsRuled += d.claims.length;
          this.claimsAuto += d.claims.length;
          d.autoRuled = 'bailout';
          this._push('BAILED OUT',
            `${d.claims.length} firm${d.claims.length === 1 ? '' : 's'} kept trading · `
            + `${money(res.amount)} now sovereign debt`, 'warn');
          this._creditFactions(res);
          this._disciplineUpdate(d.total, 0.5);
          this._crisisTicks = Math.max(0, this._crisisTicks - 60);
          this.pending = null;
          return null;
        }
        /* No credit left: fall through to enforcement, which is the only
         * ruling that does not need anyone to agree to lend. */
        this._push('BANKRUPTCY', 'No foreign credit available. The claims are enforced.', 'bad');
        this._applyRuling(d, false, d.claims.length, true);
        this.claimsAuto += d.claims.length;
        this.pending = null;
        return null;
      }
      const forgive = this.autoRule === 'forgive';
      this._applyRuling(d, forgive, d.claims.length, true);
      this.claimsAuto += d.claims.length;
      d.autoRuled = this.autoRule;
      this.pending = null;
      return null;
    }
    return d;
  }

  /* Player ruling. forgive=true absorbs, false enforces. */
  rule(forgive) {
    const d = this.pending;
    if (!d) return null;
    this._applyRuling(d, forgive, d.claims.length, false);
    this.pending = null;
    return d;
  }

  /* The third option.
   *
   * A bailout is the only ruling with no losers, and that is exactly why it
   * must be paid for somewhere nobody is looking. The mechanism is not a
   * penalty — it is the debt itself: the docket's claims are settled with
   * newly created currency and the sovereign cannot default, so the bill comes
   * due forever as money that had to be printed to pay it.
   *
   * What that does to the state is not a number subtracted from a bar, it is
   * four distinct things, each of which the player can watch:
   *
   *   - every faction is pleased, because nobody is forgiven-with-nothing and
   *     nobody is liquidated, and the creditors are actually paid
   *   - credit discipline rots, because lenders learn no claim is ever lost
   *   - the sovereign's capacity to respond to the NEXT crisis is gone,
   *     because this one is still on the books
   *   - and the price level rises, because the money is real and goods are
   *     not, and that is the only part of the cost that reaches the voter
   */
  ruleBailout(lenderId) {
    const d = this.pending;
    if (!d) return null;
    const credit = this.sim.credit;
    if (!credit) { this.rule(true); return d; }

    const res = credit.settleDocket({ ...d, lenderId });
    if (!res.ok) {
      /* No foreign credit left. The court falls back to the only ruling that
       * is always available, rather than silently doing nothing — a docket
       * cannot be left undecided. */
      this._push('BANKRUPTCY', `${res.reason} The claim was absorbed instead.`, 'warn');
      this._applyRuling(d, true, d.claims.length, false);
      this.pending = null;
      return d;
    }

    this.claimsRuled += d.claims.length;
    this._push('BAILED OUT',
      `${d.claims.length} firm${d.claims.length === 1 ? '' : 's'} kept trading · `
      + `${money(res.amount)} now sovereign debt · ${money(d.total)} settled`,
      'warn');

    this._creditFactions(res);
    this._disciplineUpdate(d.total, 0.5);

    /* Bailouts shrink the docket rather than feed it: the firms that were
     * bailed out are current. That is a genuine benefit and it is also why
     * this strategy looks so attractive — the crisis flow stops while the
     * printing continues. */
    this._crisisTicks = Math.max(0, this._crisisTicks - 60);

    this.pending = null;
    return d;
  }

  /* Bailout reactions. Every faction gains, because every faction's preferred
   * outcome is a going concern with its debts paid: labour and the commons
   * keep their firms and their jobs, the banks get paid in full, the houses
   * are untouched, industry keeps producing, the army has nothing to shoot
   * and the reformers have applied the same law to everybody.
   *
   * This is the deliberate design of the third option, and it is why it is
   * the most dangerous button in the game. There is no faction to please by
   * ruling on it, so there is no political cost to pressing it — only the
   * bill, which arrives as inflation long after the popularity has been
   * spent. A sovereign who bails out everything reaches higher approval than
   * one who enforces everything, and still loses the country by the second
   * election.
   *
   * The gain is deliberately modest per ruling. It would be wrong to make it
   * large: an interest that is pleased because the state is printing into
   * inflation is not genuinely pleased, it is distracted, and the gauge cannot
   * tell the difference for a while. */
  _creditFactions(res) {
    const scale = clamp(0.8 + (res.amount / Math.max(1, this.sim.bankSum())) * 5, 0.8, 2.6);
    for (const f of Object.values(FACTIONS)) {
      const next = clamp(f.power + f.cap * 0.075 * scale, -1, 1);
      /* Same soft knee as every other ruling, so a faction that has been
       * bailed out repeatedly records diminishing rather than infinite
       * gratitude — see _applyRuling for why the hard clamp was removed. */
      if (Math.abs(next) > 0.85) {
        const over = Math.abs(next) - 0.85;
        f.power = Math.sign(next) * (0.85 + over * 0.15);
      } else {
        f.power = next;
      }
    }
    this._recomputeApproval();
  }

  /* Update the rolling credit-standards reading. `weight` is how much of the
   * ruling the debtor actually bore: 1 enforced, 0.5 bailed, 0 forgiven.
   *
   * The window is a fixed number of recent RULINGS, not a fraction of the
   * money supply. The original formulation waited until 5% of total currency
   * had passed through the court, which sounds self-scaling and is not: once
   * the supply is in the hundreds of millions, 5% of it is never reached by a
   * docket stream that only ever moves a few tens of thousands at a time, so
   * the reading sat at zero forever and lenders never saw the sovereign's
   * standards change at all. Measured: discipline 0.00 after 74 bailouts and
   * $30,930 of relief. Counting rulings makes it settle as soon as a policy
   * does, which is the entire reason for having it. */
  _disciplineUpdate(total, weight) {
    const w = this._discWindow || (this._discWindow = []);
    w.push({ amount: total, weight });
    if (w.length > 24) w.shift();
    let num = 0, den = 0;
    for (const r of w) { num += r.amount * r.weight; den += r.amount; }
    this.discipline = den > 0 ? num / den : 0;
  }

  _applyRuling(d, forgive, n, auto) {
    const total = d.total;

    /* Apply the ruling to every claimant. This is what makes the choice
     * mechanical rather than cosmetic: forgiving keeps these traders alive
     * and solvent, enforcing seizes their assets and kills them. */
    let died = 0;
    for (const c of d.claims) {
      const acct = c.acct;
      if (!acct || acct.debt <= 0) continue;
      const before = acct.debt;
      this.sim.bank.writeOff(acct, forgive);
      if (forgive) {
        this.forgivenTotal += before;
      } else if (acct.owner && acct.owner.isDead) {
        died++;
        this.enforcedTotal += before;
      } else {
        this.enforcedTotal += before;
      }
    }

    this.claimsRuled += n;
    /* Rolling enforcement rate. This is the state's monetary stance: an
     * enforced claim is extinguished and never returns to circulation, so a
     * high rate means tight money, firm prices and credit that lenders trust.
     * Tracked as a ratio over a window rather than a running total so it
     * settles as soon as a policy does. */
    this._disciplineUpdate(total, forgive ? 0 : 1);

    this._push(forgive ? 'FORGIVEN' : 'ENFORCED',
      forgive
        ? `${n} claim${n === 1 ? '' : 's'} absorbed · ${money(total)}${auto ? ' · standing order' : ''}`
        : `${n} default${n === 1 ? '' : 's'} · ${money(total)}${died ? ` · ${died} firm${died === 1 ? '' : 's'} liquidated` : ''}${auto ? ' · standing order' : ''}`,
      forgive ? 'good' : 'bad');

    /* Interest groups react; this is where approval actually comes from.
     *
     * Each group moves toward its own ideal ruling when the sovereign agrees
     * with it, and AWAY when the sovereign repeatedly does the opposite.
     * Opposition is weighted more heavily than agreement: an interest that
     * just watched its members liquidated does not forgive and forget, it
     * organizes. That asymmetry is what carries the country to an endpoint
     * instead of parking near the middle.
     *
     * Arithmetic note: `strength` is a magnitude and `support` the sign.
     * An earlier version folded the sign into a scaled magnitude and the
     * result was inverted — always forgiving drove approval DOWN to tyranny,
     * because the sign was applied to the wrong term. Always forgive must
     * please labour and the commons; always enforce must please banks and
     * industry. */
    const kind = d.industry;

    /* Magnitude of the reaction.
     *
     * It must NOT depend only on the size of this docket. Enforcement
     * liquidates the firms that would otherwise generate further claims, so
     * a ruthless sovereign faces ever fewer dockets and the political state
     * stops responding — measured: 3272 claims ruled under forgiveness but
     * only 93 under enforcement, leaving approval at 43% versus 59% and
     * with the wrong sign on every faction. The state would be judged by
     * how busy the court was, which is exactly backwards.
     *
     * So each ruling carries a floor of its own: the sovereign's standing is
     * driven by the *consistency* of what it decides, weighted by the scale
     * of what is at stake, not by the accident of how many debtors survived
     * to appeal. */
    const scale = Math.min(3, 0.9 + (total / Math.max(1, d.banks)) * 6);
    for (const f of Object.values(FACTIONS)) {
      const prefersForgive = f.forgive > 0;
      const support = forgive ? (prefersForgive ? 1 : -1)
                              : (prefersForgive ? -1 : 1);
      // an interest whose own industry is named on the docket cares more
      const emphasis = (kind != null && SECTOR_OWNER[kind] === f.id) ? 1.30 : 1;
      const w = f.cap * 0.11 * scale * emphasis * (support > 0 ? 1 : -1.20);

      /* Soft knee past 0.85. A hard clamp saturates every faction at +-1
       * within a few thousand rulings (measured: all six pinned at 1.00) and
       * the political state then records nothing new. */
      const next = clamp(f.power + w, -1, 1);
      if (Math.abs(next) > 0.85) {
        const over = Math.abs(next) - 0.85;
        f.power = Math.sign(next) * (0.85 + over * 0.15);
      } else {
        f.power = next;
      }
    }
    this._recomputeApproval();
  }

  /* ---------------- social mobility ----------------
 *
 * The middle class is the only route to a great house. That is the whole
 * point of having one: enforcement is survivable for a firm with plant and
 * stock, so a working producer who accumulates capital under a healthy economy
 * can found a house, and the elite class grows from below rather than being
 * fixed at whatever number was seeded at t=0.
 *
 * Movement is sticky in both directions, and unevenly so. Promotion needs
 * wealth AND conditions — a firm cannot found a house in a depression, however
 * rich it is, because there is no confidence to spend on one. Demotion is
 * rarer and needs bad conditions to strip a house of its standing. Both are
 * probabilistic per review, and reviews are infrequent, so class composition
 * moves over thousands of ticks rather than jittering.
 */
  _mobility(sim) {
    if (++this._mobTick < MOBILITY_EVERY) return;
    this._mobTick = 0;

    const c = this.cfg;
    const healthy = this.approval >= 45 && this.confidenceOK()
      && (sim.macro.gapShow ?? 0) > -0.05 && this.unrest < 0.4;
    const bad = this.approval < 45 || (sim.macro.gapShow ?? 0) < -0.12 || this.unrest > 0.5;

    /* The middle class must never be spent down to nothing.
     *
     * A promotion REMOVES a firm from the middle class and creates a house, so
     * an unguarded pathway is a one-way ratchet: the middle class empties and
     * upward mobility stops permanently because there is nobody left to
     * promote. Measured — all five initial producers founded houses within
     * 20k ticks and the class hit zero in a perfectly healthy economy.
     *
     * The guard is an ABSOLUTE floor, not a fraction of the current total. A
     * proportional floor ratchets downward for the same reason the ungated
     * version did: it is always measured against a number that promotion has
     * already shrunk, so it slides to the minimum regardless of how many
     * firms there are. A fixed reserve keeps the ladder standing. */
    const MIDDLE_FLOOR = 6;
    let middles = 0;
    for (const t of sim.directory.all) {
      if (!t.isDead && t.id !== 'MASTER' && t.socialClass === 'middle') middles++;
    }
    let promotable = Math.max(0, middles - MIDDLE_FLOOR);

    for (const t of sim.directory.all) {
      if (t.isDead || t.id === 'MASTER') continue;
      const wealth = t.account.balance;

      if (t.isElite) {
        // a house that has been bled dry loses its standing
        if (bad && wealth < (c.DEMOTE_WEALTH || 120000)
            && Math.random() < (c.DEMOTE_CHANCE || 0.008)) {
          t.isElite = false;
          t.socialClass = 'middle';
          t.eliteHouse = null;
          FACTIONS.elite.power = clamp(FACTIONS.elite.power - 0.18, -1, 1);
          this._push('CLASS', `${t.id} has lost its charter. The firm is middle class again.`, 'warn');
        }
        continue;
      }

      if (t.socialClass !== 'middle' || promotable <= 0) continue;

      if (healthy && wealth > (c.PROMOTE_WEALTH || 1200000)
          && Math.random() < (c.PROMOTE_CHANCE || 0.02)) {
        this.foundHouse(t);
        promotable--;
      }
    }
  }

  /* Promote a middle-class firm to a great house. The house is given a
   * reserve it can survive anything with, which is what founding one means. */
  foundHouse(t) {
    t.isElite = true;
    t.socialClass = 'elite';
    t.eliteHouse = HOUSE_NAMES[(this._houseSeq = (this._houseSeq || 0) + 1)
      % HOUSE_NAMES.length];
    t.account.create(this.cfg.ELITE_CASH || this.cfg.INIT_CASH * 400);
    t.isStocked = t.com.length > 0;
    FACTIONS.elite.power = clamp(FACTIONS.elite.power + 0.10, -1, 1);
    this.housesFounded = (this.housesFounded || 0) + 1;
    this._push('CLASS', `${t.eliteHouse} is founded from ${t.id}.`, 'good');
  }

  confidenceOK() {
    const c = this.sim && this.sim.macro;
    return !c || c.confidenceShow >= 0.6;
  }

  /* A coup. Severe, legible, and survivable — see the note in tick().
   *
   * The army cannot remove the sovereign, but it can make the sovereign
   * govern on its terms: the treasury is skimmed, the emergency decrees are
   * forced through regardless of consent, and the great houses profit from
   * the confusion. The state survives; its finances and its autonomy do not. */
  _coup() {
    const army = FACTIONS.military;
    this.coups = (this.coups || 0) + 1;
    this.approval = clamp(this.approval - 6, 0, 100);

    // the army extorts a levy, and it ends up where such money always does
    const crown = this.sim.bank.master;
    const levy = Math.min(Math.max(0, crown.balance) * 0.5,
      Math.floor(BankStats.totalCurrency * 0.01));
    if (levy > 0) {
      crown.__edit(-levy);
      let each = levy / 55;
      for (const t of this.sim.directory.getListFromType(ComType.LABOR)) {
        if (t.id === 'MASTER') continue;
        t.account.__edit(each);
      }
    }

    // decrees imposed from above, ignoring the consent thresholds
    for (const k of ['martial', 'press']) if (!this.law[k]) this.law[k] = true;

    army.power = clamp(army.power + 0.45, -1, 1);
    FACTIONS.elite.power = clamp(FACTIONS.elite.power + 0.25, -1, 1);
    this._recomputeApproval();

    this._push('COUP', 'The army has taken the palace. The sovereign remains, '
      + 'and considerably poorer for it.', 'bad');
  }

  /* ---------------- decrees ---------------- */

  availableDecrees() {
    return Object.values(DECREES).map(d => ({
      ...d,
      active: this.law[d.id],
      available: this.approval >= d.minApproval,
    }));
  }

  toggleDecree(id) {
    const d = DECREES[id];
    if (!d) return false;
    if (!this.law[id]) {
      if (this.approval < d.minApproval) return false;
      this.law[id] = true;
      this._push('DECREE', `${d.name} enacted`, 'warn');
    } else {
      this.law[id] = false;
      this._push('DECREE', `${d.name} repealed`, 'info');
    }
    return true;
  }

  /* Maintenance: decrees sap approval continuously. This is the mechanism
   * that makes authoritarianism self-defeating rather than a stable end state
   * — you cannot simply hold the country down and keep it whole. */
  tick() {
    if (this.pending) return;   // don't move approval while a ruling is open
    this._mobility(this.sim);
    let drain = 0;
    for (const d of Object.values(DECREES)) if (this.law[d.id]) drain += d.cost;
    if (drain > 0) {
      for (const f of Object.values(FACTIONS)) {
        // the regime sows resentment most among those with the least power
        const weakness = 1 - Math.abs(f.power);
        f.power = clamp(f.power - (drain / 1000) * weakness * (f.forgive > 0 ? 1.4 : 0.6),
                        -1, 1);
      }
      this._recomputeApproval();
      this._drainAcc = (this._drainAcc || 0) + drain;
      if (this._drainAcc >= 8) { this._drainAcc = 0; this._push('UNREST', 'The country is quietly seething.', 'bad'); }
    }
    /* Standing power decays very slowly toward zero — politics has inertia.
     * A fast decay was measured destroying the whole model: with a
     * 0.010/tick pull the interests were flat again within a few thousand
     * ticks, so the political state carried no information about the
     * player's actual record of rulings. */
    for (const f of Object.values(FACTIONS)) {
      f.power = clamp(f.power * 0.99995, -1, 1);
    }
    this._recomputeApproval();

    /* Survival instinct. A state that is visibly killing its own economy
     * cannot afford to keep killing it: enforcement taken to the extreme
     * drove the workforce to 1 trader in testing, because nothing in the
     * model intervened on the government's behalf. This is the political
     * floor — the regime quietly stops enforcing and starts absorbing long
     * before it would otherwise collapse.
     *
     * It is deliberately not forgiveness. The state relents on the narrowest
     * terms, buys its way back, and keeps its posture; approval still erodes
     * and the decrees are still available. The player is never deposed and
     * never loses — a state under siege consolidates rather than dying. */
    /* Only a genuine collapse counts. An earlier version tested labor below 30%
     * of capacity, which the economy passes through routinely during the
     * early ramp (labor spawns gradually from its seeded 20), so the state
     * declared an emergency and forgave debts on a perfectly healthy economy
     * — which erased the difference between the two ideologies entirely. */
    const lab = this.sim.laborCount();
    // no population ceiling: distress is measured against the peak the economy
    // has actually reached, not a config number
    const peak = Math.max(1, this.sim.observedLaborPeak || 1);
    const distressed = lab / peak < 0.18 || this.sim.directory.getCount() < 14;

    /* Coups.
     *
     * The army is the arbiter, so a sovereign who alienates it is governing
     * on borrowed time. A coup is a real event with severe consequences — the
     * treasury is seized, decrees are forced on, and the great houses take
     * their cut — but the sovereign is never actually removed. The design
     * contract is that office is unconditional and everything else is
     * conditional: you can be humiliated, bankrupted and buried in decrees,
     * and you can never be deposed. That keeps a failed coup a legible
     * punishment rather than a game over.
     *
     * Loyalty buys immunity: while the army stands with the government there
     * is no coup at all, which is what makes winning its favour the single
     * most valuable thing a ruler can do. */
    const army = FACTIONS.military.power;
    if (army < -0.35 && this.approval < 45 && !this.coupPending) {
      this._coupPressure = (this._coupPressure || 0) + 1;
      const threshold = army < -0.75 ? 900 : 2600;
      if (this._coupPressure > threshold) {
        this._coupPressure = 0;
        this._coup();
      }
    } else {
      this._coupPressure = Math.max(0, (this._coupPressure || 0) - 4);
    }

    if (distressed) {
      if (++this._crisisTicks > 200) {
        this._crisisTicks = 0;
        /* Force the next docket to be forgiven, and buy a little peace — but
         * only a little, and on a cooldown. An earlier version ran this every
         * 120 ticks and multiplied the opposition back by 0.86 each time,
         * which pinned approval at tyranny and made forgiveness and
         * enforcement produce identical outcomes: the intervention had become
         * the policy. The state must relieve the economy without being able
         * to legislate its way out of having caused it. */
        this.forcedForgive = Math.max(this.forcedForgive || 0, 220);
        for (const f of Object.values(FACTIONS)) {
          if (f.power < 0) f.power = clamp(f.power + 0.10, -1, 1);
        }
        this._recomputeApproval();
        this._push('STATE', 'Emergency relief declared under martial authority.', 'warn');
      }
    } else {
      this._crisisTicks = Math.max(0, this._crisisTicks - 2);
    }

    this._electionCycle();
  }

  /* ---------------- elections ----------------
   *
   * Every five years the country returns a verdict, and the verdict is a
   * popup rather than a death: the office is unconditional in this game, so
   * the most that can happen to a ruler is to be told, in public, with
   * numbers attached, that the country has stopped believing the state is
   * solvent or honest.
   *
   * That is why the button is always there. A sovereign who fails the vote is
   * offered "Keep Ruling Anyway", and may take it, and will keep the office
   * exactly as before — the army does not remove them and the voters do not.
   * What changes is the country: a defiance is read correctly by everyone,
   * so the democratic interests turn sharply against the state, the street
   * answers, and the next docket comes sooner and harder. Being allowed to
   * stay is a punishment, not a reprieve.
   *
   * The measure is approval, but approval alone is too forgiving — a
   * sovereign can be popular and insolvent at the same time, and that is
   * precisely the failure mode of the bailout strategy. So the electorate
   * also prices what it can actually see: credit discipline, and the price
   * of bread. A government that has bought the country off repeatedly and
   * is now paying for it in the cost of living loses, even at 70% approval,
   * and that is the whole reason the third option is not a winning machine.
   */
  _electionCycle() {
    const credit = this.sim.credit;
    if (!credit) return;
    /* An unread result must never be overwritten by the next one. */
    if (this.election && !this.election.responded) return;
    const year = credit.year;
    if (year < this._nextElectionYear) return;

    this._nextElectionYear = year + (this.cfg.ELECTION_TERM_YEARS || 5);

    const threshold = this.cfg.DEMOCRATIC_THRESHOLD || 50;
    const approval = this.approval;
    const infl = Math.abs(this.sim.macro.inflationTrend);
    const disc = clamp(this.discipline, 0, 1);

    /* Bread and credit. Both are things a voter eats and things a voter
     * borrows, and both are weighted so that neither can be ignored in favour
     * of approval: at 90% approval with runaway prices and no discipline, the
     * government still loses. */
    const pricePenalty = clamp(infl * 1.6, 0, 30);
    const creditPenalty = clamp((0.55 - disc) * 70, 0, 22);
    const effective = clamp(approval - pricePenalty - creditPenalty, 0, 100);
    const passed = effective >= threshold;

    /* Seats. The same cap-weighted balance that drives approval drives the
     * chamber, so the numbers on screen and the gauge can never disagree. */
    let total = 0;
    const seats = [];
    for (const f of Object.values(FACTIONS)) {
      const w = f.cap * (0.55 + 0.45 * (0.5 + f.power / 2));
      total += w;
      seats.push({ id: f.id, name: f.name, short: f.short, color: f.color, weight: w });
    }
    const totalSeats = 200;
    let assigned = 0;
    for (const s of seats) {
      s.vote = total > 0 ? s.weight / total : 0;
      s.seats = Math.floor(s.vote * totalSeats);
      assigned += s.seats;
    }
    /* Largest-remainder so the chamber adds up exactly. */
    const rema = seats.length;
    let i = 0;
    while (assigned < totalSeats && i < rema * 4) {
      seats[i % seats.length].seats++;
      assigned++;
      i++;
    }
    const bloc = seats.filter(s => s.id === 'military' || s.id === 'elite' || s.id === 'banks'
      || s.id === 'industry' || s.id === 'reform')
      .reduce((a, s) => a + s.seats, 0);

    this.election = {
      year,
      term: this.termsHeld + 1,
      approval,
      effective,
      threshold,
      passed,
      inflation: infl,
      discipline: disc,
      pricePenalty,
      creditPenalty,
      seats,
      bloc,
      responded: false,
      defiant: false,
      debt: credit ? credit.totalDebt() : 0,
      monetized: credit ? credit.monetized : 0,
      bailed: credit ? credit.bailedTotal : 0,
      verdict: passed
        ? (effective >= threshold + 22 ? 'LANDSLIDE' : 'RETURNED')
        : 'NO CONFIDENCE',
    };
    this._push('ELECTION',
      passed ? `Year ${year}: returned with ${effective.toFixed(0)}% of the vote.`
             : `Year ${year}: no confidence. ${effective.toFixed(0)}% against ${threshold}%.`,
      passed ? 'good' : 'bad');
  }

  /* The player's answer to the result.
   *
   * `defiant` is only meaningful when the vote failed, but the button is
   * offered either way: a ruler who has just won a landslide may still choose
   * to rule without the mandate, and the country notices. */
  answerElection(defiant) {
    const e = this.election;
    if (!e || e.responded) return null;
    e.responded = true;
    e.defiant = !!defiant && !e.passed;
    this.electionHistory.push({
      year: e.year, effective: e.effective, approval: e.approval,
      passed: e.passed, verdict: e.verdict, defiant: e.defiant,
      inflation: e.inflation, discipline: e.discipline,
    });
    this.lastElection = e;
    this.election = null;

    if (e.passed && !defiant) {
      this.termsHeld++;
      /* A real mandate consolidates: the state breathes, and the country
       * gives it a little more room before the next test. */
      for (const f of Object.values(FACTIONS)) f.power = clamp(f.power * 0.90, -1, 1);
      this._recomputeApproval();
      this._push('ELECTION', `The mandate is accepted. Term ${this.termsHeld} begins.`, 'good');
      return e;
    }

    this.termsHeld++;
    if (defiant) {
      this.defianceCount++;
      /* Nobody throws the sovereign out. The country simply stops pretending.
       *
       * The democratic interests turn hardest, because defiance is the one
       * act that insults all of them at once — the unions, the commons and
       * the reformers are all, in different ways, asking for the ordinary
       * thing, which is that the ruler obey a result. The army is unmoved:
       * it is holding the office, and the office is exactly what the player
       * was promised would never be taken. */
      const struck = ['commons', 'labour', 'reform', 'banks', 'industry'];
      for (const id of struck) {
        const f = FACTIONS[id];
        if (f) f.power = clamp(f.power - 0.42, -1, 1);
      }
      this._recomputeApproval();
      this._coupPressure = (this._coupPressure || 0) + 900;
      this._crisisTicks = Math.max(this._crisisTicks || 0, 240);
      this._push('ELECTION',
        'The sovereign rules on regardless. The chamber is dissolved and the '
        + 'street learns what the mandate was worth.', 'bad');
    } else {
      for (const f of Object.values(FACTIONS)) f.power = clamp(f.power - 0.14, -1, 1);
      this._recomputeApproval();
      this._push('ELECTION',
        'The result stands. The sovereign remains, without the country\'s '
        + 'consent behind them.', 'warn');
    }
    return e;
  }

  /* ---------------- presentation ---------------- */

  _describe(acct, trader) {
    const rand = this._rand;
    const root = pick(FIRM_ROOTS, rand);
    const kind = pick(CLAIM_KINDS, rand);
    const ind = trader ? trader.comType : ComType.LABOR;
    const sector = label(ind);
    return {
      name: `${root} ${sector}`,
      verb: kind.verb,
      label: sector,
      note: INDUSTRY_NOTE[ind] || '',
    };
  }

  _dominantIndustry(claims) {
    const tally = {};
    let best = null, bestN = 0;
    for (const c of claims) {
      const k = c.industry ?? -1;
      tally[k] = (tally[k] || 0) + 1;
      if (tally[k] > bestN) { bestN = tally[k]; best = k; }
    }
    return best;
  }

  _push(head, body, tone) {
    this.log.unshift({ head, body, tone, tick: this.sim.tickCount });
    if (this.log.length > 60) this.log.pop();
  }

  /* The great houses, as they currently stand. */
  _eliteHouses() {
    if (!this.sim || !this.sim.directory) return [];
    return this.sim.directory.all
      .filter(t => t.isElite)
      .map(t => ({
        name: t.eliteHouse || t.id,
        industry: t.comType,
        wealth: Math.round(t.account.balance),
        stock: t.com.length,
        hits: t.eliteHits || 0,
        alive: !t.isDead,
      }));
  }

  describe() {
    return {
      approval: this.approval,
      tier: this.tier,
      authority: this.authority,
      pending: this.pending ? {
        ...this.pending,
        industryLabel: label(this.pending.industry),
        note: INDUSTRY_NOTE[this.pending.industry] || '',
        largest: this.pending.largest.map(c => ({
          ...c,
          saved: c.saved,
          industryLabel: label(c.industry),
        })),
      } : null,
      autoRule: this.autoRule,
      decrees: this.availableDecrees(),
      factions: Object.values(FACTIONS).map(f => ({
        id: f.id, name: f.name, short: f.short, color: f.color,
        creed: f.creed, power: f.power,
        cap: f.cap, powerPct: clamp(f.power * 50 + 50, 0, 100),
      })),
      writeOffs: BankStats.writeOffs || 0,
      insolvencies: BankStats.insolvencyHits || 0,
      // security & monetary stance
      military: FACTIONS.military.power,
      elite: FACTIONS.elite.power,
      unrest: this.unrest,
      discipline: this.discipline,
      coupProtected: this.protectedFromCoup,
      coups: this.coups || 0,
      eliteHouses: this._eliteHouses(),
      forgivenTotal: this.forgivenTotal,
      enforcedTotal: this.enforcedTotal,
      claimsRuled: this.claimsRuled,
      claimsAuto: this.claimsAuto,
      log: this.log.slice(0, 12),

      /* elections */
      election: this.election,
      lastElection: this.lastElection,
      electionHistory: this.electionHistory.slice(),
      termsHeld: this.termsHeld,
      defianceCount: this.defianceCount,
      nextElectionYear: this._nextElectionYear,
      year: this.sim.credit ? this.sim.credit.year : 0,
    };
  }
}