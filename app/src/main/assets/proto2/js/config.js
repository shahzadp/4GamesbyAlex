/* ------------------------------------------------------------------
 * Proto Web — configuration defaults
 * Values transcribed from the original app's sim.Config constructor
 * (smali: full_decompile/smali/.../proto/lib/sim/Config.smali)
 * ------------------------------------------------------------------ */

export const DEFAULT_CONFIG = {
  // --- presentation (the only surviving key from the original's render block,
  //     which described a grid frame; the frame is gone but the flag is not) ---
  FULL_SCREEN: false,

  // --- money ---
  INIT_CASH_DOLLAR: 100,      // dollars
  INIT_CASH: 10000,           // INIT_CASH_DOLLAR * 100 (cents)
  PRICE_INC: 10,              // price step per adjustment
  MIN_PRICE: 1,               // price floor
  MIN_STOCK: 10,              // stock level at/below which trader restocks
  TRANSPORT_MAX: 10,          // max units per shipment
  OFFSET_DIV: 10,             // standard price-model divisor
  FIX_PRICE: 5,               // labor peg divisor (standard mode)
  FIX_PRICE_SUPPLYDEMAND: 5,  // labor peg divisor (supply & demand mode)
  fixPrice: true,             // peg goods prices to average labour price

  // --- labour / the commons ---
  INIT_LABOR_POP: 19,         // +1 "TRIGGER" trader = 20 total
  INIT_LABOR: 100,
  LAB_SPAWN_RATE: 100,        // stock must exceed this to spawn
  LAB_CAN_DIE: true,
  LAB_CAN_SPAWN: true,
  MIN_LABOR: 1,               // die only if count > this
  // NB: there is deliberately no MAX_LABOR. The cell map that used to impose
  // one is gone, so population is bounded by the food supply and by the state's
  // willingness to print money — an economy stops growing when it runs out of
  // bread, not when it hits a number in a config file. Unemployment is
  // therefore measured against the highest population the economy has reached.
  //
  // The commons breed fast, and are paid for it in bread: a household must hold
  // real stock, keep cash back, and face a birth rate scaled down by how badly
  // the country as a whole is being fed. Without those three brakes the
  // population compounded without limit once the grid's cap was lifted —
  // measured 5,142 and doubling every 5k ticks, with nine producers selling
  // into a permanently empty larder.
  LAB_BIRTH_CHANCE: 0.10,     // per tick, for a household that can feed one
  LAB_BIRTH_COST: 20,         // stock the parent contributes to a newborn
  LAB_BIRTH_RESERVE: 4000,    // cash a household must keep back (=$40)

  // --- goods population (the middle class) ---
  // Producers own their means of production and are the only people who can
  // found a house, so this is not just an industry mix — it is the width of
  // the social ladder. Too few and every producer is promoted away, the middle
  // class empties, and upward mobility stops for good (measured: all five
  // initial firms founded houses within 20k ticks and the class hit zero).
  FOOD_POP: 9,
  TOOL_POP: 5,
  COAL_POP: 5,
  IRON_POP: 5,

  // --- recipes ---
  LABOR_FOOD: 1,   // labour-only food output
  TOOL_FOOD: 20,   // tool-boosted food output
  LABOR_COAL: 1,
  TOOL_COAL: 8,
  LABOR_IRON: 1,
  TOOL_IRON: 8,
  REQ_LAB_FOR_TOOL: 1,
  MIN_FOOD_SELL: 5,

  // --- transport / travellers ---
  // A flat 70 was the original's number, and it was really standing in for
  // "about one shipment per trader". Now that deliveries fly an arc instead
  // of walking a grid and population is ~3x the grid's old ceiling, the
  // constant became a metronome: the world latched into a permanent stop-go
  // and the money supply froze at $1,681,398 from tick 6000 to 20000. The jam
  // is now measured against the size of the economy.
  TRANSPORT_OVERLOAD: 70,             // absolute floor
  TRANSPORT_OVERLOAD_PER_TRADER: 8,   // ...and this many in flight per trader
  TRANSPORT_OVERLOAD_RESET: 69,       // ticks the pause lasts

  // --- macro layer (reimplementation; see js/macro.js) ---
  macroEnabled: true,
  macroStance: 0,        // -100 contractionary .. +100 expansionary
  macroStabilizer: 40,   // automatic stabilizer strength, 0..100
  macroVolatility: 1,    // shock frequency/magnitude scale, 0..2

  // --- social classes (reimplementation; see js/politics.js) ---
  // Commons      labour traders. Enforcement is fatal to them, and they breed
  //               fast enough to refill the rolls before the next docket.
  // Middle class  goods producers. They run firms, keep assets, and are the
  //             only route by which anyone becomes a great house.
  // Elite       the great houses. Immune to enforcement entirely.
  ELITE_POP: 4,
  ELITE_CASH: 4000000,     // INIT_CASH * 400 = $40,000 each
  ELITE_STOCK: 500,        // they open with deep reserves and trade hard

  // Social mobility. A middle-class firm that accumulates enough capital in a
  // healthy economy is promoted to a house; a house that is stripped of its
  // capital in a bad one is demoted to the middle class. Movement downward is
  // rarer than movement up — the whole point of a class system is that it is
  // sticky — but it is never impossible.
  PROMOTE_WEALTH: 1200000,     // cents (=$12,000) to found a house
  DEMOTE_WEALTH: 120000,       // below this a house loses its standing
  PROMOTE_CHANCE: 0.020,       // per mobility review, if conditions are good
  DEMOTE_CHANCE: 0.008,        // per review, if conditions are bad

  // --- sovereign credit (reimplementation; see js/credit.js) ---
  //
  // The calendar is measured in DAYS: one tick is one day, so a year is 365
  // ticks and an election falls every ELECTION_TERM_YEARS years — 1,825 ticks
  // for the five-year term the player is shown.
  //
  // This was 1,200 ticks/year, on the reasoning that a "year" should feel short.
  // Measured on a handset that put the first election at tick 6,000 — over
  // twelve minutes of continuous play at normal speed — so the Chamber sheet
  // showing "year 5" was accurate and completely useless: it read as an election
  // that never happens. Prose years are what a player expects to see in a
  // calendar, and 365 days to a year is the one conversion everybody already
  // has. At 8 ticks/second a term is now ~3.8 minutes, and ~30 seconds at warp.
  TICKS_PER_YEAR: 365,
  ELECTION_TERM_YEARS: 5,
  // How often the court sits, in ticks. It used to be every bank cycle — 11
  // ticks — because the docket shared a counter with interest collection.
  // Measured consequence: 144 dockets in 3,000 ticks, every one carrying
  // claims, so the player was interrupted every ~21 ticks and an election 1,825
  // ticks away could not be reached in practice. 90 ticks is roughly a season
  // at this calendar: claims accrue in between and are settled together, which
  // gives whole stretches of play punctuated by a real decision instead of a
  // button three times a minute.
  DOCKET_PERIOD_TICKS: 90,
  // Domestic borrowing. The coupon floor is what the lenders charge when the
  // crown is solvent in their eyes; the credit module adds the rest as a risk
  // premium as the debt load grows.
  BOND_COUPON: 0.06,
  BOND_TERM_YEARS: 5,
  BOND_MAX_FACE_FACTOR: 0.35,   // ceiling on domestic face vs money supply
  // A bailout reprices the claim rather than discharging it, so the foreign
  // advance covers the debt plus this much. (See credit.js.)
  BAILOUT_SPREAD: 0.06,
  // Approval a sovereign needs to be returned by an election.
  DEMOCRATIC_THRESHOLD: 50,

  // --- modes ---
  supplyAndDemandEnabled: true,
  collectTax: false,
  speed: false,
  warp: false,
  computing: true,
  fresh: true,
  USE_TEST_ADS: false,

  // --- tax rates (percent, doubles) ---
  universalTaxRate: 0,
  laborTaxRate: 0,
  foodTaxRate: 0,
  toolTaxRate: 0,
  coalTaxRate: 0,
  ironTaxRate: 0,
  transportTaxRate: 0,
};

/* Central bank constructor defaults (lib/bank/Bank.smali) */
export const DEFAULT_BANK = {
  minPayPercent: 0.10,   // 0x3fb999999999999a
  interestRate: 0.15,    // 0x3fc3333333333333
  reserveRate: 0.20,     // 0x3fc999999999999a
};

/* The original world, verbatim: R.string.map as a 20x20 grid of digits, '1'
 * marking an unwalkable tree. Nothing reads this any more — the simulation has
 * no squares to place anyone on (see the note at the top of js/map.js). It is
 * kept only so the artifact the port grew out of survives beside it. */
const RETIRED_MAP = `00000000000000000000 00000000111110000000 00101000000000001000 00000000111110000000 00000000100010000000 00000000100010000000 11110011110111100111 00000000000000000000 00000000000000000000 00000011110111100000 00000000010100000000 00000000010100000000 00000000010100000000 00000000010100000000 00000000110110000000 00000000100010000000 00000000100010000000 00000000111110000000 00000000001000000000 00000000001000000000`;
void RETIRED_MAP;

/* ------------------------------------------------------------------
 * Economic scenarios.
 *
 * These used to be map sizes — "a 32×32 world", "a 40×40 world" — which
 * were really just a way of asking for a bigger economy, back when the
 * cell grid was the thing that capped it. With the grid gone there is no
 * size to vary, so a preset now varies the economy itself: who starts
 * rich, how much bread there is, how hard the bank leans, how fast the
 * commons breed.
 *
 * Every scenario is deliberately *unstable*. None of them is a stable
 * equilibrium waiting to be admired — each starts somewhere the cycle
 * engine will have to move away from, which is the point. A scenario that
 * could sit still forever would not be an economy.
 * ------------------------------------------------------------------ */
export const PRESETS = {
  classic: {
    name: 'THE OLD COUNTRY',
    blurb: 'The original economy, faithfully. Bread is thin, the bank is cautious, and nobody has money to spare.',
    cfg: {},
  },
  // Plenty of tools, plenty of bread, and an elite class that starts enormous.
  // Food outruns the commons, so the population compounds into a glut, prices
  // collapse, and the boom turns on itself. This is how you get a bust.
  boom: {
    name: 'THE GILDED AGE',
    blurb: 'Abundant tools, abundant bread, and houses already rich at the start. Watch it inflate, then break.',
    cfg: {
      FOOD_POP: 26, TOOL_POP: 14, COAL_POP: 12, IRON_POP: 12,
      INIT_LABOR_POP: 60,
      ELITE_CASH: 22000000, ELITE_STOCK: 2400, ELITE_POP: 8,
      LAB_BIRTH_CHANCE: 0.16,
      macroStance: 55, macroStabilizer: 15, macroVolatility: 1.5,
    },
  },
  // Scarce bread, scarce tools. The population starts and stays close to the
  // edge of what the farms can feed, so every docket is a real decision and
  // every cycle is felt in the stomach rather than the ledger.
  lean: {
    name: 'THE LEAN YEARS',
    blurb: 'Nine farmers, five smiths, and a hungry crown. Little cushion between one bad harvest and the next.',
    cfg: {
      FOOD_POP: 6, TOOL_POP: 3, COAL_POP: 3, IRON_POP: 3,
      INIT_LABOR_POP: 26,
      INIT_CASH: 4200,
      ELITE_CASH: 900000, ELITE_STOCK: 160, ELITE_POP: 2,
      LAB_BIRTH_CHANCE: 0.06,
      macroStance: -30, macroStabilizer: 65, macroVolatility: 0.9,
    },
  },
  // A bank that prints. Loose stance, weak stabilizer, high volatility, and
  // elites seeded with enough cash to buy whatever is moving. The cap on
  // prices is floating rather than fixed, so the supply of money can genuinely
  // outrun the goods and the numbers go somewhere absurd.
  flood: {
    name: 'THE PAPER CROWN',
    blurb: 'The bank prints on command and nobody checks the ledger. Money chases goods until goods cannot keep up.',
    cfg: {
      INIT_CASH: 26000,
      ELITE_CASH: 12000000, ELITE_STOCK: 1400,
      FOOD_POP: 7, TOOL_POP: 4, COAL_POP: 4, IRON_POP: 4,
      INIT_LABOR_POP: 34,
      LAB_BIRTH_CHANCE: 0.14,
      macroStance: 85, macroStabilizer: 5, macroVolatility: 1.8,
    },
  },
  // The mirror image. A tight bank, a strong stabilizer, few households able to
  // afford a child, and money that keeps its value — so prices have nowhere to
  // go but down. Deflation is the harder regime to reach and the one the
  // original could never produce, because write-offs only ever ratcheted money
  // supply upward.
  thrift: {
    name: 'THE HOUSE OF THRIFT',
    blurb: 'Hard money, few births, and prices that keep their worth. Demand collapses before supply ever does.',
    cfg: {
      INIT_CASH: 6000,
      ELITE_CASH: 1600000,
      FOOD_POP: 14, TOOL_POP: 6, COAL_POP: 5, IRON_POP: 5,
      INIT_LABOR_POP: 24,
      LAB_BIRTH_CHANCE: 0.03,
      LAB_BIRTH_RESERVE: 12000,
      PROMOTE_WEALTH: 2200000,
      macroStance: -70, macroStabilizer: 90, macroVolatility: 0.7,
    },
  },
  // A country already coming apart: heavy debts seeded by starting the elites
  // rich, a middling food supply, and a docket that arrives constantly. The
  // approval clock is the real opponent here.
  upheaval: {
    name: 'THE DYING STATE',
    blurb: 'Deep in the red before you are crowned, and the commons are already angry. Survive the docket.',
    cfg: {
      FOOD_POP: 11, TOOL_POP: 5, COAL_POP: 5, IRON_POP: 5,
      INIT_LABOR_POP: 70,
      ELITE_CASH: 3000000, ELITE_STOCK: 300,
      LAB_BIRTH_CHANCE: 0.12,
      macroStance: 20, macroStabilizer: 30, macroVolatility: 1.6,
    },
  },
};

/* Tick pacing (original was a free-running thread; we throttle it) */
export const TICK_RATE = {
  normal: 8,    // ticks per second
  fast: 20,     // "speed on"
  warp: 60,     // warp — renders throttled to 500ms like the original
};
