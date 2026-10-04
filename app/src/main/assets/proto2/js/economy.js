/* ------------------------------------------------------------------
 * Proto Web — economy core
 * Faithful port of the original app's proto.lib.* from smali.
 *
 *   ComType / commodities   lib/commodities/*
 *   Trader base + subclasses lib/traders/*
 *   Account / TaxCode        lib/bank/Account*
 *   Bank                     lib/bank/Bank.smali
 *   Directory                lib/Directory.smali
 * ------------------------------------------------------------------ */

import { DEFAULT_CONFIG, DEFAULT_BANK } from './config.js';

/* ---------------- commodity types ---------------- */
export const ComType = Object.freeze({
  LABOR: 0,
  FOOD: 1,
  TOOL: 2,
  COAL: 3,
  IRON: 4,
  TRANSPORTATION: 5,
});

export const COM_ORDER = [
  ComType.LABOR, ComType.FOOD, ComType.TOOL,
  ComType.COAL, ComType.IRON, ComType.TRANSPORTATION,
];

export function comName(t) {
  return ['Labor', 'Food', 'Tools', 'Coal', 'Iron', 'Shipping'][t];
}

/* ---------------- global stats ---------------- */
export const BankStats = {
  totalCurrency: 0,
  adj_totalCurrency: 0,
  totalDebt: 0,
  transactionCount: 0,
  totalTrValue: 0,     // GDP
  insolvencyHits: 0,
  writeOffs: 0,        // claims the sovereign chose to forgive
  moneyCreated: 0,
  moneyDestroyed: 0,
};

export function resetBankStats() {
  Object.assign(BankStats, {
    totalCurrency: 0, adj_totalCurrency: 0, totalDebt: 0,
    transactionCount: 0, totalTrValue: 0,
    insolvencyHits: 0, writeOffs: 0,
    moneyCreated: 0, moneyDestroyed: 0,
  });
}

export const TaxCode = Object.freeze({
  UNIVERSAL: 0, LABOR: 1, FOOD: 2, TOOL: 3,
  COAL: 4, IRON: 5, TRANSPORTATION: 6, MASTER: 7,
});

const TAX_FIELD = {
  [TaxCode.LABOR]: 'laborTaxRate',
  [TaxCode.FOOD]: 'foodTaxRate',
  [TaxCode.TOOL]: 'toolTaxRate',
  [TaxCode.COAL]: 'coalTaxRate',
  [TaxCode.IRON]: 'ironTaxRate',
  [TaxCode.TRANSPORTATION]: 'transportTaxRate',
};

/* How much of an enforced wage ceiling traders actually accept. A decree is
 * not law in the physical sense: sellers shade their ask up to compensate,
 * so the ceiling suppresses but never eliminates inflation. */
const PRICE_CEILING_EVASION = 0.85;

/* ---------------- bank ---------------- */
export class Bank {
  constructor(cfg, macro = null, sovereign = null) {
    this.cfg = cfg;
    this.macro = macro;        // set by Simulator; gates credit issuance
    this.sovereign = sovereign; // set by Simulator; routes write-off claims
    this.minPayPercent = DEFAULT_BANK.minPayPercent;
    this.interestRate = DEFAULT_BANK.interestRate;
    this.reserveRate = DEFAULT_BANK.reserveRate;
    this.reserve = 0;
    this.cycle = 0;
    this.fail = false;
    this.accounts = [];
    this.master = null;
    this.removals = 0;   // traders retired since the last orphan sweep
  }

  addAccount(a) { this.accounts.push(a); }

  /* Called from Trader.die() so reclaimOrphans knows there is something to do. */
  noteRemoval() { this.removals++; }

  /* Every 11th tick: collect interest + minimum payment on all debt. */
  act() {
    this.cycle++;
    if (this.cycle <= 10) return;
    this.cycle = 0;

    for (const acct of this.accounts) {
      if (acct.debt <= 0) continue;
      const interest = acct.debt * this.interestRate;
      const payment = acct.debt * this.minPayPercent + interest;
      const negBal = payment - acct.balance;

      if (negBal > 0) {
        // Seize whatever they can actually pay. The unpaid remainder used to
        // be written off here, silently and automatically; it is now handed
        // to the sovereign as a claim to rule on (see politics.js). Rolling
        // the shortfall into a fresh loan instead made debt compound at
        // interestRate+minPayPercent until it exceeded the whole money supply.
        const paid = Math.min(acct.balance, acct.debt);
        this.payOnLoan(acct, acct.balance);
        if (paid < payment && acct.balance <= 0 && acct.debt > 0) {
          this._claimWriteOff(acct, acct.owner || null);
        }
        acct.freeze = acct.debt > 0;
      } else {
        this.payOnLoan(acct, payment);
        acct.freeze = false;
      }
    }

    /* The lending floor, and where repaid principal goes.
     *
     * This block used to conjure money into the reserve:
     *
     *   const cycle = totalCurrency * reserveRate * 0.1;
     *   if (cycle > 0) this.reserve = Math.max(this.reserve, cycle);
     *   ... this.master.balance -= surplus; this.reserve += surplus;
     *
     * which compounded with `issueLoanTo`, whose only brake was
     * `resReq = amount - this.master.balance`. Master is left at exactly zero by
     * every loan — (M + (a - M)) - a = 0 for any M — so resReq was the FULL
     * amount every time and the bank created on every cash-short purchase,
     * gated only by a reserve that was being topped up to 2% of a supply that
     * was itself compounding. The one constraint scaled with the runaway
     * instead of restraining it, and `max()` let it only ever ratchet upward.
     *
     * Measured, 12k ticks under a standing `enforce` order: supply $16.5M ->
     * $1.45B (88x) on $158K of net destruction, $29M of reserve backing $1.45B.
     *
     * What replaces it is a FIXED seed, deliberately NOT a function of the
     * money supply — a constant can bound lending without being able to amplify
     * it. This is the guard the old comment here always claimed and never had:
     * "once it hits zero the bank can never create money again, credit freezes
     * and the industrial chain starves". Bad debts permanently shrink a real
     * banking system, but a simulation that can no longer lend has no economy
     * left to simulate. The reserve is now a revolving base (see
     * retireReserve) rather than a consumable stock, and creating new currency
     * is the sovereign's business, done by open-market operations. */
    const seed = Math.floor(this.cfg.INIT_CASH * 8);
    if (this.reserve < seed) this.reserve = seed;
  }

  /* Reclaim currency stranded in accounts whose trader has left the directory.
   *
   * `bankSum()` walks `bank.accounts`, and an Account is registered with the
   * bank for the lifetime of the trader that made it — it is never removed.
   * So any balance left on a departed trader's account is counted in the money
   * supply forever: it is spendable by nobody, prices nothing, and is removed
   * by no operation. Measured 708 such accounts holding $122M of a $1.17B
   * supply after 12k ticks, almost all of it currency the central bank had
   * injected into corpses (see Macro._openMarket).
   *
   * The residual goes to the sovereign's account — the same account the bank
   * pays taxes and sovereign debt into — and leaves circulation, because an
   * estate is not a claim on the larder of the living. Debt dies with the
   * trader: the claim was against a firm that no longer trades. */
  reclaimOrphans(sim, force = false) {
    /* Cheap in the common case, and it has to be: `accounts` only ever grows,
     * and this walks all of it. A removal counter makes the no-op case O(1)
     * instead of O(accounts) on every single tick — without it, a long run
     * accumulated tens of thousands of dead accounts and scanned them 12000
     * times, which is what wedged the page during preset testing.
     *
     * `force` exists because "nothing died recently" is not the same as
     * "there is nothing to reclaim". Restoring a save (see save.js) marks the
     * seeded traders dead directly rather than through die(), so noteRemoval()
     * is never called and the counter suppresses the sweep that would clear
     * exactly the accounts the restore just orphaned. Measured: the restored
     * world came back with 44 dead accounts holding $16.44M — the seeded
     * population's opening float — and the money supply was high by precisely
     * that amount on every single load. The tick loop keeps the cheap path; only
     * the restore forces. */
    if (!this.removals && !force) return null;
    this.removals = 0;
    const present = new Set(sim.directory.all);
    let reclaimed = 0, cleared = 0, n = 0;
    for (const a of this.accounts) {
      if (!a.owner || present.has(a.owner)) continue;
      if (a.balance > 0) {
        const bal = a.balance;
        a.balance = 0;
        this.master.__edit(bal);
        BankStats.totalCurrency -= bal;
        BankStats.moneyDestroyed += bal;
        reclaimed += bal;
      }
      if (a.debt !== 0) {
        BankStats.totalDebt -= a.debt;
        this.retireReserve(a.debt);
        a.debt = 0;
        a.freeze = false;
        cleared++;
      }
      n++;
    }
    return { reclaimed, cleared, accounts: n };
  }

  /* Queue a default for the sovereign to rule on. Falls back to an automatic
   * write-off only if there is no sovereign (bare-sim use). */
  _claimWriteOff(acct, trader) {
    if (this.sovereign) { this.sovereign.requestWriteOff(acct, trader); return; }
    this.writeOff(acct);
  }

  /* Bankruptcy, applied mechanically. `forgive` absorbs the loss; otherwise
   * the debt is called in and counts as an insolvency.
   *
   * Enforcement is not a no-op: the creditor seizes the assets, the claim is
   * extinguished, and a trader with nothing left is finished. That is the
   * whole difference between the two rulings — forgiving keeps the firm and
   * its workers in the economy; enforcing removes the claim from the money
   * supply and leaves a trader that cannot buy inputs.
   *
   * But enforcement has an upside and it is not a moral one. Calling debts in
   * destroys currency (the claim never returns to circulation) and it is the
   * only thing in the model that does, which is why an enforcing state runs
   * tight money and firm prices. It also keeps the great houses solvent —
   * they hold the wealth, so a state that kills the small still has someone
   * left to lend to. Both are real benefits, and both are paid for with the
   * labor and the commons that enforcement liquidates. */
  writeOff(acct, forgive = true) {
    if (acct.debt <= 0) return;
    const owed = acct.debt;
    BankStats.totalDebt -= acct.debt;
    acct.debt = 0;
    acct.freeze = false;
    /* Deliberately NO retireReserve here. A claim the sovereign wiped out is a
     * real loss to the bank, and the lending capacity it was holding is gone
     * for good. Returning it made forgiveness free and lending unbounded:
     * measured 8,640 write-offs under a standing `forgive` order created
     * $1.03B against $193M destroyed, because every forgiven loan both left its
     * currency in circulation AND handed the bank back the means to lend again.
     *
     * This is the cost MEMORY's credit section already describes — "credit
     * discipline rots, because lenders learn no claim is ever lost" — given a
     * mechanism. A sovereign that forgives repeatedly ends up with a bank too
     * small to lend, and the seed floor is the only thing keeping any credit at
     * all alive. Enforcement, which makes creditors whole, keeps the bank whole
     * with it. */
    void owed;

    if (forgive) {
      BankStats.writeOffs = (BankStats.writeOffs || 0) + 1;
      return;
    }

    // enforced: the creditor takes what there is; the rest evaporates
    BankStats.insolvencyHits++;
    const held = acct.balance;
    acct.__edit(-held);
    this.master.__edit(held);
    /* That seizure is the one place enforcement genuinely removes currency:
     * the estate goes to `master`, which is off-book (AccountProxy never calls
     * addAccount), so it leaves bankSum(). It was never counted, so `enforce`
     * showed $642M created against $51M destroyed and the open-market rule had
     * no honest number to steer on. */
    BankStats.totalCurrency -= held;
    BankStats.moneyDestroyed += held;

    const owner = acct.owner;
    if (!owner) return;
    owner.declared = true;

    /* Only the commons die.
     *
     * The ruling falls hardest on those with nothing behind them. A middle
     * firm is stripped of its cash and survives on its plant and stock; a
     * house barely feels it. That asymmetry is the entire politics of the
     * decision: enforcement is a poor-man's catastrophe, and because the
     * commons breed fast the casualty list is replenished before the next
     * docket is opened — so the ruler pays almost nothing for it and the
     * rich pay almost nothing for it either. The cost lands on the people
     * who have no vote in any of this. */
    if (owner.socialClass === 'middle') {
      owner.seized = (owner.seized || 0) + 1;
      return;
    }
    if (owner.socialClass === 'elite') {
      owner.eliteHits = (owner.eliteHits || 0) + 1;
      return;
    }

    // a commoner that just defaulted is finished — no stock, no working
    // capital, and no claim on goodwill
    if (owner.die) owner.die();
  }

  /* Money creation. The bank creates the loan against its reserve and credits
   * the borrower directly.
   *
   * The reserve — not totalCurrency — is the binding constraint, otherwise
   * credit would freeze as the supply grows.
   *
   * The credit used to travel through `master`: resReq = amount - master.balance
   * was conjured into master, then master.__transfer(acct, amount) paid it out,
   * which leaves master at EXACTLY zero every single time — (M + (a - M)) - a = 0,
   * for any M. So the bank could never hold a cash buffer: every repayment that
   * landed in master was spent again by the very next loan, the reserve could
   * never be replenished, and credit deadlocked at zero. Measured after making
   * repayment honest: reserve $6 and outstanding debt $263 after 12k ticks, so
   * nothing could borrow and the docket had no claims to rule on at all.
   *
   * Creating straight into the borrower's account keeps the reserve discipline
   * (the bank still may not lend what it cannot back) while leaving master free
   * to accumulate repayments, which is what refills the reserve. Master is
   * off-book (AccountProxy never calls addAccount), so this is supply-correct:
   * the currency appears in circulation and is counted as created. */
  issueLoanTo(acct, amount) {
    if (acct.taxCode === TaxCode.MASTER || !(amount > 0)) return false;

    /* Credit rationing. The original bank was a pure faucet: every
     * unaffordable purchase printed the shortfall, so nothing could ever be
     * priced out of the market and no crisis could take hold.
     *
     * Two levers, because a partial loan still lets the purchase complete:
     *   1. availability — under a crunch the bank simply refuses, sometimes
     *      outright and sometimes by rolling the dice;
     *   2. partial issue — when it does lend, it lends less than asked.
     * Refusal is what produces real insolvency. The refusal rate bottoms out
     * at CREDIT_FLOOR, so credit never dies completely and always returns. */
    const macro = this.macro;
    if (macro && macro.cfg.macroEnabled !== false) {
      const avail = macro.creditAvailability;
      if (avail < 1 && Math.random() > avail) return false;   // declined outright
      if (avail < 1) amount = Math.round(amount * avail);
      if (!(amount > 0)) return false;
    }

    if (this.reserve < amount) return false;
    this.removeReserve(amount);
    acct.__edit(amount);
    BankStats.totalCurrency += amount;
    BankStats.moneyCreated += amount;
    acct.debt += amount;
    BankStats.totalDebt += amount;
    return true;
  }

  /* Repaying a loan retires currency. It used to move principal from the borrower
   into `master` without touching either counter, so the money left circulation
   invisibly — `moneyDestroyed` stayed at $158K while $801M had been created,
   and the open-market rule, which steers on exactly this number, was steering
   on a total that could never go up. Master is deliberately left holding it:
   it is off-book (see AccountProxy in simulator.js, which never calls
   addAccount), so the principal is out of `bankSum()` from here on, and
   whatever the bank can justify as reserve it takes back in Bank.act(). */
  payOnLoan(acct, amount) {
    const pay = Math.min(amount, acct.balance, acct.debt);
    if (pay <= 0) return;
    acct.__edit(-pay);
    this.master.__edit(pay);
    acct.debt -= pay;
    BankStats.totalDebt -= pay;
    BankStats.totalCurrency -= pay;
    BankStats.moneyDestroyed += pay;
    this.retireReserve(pay);
    if (acct.debt <= 0) { acct.debt = 0; acct.freeze = false; }
  }

  /* Hand lending capacity back.
   *
   * The reserve is CONSUMED when a loan is created, so unless it comes back the
   * bank can lend only once ever: the reserve falls to zero, no further credit
   * can be created, therefore no debt exists, therefore there is nothing to
   * repay and nothing to refill it. A permanent, silent credit freeze.
   *
   * Measured with the reserve funded only by repayments and nothing else:
   * reserve $4, outstanding debt $276 after 12k ticks, and zero dockets — the
   * sovereign had no claims at all to rule on, so the entire political layer
   * had quietly stopped existing.
   *
   * Every path that extinguishes a claim hands the reserve back, whether the
   * claim was settled in cash or written off. The reserve is therefore a
   * revolving base rather than a consumable stock: lend $1 and repay $1 leaves
   * it exactly where it started, and the currency created is retired to match. */
  retireReserve(amount) {
    if (amount > 0) this.reserve += amount;
  }

  removeReserve(a) { this.reserve = Math.max(0, this.reserve - a); }
  enoughReserves(a) { return this.reserve >= a; }
}

/* ---------------- account ---------------- */
let acctSeq = 0;
export class Account {
  constructor(bank, taxCode = TaxCode.UNIVERSAL) {
    this.id = ++acctSeq;
    this.bank = bank;
    this.taxCode = taxCode;
    this.balance = 0;
    this.debt = 0;
    this.freeze = false;
    this.owner = null;   // the Trader behind this account, for claim framing
    bank.addAccount(this);
  }

  /* Apply configured taxes to an outgoing amount. Returns {total, tax}. */
  _taxFor(comType, amount) {
    const c = this.cfg();
    if (!c.collectTax) return { total: amount, tax: 0 };
    const u = c.universalTaxRate || 0;
    const specific = TAX_FIELD[this.taxCode] === undefined
      ? (TAX_FIELD[comType] !== undefined ? c[TAX_FIELD[comType]] : 0)
      : c[TAX_FIELD[this.taxCode]] || 0;
    const rate = Math.min(100, u + Math.max(0, specific)) / 100;
    const tax = amount * rate;
    return { total: amount + tax, tax };
  }

  cfg() { return this.bank.cfg; }

  send(to, amount) {
    if (!(amount > 0)) return false;
    // NB: an ordinary transfer moves existing money, so it needs no reserve
    // backing — reserves gate money *creation* (see Bank.issueLoanTo). Checking
    // them here would stop the whole economy the moment the reserve ran dry.
    // NB: `freeze` is a solvency flag for the bank readout, not a spending lock.
    // Blocking here would trap an indebted trader in a permanent deadlock —
    // it could never buy inputs, so it could never earn to repay.
    if (this.balance < amount) return false;
    this.__edit(-amount);
    to.__edit(amount);
    this.bank.fail = false;
    BankStats.transactionCount++;
    BankStats.totalTrValue += amount;
    return true;
  }

  refund(to, amount) {
    if (!(amount > 0)) return;
    this.__edit(-amount);
    to.__edit(amount);
  }

  /* raw balance mutation; currency supply only changes on net external flows */
  __edit(delta) {
    if (!Number.isFinite(delta)) return;
    this.balance += delta;
  }

  __transfer(to, amount) {
    if (this.balance < amount) return false;
    this.__edit(-amount);
    to.__edit(amount);
    return true;
  }

  getLoan(amount) {
    if (amount <= 0) return true;
    return this.bank.issueLoanTo(this, amount);
  }

  destroy(amount) {
    const a = Math.min(Math.max(0, amount), this.balance);
    if (!(a > 0)) return 0;
    this.balance -= a;
    BankStats.totalCurrency -= a;
    BankStats.moneyDestroyed += a;
    return a;
  }

  create(amount) {
    if (!(amount > 0)) return;
    this.balance += amount;
    BankStats.totalCurrency += amount;
    BankStats.moneyCreated += amount;
  }
}

/* ---------------- directory ---------------- */
export class Directory {
  constructor() {
    this.byType = COM_ORDER.map(() => []);
    this.priority = [];   // out-of-stock traders act first
    this.all = [];
  }

  register(t) {
    if (this.all.includes(t)) return;
    this.all.push(t);
    this.byType[t.comType].push(t);
  }

  unregister(t) {
    this.all = this.all.filter(x => x !== t);
    this.byType[t.comType] = this.byType[t.comType].filter(x => x !== t);
    this.setMaxPriority(t, false);
  }

  getListFromType(t) { return this.byType[t]; }
  getCount(t) { return t === undefined ? this.all.length : this.byType[t].length; }

  setMaxPriority(t, on) {
    const has = this.priority.includes(t);
    if (on && !has) this.priority.push(t);
    if (!on && has) this.priority = this.priority.filter(x => x !== t);
  }

  /* Priority list first, then everyone else (original Simulator.Next order). */
  getActOrder(skip) {
    const out = [];
    for (const t of this.priority) if (this.all.includes(t) && t !== skip) out.push(t);
    for (const t of this.all) if (!this.priority.includes(t) && t !== skip) out.push(t);
    return out;
  }

  getAveragePriceOf(type) {
    let sum = 0, n = 0;
    for (const t of this.byType[type]) {
      if (t.id === 'MASTER') continue;
      sum += t.getPrice();
      n++;
    }
    return n === 0 ? 0 : sum / n;
  }

  getCheapest(type) {
    let best = null;
    for (const t of this.byType[type]) {
      if (!best || t.getPrice() < best.getPrice()) best = t;
    }
    return best;
  }
}

/* ---------------- price dec signal ---------------- */
const priceListeners = [];
export function addPriceListener(fn) { priceListeners.push(fn); }
export function sendPriceDecSignal(origin) {
  for (const fn of priceListeners) fn(origin);
}
export function clearPriceListeners() { priceListeners.length = 0; }

/* ---------------- trader base ---------------- */
let traderSeq = 0;

export class Trader {
  constructor(sim, comType, id, cfg) {
    this.sim = sim;
    this.cfg = cfg;
    this.comType = comType;
    this.id = id || `${comName(comType)}#${++traderSeq}`;
    this.account = new Account(sim.bank, TaxCode.UNIVERSAL);
    this.com = [];          // stock on hand
    this.com_sold = [];     // sold but not yet delivered
    this.price = cfg.MIN_PRICE;
    this.priceOffset = 0;
    this.targetOffset = 0;
    this.bidPriceOffset = 0;
    this.sale_count = 0;
    this.isWaiting = false;
    this.isDead = false;
    this.isStocked = true;
    this.active = true;
    this.sale = false;
    this.allowPriceDecrease = false;
    this.unableToBuyTransportaion = false;
    this.activeTrade = null;
    this.quantity = 0;
    this.reserved = false;
    this.reserve_price = 0;
    this.address = null;    // {x,y}
    this.color = 0;

    /* Social class. Subclasses set their own; 'commons' is the safe default.
     * Enforcement reads this, and it is the difference between a ruling that
     * empties the poor and one that merely reorders the rich. */
    this.socialClass = 'commons';
    this.isElite = false;

    this.account.owner = this;   // lets the sovereign name the firm on a claim
    this.account.create(cfg.INIT_CASH);
  }

  get stock() { return this.com.length; }

  /* price composition: base + offset + shipping, then taxes via subclass */
  getNonBidPrice() {
    if (this.reserved) return this.reserve_price;
    let ship = 0;
    if (this.unableToBuyTransportaion) {
      const t = this.sim.directory.getCheapest(ComType.TRANSPORTATION);
      if (t) ship = t.getPrice();
    }
    return this.price + this.priceOffset + ship;
  }

  getPrice() { return this.getNonBidPrice(); }

  setPrice(p) {
    this.price = Math.max(this.cfg.MIN_PRICE, p);
  }

  /* NB: deliberately NOT scaled by macro.pushBias. A sale's markup is a
   * one-way step — there is no matching down-step on the same trade — so
   * scaling it by an expectations multiplier turned the whole economy into
   * a one-way ratchet: the price index reached 300x while measured
   * inflation read "stable". Expectations act on the price *target* instead
   * (applyPush), which is proportional and therefore reversible. */
  increasePrice() {
    this.priceOffset += this.cfg.PRICE_INC;
  }

  increaseBid() { this.bidPriceOffset += this.cfg.PRICE_INC; }

  decreasePrice(sendSignal) {
    const c = this.cfg;
    if (!c.supplyAndDemandEnabled || this.isWaiting || this.sim.isWaiting() || !this.allowPriceDecrease) {
      this.allowPriceDecrease = false;
      return;
    }
    this.priceOffset = Math.max(this.cfg.MIN_PRICE, this.priceOffset - c.PRICE_INC);
    this.allowPriceDecrease = false;
    if (sendSignal) sendPriceDecSignal(this);
  }

  /* a cheaper same-type peer dragged the market down */
  priceDecSignalNotification(t) {
    if (this.isDead || this.id === 'MASTER') return;
    if (t === this || t.comType !== this.comType) return;
    this.decreasePrice(false);
  }

  /* Expectations bias. Inflationary expectations lift every seller's target
   * proportionally; deflationary ones pull them back down. Proportional is
   * the point: this term is fully reversible, so a price rise feeds an
   * expectation, which feeds a price rise, but a fall unwinds the same way.
   * That feedback is what makes hyperinflation and deflation both possible
   * without either becoming permanent. */
  applyPush(off) {
    const m = this.sim.macro;
    if (!m || m.cfg.macroEnabled === false || !(off > 0)) return off;
    let v = Math.round(off * m.pushBias) + m.supplyPrice;

    /* A wage ceiling is a decree, and decrees are obeyed by some and evaded
     * by others: compliance is partial and decays, so holding wages down
     * keeps working only for as long as it keeps costing something. */
    const sov = this.sim.sovereign;
    if (sov && sov.canCapPrices && this.comType === ComType.LABOR) {
      v = Math.round(v * PRICE_CEILING_EVASION);
    }
    return v;
  }

  /* --- price target models --- */
  setTargetPriceOffset() {
    const level = Math.floor(BankStats.adj_totalCurrency / Math.max(1, this.sim.directory.getCount()));
    const target = Math.abs(level - this.account.balance);
    const div = this.com.length === 0 ? 1 : this.com.length;
    let off;

    if (this.cfg.supplyAndDemandEnabled) {
      if (this.account.balance < level) {
        off = Math.floor(target / div);
      } else {
        // already at or above the money-per-trader level: no expectation
        // bias on the way down, or deflation could never take hold
        off = this.targetOffset - Math.floor(target / div / div);
        if (off < 0) off = 0;
        this.targetOffset = this.clampOffset(off);
        return;
      }
    } else {
      off = this.standardTarget(level, target);
    }
    this.targetOffset = this.clampOffset(this.applyPush(off));
  }

  standardTarget(level, target) {
    if (this.account.balance < level) return Math.floor(target / this.cfg.OFFSET_DIV);
    return this.targetOffset > 0 ? 0 : this.targetOffset;
  }

  /* An out-of-stock trader has div=1, which would otherwise drive its price
   * toward the whole money supply and freeze the market. Bound the offset. */
  clampOffset(off) {
    // A trader must never price itself out of reach of its own customers:
    // starving labor traders have to stay able to buy food.
    const base = this.cfg.MIN_PRICE * 20 +
                 Math.round(this.cfg.INIT_CASH / (this.cfg.OFFSET_DIV * 4));
    // The original used `base` unconditionally, a hard nominal cap. That cap
    // is precisely why money creation could never become inflation — prices
    // were pinned while the supply grew without bound. The cap now floats
    // with the money supply so runaway inflation is reachable, and shrinks
    // toward the base floor in a bust.
    const m = this.sim.macro;
    const ceiling = (m && m.cfg.macroEnabled !== false) ? m.offsetCeiling(base) : base;
    if (off > ceiling) return ceiling;
    return off < 0 ? 0 : off;
  }

  useStandardOffsetModel() {
    const level = Math.floor(BankStats.adj_totalCurrency / Math.max(1, this.sim.directory.getCount()));
    const target = Math.abs(level - this.account.balance);
    const target2 = this.standardTarget(level, target);
    this.targetOffset = this.clampOffset(
      target2 > 0 ? this.applyPush(target2) : target2);
  }

  adjustPriceOffset() {
    if (this.targetOffset === this.priceOffset) return;
    // converge proportionally — creeping by 1/tick leaves prices stranded
    // high long after the market has moved, which starves the buyer side
    const gap = Math.abs(this.targetOffset - this.priceOffset);
    const step = Math.max(1, Math.round(gap / 8));
    if (this.targetOffset < this.priceOffset) this.priceOffset -= step;
    else this.priceOffset += step;
    if (this.priceOffset < 0) this.priceOffset = 0;
    if (this.priceOffset > this.targetOffset && gap < step) this.priceOffset = this.targetOffset;
  }

  fixPriceToLabor() {
    if (!this.cfg.fixPrice) return;
    const avg = this.sim.directory.getAveragePriceOf(ComType.LABOR);
    const div = this.cfg.supplyAndDemandEnabled
      ? this.cfg.FIX_PRICE_SUPPLYDEMAND
      : this.cfg.FIX_PRICE;
    if (div > 0) this.setPrice(Math.round(avg / div));
  }

  /* --- per-tick --- */
  act() {
    if (this.isDead) return true;
    this._rearmIfStocked();
    if (!this.sale && this.com.length > 0 && this.cfg.supplyAndDemandEnabled) {
      this.allowPriceDecrease = true;
    }
    this.fixPriceToLabor();
    this.setTargetPriceOffset();
    this.adjustPriceOffset();

    let active = this.active;
    if (this.com.length <= this.cfg.MIN_STOCK || this.priceOffset === 0) {
      active = this.stock_();
    }
    this.sale = false;
    this.active = active;
    return active;
  }

  /* subclasses override to place orders */
  stock_() { return this.active; }

  /* Restocking always re-arms sales. ranOutOfStock() latches isStocked=false,
   * and without this a trader that goes broke mid-gap can never sell again. */
  _rearmIfStocked() {
    if (this.com.length > 0 && !this.isStocked) {
      this.isStocked = true;
      this.sim.directory.setMaxPriority(this, false);
    }
  }

  /* --- buying --- */
  buy(type, quant) {
    let remaining = quant;
    if (!(remaining > 0)) return false;

    // aggregate demand. Orders are cut in a slump and stretched in a boom,
    // so the spending multiplier drives real output rather than just
    // re-labelling it. Shipping is excluded — freight is a fixed per-unit
    // fee, and scaling it would corrupt every delivered price.
    const m = this.sim.macro;
    if (m && m.cfg.macroEnabled !== false && type !== ComType.TRANSPORTATION) {
      remaining = Math.max(1, Math.round(quant * m.demandMul));
    }

    const sellers = this.sim.directory.getListFromType(type);
    // Ask cheapest first, and spread ties across the least-served sellers.
    // Directory order meant whichever trader happened to sit first absorbed
    // every order while the 43 cheapest never got asked at all.
    const ordered = sellers.slice().sort((a, b) => {
      const d = a.getPrice() - b.getPrice();
      if (d) return d;
      return (a.sale_count | 0) - (b.sale_count | 0);
    });
    for (const t of ordered) {
      if (!t || t === this || t.isDead) continue;
      if (remaining <= 0) break;
      const stash = t.quantity;
      t.quantity = 0;
      if (t.sellTo(this, this.account, remaining) && t.quantity > 0) {
        remaining -= t.quantity;
      }
      t.quantity = stash;
    }
    return remaining <= 0;
  }

  /* --- the transaction --- */
  sellTo(buyer, acct, quant) {
    // NB: isWaiting is not a lock — a seller may have shipments in flight.
    // The stock check below already prevents overselling.
    if (!this.isStocked || this.com.length === 0) return false;

    let q = { quant, tp: 0, total: 0 };
    this.calculateTotals(q);

    if (q.total > acct.balance) {
      const loanReq = q.total - acct.balance;
      acct.getLoan(loanReq);
      if (acct.balance < this.getPrice() + q.tp) q.quant = 0;
    }

    if (q.quant > 1) {
      q.quant = Math.floor((acct.balance - q.tp) / this.getPrice());
    }

    if (q.quant <= 0) {
      this.decreasePrice(true);
      return false;
    }

    if (q.quant > this.com.length) q.quant = this.com.length;
    if (q.quant > this.cfg.TRANSPORT_MAX) q.quant = this.cfg.TRANSPORT_MAX;
    if (q.quant <= 0) { this.decreasePrice(true); return false; }

    q.total = this.getPrice() * q.quant + q.tp;
    this.quantity = q.quant;
    this.activeTrade = buyer;

    if (!acct.send(this.account, q.total)) return false;

    // buy transportation to deliver (a transport seller IS the transport)
    const needsTransport = this.comType !== ComType.TRANSPORTATION;
    if (!needsTransport || this.buy(ComType.TRANSPORTATION, q.quant)) {
      for (let i = 0; i < q.quant && this.com.length; i++) this.com_sold.push(this.com.shift());
      this.sale_count += q.quant;
      this.sale = true;
      this.sellSuccess();
      if (this.com.length === 0) this.ranOutOfStock();
      this.unableToBuyTransportaion = false;
      this.sim.spawnDelivery(this, buyer, q.quant);
      return true;
    }

    // no transport available — refund the buyer
    const cheap = this.sim.directory.getCheapest(ComType.TRANSPORTATION);
    if (cheap && acct.balance < cheap.getPrice()) this.unableToBuyTransportaion = true;
    acct.refund(buyer.account, q.total);
    return false;
  }

  calculateTotals(q) {
    if (q.quant === 0x7fffffff || q.quant > this.com.length) q.quant = this.com.length;
    const tAvg = this.sim.directory.getAveragePriceOf(ComType.TRANSPORTATION);
    q.tp = tAvg;
    q.total = this.getPrice() * q.quant + q.tp;
  }

  sellSuccess() {
    if (this.id !== 'MASTER' && this.cfg.supplyAndDemandEnabled) this.increasePrice();
    this.allowPriceDecrease = false;
  }

  ranOutOfStock() {
    this.isStocked = false;
    this.allowPriceDecrease = false;
    this.sim.directory.setMaxPriority(this, true);
  }

  /* delivered goods have arrived — credit the traveler's own buyer, not
   * activeTrade, which may already point at a later sale */
  arrivalNotification(traveler) {
    const n = traveler ? traveler.quant : this.quantity;
    const buyer = traveler && traveler.buyer ? traveler.buyer : this.activeTrade;
    for (let i = 0; i < n && this.com_sold.length; i++) {
      const item = this.com_sold.shift();
      if (buyer) buyer.receive(this.comType, item);
    }
    if (traveler && traveler.buyer) this.activeTrade = null;
    // a seller may have several shipments in flight; only the last clears the latch
    this.inFlight = Math.max(0, (this.inFlight || 1) - 1);
    if (this.inFlight === 0) this.isWaiting = false;
  }

  receive(type, item) {
    this.com.push(item);
    this.isStocked = true;
    if (type === ComType.LABOR) this.laborReceived?.();
  }

  die() {
    /* The great houses are untouchable. This is the single choke point for
     * every removal in the model — enforcement, starvation, anything added
     * later — so the exemption belongs here rather than being re-asserted at
     * each caller. */
    if (this.isElite) return false;
    this.isDead = true;
    this.sim.bank?.noteRemoval();
    this.sim.directory.unregister(this);
    this.sim.map.unregister(this);   // leave the industry's disc
    /* Settle the account here, because an Account outlives the Trader that
     * made it: it is registered with the bank forever and bankSum() walks
     * every account the bank has ever had. Whatever is left on a departed
     * trader's account is counted in the money supply permanently — spendable
     * by nobody, priced by nothing, removed by nothing.
     *
     * redistribute — never destroy currency on death, where there is anyone
     * left to inherit it. The indivisible remainder used to evaporate silently
     * (`balance -= each * heirs.length`, then `balance = 0`), which destroyed
     * currency without counting it: the same invisible loss that left
     * moneyDestroyed at zero while the supply drifted up. It is now retired
     * explicitly, and the debt dies with the firm — the claim was against a
     * trader that no longer trades, so leaving it on the books only ever
     * inflated totalDebt against nobody. */
    const bank = this.sim.bank;
    const heirs = this.sim.directory.all.filter(t => t !== this && !t.isDead);
    const pool = this.account.balance;
    const retire = (amt) => {
      if (!(amt > 0)) return;
      bank.master.__edit(amt);
      BankStats.totalCurrency -= amt;
      BankStats.moneyDestroyed += amt;
    };
    if (pool > 0) {
      if (heirs.length) {
        const each = Math.floor(pool / heirs.length);
        if (each > 0) {
          this.account.balance -= each * heirs.length;
          for (const h of heirs) h.account.balance += each;
        }
        retire(this.account.balance);       // the remainder that will not divide
      } else {
        retire(pool);                       // no heirs: the estate just leaves
      }
    }
    if (this.onDeath) this.onDeath();
    this.account.balance = 0;
    if (this.account.debt > 0) {
      BankStats.totalDebt -= this.account.debt;
      this.sim.bank.retireReserve(this.account.debt);
      this.account.debt = 0;
      this.account.freeze = false;
    }
  }
}

/* ---------------- commodity payloads ---------------- */
export class Commodity {
  constructor(type, owner) {
    this.type = type;
    this.owner = owner;
    this.quant = 1;
  }
}

/* Names for offspring.
 *
 * These must be unique. Deriving them by string concatenation from the
 * parent's id — 'LABOR#5' -> 'LABOR#5(spawn)' -> 'LABOR#5(spawn)(born)'
 * — collides the moment a descendant breeds, because every grandchild of the
 * same ancestor lands on the same string. The result is invisible in the
 * economy and catastrophic in the census: measured 1,082 registered traders
 * sharing 131 distinct ids, which made the population appear to compound
 * without limit when in fact nothing was reproducing. Names are now minted
 * from a counter and carry the parent purely as decoration. */
let laborSeq = 0;
function nextLaborName(parentId) {
  const root = String(parentId || 'LABOR').split('(')[0];
  return `${root}#${++laborSeq}(born)`;
}

/* ---------------- concrete traders ---------------- */

export class LaborTrader extends Trader {
  constructor(sim, cfg, id) {
    super(sim, ComType.LABOR, id, cfg);
    this.orderedFood = 0;
    this.foodStock = 0;
    this.isTrigger = false;
    for (let i = 0; i < cfg.INIT_LABOR; i++) this.com.push(new Commodity(ComType.LABOR, this));
  }

  /* Labour sells 1 unit at a time, no transport fee (original override). */
  calculateTotals(q) {
    q.quant = 1;
    q.tp = 0;
    q.total = this.getPrice();
  }

  getPrice() {
    // labour does not use the shipping surcharge path
    return this.reserved ? this.reserve_price : this.price + this.priceOffset;
  }

  act() {
    if (this.isDead) return true;
    this._rearmIfStocked();
    this.useStandardOffsetModel();
    this.adjustPriceOffset();

    /* Reproduction.
     *
     * The commons breed faster than any court can schedule. An enforced
     * docket can remove a dozen of them, and by the next one the rolls are
     * full again — which is precisely why enforcement is so cheap for a ruler
     * to choose and so expensive for the people it removes.
     *
     * Breeding is paid for in bread. With the cell map's population cap gone
     * there is no longer anything holding the commons down, and an unpriced
     * birth rate compounds without limit — measured 2,835 and climbing
     * linearly at 30k ticks, while nine food producers sold 21,470 units into
     * an empty larder. A child is only born if the household can actually feed
     * it, so population is limited by the food supply, which is the only limit
     * that was ever honest. */
    if (this.cfg.LAB_CAN_SPAWN && this.com.length > this.cfg.LAB_SPAWN_RATE
        && this.sim.foodScarcity() < 0.85) {
      this.spawn();
    } else if (this.canBreed()) {
      this.birth();
    }

    if (this.deathCondition()) { this.die(); return false; }

    this.allowPriceDecrease = !this.sale;
    this.active = this.stock_();
    this.sale = false;
    return this.active;
  }

  /* Can this household afford another mouth?
   *
   * Breeding is paid for in bread. With the cell map's population cap gone
   * there is nothing left to hold the commons down, and a fixed birth chance
   * compounds without limit — measured 5,142 and doubling every 5k ticks,
   * with nine producers selling into a permanently empty larder.
   *
   * The household-level test (stock in hand, cash beyond a reserve) is
   * necessary but not sufficient: it gated 37 of 400 households and the
   * population still doubled, because 2% of a thousand households is twenty
   * births a tick. So the chance is also scaled by how well the whole economy
   * is being fed. When food is scarce the rate collapses toward zero, which
   * is the Malthusian brake: population is limited by the food supply, and
   * nothing artificial stands in its way. */
  canBreed() {
    const c = this.cfg;
    if (this.com.length <= (c.LAB_BIRTH_COST || 20) * 2) return false;
    const reserve = (c.LAB_BIRTH_RESERVE || 4000) * (1 + this.com.length / 200);
    if (this.account.balance < reserve) return false;

    // system-wide food pressure, sampled cheaply from the labor stock
    const sim = this.sim;
    const scarcity = sim.foodScarcity();
    if (scarcity > 0.999) return false;
    return Math.random() < (c.LAB_BIRTH_CHANCE || 0.1) * (1 - scarcity);
  }

  /* A newborn, funded by its parent out of existing stock. Cheap and quick:
   * this is what refills the commons between dockets. */
  birth() {
    const cost = this.cfg.LAB_BIRTH_COST || 20;
    if (this.com.length <= cost) return;
    const kid = new LaborTrader(this.sim, this.cfg, nextLaborName(this.id));
    kid.com.length = 0;
    kid.price = this.price;
    // placement is by industry; the network is unbounded so it always succeeds
    this.sim.map.place(kid, ComType.LABOR);
    for (let i = 0; i < cost; i++) kid.com.push(this.com.pop());
    kid.account.create(this.cfg.INIT_CASH);
    this.sim.directory.register(kid);
    this.sim.onSpawn?.(kid);
    this.births = (this.births || 0) + 1;
  }

  deathCondition() {
    if (!this.cfg.LAB_CAN_DIE) return false;
    if (this.com.length > 0) return false;
    /* The great houses do not starve. They hold deep reserves and are exempt
     * from every path out of the economy: enforcement spares them by design,
     * and they must survive the ordinary labour mechanism too, or they quietly
     * died of malnutrition under a ruling meant to protect them — measured:
     * 3 of 4 houses gone after 40k ticks of relentless enforcement, which
     * emptied the very constituency that makes enforcement attractive. */
    if (this.isElite) return false;
    // only starve when we truly cannot buy food — a solvent trader recovers
    const food = this.sim.directory.getCheapest(ComType.FOOD);
    if (food && this.account.balance >= food.getPrice()) return false;
    if (this.sim.laborCount() <= this.cfg.MIN_LABOR) return false;
    // Automatic stabilizer. Insolvency is allowed to bite, but relief scales
    // with how bad the crisis is, so a depression thins the workforce rather
    // than wiping it out — and a trader that gets one grant usually lives.
    const m = this.sim.macro;
    if (m && m.cfg.macroEnabled !== false && m.relieve(this)) return false;
    return true;
  }

  /* Founding a firm: the original's heavy-weight spawn, kept distinct from
   ordinary birth. It halves the parent's stock into a substantial new trader
   rather than dribbling out a newborn, which is how the population used to
   grow. */
  spawn() {
    if (!this.cfg.LAB_CAN_SPAWN) return;
    const take = Math.floor(this.cfg.LAB_SPAWN_RATE / 2);
    if (this.com.length <= take) return;
    const kid = new LaborTrader(this.sim, this.cfg, nextLaborName(this.id));
    kid.com.length = 0;                 // spawned trader starts empty...
    kid.price = this.price;
    this.sim.map.place(kid, ComType.LABOR);
    for (let i = 0; i < take; i++) kid.com.push(this.com.pop());  // ...funded by the parent
    kid.account.create(this.cfg.INIT_CASH);
    this.sim.directory.register(kid);
    this.sim.onSpawn?.(kid);
  }

  stock_() {
    // buy food in batches (MIN_FOOD_SELL), then consume it to produce labour
    if (this.foodStock <= 0) this.buy(ComType.FOOD, this.cfg.MIN_FOOD_SELL);
    const before = this.com.length;
    while (this.foodStock > 0) {
      this.foodStock--;
      this.com.push(new Commodity(ComType.LABOR, this));
    }
    if (this.com.length > before) this.isStocked = true;
    // if we couldn't get food, keep the order open and signal it
    if (this.foodStock === 0 && this.com.length === 0) this.allowPriceDecrease = false;
    return this.com.length > 0;
  }

  receive(type, item) {
    if (type === ComType.FOOD) { this.foodStock++; this.orderedFood = 0; return; }
    this.com.push(item);
    this.isStocked = true;
  }

  laborReceived() { this.orderedFood = 0; }
}

/* Generic goods trader: produced via labor, optionally tool-boosted. */
export class GoodsTrader extends Trader {
  constructor(sim, comType, id, cfg) {
    super(sim, comType, id, cfg);
    // Producers own their means of production. They are the middle class:
    // too substantial to be killed by a ruling, and the only people who can
    // ever found a house.
    this.socialClass = 'middle';
    this.toolsEnabled = true;
    this.laborStock = 0;
    this.toolStock = 0;
    this.reserveTool = false;
  }

  get laborOut() {
    return {
      [ComType.FOOD]: this.cfg.LABOR_FOOD,
      [ComType.COAL]: this.cfg.LABOR_COAL,
      [ComType.IRON]: this.cfg.LABOR_IRON,
    }[this.comType];
  }

  get toolOut() {
    return {
      [ComType.FOOD]: this.cfg.TOOL_FOOD,
      [ComType.COAL]: this.cfg.TOOL_COAL,
      [ComType.IRON]: this.cfg.TOOL_IRON,
      [ComType.TOOL]: 1,
    }[this.comType];
  }

  /* Production: consume labor, or a tool for a boosted yield. */
  generate() {
    const before = this.com.length;
    const useTool = this.toolsEnabled && this.toolStock > 0;

    // A supply shock costs output, a productivity boom adds it. Both ride on
    // the same roll so a glut and a famine are genuinely different worlds.
    const m = this.sim.macro;
    let yieldBonus = 0;
    if (m && m.cfg.macroEnabled !== false) {
      if (!m.productionRoll()) { this.isStocked = this.com.length > 0; return; }
      yieldBonus = m.productivity();
    }

    if (useTool) {
      this.toolStock--;
      for (let i = 0; i < this.toolOut; i++) this.com.push(new Commodity(this.comType, this));
    } else if (this.laborStock > 0) {
      this.laborStock--;
      for (let i = 0; i < this.laborOut; i++) this.com.push(new Commodity(this.comType, this));
    } else if (yieldBonus > 0) {
      // a technology surge still yields, it just does not consume inputs
      this.com.push(new Commodity(this.comType, this));
    }
    if (yieldBonus > 0) {
      const extra = Math.min(4, Math.round(this.laborOut * yieldBonus));
      for (let i = 0; i < extra; i++) this.com.push(new Commodity(this.comType, this));
    }
    // restocking clears the out-of-stock latch so sales can resume
    if (this.com.length > before) this.isStocked = true;
  }

  /* Bought inputs go to the input stock; outputs go to sellable inventory. */
  receive(type, item) {
    if (type === ComType.LABOR) this.laborStock++;
    else if (type === ComType.TOOL) this.toolStock++;
    else this.com.push(item);
    this.isStocked = true;
  }

  stock_() {
    // buy labour + tools to keep producing
    if (this.laborStock <= 0) this.buy(ComType.LABOR, 5);
    if (this.toolStock <= 0) this.buy(ComType.TOOL, 2);
    this.generate();
    // never sell below a working buffer
    return this.com.length > 0;
  }

  act() {
    if (this.isDead) return true;
    this._rearmIfStocked();
    if (!this.sale && this.com.length > 0 && this.cfg.supplyAndDemandEnabled) {
      this.allowPriceDecrease = true;
    }
    this.fixPriceToLabor();
    this.setTargetPriceOffset();
    this.adjustPriceOffset();
    this.active = this.stock_();
    this.sale = false;
    return this.active;
  }
}

/* Tool trader: 1 labor + 1 coal + 1 iron -> 1 tool */
export class ToolTrader extends GoodsTrader {
  constructor(sim, id, cfg) {
    super(sim, ComType.TOOL, id, cfg);
    this.coalStock = 0;
    this.ironStock = 0;
  }

  generate() {
    const before = this.com.length;
    while (this.laborStock >= this.cfg.REQ_LAB_FOR_TOOL &&
           this.coalStock > 0 && this.ironStock > 0) {
      this.laborStock -= this.cfg.REQ_LAB_FOR_TOOL;
      this.coalStock--;
      this.ironStock--;
      this.com.push(new Commodity(ComType.TOOL, this));
    }
    if (this.com.length > before) this.isStocked = true;
  }

  /* Original ToolTrader.priceFix(): labor cost + (iron+coal)/FIX_PRICE */
  fixPriceToLabor() {
    if (!this.cfg.fixPrice) return;
    const avgLabor = this.sim.directory.getAveragePriceOf(ComType.LABOR);
    const avgIron = this.sim.directory.getAveragePriceOf(ComType.IRON);
    const avgCoal = this.sim.directory.getAveragePriceOf(ComType.COAL);
    const p = avgLabor * this.cfg.REQ_LAB_FOR_TOOL +
              (avgIron + avgCoal) / this.cfg.FIX_PRICE;
    this.setPrice(Math.round(p));
  }

  stock_() {
    if (this.laborStock < this.cfg.REQ_LAB_FOR_TOOL) this.buy(ComType.LABOR, 3);
    if (this.coalStock <= 0) this.buy(ComType.COAL, 3);
    if (this.ironStock <= 0) this.buy(ComType.IRON, 3);
    this.generate();
    return true;
  }

  receive(type, item) {
    if (type === ComType.LABOR) this.laborStock++;
    else if (type === ComType.COAL) this.coalStock++;
    else if (type === ComType.IRON) this.ironStock++;
    else this.com.push(item);
  }
}

/* Transportation — singleton, index 0. Sells one unit per shipment. */
export class TransportationService extends Trader {
  constructor(sim, cfg) {
    super(sim, ComType.TRANSPORTATION, 'TRANSPORT', cfg);
    this.laborStock = 0;
    this.stock_unlimited = true;
    for (let i = 0; i < 400; i++) this.com.push(new Commodity(ComType.TRANSPORTATION, this));
  }

  /* transport price pegs to half the average labor price */
  fixPriceToLabor() {
    if (!this.cfg.fixPrice) return;
    const avg = this.sim.directory.getAveragePriceOf(ComType.LABOR);
    this.setPrice(Math.max(this.cfg.MIN_PRICE, Math.round(avg / 2)));
  }

  setTargetPriceOffset() { this.useStandardOffsetModel(); }

  getPrice() {
    return this.reserved ? this.reserve_price : this.price + this.priceOffset;
  }

  calculateTotals(q) {
    if (q.quant > this.com.length) q.quant = this.com.length;
    q.tp = 0;
    q.total = this.getPrice() * q.quant;
  }

  /* Shipping is an instantaneous fee, not a shipment of its own — the selling
   * trader spawns the real delivery. So this seller only moves money. */
  sellTo(buyer, acct, quant) {
    if (this.isDead || quant <= 0) return false;
    const q = { quant: Math.min(quant, this.cfg.TRANSPORT_MAX), tp: 0, total: 0 };
    q.total = this.getPrice() * q.quant;
    if (q.quant <= 0) return false;
    if (q.total > acct.balance) {
      acct.getLoan(q.total - acct.balance);
      if (acct.balance < q.total) { q.quant = Math.floor(acct.balance / this.getPrice()); q.total = this.getPrice() * q.quant; }
    }
    if (q.quant <= 0 || q.total <= 0) return false;
    if (!acct.send(this.account, q.total)) return false;
    this.quantity = q.quant;          // buy() reads this to credit the purchase
    this.sale_count += q.quant;
    this.sale = true;
    this.sellSuccess();
    return true;
  }

  /* Transportation is produced by consuming labor — this is what recirculates
   * the shipping fees the service collects, instead of hoarding them. */
  stock_() {
    if (this.laborStock <= 0) this.buy(ComType.LABOR, 1);
    let made = 0;
    while (this.laborStock > 0 && this.com.length < 400) {
      this.laborStock--;
      this.com.push(new Commodity(ComType.TRANSPORTATION, this));
      made++;
    }
    if (made && this.com.length) this.isStocked = true;
    // never let shipping fees pool unboundedly — pay them back out as wages
    if (this.account.balance > this.cfg.INIT_CASH * 4) {
      const excess = Math.floor((this.account.balance - this.cfg.INIT_CASH) / 2);
      const laborers = this.sim.directory.getListFromType(ComType.LABOR)
        .filter(t => t.id !== 'MASTER');
      if (laborers.length) {
        const each = Math.floor(excess / laborers.length);
        if (each > 0) {
          // transfer, never create — the money supply must not grow here
          const give = each * laborers.length;
          if (this.account.balance - give >= this.cfg.INIT_CASH) {
            this.account.balance -= give;
            for (const t of laborers) t.account.balance += each;
          }
        }
      }
    }
    return this.com.length > 0;
  }

  receive(type, item) {
    if (type === ComType.LABOR) { this.laborStock++; return; }
    this.com.push(item);
    this.isStocked = true;
  }

  /* transport must act every tick so fees keep circulating */
  act() {
    if (this.isDead) return true;
    this._rearmIfStocked();
    this.fixPriceToLabor();
    this.setTargetPriceOffset();
    this.adjustPriceOffset();
    this.active = this.stock_();
    this.sale = false;
    return this.active;
  }

  /* transport price is a pegged utility fee — it must never inflate on sales,
   * otherwise shipping eats the whole economy */
  sellSuccess() { this.sale = false; this.allowPriceDecrease = false; }

  adjustPriceOffset() {
    // snap toward target instead of creeping, so the fee stays honest
    if (this.targetOffset < this.priceOffset) {
      this.priceOffset = this.targetOffset;
    } else if (this.targetOffset > this.priceOffset) {
      this.priceOffset++;
    }
  }

  /* transport never "runs out" in the original */
  ranOutOfStock() { this.isStocked = true; }
}

/* Master trader — sovereign, receives all tax revenue, crown marker */
export class MasterTrader extends Trader {
  constructor(sim, cfg) {
    super(sim, ComType.LABOR, 'MASTER', cfg);
    this.account.taxCode = TaxCode.MASTER;
    // the master's account IS the tax account — it holds the tax pool
    this.price = cfg.MIN_PRICE;
    this.canTradeAll = true;
  }

  setTargetPriceOffset() { this.targetOffset = 0; }
  adjustPriceOffset() {}
  fixPriceToLabor() {}
  getPrice() { return this.price + this.priceOffset; }

  /* Master may buy/sell every commodity except labor and transportation. */
  accepts(type) {
    return type !== ComType.LABOR && type !== ComType.TRANSPORTATION;
  }

  act() {
    if (this.isDead) return true;
    this.sale = false;
    return true;
  }
}
