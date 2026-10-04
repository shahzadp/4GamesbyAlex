/* ------------------------------------------------------------------
 * Proto Web — simulator
 * Port of the original app's proto.lib.sim.Simulator (tick order + world bootstrap)
 *
 * Simulator.Next() order (from smali l.437-600):
 *   1. adj_totalCurrency = bankSum()
 *   2. bank.act()
 *   3. master.act()
 *   4. transport.act()
 *   5. if wait_for_t -> transport.act() again, return  (everything pauses)
 *   6. priority list, then everyone else
 * ------------------------------------------------------------------ */

import {
  Bank, BankStats, resetBankStats, clearPriceListeners, addPriceListener,
  Directory, ComType, LaborTrader, GoodsTrader, ToolTrader,
  TransportationService, MasterTrader, Trader, Commodity, TaxCode,
} from './economy.js';
import { GameMap, Traveler, NODE } from './map.js';
import { Credit } from './credit.js';
import { Macro } from './macro.js';
import { Sovereign } from './politics.js';
import { DEFAULT_CONFIG } from './config.js';
import { clamp } from './util.js';

/* Names for the great houses. Module scope: the seeding helper closes over
 * this, and a const declared inside the class body is not visible to methods. */
const HOUSE_NAMES = ['Ashgrove & Co.', 'Bexworth & Sons', 'Coldstream Ltd.',
  'Draymoor Holdings', 'Elmsworth Trust', 'Fenwick Partners', 'Grimsby Corp.',
  'Hartley & Co.', 'Ingram Holdings', 'Jessamine Group', 'Kelvin Ltd.',
  'Lansdowne Partners', 'Marchmont Trust', 'Northcliffe Ltd.',
  'Ottersby & Co.', 'Pemberton Holdings'];

export class Simulator {
  constructor(opts = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...(opts.cfg || {}) };
    this.map = opts.map || new GameMap();
    this.macro = new Macro(this.cfg);
    this.sovereign = new Sovereign(this.cfg, this);
    this.bank = new Bank(this.cfg, this.macro, this.sovereign);
    this.directory = new Directory();
    this.credit = new Credit(this);

    this.tickCount = 0;
    this.wait_for_t = false;
    /* Ticks until the court next sits. Reset by _build so a preset change or a
     * restore begins a clean cadence rather than inheriting a partial one. */
    this._docketCountdown = 0;
    /* There used to be a `this.paused = true` here, read by App._loop as
     * `if (this.running && !this.sim.paused)`. Nothing in the codebase ever set
     * it back to false, so the tick gate was shut permanently: pressing Play
     * flipped App.running, the button showed Pause, a toast said the simulation
     * was running, and tickCount stayed at 0 forever.
     *
     * It is a vestigial flag — App.running is the real authority, and the
     * simulator's own pause condition is Sovereign.holdsTime(), which stops the
     * world when a ruling is owed. Two pause concepts that disagreed, and the
     * simulation always lost. Removed rather than initialised to false, so the
     * next reader cannot mistake it for a live control.
     *
     * Measured before the fix: press Play, wait 2.5s, ticks advanced by 0. */

    this._build();
  }

  _build() {
    resetBankStats();
    clearPriceListeners();
    this.macro.reset();
    this._docketCountdown = 0;

    // central bank account = sovereign/tax account
    this.bank.master = new AccountProxy(this.bank);
    this.bank.reserve = this.cfg.INIT_CASH * 8;

    /* Placement is by industry, not by square. The map used to hand out grid
     * cells inside configured regions (Fxreg, Lxreg, …); with the cell map
     * gone those regions mean nothing and are ignored. What remains is the
     * only distinction that ever mattered economically: which industry a
     * trader belongs to. */
    const place = (trader) => {
      this.map.place(trader, trader.comType);
      this.directory.register(trader);
    };

    // the crown
    this.master = new MasterTrader(this, this.cfg);
    this.master.comType = ComType.LABOR;   // it is counted among the labour
    this.map.place(this.master, NODE.CROWN);
    this.directory.register(this.master);

    // the carriers
    this.transport = new TransportationService(this, this.cfg);
    this.map.place(this.transport, NODE.SHIPPING);
    this.directory.register(this.transport);

    this._populate(place);
    this._primeAccounts();
    this._seedElites();

    /* The macro layer needs to know how big the starting economy is, for two
     * separate scalings: the "is this economy still small enough that a lull is
     * just a ramp" test in the survival watchdog, and the base against which
     * the floating price ceiling is measured.
     *
     * It must be measured, not declared. It used to be the literal 81, which
     * was correct for exactly one starting configuration — so every scenario
     * that changed the population was calibrated against a baseline from a
     * different world, and the price ceiling for The Lean Years was anchored to
     * an economy eight times its own size. */
    this.macro._baseTraderCount = Math.max(1, this.directory.getCount());

    addPriceListener(origin => {
      for (const t of this.directory.all) t.priceDecSignalNotification(origin);
    });
  }

  _populate(place) {
    const c = this.cfg;

    // labour: INIT_LABOR_POP + 1 trigger trader
    for (let i = 0; i <= c.INIT_LABOR_POP; i++) {
      const t = new LaborTrader(this, c, `LABOR#${i + 1}`);
      if (i === 0) { t.isTrigger = true; t.com.push(new Commodity(ComType.LABOR, t)); }
      place(t);
    }

    for (let i = 0; i < c.FOOD_POP; i++)
      place(new GoodsTrader(this, ComType.FOOD, `FOOD#${i + 1}`, c));

    for (let i = 0; i < c.COAL_POP; i++)
      place(new GoodsTrader(this, ComType.COAL, `COAL#${i + 1}`, c));

    for (let i = 0; i < c.IRON_POP; i++)
      place(new GoodsTrader(this, ComType.IRON, `IRON#${i + 1}`, c));

    for (let i = 0; i < c.TOOL_POP; i++)
      place(new ToolTrader(this, `TOOL#${i + 1}`, c));
  }

  /* Give each trader an initial float of currency so the economy can turn over. */
  _primeAccounts() {
    for (const t of this.directory.all) {
      if (t === this.master) continue;
      if (t.account.balance === 0) t.account.create(this.cfg.INIT_CASH);
    }
    BankStats.adj_totalCurrency = this.bankSum();
  }

  /* The great houses.
   *
   * A small class of very wealthy houses, seeded with deep reserves. They
   * matter politically because enforcement cannot touch them: they can always
   * pay what they owe, so a ruling that buries the small spares them, and that
   * is exactly the ruling they want. They are the reason enforcement has an
   * constituency rather than only victims, and without them the choice was
   * moral rather than political.
   *
   * Their fortune also does real work in the economy — it is the demand that
   * keeps producers solvent through a credit crunch, which is why a state that
   * liquidates its small firms can still find anyone left to tax. */
  _seedElites() {
    const c = this.cfg;
    const want = Math.max(0, c.ELITE_POP || 0);
    if (!want) return;
    // Houses are founded from the MIDDLE class — the producers. A house whose
    // entire holding is the labour of its own name is an absurdity, and the
    // sort that put comType 0 (LABOR) first did exactly that: all four
    // initial houses were seeded onto commoners, which then had to be exempted
    // from enforcement by hand. Recruitment starts from producers, spread
    // across industries so no single chain is monopolised.
    const pool = this.directory.all.filter(t =>
      t.id !== 'MASTER' && t.socialClass === 'middle');
    if (!pool.length) return;
    const step = Math.max(1, Math.floor(pool.length / want));
    for (let i = 0, n = 0; n < want && i < pool.length; i += step, n++) {
      const t = pool[i];
      t.isElite = true;
      t.socialClass = 'elite';
      // a house is named like a house, not like a trader row in a debug dump
      t.eliteHouse = HOUSE_NAMES[n % HOUSE_NAMES.length];
      t.account.create(c.ELITE_CASH || c.INIT_CASH * 400);
      for (let k = 0; k < (c.ELITE_STOCK || 0); k++) {
        t.com.push(new Commodity(t.comType, t));
      }
      t.isStocked = true;
    }
  }

  bankSum() {
    let s = 0;
    for (const a of this.bank.accounts) s += a.balance;
    return s;
  }

  laborCount() {
    // MASTER is also typed LABOR but is not part of the workforce
    return this.directory.getListFromType(ComType.LABOR).filter(t => t.id !== 'MASTER').length;
  }

  /* How close the food supply is to failing, 0 (plenty) .. 1 (famine).
   *
   * This is the brake on population now that the cell map's cap is gone, so
   * it has to be cheap: it is consulted by every labourer every tick. It
   * therefore compares a cached per-window total of food actually in stock
   * against the appetite of the population, refreshed on the bank cycle and
   * interpolated in between. */
  foodScarcity() {
    if (this._scarcity == null) this._refreshScarcity();
    return this._scarcity;
  }

  _refreshScarcity() {
    let stock = 0;
    for (const f of this.directory.getListFromType(ComType.FOOD)) {
      if (!f.isDead) stock += f.com.length;
    }
    const mouths = this.laborCount();
    // each worker eats MIN_FOOD_SELL per restock cycle; compare a few cycles
    // of supply against a few cycles of demand
    const demand = mouths * (this.cfg.MIN_FOOD_SELL || 5) * 4;
    const raw = demand > 0 ? 1 - stock / demand : 1;
    this._scarcity = clamp(raw, 0, 1);
  }

  isWaiting() { return this.wait_for_t; }

  /* Deliveries are spawned as travellers; global overload pauses the world.
   * The transport service itself is instant (it just charges shipping), so it
   * must never be latched into isWaiting — that would stall all future sales. */
  spawnDelivery(seller, buyer, quant) {
    const instant = seller.comType === ComType.TRANSPORTATION;
    const trav = new Traveler(this.map, seller, buyer, seller.comType, quant);
    this.map.travellers.push(trav);
    if (!instant) { seller.inFlight = (seller.inFlight || 0) + 1; seller.isWaiting = true; }
    else seller.isWaiting = false;

    // Overload must clear on ticks, never on a timer — a timer would never
    // fire while the sim is stepped synchronously, freezing the world.
    const overload = this.transportOverloadLimit();
    if (!this.wait_for_t && this.map.travellers.length >= overload) {
      this.wait_for_t = true;
      this._overloadTicks = this.cfg.TRANSPORT_OVERLOAD_RESET;
    }
  }

  /* The traffic jam threshold.
   *
   * This was a flat 70, copied from the original, where a shipment was a
   * trader walking an A* route across a 20x20 grid and the world paused
   * because the roads were genuinely blocked. Neither half of that is true any
   * more: deliveries now fly along an arc and land in a couple of ticks, and
   * the population is roughly three times what the grid allowed.
   *
   * A flat number against an economy of unbounded size is not a limit, it is a
   * scheduling bug. At 70 the world latched into a permanent stop-go: every
   * release let the queue refill past the threshold on the very next tick, so
   * traders only ever acted in one tick and then stood still for sixty-nine.
   * Measured, the money supply froze dead at $1,681,398 from tick 6000 to
   * 20000 — the economy was not slow, it was alternating between a total
   * flood and a total stoppage.
   *
   * So the jam is now measured against the size of the economy, which is what
   * the original's number was standing in for all along. A jam still happens —
   * it has to, it is a real constraint and it makes shipping capacity matter —
   * but it is a jam and not a metronome. */
  transportOverloadLimit() {
    const floor = this.cfg.TRANSPORT_OVERLOAD || 70;
    const per = this.cfg.TRANSPORT_OVERLOAD_PER_TRADER || 8;
    return Math.max(floor, Math.floor(this.directory.getCount() * per));
  }

  /* clear the overload pause and shed the oldest shipped travellers */
  _releaseOverload() {
    this.wait_for_t = false;
    const reset = Math.max(1, Math.floor(this.transportOverloadLimit() * 0.92));
    const shed = Math.max(1, this.map.travellers.length - reset);
    const removing = this.map.travellers.splice(0, shed);
    for (const t of removing) if (!t.done) t.arrive();
  }

  /* ---------------- tick ---------------- */
  next() {
    /* A ruling is owed. The world holds completely still until the player
     * answers — this is the one thing that genuinely interrupts the
     * simulation. Deliberately does NOT advance tickCount: time must not
     * pass in a country waiting on a decision, or a long deliberation would
     * quietly age the economy while frozen. An unanswered election holds the
     * world in the same way: a country does not run its clock while the
     * result is being contested. */
    if (this.sovereign && this.sovereign.holdsTime()) return;

    BankStats.totalCurrency = this.bankSum();
    BankStats.adj_totalCurrency = BankStats.totalCurrency;

    /* Debt service comes first: the sovereign's obligations are paid on the
     * tick they fall due, before anyone gets to trade with the money. */
    if (this.credit) this.credit.tick();

    // the macro layer observes the last tick and sets the multipliers the
    // agents below will act on — run it before anything trades
    this.macro.tick(this);

    const cycleBefore = this.bank.cycle;
    this.bank.act();
    // refresh the food-pressure reading once per bank cycle
    this._scarcity = null;
    /* Reclaim anything stranded on an account whose trader has left the
     * directory. Bank.act() walks `bank.accounts`, which only ever grows, so
     * without this a departed trader's balance is counted in the money supply
     * forever. Gated to the bank cycle, and cheap when idle — see the removal
     * counter in Bank.reclaimOrphans. */
    if (this.bank.cycle === 0 && cycleBefore !== 0) this.bank.reclaimOrphans(this);

    /* Seal the court's claims into one ruling for the player.
     *
     * This used to fire on every bank cycle — every 11th tick — because the
     * docket was bolted onto the same counter that collects interest. That made
     * the court a creditor meeting rather than a sovereign one: measured, 144
     * dockets in 3,000 ticks, EVERY one carrying claims (mean 3.2), so the
     * player was interrupted roughly every 21 ticks. At 8 ticks/second an
     * election 1,825 ticks away was unreachable in practice — not because the
     * schedule was wrong but because you never got to play long enough to reach
     * it. It also made MEMORY's "read a docket at your leisure" untrue: there
     * was no leisure.
     *
     * The court now sits on its own cadence, quarterly like the coupons, which
     * is what a sovereign actually does with a docket. Claims keep accruing in
     * the meantime and are settled together, so a session has whole stretches
     * of uninterrupted play punctuated by a real decision — which is the rhythm
     * the game is built around.
     *
     * Configurable, because the right cadence is a design choice and not
     * something that should be argued about in the tick loop. */
    if (this.sovereign) {
      if (--this._docketCountdown <= 0) {
        this._docketCountdown = this.cfg.DOCKET_PERIOD_TICKS || 90;
        this.sovereign.sealDocket();
      }
    }

    this.sovereign?.tick();
    this.master.act();
    this.transport.act();

    // travellers always move — pausing them would mean the queue never drains
    this.map.tick();

    if (this.wait_for_t) {
      if (this._overloadTicks > 0) this._overloadTicks--;
      if (this._overloadTicks <= 0) this._releaseOverload();
      this.tickCount++;
      return;
    }

    for (const t of this.directory.getActOrder()) {
      if (t.isDead) continue;
      t.act();
    }

    this.tickCount++;
  }

  stats() {
    return {
      tick: this.tickCount,
      gdp: BankStats.totalTrValue,
      transactions: BankStats.transactionCount,
      currency: BankStats.totalCurrency,
      debt: BankStats.totalDebt,
      insolvency: BankStats.insolvencyHits,
      writeOffs: BankStats.writeOffs || 0,
      created: BankStats.moneyCreated,
      destroyed: BankStats.moneyDestroyed,
      laborPop: this.laborCount(),
      traders: this.directory.getCount(),
      reserve: this.bank.reserve,
      bankBalance: this.bank.master.balance,
      travelers: this.map.travellers.length,
      macro: this.macro.describe(),
      politics: this.sovereign ? this.sovereign.describe() : null,
    };
  }

  /* per-commodity aggregates for stats/graph */
  comStats() {
    const out = [];
    for (const type of [0, 1, 2, 3, 4, 5]) {
      const list = this.directory.getListFromType(type);
      let stock = 0, sold = 0, priceSum = 0, priceN = 0;
      for (const t of list) {
        stock += t.com.length;
        sold += t.sale_count;
        if (t.id !== 'MASTER') { priceSum += t.getPrice(); priceN++; }
      }
      out.push({
        type, count: list.length, stock, sold,
        price: priceN ? priceSum / priceN : 0,
      });
    }
    return out;
  }

  reset() {
    this.map = new GameMap();
    this.macro = new Macro(this.cfg);
    this.sovereign = new Sovereign(this.cfg, this);
    this.bank = new Bank(this.cfg, this.macro, this.sovereign);
    this.directory = new Directory();
    this.credit.reset();
    this.tickCount = 0;
    this.wait_for_t = false;
    this._build();
  }
}

/* The bank's own account (money creation source). */
class AccountProxy {
  constructor(bank) {
    this.bank = bank;
    this.balance = 0;
    this.debt = 0;
    this.freeze = false;
    this.taxCode = TaxCode.MASTER;
  }
  __edit(d) {
    if (!Number.isFinite(d)) return;
    this.balance += d;
  }
  __transfer(to, amt) {
    if (this.balance < amt) return false;
    this.__edit(-amt);
    to.__edit(amt);
    return true;
  }
}
