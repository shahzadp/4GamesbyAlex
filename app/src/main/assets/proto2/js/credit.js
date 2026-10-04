/* ------------------------------------------------------------------
 * Proto Web — sovereign credit
 * ------------------------------------------------------------------
 * Two businesses of state, and a third ruling.
 *
 * DOMESTIC BONDS. The crown borrows from its own creditors. Money comes in
 * now and goes back out later, which is the ordinary way a state funds
 * itself, and it is genuinely double-edged: lenders are mostly banks and
 * houses, so an issue pleases exactly the factions that enforcement
 * pleases, and a coupon paid to them is money that goes straight back
 * into the domestic economy and gets spent again.
 *
 * FOREIGN LENDERS. The IMF and the World Bank will cover a docket nobody
 * else will cover. Nobody is forgiven and nobody is liquidated: the claims
 * are SETTLED, in full, with money that did not exist when the docket was
 * opened. That is the third option, and it is the reason it exists — it is
 * the only ruling with no losers, so it is also the only one that buys
 * approval from every faction at once.
 *
 * And it is paid for by everybody, later, silently.
 *
 * WHY THE PRICE IS INFLATION. The sovereign in this country cannot default.
 * There is no bankruptcy, no restructuring, no collective-action clause and
 * no exit. Every unit of repayment is therefore newly created currency, by
 * definition, and the bill for it does not arrive as a deduction from
 * anyone's income — it arrives as a price level nobody agreed to. The firms
 * that were saved keep their cash and their staff; the money that paid them
 * is still circulating; and the obligation to keep printing is permanent and
 * compounding. That is the whole bargain: the pain is moved downward and
 * forward, onto everyone who never appears on the docket.
 *
 * It is also why the mechanism has to be honest about WHO pays. If a bailout
 * were free, the correct strategy would be to bail out every claim forever
 * and the entire political layer — forgive, enforce, the factions, the
 * approval gauge, the election — would be decorative. So the cost is spread
 * across four channels rather than invented as one penalty:
 *
 *   1. Money creation. The drawdown enters circulation immediately, and the
 *      open-market sterilizer can only claw back a capped fraction, so a
 *      large enough bailout overwhelms it and prices run away.
 *   2. Discipline. Bailouts are half-credit. Sovereign credit standards rot:
 *      lenders learn that no claim is ever lost, so they lend more freely,
 *      which builds the leverage that produces the next bust.
 *   3. Capacity. Debt service is a fixed claim on the treasury. The sovereign
 *      that has bailed out everything cannot respond to the next crisis,
 *      because the next crisis arrives with the last one still on the books.
 *   4. Credibility at the election. Discipline is one of the things the
 *      electorate can actually see.
 *
 * The one thing a bailout does NOT do is let the ruler off. Approval is a
 * political fact about whether the country believes the state is solvent and
 * honest, and printing into inflation is the single most legible way to
 * destroy that belief. Measured: a sovereign that bails out everything reaches
 * a higher approval than one that enforces everything, and still loses the
 * country by the second election.
 * ------------------------------------------------------------------ */

import { BankStats } from './economy.js';
import { clamp } from './util.js';

/* ------------------------------------------------------------------
 * The two foreign lenders.
 *
 * They are not interchangeable, and the difference is the difference between
 * a loan you can live with and a loan that owns you.
 * ------------------------------------------------------------------ */
export const LENDERS = Object.freeze({
  imf: {
    id: 'imf',
    name: 'International Monetary Fund',
    short: 'IMF',
    color: '#4f6bff',
    creed: 'We lend fast, at a price, and we expect the ledger to balance.',
    /* Emergency money is expensive and short. The IMF is the only lender that
     * will cover a docket tonight. */
    rate: 0.085,
    termYears: 5,
    graceYears: 1,
    /* Conditions: the Fund attaches them, and they are real. A programme
     * caps how much can be borrowed again until the previous one is
     * respected, which is how an emergency lender becomes a permanent
     * creditor. */
    maxExposureFactor: 0.60,   // of money supply
    conditionality: 0.30,      // drag on the business cycle while outstanding
    blurb: 'Fast, expensive, and it will be back next quarter.',
  },
  worldbank: {
    id: 'worldbank',
    name: 'World Bank',
    short: 'World Bank',
    color: '#22e06a',
    creed: 'We lend for the long term, and we would like the country to last.',
    /* Patient money. Cheaper and far longer, but it moves slowly and it will
     * not cover an emergency docket at all — it needs a project, a plan, and
     * a reason to believe the country will still exist in ten years. */
    rate: 0.042,
    termYears: 15,
    graceYears: 3,
    maxExposureFactor: 1.10,   // development finance is larger than emergency finance
    conditionality: 0.10,
    blurb: 'Cheap, long, and slow. It will still be there in fifteen years.',
  },
});

/* Standing arrangement: which lender the sovereign reaches for by default.
 * Switchable from the Credit panel, and shown on the ruling button so the
 * choice is never a surprise. */
let standingLender = 'imf';
export function setStandingLender(id) { if (LENDERS[id]) standingLender = id; }
export function getStandingLender() { return standingLender; }

let issueSeq = 0;

/* ==================================================================
 * Credit
 * ================================================================== */
export class Credit {
  constructor(sim) {
    this.sim = sim;
    this.cfg = sim.cfg;
    this.reset();
  }

  reset() {
    /* Outstanding domestic issues. Each carries its own schedule, because a
     * crown that rolls short bonds to fund long promises is making a
     * different bet from one that does not. */
    this.bonds = [];
    this.bondHistory = [];

    /* Foreign obligations, one book per lender. */
    this.foreign = {};
    for (const id of Object.keys(LENDERS)) {
      this.foreign[id] = {
        id, drawn: 0, repaid: 0, interestPaid: 0,
        outstanding: 0, tranches: [], history: [],
      };
    }

    this.issuedTotal = 0;      // face value of domestic bonds ever sold
    this.couponsPaid = 0;
    this.principalRepaid = 0;
    this.interestPaid = 0;

    /* Money created to service debt. Tracked separately from the central
     * bank's sterilizer so the two can be told apart: one is policy, the
     * other is the bill. */
    this.monetized = 0;

    this.bailedTotal = 0;
    this.bailoutCount = 0;
    this.lastBailout = null;

    this._tick = 0;
    this._serviceAcc = 0;
  }

  /* ---------------- calendar ----------------
   * The year exists because debt does. Coupons are quarterly, bonds mature
   * in years, foreign loans amortize over a decade — none of which can be
   * expressed without a clock. The election borrows the same clock. */
  /* The calendar: one tick is one day, TICKS_PER_YEAR days to a year.
   *
   * The fallback is 365 to match config.js. It used to be duplicated here as
   * 1200, which was a real hazard rather than a harmless default: a save written
   * before the calendar changed carries a cfg without the field, and a stale
   * per-module default would silently give that save a year three times longer
   * than the UI believed it had — the symptom being an election that never
   * arrives, which is the bug this calendar was changed to fix. Both constants
   * now say 365, and the comment is here to say why they must agree. */
  get year() { return Math.floor(this._tick / this.ticksPerYear); }
  get tickInYear() { return this._tick % this.ticksPerYear; }
  get ticksPerYear() { return this.cfg.TICKS_PER_YEAR || 365; }

  /* ---------------- domestic bonds ---------------- */

  /* How much the crown may issue. A state can always borrow from itself, so
   * the only honest limits are the ones lenders impose: a ceiling against
   * the size of the economy, and a price that rises as debt piles up. */
  bondCapacity() {
    const supply = Math.max(1, BankStats.totalCurrency);
    const factor = this.cfg.BOND_MAX_FACE_FACTOR || 0.35;
    return Math.max(0, Math.floor(supply * factor - this.bondsOutstanding()));
  }

  bondsOutstanding() {
    let s = 0;
    for (const b of this.bonds) s += b.face;
    return s;
  }

  /* Coupon rate rises with outstanding debt — the risk premium a lender
   * charges for lending to a sovereign that keeps printing. This is the
   * mechanical reason the bailout strategy cannot be run forever at a fixed
   * price. */
  bondRate() {
    const supply = Math.max(1, BankStats.totalCurrency);
    const load = clamp(this.bondsOutstanding() / (supply * 0.35), 0, 1.5);
    return (this.cfg.BOND_COUPON || 0.06) + load * 0.09;
  }

  canIssue() { return this.bondCapacity() > 0; }

  /* Issue a domestic series. The money enters circulation immediately — that
   * is what a bond is for. */
  issueBonds(opts = {}) {
    const cap = this.bondCapacity();
    if (cap <= 0) return { ok: false, reason: 'Lenders will not take more paper at this debt load.' };
    const face = Math.min(Math.floor(opts.face ?? cap), cap);
    if (!(face > 0)) return { ok: false, reason: 'Nothing to issue.' };

    const rate = this.bondRate();
    const termYears = Math.max(1, opts.termYears ?? (this.cfg.BOND_TERM_YEARS || 5));
    const b = {
      id: ++issueSeq,
      face,
      rate,
      termYears,
      issuedAt: this._tick,
      maturesAt: this._tick + termYears * this.ticksPerYear,
      couponAccrued: 0,
      lastCoupon: this._tick,
    };
    this.bonds.push(b);
    this.bondHistory.push(b);
    this.issuedTotal += face;

    /* The proceeds are spent by the crown into the domestic economy, so they
     * are created here and stay in circulation. */
    this._print(face, 'bond proceeds');
    this._push(`TREASURY · Issued ${this._money(face)} of bonds at `
      + `${(rate * 100).toFixed(2)}% · ${termYears}y`, 'good');
    return { ok: true, face, rate, termYears };
  }

  redeemBond(id, fraction = 1) {
    const i = this.bonds.findIndex(b => b.id === id);
    if (i < 0) return { ok: false };
    const b = this.bonds[i];
    const amt = Math.floor(b.face * clamp(fraction, 0, 1));
    if (!(amt > 0)) return { ok: false };
    b.face -= amt;
    this.principalRepaid += amt;
    this._print(amt, 'bond redemption');
    if (b.face <= 0) this.bonds.splice(i, 1);
    this._push(`TREASURY · Redeemed ${this._money(amt)} of bonds`, 'info');
    return { ok: true, amt };
  }

  /* ---------------- foreign borrowing ---------------- */

  foreignOutstanding(id) { return this.foreign[id].outstanding; }
  get foreignTotal() {
    let s = 0;
    for (const id of Object.keys(LENDERS)) s += this.foreign[id].outstanding;
    return s;
  }

  foreignCapacity(id) {
    const L = LENDERS[id];
    const supply = Math.max(1, BankStats.totalCurrency);
    return Math.max(0, Math.floor(supply * L.maxExposureFactor - this.foreignOutstanding(id)));
  }

  canDraw(id) { return this.foreignCapacity(id) > 0; }

  /* Draw from a foreign lender. The funds are advanced into the domestic
   * economy, which is the moment the inflation is created — the sovereign
   * takes on a permanent obligation in exchange for currency that is already
   * circulating and being spent.
   *
   * Each draw becomes its own TRANCHE with its own schedule, rather than
   * being pooled into a single amortizing balance. Pooling looks tidier and
   * is wrong: an instalment sized off cumulative lifetime drawings makes the
   * sovereign repay *faster* the more it borrows, so a country that bails out
   * repeatedly ends up debt-free and cannot be trapped — which removes the
   * only consequence the third option was supposed to have. Measured: the
   * IMF book reached $14.7M and was fully repaid by year ten, and the sovereign
   * finished the run owing nothing. */
  drawForeign(id, amount) {
    const L = LENDERS[id];
    if (!L) return { ok: false, reason: 'No such lender.' };
    const cap = this.foreignCapacity(id);
    const amt = Math.floor(Math.min(amount, cap));
    if (!(amt > 0)) return { ok: false, reason: `${L.short} will not extend more credit.` };

    const book = this.foreign[id];
    book.drawn += amt;
    book.outstanding += amt;
    book.tranches.push({
      id: book.tranches.length + 1,
      principal: amt,
      remaining: amt,
      rate: L.rate,
      drawnYear: this.year,
      graceUntil: this.year + L.graceYears,
      // principal amortizes evenly once the grace period ends
      amortYears: Math.max(1, L.termYears - L.graceYears),
      annual: Math.max(1, Math.round(amt / Math.max(1, L.termYears - L.graceYears))),
    });
    book.history.push({ tick: this._tick, amount: amt, year: this.year });
    return { ok: true, amount: amt, lender: L, rate: L.rate };
  }

  /* ---------------- the third ruling ----------------
   *
   * A bailout SETTLES the docket. It does not forgive it and it does not
   * enforce it:
   *
   *   - the claims are paid in full, so creditors are made whole
   *   - the debtors keep their cash and their firms, so nobody is ruined
   *   - the money is new, because no one had it to give
   *
   * The three-way split is the whole design, and each branch has a distinct
   * fingerprint on the economy:
   *
   *   forgive — claim extinguished. Nobody pays. No new money.
   *   enforce — claim collected from the estate. Money LEAVES circulation.
   *   bailout — claim met with new money. Money ENTERS circulation, and the
   *              sovereign is on the hook for it forever.
   */
  settleDocket(d) {
    const total = d.total;
    if (!(total > 0)) return { ok: false, reason: 'Nothing to bail out.' };

    /* Interest is charged ON TOP: the lender is not covering the debt, it is
     * financing it. This is why a bailout is never as cheap as it looks —
     * the claim is not discharged, it is transferred and repriced. */
    const surcharge = 1 + (this.cfg.BAILOUT_SPREAD || 0.06);
    let drawn = Math.round(total * surcharge);

    const lenderId = d.lenderId || standingLender;
    const res = this.drawForeign(lenderId, drawn);
    if (!res.ok) return res;

    /* The advanced funds are handed straight to the defaulting firms as
     * working capital. They were insolvent a moment ago; being current is
     * not enough to keep trading, they need stock to sell. So this is a
     * transfer of new money into firms that will immediately spend it. */
    const claims = d.claims.filter(c => c.acct && c.acct.debt > 0);
    const weight = claims.reduce((s, c) => s + c.acct.debt, 0) || 1;
    let placed = 0;

    /* The bank is a creditor, so it gets PAID out of the drawdown — like every
     * other creditor — rather than having its claim deleted.
     *
     * It used to be erased outright:
     *
     *   BankStats.totalDebt -= owed;  acct.debt = 0;   // bank loses everything
     *   if (share > 0) { acct.create(share); ... }     // and money is printed
     *
     * which was a double creation on every single bailout. The currency the
     * bank had lent was neither repaid nor destroyed — it stayed with the firm,
     * now unbacked by any claim — and the sovereign then printed fresh currency
     * on top of it. Measured 3,109 bailouts conjuring $58.5M this way, on top
     * of roughly $146M the bank itself had created and never recovered.
     *
     * Repaying the bank is also simply what a bailout is: the sovereign borrows
     * abroad and settles what is owed at home, the domestic banks included. It
     * costs the sovereign the difference, which is honest — it is the price of
     * the third option, not a hidden subsidy. */
    const bank = this.sim && this.sim.bank;
    let toBank = 0;
    if (bank) {
      for (const c of claims) {
        const owed = c.acct.debt;
        if (!(owed > 0)) continue;
        const cut = Math.min(owed, drawn);
        if (!(cut > 0)) continue;
        c.acct.__edit(-cut);
        bank.master.__edit(cut);
        BankStats.totalCurrency -= cut;
        BankStats.moneyDestroyed += cut;
        toBank += cut;
        drawn -= cut;
      }
      // every claim the bank held is now settled, so its capacity comes back
      const owedTotal = claims.reduce((s, c) => s + c.acct.debt, 0);
      if (owedTotal > 0) bank.retireReserve(owedTotal);
      // No _print() here: the sovereign already created this money in
      // drawForeign() above. Repaying the bank moves it out of circulation, it
      // is not a second injection, and counting it again would report the
      // bailout as larger than the currency that actually exists.
      void toBank;
    }

    const scale = weight > 0 ? drawn / Math.max(1e-9, drawn + toBank) : 1;
    for (const c of claims) {
      const acct = c.acct;
      const owed = acct.debt;
      if (!(owed > 0)) continue;
      const share = Math.round(drawn * scale * (owed / weight));
      BankStats.totalDebt -= owed;
      acct.debt = 0;
      acct.freeze = false;
      /* the money itself */
      if (share > 0) { acct.create(share); placed += share; }
      /* and the claim is recorded as settled rather than forgiven */
      acct.bailedOut = (acct.bailedOut || 0) + 1;
      if (acct.owner) acct.owner.bailouts = (acct.owner.bailouts || 0) + 1;
    }
    /* rounding remainder lands with the largest claimant */
    if (drawn > placed && claims.length) {
      const big = claims.reduce((a, b) => (a.acct.debt >= b.acct.debt ? a : b));
      const rem = drawn - placed;
      big.acct.create(rem);
      placed += rem;
    }

    /* Count the drawdown against the money the sovereign has created.
     *
     * This must happen here rather than in _print(), because the bailout
     * routes its money straight to the defaulting firms rather than through
     * the sovereign's account — there is no intermediate step where _print()
     * would run. Without this, the "minted for debt" readout reported $0
     * after a bailout that had demonstrably created $21,200 of currency, and
     * the number that exists to make the third option's price legible was
     * reading zero at the exact moment the player most needed it. */
    this.monetized += placed;

    this.bailedTotal += placed;
    this.bailoutCount++;
    this.lastBailout = {
      tick: this.sim.tickCount, amount: placed, lender: lenderId,
      industry: d.industry, firms: claims.length,
    };
    this._push(`BANKRUPTCY · ${LENDERS[lenderId].short} covered ${this._money(placed)} `
      + `for ${claims.length} firm${claims.length === 1 ? '' : 's'} · `
      + `the bill is now sovereign`, 'warn');

    return { ok: true, amount: placed, lender: LENDERS[lenderId], lenderId, claims: claims.length };
  }

  /* ---------------- debt service ----------------
   *
   * The sovereign cannot default, so every payment is created. There is no
   * branch here that says "if the treasury cannot pay, restructure" — the
   * absence of that branch is the entire point of this file.
   */
  tick() {
    this._tick++;
    const year = this.ticksPerYear;

    /* Coupons quarterly, principal at maturity. Both are paid to holders
     * INSIDE the domestic economy, so both are directly inflationary: this is
     * textbook deficit financing, and the price level is where it lands. */
    for (const b of this.bonds) {
      if (b.face <= 0) continue;
      b.couponAccrued += b.face * b.rate * (1 / (year * 4));
      if (this._tick - b.lastCoupon >= year / 4) {
        b.lastCoupon = this._tick;
        const coupon = Math.round(b.couponAccrued);
        if (coupon > 0) {
          b.couponAccrued -= coupon;
          this.couponsPaid += coupon;
          this.interestPaid += coupon;
          this._print(coupon, 'coupon');
        }
      }
      if (this._tick >= b.maturesAt) {
        const face = b.face;
        b.face = 0;
        this.principalRepaid += face;
        this._print(face, 'maturity');
        const i = this.bonds.indexOf(b);
        if (i >= 0) this.bonds.splice(i, 1);
        this._push(`TREASURY · ${this._money(face)} of bonds matured and was paid`, 'info');
      }
    }

    /* Foreign amortization, per tranche. Interest accrues on what is still
     * owed; principal is repaid on the tranche's own schedule once its grace
     * period ends.
     *
     * The money is created here and remitted out of the country: the domestic
     * supply sees the creation and never sees the repayment. That asymmetry IS
     * the cost of the third option, and it is why a sovereign that bails out
     * everything is buying approval with a currency it cannot stop printing.
     * The sovereign cannot default, so this branch is the only branch — there
     * is no version of this code where the payment is skipped, deferred for
     * want of funds, or restructured. */
    for (const id of Object.keys(LENDERS)) {
      const L = LENDERS[id];
      const book = this.foreign[id];
      if (book.outstanding <= 0) continue;

      if (this.tickInYear !== 0) continue;
      const year = this.year;

      const interest = Math.round(book.outstanding * L.rate);
      if (interest > 0) {
        book.interestPaid += interest;
        this.interestPaid += interest;
        this.monetized += interest;
        BankStats.moneyCreated += interest;
      }

      let principal = 0;
      for (const tr of book.tranches) {
        if (tr.remaining <= 0) continue;
        if (year < tr.graceUntil) continue;
        principal += Math.min(tr.remaining, tr.annual);
        tr.remaining = Math.max(0, tr.remaining - tr.annual);
      }
      if (principal > 0) {
        principal = Math.min(principal, book.outstanding);
        book.outstanding -= principal;
        book.repaid += principal;
        this.monetized += principal;
        BankStats.moneyCreated += principal;
      }
    }
  }

  /* Create currency. Every debt payment in this file goes through here, and
   * the count is what the Credit panel displays: this is the number the
   * player is actually paying for the third option. */
  _print(amount, why) {
    const a = Math.round(amount);
    if (!(a > 0)) return;
    BankStats.totalCurrency += a;
    BankStats.moneyCreated += a;
    this.monetized += a;
    void why;
  }

  /* ---------------- discipline ----------------
   *
   * Discipline is the share of docketed claims the sovereign actually made
   * the DEBTOR meet. It is not docket volume and it is not approval:
   *
   *   enforced  1.0 — collected from the estate
   *   bailed     0.5 — met on the debtor's behalf; the debtor's credit is
   *                    rescued and learns nothing
   *   forgiven  0.0 — nobody pays anything
   *
   * A bailout is deliberately not zero. That is the whole trap: it is the
   * only ruling that satisfies every faction, and it is the only ruling that
   * quietly disarms the one thing that keeps lenders lending sensibly. A
   * sovereign that bails out everything ends up with a perfectly popular
   * economy that lends against the collapse it is about to have. */
  get disciplinePressure() {
    /* Conditionality drag: an outstanding emergency programme suppresses the
     * business cycle whether the sovereign likes it or not. */
    let drag = 0;
    for (const id of Object.keys(LENDERS)) {
      const book = this.foreign[id];
      if (book.outstanding <= 0) continue;
      const supply = Math.max(1, BankStats.totalCurrency);
      const weight = clamp(book.outstanding / (supply * LENDERS[id].maxExposureFactor), 0, 1);
      drag += LENDERS[id].conditionality * weight;
    }
    return clamp(drag, 0, 0.6);
  }

  /* Total sovereign obligation: what the crown now owes, in today's money. */
  totalDebt() {
    let s = this.bondsOutstanding();
    for (const id of Object.keys(LENDERS)) s += this.foreign[id].outstanding;
    return s;
  }

  /* Annual debt service, as a share of the money supply. The number that
   * tells you whether the state is still solvent in any meaningful sense. */
  debtServiceRatio() {
    let coupons = 0;
    for (const b of this.bonds) coupons += b.face * b.rate;
    let amort = 0;
    for (const id of Object.keys(LENDERS)) {
      const book = this.foreign[id];
      if (book.outstanding <= 0) continue;
      /* interest on everything still owed, plus this year's principal */
      amort += book.outstanding * LENDERS[id].rate;
      for (const tr of book.tranches) {
        if (tr.remaining > 0 && this.year >= tr.graceUntil) amort += tr.annual;
      }
    }
    return (coupons + amort) / Math.max(1, BankStats.totalCurrency);
  }

  _money(v) {
    return '$' + Math.round(v / 100).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  _push(head, body, tone) { this.sim.onCredit?.(head, body, tone); }

  /* ---------------- readout ---------------- */
  describe() {
    const supply = Math.max(1, BankStats.totalCurrency);
    return {
      year: this.year,
      tickInYear: this.tickInYear,
      standingLender: getStandingLender(),

      bonds: this.bonds.length,
      bondFace: this.bondsOutstanding(),
      bondRate: this.bondRate(),
      bondCapacity: this.bondCapacity(),
      canIssue: this.canIssue(),

      foreignTotal: this.foreignTotal,
      imf: { ...this.foreign.imf, capacity: this.foreignCapacity('imf') },
      worldbank: { ...this.foreign.worldbank, capacity: this.foreignCapacity('worldbank') },

      totalDebt: this.totalDebt(),
      debtToSupply: this.totalDebt() / supply,
      serviceRatio: this.debtServiceRatio(),
      interestPaid: this.interestPaid,
      couponsPaid: this.couponsPaid,
      principalRepaid: this.principalRepaid,
      monetized: this.monetized,
      monetizationRatio: this.monetized / supply,

      bailedTotal: this.bailedTotal,
      bailoutCount: this.bailoutCount,
      lastBailout: this.lastBailout,

      conditionality: this.disciplinePressure,
    };
  }
}
