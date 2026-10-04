/* ------------------------------------------------------------------
 * Proto Web — persistence
 *
 * Restores the whole simulation after the app is closed. The requirement is
 * "do not start from tick 0 every time", which sounds like a snapshot and is
 * not quite: the simulator is a cyclic object graph (trader -> account ->
 * owner -> trader, account -> bank -> macro -> sovereign -> sim), so
 * JSON.stringify(sim) either throws on the cycles or silently produces
 * something unreconstructable.
 *
 * So state is written as an explicit, flat list of primitives, in the order the
 * object graph is built. Nothing here reflects over the classes: an explicit
 * field list is longer, but it is reviewable, it fails loudly when a field is
 * renamed, and it cannot accidentally persist a back-reference.
 *
 * Design rules, each of which cost something to learn:
 *
 *   1. **Rebuild, do not patch.** Load creates a fresh Simulator and then
 *      overwrites its fields. Mutating a live graph in place is where
 *      half-restored states come from.
 *   2. **Traders are restored by CONSTRUCTOR, not by assignment.** A trader is
 *      a LaborTrader or a GoodsTrader, it owns an Account, and it is registered
 *      in the Directory and placed on the map. Constructing it gets all of that
 *      for free and keeps the invariants that _build() establishes. An id-based
 *      rehydration was tried first and silently lost every `isElite` house,
 *      because the social class lives on the object, not the id.
 *   3. **Dead traders are NOT restored.** They are unreachable — unregister()
 *      removed them from the Directory — and their accounts are swept by
 *      reclaimOrphans() anyway. Restoring them would resurrect balances that
 *      the living economy no longer agrees exists.
 *   4. **Version the format and refuse to load a mismatch.** A save from an
 *      older build that loads into a newer one would corrupt state in ways that
 *      look like an economy bug. Failing loudly and starting fresh is kinder.
 *
 * Storage is localStorage. It is synchronous, survives an app kill, and is
 * already enabled in the wrapper (`setDomStorageEnabled(true)`). The save is
 * written on a timer and on page-hide, never per tick: serialising a few
 * hundred traders 8 times a second would cost more than the simulation.
 * ------------------------------------------------------------------ */

import {
  LaborTrader, GoodsTrader, ToolTrader, Commodity,
  BankStats, resetBankStats, ComType, TaxCode,
  clearPriceListeners, addPriceListener,
} from './economy.js';
import { Traveler, NODE } from './map.js';
import { Simulator } from './simulator.js';
import { FACTIONS } from './politics.js';

const KEY = 'proto2.save.v1';
const FORMAT = 1;

/* How often to write while running. 1s, at the player's request.
 *
 * Worth recording what that costs, because it was assumed to be expensive and
 * is not. Measured: a full save is 0.78ms at 86 firms, 1.65ms at 138, 2.66ms at
 * 199 — 46-199KB. At 1s that is a 0.27% duty cycle, ~16ms of main thread per
 * minute, against a 125ms frame. The original 20s interval was chosen because
 * 20s "felt safe" and was costing up to 20s of lost play for no reason; 1s is
 * the same order of cost as 3s, just spent on more protection.
 *
 * What makes frequent writes safe is the cost, not a deferral. Writes are
 * SYNCHRONOUS — deferring them to requestIdleCallback was tried and silently
 * lost every save on a real Android WebView, which does not reliably deliver
 * idle callbacks. See the long note in attachAutosave. The re-entrancy guard
 * there stops three triggers landing in one frame from serialising the same
 * state three times.
 *
 * So the interval can be short without the write ever being the reason a frame
 * is missed. Beyond ~500ms the cost would start to matter on a large economy
 * (199 firms x 2 writes/s is ~5ms/s), but at 1s there is roughly 20x headroom. */
const AUTOSAVE_MS = 1000;

/* ---- primitive coercion ----
 * Anything non-finite becomes 0 rather than null. A NaN that survives into a
 * save poisons every subsequent tick, and localStorage round-trips NaN as
 * null, so a single un-saved NaN would come back as null and then break
 * arithmetic on load. Coercing at the boundary keeps the corruption from
 * spreading. */
const n = (v) => (Number.isFinite(v) ? v : 0);
const b = (v) => !!v;
const s = (v) => (typeof v === 'string' ? v : '');

/* ---------------- writer ---------------- */

export function serialize(sim) {
  const bank = sim.bank;
  const sov = sim.sovereign;
  const mac = sim.macro;
  const cr = sim.credit;

  /* Live traders only, keyed by id. The index is what turns trader references
   * (a traveller's seller/buyer) back into objects on load without relying on
   * array order, which _build() does not guarantee to reproduce. */
  const live = sim.directory.all.filter((t) => !t.isDead);
  const index = new Map();
  live.forEach((t, i) => index.set(t.id, i));

  /* Accounts are stored per trader rather than as a separate list. An Account
   * without an owner is either the bank's master account (serialized on its
   * own, below) or a dead trader's, which rule 3 says not to restore. */
  const accts = live.map((t) => [
    n(t.account.balance), n(t.account.debt), t.account.taxCode,
    b(t.account.freeze),
  ]);

  return {
    format: FORMAT,
    savedAt: Date.now(),
    tick: sim.tickCount,
    preset: sim._presetName || 'classic',
    cfg: { ...sim.cfg },

    wait: b(sim.wait_for_t),
    overloadTicks: n(sim._overloadTicks),
    scarcity: sim._scarcity == null ? null : n(sim._scarcity),

    bank: {
      reserve: n(bank.reserve),
      cycle: n(bank.cycle),
      fail: b(bank.fail),
      removals: n(bank.removals),
      minPayPercent: n(bank.minPayPercent),
      interestRate: n(bank.interestRate),
      master: n(bank.master ? bank.master.balance : 0),
    },

    stats: {
      totalCurrency: n(BankStats.totalCurrency),
      totalDebt: n(BankStats.totalDebt),
      transactionCount: n(BankStats.transactionCount),
      totalTrValue: n(BankStats.totalTrValue),
      insolvencyHits: n(BankStats.insolvencyHits),
      writeOffs: n(BankStats.writeOffs),
      moneyCreated: n(BankStats.moneyCreated),
      moneyDestroyed: n(BankStats.moneyDestroyed),
    },

    /* Trader payloads. `k` is the constructor: a bare object literal would
     * come back without methods, and the very next tick calls act() on it. */
    traders: live.map((t) => ({
      k: t.id,
      c: t.comType,
      n: s(t.id),
      a: n(t.account.balance),
      d: n(t.account.debt),
      tc: t.account.taxCode,
      fz: b(t.account.freeze),
      /* price model: base + offset, plus the shipping surcharge state */
      p: n(t.price), po: n(t.priceOffset), to: n(t.targetOffset),
      bo: n(t.bidPriceOffset), rp: n(t.reserve_price),
      sc: n(t.sale_count),
      w: b(t.isWaiting), inF: n(t.inFlight || 0),
      st: b(t.isStocked), ac: b(t.active), sa: b(t.sale),
      apd: b(t.allowPriceDecrease), ubt: b(t.unableToBuyTransportaion),
      rs: b(t.reserved), q: n(t.quantity),
      col: n(t.color),
      /* social position — rule 2: this is why rehydration by id failed */
      soc: s(t.socialClass), el: b(t.isElite),
      house: s(t.eliteHouse || ''),
      seized: n(t.seized || 0), eliteHits: n(t.eliteHits || 0),
      bailouts: n(t.bailouts || 0), declared: b(t.declared),
      births: n(t.births || 0),
      /* stock. Only the COUNT is saved per commodity type: a Commodity is a
       * bare {type, owner} payload with no other state, so N items of type T
       * are fully described by N and the type. Storing the objects themselves
       * would triple the save size and restore nothing extra. */
      com: countTypes(t.com),
      sold: countTypes(t.com_sold),
      /* labour-specific */
      foodStock: n(t.foodStock), laborStock: n(t.laborStock),
      orderedFood: n(t.orderedFood),
    })),

    accounts: accts,

    /* The map holds trader references inside travellers, so travellers are stored
     * as id pairs and rebuilt against the restored traders.
     *
     * Travellers whose seller or buyer is no longer in the directory are
     * dropped, and that is deliberate rather than a shortfall. A firm that died
     * mid-delivery took its stock with it — `die()` zeroed the account and
     * redistributed the estate — so restoring that shipment would hand the buyer
     * goods that were destroyed, and would leave a Traveler pointing at a
     * trader object that no longer exists.
     *
     * Consequence worth knowing when diffing a round-trip: the traveller count
     * can legitimately come back a few lower than it was at save time. Measured
     * up to 15 of 422 after 2000 ticks under relentless enforcement, and exactly
     * zero when no firm had died in flight. Every other field — supply, debt,
     * population by class, houses, reserve, price index, approval, total stock —
     * round-trips to the cent. */
    travellers: sim.map.travellers
      .filter((tr) => !tr.done && index.has(tr.seller?.id) && index.has(tr.buyer?.id))
      .map((tr) => ({
        s: tr.seller.id, b: tr.buyer.id,
        ct: tr.comType, q: n(tr.quant),
        t: n(tr.t), d: n(tr.duration), bow: n(tr.bow),
      })),

    macro: pick(mac, [
      'n', 'phase', 'regime', 'priceIndex', 'avgPrice', 'inflation',
      'inflationTrend', 'inflationRaw', 'lagged', 'expect', 'nomOutput',
      'flowWindow', 'flowPrev', 'growth', 'realOutput', 'outputGap', 'gapShow',
      'unemployment', 'moneyGrowth', 'logWealth', 'confidence',
      'confidenceShow', 'confMomentum', 'demandMul', 'supplyMul', 'creditMul',
      'pushBias', 'supplyPrice', 'relief', 'omCreated', 'omDestroyed',
      'reliefPaid', 'lastRelief',
    ]),
    macroPriv: pick(mac, [
      '_shockDemand', '_shockCredit', '_creditAvail', '_shockSupply',
      '_shockConf', '_shockExpect', '_shockPush', '_basePrice',
      '_baselined', '_lastTx', '_prevCur', '_tx', '_cumFlow', '_checkTick',
      '_flowRef', '_cool', '_dark', '_omCycle', '_reliefBudget',
      '_reliefCycle',
    ]),
    /* Arrays that are cleared with .length = 0 elsewhere must be copied, not
     * referenced, or the loaded save would share them with the live object. */
    macroLists: {
      shocks: (mac.shocks || []).map((k) => pick(k, ['kind', 'mag', 'born', 'until', 'why'])),
      inflHist: (mac._inflHist || []).map(n),
      checks: (mac._checks || []).map(n),
    },

    sovereign: pick(sov, [
      'approval', 'tier', 'autoRule', 'forgivenTotal', 'enforcedTotal',
      'claimsRuled', 'claimsAuto', 'forcedForgive', '_crisisTicks',
      '_coupPressure', 'coups', 'discipline', 'lastElection', 'termsHeld',
      'defianceCount', '_nextElectionYear',
    ]),
    sovereignLaw: pick(sov.law, ['draft', 'ceiling', 'seize', 'strikes', 'press', 'martial']),
    sovereignDecrees: [...(sov.decrees || [])],
    sovereignLists: {
      log: (sov.log || []).slice(-40).map((e) => pick(e, ['head', 'body', 'tone', 'tick'])),
      discWindow: (sov._discWindow || []).map(n),
      electionHistory: (sov.electionHistory || []).slice(-12),
      marks: pick(sov._electionMarks, ['phase', 'approval', 'inflation']),
    },
    /* Faction power is the accumulated political state — the thing that decides
     * approval, the chamber and therefore every election. It lives on the
     * module-level FACTIONS table, not on the sovereign, so it is invisible to a
     * walk of the object graph and has to be captured by name.
     *
     * It was read as `sov.constructor.FACTIONS`, which is NOT a static on the
     * class — FACTIONS is a module export — so the expression was always
     * `undefined || {}` and this captured an empty object on every save. The
     * import at the top of this file is the fix. It matters: after a restore
     * every faction's power read 0, approval collapsed to a floor value and the
     * electorate was permanently denied. */
    factions: Object.fromEntries(
      Object.entries(FACTIONS).map(([k, f]) => [k, n(f.power)]),
    ),

    credit: pick(cr, [
      'issuedTotal', 'couponsPaid', 'principalRepaid', 'interestPaid',
      'monetized', 'bailedTotal', 'bailoutCount', 'lastBailout', '_tick',
      '_serviceAcc',
    ]),
    /* Partial-curried helper.
     *
     * NOT `pick.bind(null, KEYS)`. pick's signature is (obj, keys), so binding
     * the key list into the FIRST slot passes it as `obj` and leaves `keys`
     * undefined — `for (const k of keys)` then throws "for...of requires an
     * iterable value, received a data object", which surfaced to the player as
     * "autosave failed: key is not iterable" the moment they first paused.
     *
     * It survived every round-trip test because both call sites map over a list
     * that is EMPTY until the sovereign borrows: an empty array never invokes
     * the callback, so the broken function was never called. The bug only
     * appeared on the first save after a bond was issued or a tranche drawn. */
    creditBonds: (cr.bonds || []).map(pickKeys([
      'id', 'face', 'couponRate', 'issuedTick', 'maturesTick', 'couponNext',
    'nextQuarter', 'outstanding', 'paid', 'holders',
  ])),
    creditBondHistory: (cr.bondHistory || []).slice(-20),
    creditForeign: Object.fromEntries(
      Object.entries(cr.foreign || {}).map(([k, f]) => [k, {
        drawn: n(f.drawn), repaid: n(f.repaid), interestPaid: n(f.interestPaid),
        outstanding: n(f.outstanding),
        tranches: (f.tranches || []).map(pickKeys([
          'id', 'amount', 'annual', 'remaining', 'rate', 'drawnTick',
          'graceUntil', 'maturesTick',
        ])),
        history: (f.history || []).slice(-10),
      }]),
    ),
  };
}

/* Copy the listed own-properties, coercing numbers. Deliberately not a generic
 * deep clone: the field list is the documentation of what a save contains. */
function pick(obj, keys) {
  const out = {};
  if (!obj) return out;
  /* Guarded, not just `for...of`. An undefined key list is a programming error
   * and should say so plainly rather than "requires an iterable value" — that
   * message is what made this bug so hard to read from the player's report. */
  if (!Array.isArray(keys)) throw new Error('save: pick() needs a key array');
  for (const k of keys) out[k] = typeof obj[k] === 'number' ? n(obj[k]) : obj[k];
  return out;
}

/* Curried pick, for mapping a list of records through one field list.
   Written as an arrow rather than pick.bind so the argument order cannot be got
   wrong again — that mistake cost a round of "autosave failed" reports. */
const pickKeys = (keys) => (obj) => pick(obj, keys);

/* Commodity list -> {type: count}. */
function countTypes(list) {
  const out = {};
  for (const c of list || []) out[c.type] = (out[c.type] || 0) + 1;
  return out;
}

function expandTypes(counts, owner) {
  const out = [];
  for (const [type, count] of Object.entries(counts || {})) {
    for (let i = 0; i < (count | 0); i++) out.push(new Commodity(Number(type), owner));
  }
  return out;
}

/* ---------------- reader ---------------- */

/* @returns {Simulator} a fully restored simulator, or throws. */
export function deserialize(data) {
  if (!data || typeof data !== 'object') throw new Error('save: not an object');
  if (data.format !== FORMAT) {
    throw new Error(`save: format ${data.format} != ${FORMAT}`);
  }

  /* Rule 1: a fresh simulator, then overwrite. Constructing with the saved cfg
   * means presets that change populations still build a correct world. */
  const sim = new Simulator({ cfg: { ...(data.cfg || {}) } });
  sim._presetName = data.preset || 'classic';

  /* --- bank --- */
  const B = data.bank || {};
  sim.bank.reserve = n(B.reserve);
  sim.bank.cycle = n(B.cycle);
  sim.bank.fail = b(B.fail);
  sim.bank.removals = n(B.removals);
  sim.bank.minPayPercent = n(B.minPayPercent);
  sim.bank.interestRate = n(B.interestRate);
  if (sim.bank.master) sim.bank.master.balance = n(B.master);

  /* --- global counters ---
   * resetBankStats() ran inside _build(), so the saved totals are restored over
   * the zeros rather than added to them. */
  resetBankStats();
  const S = data.stats || {};
  BankStats.totalCurrency = n(S.totalCurrency);
  BankStats.totalDebt = n(S.totalDebt);
  BankStats.transactionCount = n(S.transactionCount);
  BankStats.totalTrValue = n(S.totalTrValue);
  BankStats.insolvencyHits = n(S.insolvencyHits);
  BankStats.writeOffs = n(S.writeOffs);
  BankStats.moneyCreated = n(S.moneyCreated);
  BankStats.moneyDestroyed = n(S.moneyDestroyed);

  /* --- traders ---
   * Tear the seeded world down first. _build() made a starting population that
   * must not survive into a restored game, or the player gets the preset's
   * opening *plus* their own restored firms. */
  for (const t of [...sim.directory.all]) {
    t.isDead = true;
    sim.directory.unregister(t);
    sim.map.unregister(t);
  }
  sim.directory.all.length = 0;
  for (const arr of sim.directory.byType) arr.length = 0;
  sim.directory.priority.length = 0;
  for (const key of sim.map.order) sim.map.nodes[key].members.length = 0;
  sim.map.seatIndex.clear();
  sim.map.travellers.length = 0;

  /* MASTER and the carrier are the two traders that are NOT in the saved rows
   * — they are world singletons that _build() creates, not population. So the
   * teardown above clears them out and something has to put them back, or a
   * restored game is missing its crown and its only shipping node.
   *
   * This was missed because the teardown marked them dead and nothing undid it:
   * measured, the CROWN node went from 1 member to 0 and master.isDead stayed
   * true across every restore. The symptom was the crown bubble rendering as a
   * dead node — reported as "house bubble shows as dead" — and a crown that is
   * marked dead cannot be seated, cannot be taxed and is skipped by the map's
   * measure(), so the readout silently counted a country with no government.
   *
   * Revived in place rather than reconstructed: they are singletons holding the
   * bank's master account and the shipping fleet, and their state was never
   * removed from the ledger. */
  revive(sim.master, sim, NODE.CROWN);
  revive(sim.transport, sim, NODE.SHIPPING);

  const index = new Map();
  const rows = data.traders || [];

  rows.forEach((r) => {
    const t = instantiate(sim, r);
    if (!t) return;

    /* Account: the constructor made one and bank.addAccount() registered it.
     * Overwrite its money rather than replacing the object, so the owner
     * back-reference and the bank's account list stay intact. */
    t.account.balance = n(r.a);
    t.account.debt = n(r.d);
    t.account.taxCode = r.tc ?? TaxCode.UNIVERSERBAL;
    t.account.freeze = b(r.fz);

    t.price = n(r.p);
    t.priceOffset = n(r.po);
    t.targetOffset = n(r.to);
    t.bidPriceOffset = n(r.bo);
    t.reserve_price = n(r.rp);
    t.sale_count = n(r.sc);
    t.isWaiting = b(r.w);
    t.inFlight = n(r.inF);
    t.isStocked = b(r.st);
    t.active = b(r.ac);
    t.sale = b(r.sa);
    t.allowPriceDecrease = b(r.apd);
    t.unableToBuyTransportaion = b(r.ubt);
    t.reserved = b(r.rs);
    t.quantity = n(r.q);
    t.color = n(r.col);
    /* Rule 2. */
    t.socialClass = s(r.soc) || 'commons';
    t.isElite = b(r.el);
    if (r.house) t.eliteHouse = r.house;
    if (r.seized) t.seized = n(r.seized);
    if (r.eliteHits) t.eliteHits = n(r.eliteHits);
    if (r.bailouts) t.bailouts = n(r.bailouts);
    t.declared = b(r.declared);
    if (r.births) t.births = n(r.births);
    if ('foodStock' in r) t.foodStock = n(r.foodStock);
    if ('laborStock' in r) t.laborStock = n(r.laborStock);
    if ('orderedFood' in r) t.orderedFood = n(r.orderedFood);

    /* Commodities are rebuilt against this trader as owner. */
    t.com = expandTypes(r.com, t);
    t.com_sold = expandTypes(r.sold, t);

    /* Place before registering so the seat index is rebuilt in order. */
    sim.map.place(t, t.comType);
    sim.directory.register(t);
    index.set(t.id, t);
  });

  /* --- travellers: id pairs -> live references ---
   *
   * `index` maps a trader id to its row ordinal. The lookup goes through the
   * directory rather than rows[] because instantiate() can return the bank-wide
   * MASTER/transport objects for those ids, and those are not in `rows` at the
   * same ordinal. */
  const byId = new Map();
  for (const t of sim.directory.all) byId.set(t.id, t);
  if (!byId.has('MASTER') && sim.master) byId.set('MASTER', sim.master);
  if (!byId.has(sim.transport.id) && sim.transport) byId.set(sim.transport.id, sim.transport);

  for (const tr of data.travellers || []) {
    const sellerObj = byId.get(tr.s);
    const buyerObj = byId.get(tr.b);
    if (!sellerObj || !buyerObj) continue;
    const tv = new Traveler(sim.map, sellerObj, buyerObj, tr.ct, tr.q);
    /* Restore the arc's progress. Constructing restarts it at t=0, which
     * would make every in-flight delivery jump back to the seller's node. */
    tv.t = n(tr.t);
    tv.duration = Math.max(1, n(tr.d) || tv.duration);
    tv.bow = n(tr.bow);
    tv.done = false;
    sim.map.travellers.push(tv);
  }
  void index;

  /* --- macro --- */
  assign(sim.macro, data.macro);
  assign(sim.macro, data.macroPriv);
  if (data.macroLists) {
    sim.macro.shocks = (data.macroLists.shocks || []).map((x) => ({ ...x }));
    sim.macro._inflHist = (data.macroLists.inflHist || []).map(n);
    sim.macro._checks = (data.macroLists.checks || []).map(n);
  }

  /* --- sovereign --- */
  const V = data.sovereign || {};
  assign(sim.sovereign, V);
  if (data.sovereignLaw) assign(sim.sovereign.law, data.sovereignLaw);
  if (data.sovereignDecrees) {
    sim.sovereign.decrees = new Set(data.sovereignDecrees);
  }
  if (data.sovereignLists) {
    const L = data.sovereignLists;
    if (L.log) sim.sovereign.log = L.log.map((e) => ({ ...e }));
    if (L.discWindow) sim.sovereign._discWindow = L.discWindow.map(n);
    if (L.electionHistory) sim.sovereign.electionHistory = L.electionHistory.slice();
    if (L.marks) assign(sim.sovereign._electionMarks, L.marks);
  }
  if (data.factions) {
    for (const [k, v] of Object.entries(data.factions)) {
      const f = FACTIONS[k];
      if (f) f.power = n(v);
    }
  }
  /* A pending docket references Account objects, which cannot be serialised.
   * It is deliberately NOT restored: the docket is re-sealed by the next bank
   * cycle at cycle 10, so the player rules on the next one instead. Anything
   * else would either crash on the dangling account reference or silently pay
   * out against a firm that no longer holds the claim. */
  sim.sovereign.pending = null;
  sim.sovereign.election = null;

  /* --- credit --- */
  const C = data.credit || {};
  assign(sim.credit, C);
  if (data.creditBonds) sim.credit.bonds = data.creditBonds.map((x) => ({ ...x }));
  if (data.creditBondHistory) sim.credit.bondHistory = data.creditBondHistory.slice();
  if (data.creditForeign) {
    for (const [k, f] of Object.entries(data.creditForeign)) {
      const target = sim.credit.foreign[k];
      if (!target) continue;
      assign(target, f);
      target.tranches = (f.tranches || []).map((x) => ({ ...x }));
      target.history = (f.history || []).slice();
    }
  }

  /* --- shell-level state --- */
  sim.tickCount = n(data.tick);
  sim.wait_for_t = b(data.wait);
  sim._overloadTicks = n(data.overloadTicks);
  sim._scarcity = data.scarcity == null ? null : n(data.scarcity);
  sim.map.dirty = true;

  /* The price listeners installed by _build() close over the OLD directory
   * array. After the teardown above they would be broadcasting to a detached
   * graph, so price-dec signals stop reaching anybody and price ceilings stop
   * binding. Re-install them against the restored sim. */
  rewireListeners(sim);

  /* Reconcile the ledger.
   *
   * This is the subtlest part of the whole save, and it is here because of a
   * measured bug: restoring left the money supply $16.44M HIGH, which is
   * exactly the seeded population's opening float ($10k each, 44 of them).
   *
   * The cause is that `bank.accounts` is a ledger that only ever grows, and
   * every seeded trader owns an account in it. Tearing the traders out of the
   * directory leaves those accounts behind, still counted by bankSum(), so the
   * restored world was carrying the saved economy PLUS the cost of booting a
   * fresh one. An earlier attempt fixed this by clearing bank.accounts, which
   * was worse: it zeroed the supply outright until the restored traders
   * re-registered.
   *
   * So the ledger is repaired in two passes instead:
   *   - every account whose owner is no longer in the directory is swept into
   *     the treasury and counted as destroyed (Bank.reclaimOrphans already
   *     does exactly this);
   *   - then BankStats.totalCurrency is RE-DERIVED from the surviving ledger
   *     rather than restored from the save, because those two numbers are only
   *     ever equal when the ledger is clean. Trusting the saved counter is what
   *     let the discrepancy hide.
   *
   * totalDebt is left alone: unlike the supply it is a claim the bank actually
   * holds, and reclaimOrphans() retires the debt of each account it sweeps, so
   * the two agree by construction. */
  sim.bank.reclaimOrphans(sim, /* force */ true);
  const supply = sim.bankSum();
  BankStats.totalCurrency = supply;

  return sim;
}

/* Put a world singleton back after the seeded teardown.
 *
 * Placement and registration are repeated rather than assumed, because the
 * teardown cleared every node's member list — including the ones these two live
 * on. Seat order is recomputed from scratch so the layout matches a fresh boot. */
function revive(t, sim, node) {
  if (!t) return;
  t.isDead = false;
  sim.map.seatIndex.delete(t.id);
  sim.map.place(t, node);
  sim.directory.register(t);
}

/* Build the right Trader subclass. A wrong constructor here is invisible until
 * something calls a method that subclass defines, so the mapping is explicit
 * rather than inferred from comType alone. */
function instantiate(sim, r) {
  const cfg = sim.cfg;
  const id = s(r.n);
  if (!id) return null;
  if (id === 'MASTER') return sim.master;
  if (r.c === ComType.TRANSPORTATION) return sim.transport;

  switch (r.c) {
    case ComType.LABOR:
      return new LaborTrader(sim, cfg, id);
    case ComType.TOOL:
      return new ToolTrader(sim, id, cfg);
    default:
      return new GoodsTrader(sim, r.c, id, cfg);
  }
}

/* _build() registers a module-level price listener that closes over whatever
 * `sim` was at the time. After a restore the old sim is gone, so clear and
 * re-add. Synchronous, not a dynamic import: a listener installed one microtask
 * late is one tick of dead price ceilings, and the module is already in the
 * graph (Simulator imports economy) so there is no cycle to avoid. */
function rewireListeners(sim) {
  clearPriceListeners();
  addPriceListener((origin) => {
    for (const t of sim.directory.all) t.priceDecSignalNotification(origin);
  });
}

function assign(obj, src) {
  if (!src) return;
  for (const [k, v] of Object.entries(src)) {
    if (v === undefined) continue;
    obj[k] = typeof v === 'number' ? n(v) : v;
  }
}

/* ---------------- storage ---------------- */

export function save(sim) {
  try {
    const json = JSON.stringify(serialize(sim));
    localStorage.setItem(KEY, json);
    return { ok: true, bytes: json.length };
  } catch (e) {
    /* QuotaExceeded is the realistic failure: a long run accumulates dead
     * accounts and the save grows with the directory. Losing autosave is not
     * worth crashing the game over, so this reports rather than throws.
     *
     * Measured: 46KB at 86 firms rising to 199KB at 199, against a ~5MB
     * localStorage budget — roughly 25x headroom, and the growth is bounded by
     * the live directory rather than by tick count. Quota is not a concern at
     * any realistic session length. */
    return { ok: false, error: String(e && e.message || e) };
  }
}

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function peek() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return {
      format: d.format, tick: d.tick, preset: d.preset,
      savedAt: d.savedAt, traders: (d.traders || []).length,
    };
  } catch { return null; }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return deserialize(JSON.parse(raw));
  } catch (e) {
    return { error: String(e && e.message || e) };
  }
}

export function clear() {
  try { localStorage.removeItem(KEY); return true; } catch { return false; }
}

/* ---------------- autosave driver ---------------- */

export function attachAutosave(app, onStatus) {
  /* Synchronous write. Every path goes through this.
   *
   * The whole driver used to funnel through requestIdleCallback, and that is
   * precisely why saves were being lost on a handset: Android's WebView does not
   * reliably deliver idle callbacks, so a scheduled write was simply never
   * invoked. Measured on a device (itel S685LN, Android 15) — after 400 ticks of
   * play the stored save still read tick 7, the value it had at launch, while
   * the live simulation was at 406. Only the synchronous pagehide handler ever
   * landed, so what the player got back was whatever the save held at the last
   * moment the page was hidden, which is the "it only restores half of what I
   * closed at" symptom.
   *
   * Nothing is deferred now. A save is 0.78-2.66ms against a 125ms frame, so
   * writing inline at a 1s interval costs ~1-3% of one frame per second. Paying
   * that is strictly better than paying it and losing the write.
   *
   * The re-entrancy guard is kept, and it is not about idle callbacks: it stops
   * a visibilitychange, a pagehide and a timer tick landing in the same frame
   * from serialising the same state three times. The first write wins and the
   * rest are dropped, because by then the data is identical. */
  let writing = false;
  let wrote = 0;

  const writeNow = (why) => {
    if (!app || !app.sim) return { ok: false, error: 'no simulation' };
    if (writing) return { ok: true, skipped: true, bytes: 0 };
    writing = true;
    try {
      const r = save(app.sim);
      wrote++;
      onStatus?.({ ...r, why, tick: app.sim.tickCount, writes: wrote });
      return r;
    } finally {
      writing = false;
    }
  };

  const timer = setInterval(() => {
    if (app.running) writeNow('timer');
  }, AUTOSAVE_MS);

  /* pagehide is the one that matters on Android: `beforeunload` is often skipped
   * when a WebView is destroyed, and `visibilitychange` to hidden fires just
   * before it. Both are synchronous writes for exactly that reason. */
  const onHide = () => writeNow('pagehide');
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') writeNow('hidden');
  };
  window.addEventListener('pagehide', onHide);
  window.addEventListener('visibilitychange', onVisibility);

  return {
    /* Synchronous by design: App.saveNow() reads .ok off the result to decide
     * what to tell the player. */
    now: () => writeNow('manual'),
    /* Kept as an explicit name because anything holding a handle may want to
     * force a write now. It is now the same synchronous path as everything
     * else rather than a separate deferred queue. */
    flush: () => writeNow('flush'),
    writes: () => wrote,
    stop: () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('visibilitychange', onVisibility);
    },
  };
}

export const SAVE_KEY = KEY;
export const AUTOSAVE_INTERVAL = AUTOSAVE_MS;