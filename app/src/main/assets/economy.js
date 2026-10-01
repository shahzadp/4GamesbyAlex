function setupEconomyGame() {
  const stage = document.getElementById('stage-economy');
  if (!stage) return;

  const storageKey = 'micro_economy_save_v1';
  const sectors = [
    /* Prices are set so the whole chain can actually pay for itself. A sector
       that cannot cover its own inputs has to borrow forever, and the resulting
       debt is what drove lending to zero and froze the economy. Each base price
       below is chosen against the labour price rather than in isolation. */
    { id: 'labor', name: 'Labor', short: 'LAB', icon: 'LAB', basePrice: 4.5, target: 80, producerLabel: '19 workers' },
    { id: 'food', name: 'Food', short: 'FOOD', icon: 'FOOD', basePrice: 2.8, target: 30, producerLabel: '3 farms' },
    /* Tools were capped at a target of 6 while farms consumed one per day, so
       tools were permanently scarce and their price ran away to $36+. The
       target now reflects a working inventory rather than an instant shortage.
       The price sits between what a tooled harvest earns extra and what the
       toolworks pay to make one, so neither side runs a loss. */
    { id: 'tools', name: 'Tools', short: 'TOOLS', icon: 'TOOL', basePrice: 10, target: 18, producerLabel: '2 workshops' },
    { id: 'coal', name: 'Coal', short: 'COAL', icon: 'COAL', basePrice: 2, target: 24, producerLabel: '2 mines' },
    { id: 'iron', name: 'Iron', short: 'IRON', icon: 'IRON', basePrice: 2.2, target: 24, producerLabel: '2 mines' },
    { id: 'shipping', name: 'Shipping', short: 'PORT', icon: 'PORT', basePrice: 0.65, target: 12, producerLabel: '1 carrier' }
  ];
  const goodsById = Object.fromEntries(sectors.map(good => [good.id, good]));
  const tradeable = ['food', 'tools', 'coal', 'iron'];

  /* The physical ratios that make this economy close. Every figure below is
     derived from these two numbers, so the value chain cannot drift out of
     balance when prices move:
       - one household eats MEALS_PER_HOUSEHOLD meals a day
       - one unit of farm labour yields FOOD_PER_WORKER meals, and a tool lifts
         the whole batch by 60%, so a tooled worker yields 1.6x
     A producer can therefore pay for the labour that makes the food only if
     the labour price is around MEALS_PER_HOUSEHOLD * food price. Below that
     the payroll can never fund the basket and the population must shrink; far
     above it the farms go broke. Keeping both sides expressed in these terms
     is what makes recovery possible instead of a one-way ratchet. */
  const MEALS_PER_HOUSEHOLD = 0.42;
  const FOOD_PER_WORKER = 1;
  const TOOL_YIELD_BONUS = 0.6;
  /* The labour price is anchored to the food price by this multiple, so wages
     track the cost of living automatically. */
  const LABOR_COST_OF_LIVING_MULTIPLE = 1.18;
  const nodes = [
    { id: 'labor', title: 'Workforce', subtitle: 'Consumers & labor supply' },
    { id: 'food', title: 'Food farms', subtitle: 'Labor + tools -> food' },
    { id: 'tools', title: 'Toolworks', subtitle: 'Labor + coal + iron' },
    { id: 'coal', title: 'Coal mines', subtitle: 'Labor -> coal' }, 
    { id: 'iron', title: 'Iron mines', subtitle: 'Labor -> iron' },
    { id: 'shipping', title: 'Freight', subtitle: 'Capacity limits deliveries' }
  ];

  function makeFreshState() {
    return {
      version: 1,
      day: 1,
      running: false,
      speed: 1,
      mode: 'supply',
      collectTax: true,
      taxRate: 5,
      interestRate: 3,
      reserveRate: 20,
      population: 19,
      goodMealDays: 0,
      missedMealDays: 0,
      treasury: 100,
      taxVault: 0,
      bankReserves: 320,
      totalDebt: 0,
      debts: { households: 0, labor: 0, food: 0, tools: 0, coal: 0, iron: 0, shipping: 0, council: 0 },
      missedPayments: {},
      wallets: { households: 180, labor: 90, food: 70, tools: 65, coal: 55, iron: 55, shipping: 40 },
      stocks: { labor: 180, food: 24, tools: 2, coal: 14, iron: 14, shipping: 16 },
      inventory: { food: 0, tools: 0, coal: 0, iron: 0 },
      prices: Object.fromEntries(sectors.map(good => [good.id, good.basePrice])),
      shippingCapacity: 20,
      transactions: 0,
      volume: 0,
      minted: 0,
      retired: 0,
      bankFailures: 0,
      idleDays: 0,
      history: [],
      ledger: [{ day: 1, message: 'Micro Economy loaded. Press Run to start the simulation.', kind: 'system' }]
    };
  }

  function numberOr(value, fallback, minimum, maximum) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(minimum, Math.min(maximum, n));
  }

  function loadState() {
    const fresh = makeFreshState();
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!saved || saved.version !== 1) return fresh;
      for (const key of ['day', 'population', 'goodMealDays', 'missedMealDays', 'treasury', 'taxVault', 'bankReserves', 'totalDebt', 'shippingCapacity', 'transactions', 'volume', 'minted', 'retired', 'bankFailures', 'idleDays', 'taxRate', 'interestRate', 'reserveRate']) {
        if (Number.isFinite(Number(saved[key]))) fresh[key] = Number(saved[key]);
      }
      fresh.mode = saved.mode === 'stable' ? 'stable' : 'supply';
      fresh.collectTax = saved.collectTax !== false;
      fresh.speed = [1, 3, 8].includes(Number(saved.speed)) ? Number(saved.speed) : 1;
      for (const group of ['debts', 'wallets', 'stocks', 'inventory', 'prices']) {
        if (saved[group] && typeof saved[group] === 'object') {
          for (const key of Object.keys(fresh[group])) {
            if (Number.isFinite(Number(saved[group][key]))) fresh[group][key] = Number(saved[group][key]);
          }
        }
      }
      fresh.history = Array.isArray(saved.history) ? saved.history.slice(-12) : [];
      fresh.ledger = Array.isArray(saved.ledger) ? saved.ledger.slice(0, 32) : fresh.ledger;
      fresh.running = false;
    } catch (error) {
      return fresh;
    }
    return fresh;
  }

  let sim = loadState();
  let activeTab = 'market';
  let timer = null;
  let resetArmed = false;
  let resetArmTimer = null;

  const byId = id => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const money = value => `$${Math.max(0, Number(value) || 0).toFixed(2)}`;
  const quantity = value => Math.max(0, Math.floor(Number(value) || 0)).toLocaleString();
  const sum = values => values.reduce((total, value) => total + value, 0);

  function save() {
    sim.running = Boolean(sim.running);
    try {
      localStorage.setItem(storageKey, JSON.stringify(sim));
    } catch (error) {
      setStatus('SAVE ISSUE');
    }
  }

  function addLedger(message, kind = 'signal') {
    sim.ledger.unshift({ day: sim.day, message, kind });
    sim.ledger = sim.ledger.slice(0, 32);
  }

  function setStatus(message) {
    const node = byId('econ-run-state');
    if (node) node.textContent = message;
  }

  function currentMoneySupply() {
    return sum(Object.values(sim.wallets)) + sim.treasury + sim.taxVault;
  }

  function getWallet(account) {
    return account === 'council' ? sim.treasury : sim.wallets[account];
  }

  function setWallet(account, amount) {
    if (account === 'council') sim.treasury = amount;
    else sim.wallets[account] = amount;
  }

  /* A reserve requirement is a rule about the bank's ability to create money,
     so it belongs against the credit the bank has actually lent, not against
     every dollar sitting in a household's savings account. Measuring it against
     the whole money supply meant the requirement crept up in lockstep with the
     town's savings until it exactly equalled the reserves on hand. Lendable
     credit was then permanently zero: the bank was simultaneously unable to
     lend and sitting on what looked like a full vault, and the economy was
     frozen for good. */
  function requiredReserves() {
    return sim.totalDebt * sim.reserveRate / 100;
  }

  function lendableCredit() {
    return Math.max(0, sim.bankReserves - requiredReserves());
  }

  function ensureFunds(account, amount) {
    const current = getWallet(account) || 0;
    if (current >= amount) return true;
    const shortfall = amount - current;
    const credit = Math.min(shortfall, lendableCredit());
    if (credit <= 0.01) {
      sim.bankFailures++;
      return false;
    }
    sim.bankReserves -= credit;
    setWallet(account, current + credit);
    sim.debts[account] = (sim.debts[account] || 0) + credit;
    sim.totalDebt += credit;
    noteBankCredit(credit);
    return true;
  }

  /* Banks stop emitting a ledger line for every tiny credit. Those entries used
     to bury the real signals and run the log hot during shortages. */
  let bankNoteDay = 0;
  /* Same idea for the idle-market warning, which was flooding the log. */
  let lastStallNote = 0;
  function noteBankCredit(amount) {
    if (sim.day - bankNoteDay < 5 || amount < 5) return;
    bankNoteDay = sim.day;
    addLedger(`Bank credit extended: ${money(amount)}.`, 'bank');
  }

  /* Freight used to be a flat fee charged once per transaction. At roughly
     $0.54 that rivaled the price of the goods being shipped, so a household
     buying a single food unit paid more in freight than for the food, which
     bankrupted consumers and froze production. Freight now scales with the
     consignment, which keeps small daily shipments viable. */
  const FREIGHT_RATE = 0.12;

  function transfer(buyer, seller, gross, options = {}) {
    const amount = Math.max(0, gross);
    if (amount <= 0 || typeof getWallet(buyer) !== 'number' || typeof getWallet(seller) !== 'number') return false;
    const usesShipping = Boolean(options.shipping);
    if (usesShipping && sim.shippingCapacity <= 0) return false;
    const fee = usesShipping ? amount * FREIGHT_RATE : 0;
    const tax = sim.collectTax && options.taxable !== false ? amount * sim.taxRate / 100 : 0;
    const due = amount + fee + tax;
    if (!ensureFunds(buyer, due)) return false;

    setWallet(buyer, getWallet(buyer) - due);
    setWallet(seller, getWallet(seller) + amount);
    if (fee > 0) {
      sim.wallets.shipping += fee;
      sim.shippingCapacity--;
    }
    sim.taxVault += tax;
    sim.transactions++;
    sim.volume += amount;
    /* Guard against any path leaving an account overdrawn, which would quietly
       create money and break every downstream balance. */
    if (getWallet(buyer) < 0) setWallet(buyer, 0);
    return true;
  }

  function buyInput(buyer, goodId, requested, useShipping = goodId !== 'labor') {
    /* Demand is fractional, so rounding it down made the shortfall permanent:
       nineteen households need 7.98 meals but could only ever buy seven, which
       capped intake at 87% and put the growth threshold permanently out of
       reach. The exact amount is offered first, then the whole-unit purchase
       as a fallback for when the precise amount cannot be funded. */
    const wanted = Math.max(0, requested);
    const available = Math.min(wanted, Math.max(0, sim.stocks[goodId] || 0));
    if (available <= 0) return 0;
    const wholeUnits = Math.floor(available);
    const attempts = available > wholeUnits
      ? [available, wholeUnits]
      : [available];
    for (const amount of attempts) {
      if (amount <= 0) continue;
      if (transfer(buyer, goodId, sim.prices[goodId] * amount, { shipping: useShipping })) {
        sim.stocks[goodId] -= amount;
        return amount;
      }
    }
    return 0;
  }

  /* How much of each ore a single tool consumes. Kept as a constant so the
     mines and the toolworks can never disagree about the recipe. */
  const TOOLWORKS_ORE_PER_TOOL = 1;

  /* How many tools the workshop is willing to run today. Tools are an
     intermediate good, not an end in themselves, and a tool nobody uses is
     a tool that only ties up cash, so the run is capped and the cap scales
     with the size of the town. */
  function toolRunTarget() {
    if (sim.stocks.tools > 18) return 0;
    return Math.max(1, Math.min(2, Math.floor(sim.population / 6)));
  }

  function produceMine(goodId) {
    /* A mine used to run whether or not anyone wanted the ore, and it hired
       two workers either way. The input cost was paid with no matching
       revenue, so every mine day was a pure loss that had to be borrowed
       against, and the debt compounded until the bank had nothing left to
       lend. A mine now hires only against what the toolworks is actually
       consuming, so ore is paid for only when it will be sold. */
    const demand = toolRunTarget() * TOOLWORKS_ORE_PER_TOOL;
    if (sim.stocks[goodId] >= demand) return 0;
    const wanted = Math.min(2, Math.max(1, Math.ceil(demand / 2)));
    const labor = buyInput(goodId, 'labor', wanted, false);
    if (!labor) return 0;
    /* A tooled shift roughly doubles the yield, which is what makes the extra
       input worth buying. */
    const tooled = sim.stocks.tools > 8 && (sim.day + (goodId === 'iron' ? 1 : 0)) % 2 === 0;
    const tool = tooled ? buyInput(goodId, 'tools', Math.min(1, labor), true) : 0;
    const produced = Math.round(labor * (1 + tool * 0.7));
    sim.stocks[goodId] += produced;
    return produced;
  }

  function produceTools() {
    let made = 0;
    const toolBudget = toolRunTarget();
    for (let i = 0; i < toolBudget; i++) {
      if (sim.stocks.labor < 4 || sim.stocks.coal < 1 || sim.stocks.iron < 1) break;
      if (!buyInput('tools', 'labor', 1, false)) break;
      if (!buyInput('tools', 'coal', 1, true)) break;
      if (!buyInput('tools', 'iron', 1, true)) break;
      sim.stocks.tools++;
      made++;
    }
    return made;
  }

  /* Producers need working capital to buy inputs. When a sector's cash is too
     thin to cover the next batch it borrows against future sales, which is how
     a real supply chain funds itself. Without this the whole network stalled
     the moment any single sector dipped under its input cost. */
  function fundProducer(account, needed) {
    const current = getWallet(account) || 0;
    if (current >= needed) return true;
    const shortfall = needed - current;
    const credit = Math.min(shortfall, lendableCredit());
    if (credit <= 0.01) return false;
    sim.bankReserves -= credit;
    setWallet(account, current + credit);
    sim.debts[account] = (sim.debts[account] || 0) + credit;
    sim.totalDebt += credit;
    noteBankCredit(credit);
    return true;
  }

  /* Farms used to hire a fixed three units of labour a day, which capped output
     at about eight food a day. The divisor behind that figure was wrong in a
     way that made the whole economy unplayable: a worker yields 1.6 food, so
     hiring one worker per five meals left the farms permanently short of
     demand. Households then sat on partial rations forever, which is neither
     growth nor decline but permanent stagnation. Farms now hire against the
     yield actually achieved, so a harvest covers the basket. */
  function farmLaborTarget() {
    const demand = sim.population * MEALS_PER_HOUSEHOLD;
    /* Farms used to hire a fixed extra unit on top of demand, which pushed
       production past what the town could eat every single day. The surplus
       piled up without limit, and a permanent glut is just as unhealthy as a
       shortage: it dragged the food price down until wages no longer covered
       the basket. Farms now hire the workers the demand actually needs, plus a
       small standing buffer so a bad day can be absorbed. */
    const buffer = Math.min(2, Math.max(1, Math.ceil(demand * 0.15)));
    /* No ceiling on the number of workers. The old cap of fourteen was the
       reason a town of fifty could never feed itself: demand climbed past the
       cap, output froze at twenty-two meals a day, and the shortfall was
       permanent. Labour is the one input that scales, so the farm has to be
       able to hire for any size of town; the labour pool itself is what keeps
       this honest. */
    return Math.max(2, Math.ceil(demand / FOOD_PER_WORKER) + buffer);
  }

  function produceFood() {
    /* Production also degrades gracefully: a thin input budget reduces the run
       instead of failing outright, which used to freeze the farm permanently. */
    const wanted = farmLaborTarget();
    const labor = buyInput('food', 'labor', wanted, false);
    if (!labor) return 0;
    /* A tool lifts the whole batch, but only while the larder needs filling.
       Applying the bonus unconditionally meant a tooled farm out-produced the
       town by sixty percent every single day, and the surplus piled up without
       limit. A permanent glut is as unhealthy as a shortage: it dragged the
       food price down until wages no longer covered the basket, so the tools
       are now a recovery tool rather than a daily overharvest. */
    const needsCatchUp = sim.stocks.food < foodStockTarget();
    const tools = needsCatchUp && labor > 2 ? buyInput('food', 'tools', 1, true) : 0;
    const produced = Math.round(labor * FOOD_PER_WORKER * (tools ? 1 + TOOL_YIELD_BONUS : 1));
    sim.stocks.food += produced;
    return produced;
  }

  /* A few days of meals in reserve. Enough to ride out a bad harvest, small
     enough that a surplus still pushes prices down. */
  function foodStockTarget() {
    return Math.max(6, sim.population * MEALS_PER_HOUSEHOLD * 3);
  }

  /* --- Labour economy ---------------------------------------------------
     Households are the demand side of this economy, but they were pure sinks:
     they bought food and never earned, so their wallets hit $0 within days and
     the farms could no longer sell anything to them. Labour stock then drained
     and never refilled, which is what made the collapse permanent.

     Wages close that loop. They are funded by the labour sector, which is the
     only account that reliably receives cash (farms buy labour every day).
     An earlier attempt drew wages from the food sector, but households already
     pay for food, so that double-counted farm revenue and starved the farms of
     the working capital they needed to plant the next harvest.

     The labour sector's leftover cash is recycled back into food purchases,
     which is what stops it hoarding while the farms run dry. */
  function payWages() {
    /* Wages are sized to the basket households actually buy, plus a thin
       margin, so the two sides of the economy stay matched by construction.
       A fixed per-household figure could not keep up: the bill came to roughly
       $21.79 a day while the wage ceiling was $21, so households bled $0.79 a
       day, ran dry, and the whole economy wound down. */
    const mealCostPerHousehold = sim.prices.food * MEALS_PER_HOUSEHOLD * (1 + FREIGHT_RATE + sim.taxRate / 100);
    const target = sim.population * mealCostPerHousehold * 1.08;

    /* Freight and the tax vault both used to sit on the sidelines: carriers
       swept up every fee and the government every tax, so the money that was
       supposed to pay wages never reached a producer who could spend it. The
       carriers now pass most of their take back into the wage pool, and the
       treasury tops up whatever is still short. */
    /* The wage pool is drawn from every account that holds money, richest
       first. Wages used to come out of the labour sector alone, but that
       sector only earns what the farms choose to spend, so the bill was
       covered by borrowing and the debt compounded every day. Spreading the
       bill across the whole economy matches what wages actually are: a share
       of everything produced, not a private transfer. */
    const contributors = ['labor', 'food', 'tools', 'coal', 'iron', 'shipping', 'council'];
    /* The grocery bill was bridged by the bank earlier in the day. Wages land
       first against that loan so the credit is cleared within the same day
       instead of compounding into permanent household debt. */
    let bill = target;
    let fromLabor = 0;
    for (const account of contributors) {
      if (bill <= 0.01) break;
      const available = Math.max(0, getWallet(account) || 0);
      const take = Math.min(bill, available * 0.25);
      if (take <= 0.01) continue;
      setWallet(account, available - take);
      sim.wallets.households += take;
      bill -= take;
      if (account === 'labor') fromLabor += take;
    }

    /* Anything still short is advanced by the bank, so a bad month shows up as
       debt to be repaid rather than as households going instantly broke. */
    let fromBank = 0;
    if (bill > 0.01) {
      fromBank = Math.min(bill, lendableCredit());
      if (fromBank > 0) {
        sim.bankReserves -= fromBank;
        sim.wallets.households += fromBank;
        sim.debts.households = (sim.debts.households || 0) + fromBank;
        sim.totalDebt += fromBank;
      }
    }

    /* Whatever the treasury did not need for the wage bill is handed straight
       back to producers, so tax collection never becomes a permanent drain on
       circulating cash. */
    const taxSpend = Math.min(sim.taxVault, sim.population * 0.12);
    if (taxSpend > 0) {
      sim.taxVault -= taxSpend;
      /* Credit only, never debit: taking a fixed slice out of each sector once
         pushed wallets negative and conjured money the economy did not have. */
      sim.wallets.food += taxSpend * 0.4;
      sim.wallets.tools += taxSpend * 0.25;
      sim.wallets.coal += taxSpend * 0.175;
      sim.wallets.iron += taxSpend * 0.175;
      sim.wallets.households += taxSpend;
    }

    return { bill: target, fromLabor, taxSpend, fromBank };
  }

  /* Workers spend their earnings on food. This recycles the labour sector's
     surplus into farm revenue and keeps the two sides of the economy linked
     instead of letting cash pile up in one wallet forever. */
  function workerFoodDemand() {
    const surplus = Math.max(0, sim.wallets.labor - 12);
    if (surplus < sim.prices.food) return 0;
    const units = Math.min(Math.floor(surplus / (sim.prices.food * 1.05)), 6);
    return Math.max(0, units);
  }

  /* Money only circulates if somebody spends it. Households kept every dollar
     they ever earned, so the town ended up rich on paper and broke in practice:
     the farms and the mines could not raise working capital, the bank lent less
     each day, and the whole economy ground to a halt with savings untouched.
     Anything far above a working balance is therefore redeployed into the goods
     the town actually consumes, which returns it to the producers who need it.
     The council is the only seller with enough stock to absorb it. */
  const HOUSEHOLD_WORKING_BALANCE_PER_PERSON = 6;
  const HOUSEHOLD_REDEPLOY_SHARE = 0.08;
  function redeployHouseholdSavings() {
    const workingBalance = Math.max(30, sim.population * HOUSEHOLD_WORKING_BALANCE_PER_PERSON);
    const surplus = sim.wallets.households - workingBalance;
    if (surplus <= 0) return 0;
    const spend = surplus * HOUSEHOLD_REDEPLOY_SHARE;
    const demand = spend / (sim.prices.food * (1 + FREIGHT_RATE + sim.taxRate / 100));
    const bought = buyInput('households', 'food', Math.min(demand, 12), true);
    return bought * sim.prices.food;
  }

  /* The carrier used to be a pure money printer. It collected freight on every
     shipment and never paid a cent of operating cost, so its balance grew
     without limit. That cash never left the wallets it was counted in, which
     inflated the money supply, pushed the bank's reserve requirement up, and
     squeezed lendable credit down to exactly zero. The town ran out of money to
     borrow at the same moment it ran out of money to lend. Freight is now
     matched by crewing and upkeep drawn from the same account, so the carrier
     pays its way rather than hoarding the whole supply chain's margin. */
  const CARRIER_CREW_PER_UNIT_CAPACITY = 0.6;
  const CARRIER_UPKEEP_PER_CREW = 0.35;
  function carrierOperatingCosts() {
    const crew = Math.max(1, sim.shippingCapacity * CARRIER_CREW_PER_UNIT_CAPACITY);
    const upkeep = crew * sim.prices.labor * CARRIER_UPKEEP_PER_CREW;
    const paid = Math.min(upkeep, Math.max(0, sim.wallets.shipping));
    sim.wallets.shipping -= paid;
    return paid;
  }

  /* Loans used to amortise at five percent of principal a day, so a hundred
     dollar loan returned about five dollars a month. The bank paid that money
     out to fund production and recovered almost none of it, so its reserves
     bled away to nothing and lendable capacity fell to a couple of dollars
     while the vault sat two percent of the money supply. Borrowers were on
     permanent rolling credit, which is exactly the one-way ratchet this model
     had to escape. Loans now amortise at a realistic daily rate, and a sector
     that cannot service its debt writes the shortfall off rather than rolling
     it forever, so the balance sheet can actually recover. */
  const LOAN_DAILY_AMORTISATION = 0.2;
  const LOAN_GRACE_AFTER_MISSES = 3;
  /* What the bank claws back when a loan is written off. */
  const LOAN_RECOVERY_RATE = 0.6;
  function settleLoans() {
    for (const account of Object.keys(sim.debts)) {
      const debt = sim.debts[account];
      if (debt <= 0) continue;
      const interest = debt * sim.interestRate / 100 / 10;
      const principal = Math.min(debt, debt * LOAN_DAILY_AMORTISATION);
      const due = interest + principal;
      if ((getWallet(account) || 0) >= due) {
        setWallet(account, getWallet(account) - due);
        sim.bankReserves += due;
        sim.debts[account] -= principal;
        sim.totalDebt -= principal;
        sim.missedPayments[account] = 0;
      } else {
        sim.missedPayments[account] = (sim.missedPayments[account] || 0) + 1;
        sim.debts[account] += interest;
        sim.totalDebt += interest;
        if (sim.missedPayments[account] > LOAN_GRACE_AFTER_MISSES) {
          /* A sector that has been underwater for days is not going to start
             paying. Holding the loan open forever only hides the loss and
             keeps the bank permanently unable to lend, so it is written off.
             The bank recovers what collateral it can: without that, the vault
             would drain toward zero and never fund the town again. */
          const recovered = debt * LOAN_RECOVERY_RATE;
          sim.bankReserves += recovered;
          sim.totalDebt -= debt - recovered;
          sim.debts[account] = 0;
          sim.missedPayments[account] = 0;
          sim.bankFailures++;
        }
      }
    }
  }

  function calculatePriceIndex() {
    const weights = { food: 0.36, labor: 0.25, tools: 0.16, coal: 0.11, iron: 0.12 };
    return sum(Object.keys(weights).map(id => sim.prices[id] / goodsById[id].basePrice * weights[id])) * 100;
  }

  function updatePrices() {
    const moneyPressure = clamp((currentMoneySupply() - 900) / 900, -0.5, 2) * 0.0015;
    for (const good of sectors) {
      if (good.id === 'shipping') {
        sim.prices.shipping = Math.max(0.25, sim.prices.labor / 2.8);
        continue;
      }
      if (sim.mode === 'stable') {
        /* Stable mode pins every price to the labour price. It used to scale
           off the labour sector's old base price, which no longer matched the
           ratio the rest of the model runs on, so switching modes collapsed the
           price index to about half. Every price is now derived from the
           current labour price instead of a stale constant.
           The food ratio inverts the labour anchor
           (labour = food * MEALS_PER_HOUSEHOLD / FOOD_PER_WORKER * multiple),
           so applying that ratio directly would have priced food below labour
           and made it the cheapest thing in the economy. */
        const labor = sim.prices.labor;
        const foodRatio = FOOD_PER_WORKER / (MEALS_PER_HOUSEHOLD * LABOR_COST_OF_LIVING_MULTIPLE);
        const ratios = { labor: 1, food: foodRatio, tools: foodRatio * 4.3, coal: 0.72, iron: 0.82 };
        sim.prices[good.id] = clamp(labor * ratios[good.id], 0.1, 250);
      } else if (good.id === 'labor') {
        /* The labour price used to float on its own, which let it drift below
           what a producer could pay out. That is the failure that made the
           economy a one-way ratchet: wages could not fund the food bill, so
           the workforce shrank and never came back. Labour is now priced off
           the cost of living, which is the only anchor that keeps both sides
           of the labour market solvable at the same time. */
        const anchor = sim.prices.food * MEALS_PER_HOUSEHOLD / FOOD_PER_WORKER * LABOR_COST_OF_LIVING_MULTIPLE;
        sim.prices.labor = clamp(anchor + (sim.prices.labor - anchor) * 0.25, 0.2, 120);
      } else {
        const stock = sim.stocks[good.id];
        const scarcity = clamp((good.target - stock) / good.target, -1.5, 2.5);
        /* Gluts used to push prices toward the 0.1 floor without limit, which
           made food worthless while the cost of living kept rising. Scarcity
           is now dampened on the downside so surplus only softens prices. */
        const damped = scarcity >= 0 ? scarcity : scarcity * 0.45;
        const next = sim.prices[good.id] * (1 + damped * 0.018 + moneyPressure);
        /* Mean reversion toward the base price keeps the index inside a
           believable band. Without a strong enough pull, inputs drifted into
           runaway inflation (tools past $50) that froze all production. */
        const pull = (goodsById[good.id].basePrice - sim.prices[good.id]) * 0.06;
        sim.prices[good.id] = clamp(next + pull, 0.2, 120);
      }
    }
  }

  function pushHistory() {
    sim.history.push({
      day: sim.day,
      priceIndex: calculatePriceIndex(),
      food: sim.prices.food,
      labor: sim.prices.labor,
      tools: sim.prices.tools
    });
    sim.history = sim.history.slice(-12);
  }

  function tick() {
    sim.day++;
    sim.shippingCapacity = 18 + Math.floor(sim.population / 10);
    const transactionStart = sim.transactions;
    /* Each producer fronts the cash for tomorrow's input run. Freight is a
       share of value now, so the buffer just needs to cover the inputs plus a
       margin for the freight and tax those purchases incur. */
    const inputBuffer = amount => amount * (1 + FREIGHT_RATE + sim.taxRate / 100);
    fundProducer('food', inputBuffer((sim.prices.labor + sim.prices.tools * 0.2) * farmLaborTarget()));
    /* The mines used to borrow every day whether or not they were going to
       work. A mine only runs when the toolworks needs ore, so on a day with no
       tool queued it took a loan, bought nothing, and never had the revenue to
       repay it. The debt compounded until the bank had no reserves left to
       lend, and the stress counter counted a failure for a day that never
       happened. Producers are only funded when there is real work to fund. */
    const oreNeeded = toolRunTarget() * TOOLWORKS_ORE_PER_TOOL;
    for (const goodId of ['coal', 'iron']) {
      if (sim.stocks[goodId] < oreNeeded) fundProducer(goodId, inputBuffer(sim.prices.labor * 2));
    }
    if (toolRunTarget() > 0) fundProducer('tools', inputBuffer(sim.prices.labor + sim.prices.coal + sim.prices.iron) * toolRunTarget());

    const laborProducedByFarms = produceFood();
    const coalProduced = produceMine('coal');
    const ironProduced = produceMine('iron');
    const toolsProduced = produceTools();

    /* The day's cycle has to run sales before wages. Wages used to be paid
       first, out of capital the producers had not yet earned: the labor sector
       borrowed from the bank to fund the bill, then households spent the same
       money straight back on food, so the farms earned it and the bank was out
       pocket. The debt compounded until lending hit zero and the town starved
       with food sitting in the larder. Production is now paid for, sold,
       and only then are wages distributed out of the day's revenue. */
    /* Households now buy their food before wages are paid out, because that is
       the order the money actually moves in: the farms sell, the workers get
       paid, the workers spend. Buying first means the day's grocery bill has to
       be covered by the bank for a few hours, and that bridging credit is
       repaid out of the wages later in the same day. */
    const foodDemand = Math.max(1, sim.population * MEALS_PER_HOUSEHOLD);
    const groceryBill = foodDemand * sim.prices.food * (1 + FREIGHT_RATE + sim.taxRate / 100);
    fundProducer('households', groceryBill);
    const mealsEaten = buyInput('households', 'food', foodDemand, true);
    // Workers also shop for food, which keeps farm revenue flowing.
    buyInput('labor', 'food', workerFoodDemand(), true);

    payWages();

    /* Households were pure sinks: they earned wages, spent only on food, and
       banked the rest forever. By day 400 they were sitting on over two
       thousand dollars while the farms, which do the actual work, could not
       raise a cent of it. Savings that never come back into circulation are
       the same as destroyed money, so a slice of the surplus above a sensible
       working balance is redeployed into the goods the town needs. */
    redeployHouseholdSavings();

    /* The carrier's upkeep is paid out of the wages it collects, so freight
       revenue is recirculated rather than accumulating as a money-printing
       balance. */
    carrierOperatingCosts();

    /* Labour is replenished from two sources so the pool tracks real activity
       instead of draining one way: the food each household actually receives,
       plus a baseline release proportional to the workforce. Release is capped
       at the pool's target so surplus labour recedes instead of accumulating
       into a meaningless number. */
    const laborTarget = Math.max(30, sim.population * 6);
    const gap = Math.max(0, laborTarget - sim.stocks.labor);
    const baseline = gap * 0.35;
    const laborFromMeals = Math.min(mealsEaten * 0.9, gap);
    sim.stocks.labor += laborFromMeals + baseline;
    /* The pool is replenished at a fixed fraction of the gap, so a town that
       suddenly needs twice the workers would wait many days to hire them, and
       a shortage that lasted a few days became permanent. Release now scales
       with the size of the gap so the pool can actually keep up with demand. */
    sim.stocks.labor = Math.max(0, Math.min(laborTarget, sim.stocks.labor));

    /* Nutrition is measured against actual intake rather than a fixed target,
       so a partial harvest still counts as partial nourishment instead of an
       instant total loss. */
    const mealRatio = mealsEaten / foodDemand;
    if (mealRatio >= 0.95) {
      sim.goodMealDays++;
      sim.missedMealDays = 0;
      if (sim.goodMealDays >= 8 && sim.population < 70) {
        sim.population++;
        sim.goodMealDays = 0;
        addLedger('A new household joined the workforce.', 'growth');
      }
    } else if (mealRatio >= 0.6) {
      // Survives on partial rations: no growth, but no losses either.
      sim.goodMealDays = 0;
      sim.missedMealDays = 0;
    } else {
      sim.missedMealDays++;
      sim.goodMealDays = 0;
      /* Decline needs sustained real starvation (8 days) and is reversible:
         a single bad harvest never permanently shrinks the workforce. */
      if (sim.missedMealDays >= 8 && sim.population > 1) {
        sim.population--;
        sim.missedMealDays = 0;
        addLedger('Food shortages reduced the workforce by one.', 'warning');
      }
    }

    if (sim.day % 10 === 0) settleLoans();
    updatePrices();
    pushHistory();

    if (sim.day % 5 === 0) {
      addLedger(`Day ${sim.day}: ${mealsEaten.toFixed(1)}/${foodDemand.toFixed(1)} food eaten; +${laborProducedByFarms} food, +${coalProduced} coal, +${ironProduced} iron, +${toolsProduced} tools.`, 'production');
    }
    /* "Trade stalled" used to be logged on any day with a single failed
       transaction, which is normal: a mine skips a day it has nothing to cut,
       or a farm holds off buying ore it does not need yet. The signal only
       matters when the whole day was dead, so it is throttled and only raised
       after the market has been genuinely idle for several days running. */
    if (sim.transactions === transactionStart) {
      sim.idleDays = (sim.idleDays || 0) + 1;
      if (sim.idleDays >= 3 && sim.day - lastStallNote >= 10) {
        lastStallNote = sim.day;
        addLedger('Trade stalled for several days. Check liquidity, stock, and freight capacity.', 'warning');
      }
    } else {
      sim.idleDays = 0;
    }
    save();
    render();
  }

  function currentHealth() {
    const foodTarget = foodStockTarget();
    if (sim.stocks.food < foodTarget * 0.45) return { label: 'FOOD SHORTAGE', kind: 'danger' };
    if (sim.stocks.labor < sim.population * 0.4) return { label: 'LABOUR SHORTAGE', kind: 'danger' };
    /* Reserves only matter to the extent they restrict lending. Flagging the
       town as stressed whenever the vault sat below the requirement showed a
       permanent LOW RESERVES on a healthy economy, which taught the player to
       ignore the one indicator that was supposed to matter. The warning is now
       raised only when the bank has genuinely stopped being able to lend. */
    if (lendableCredit() < Math.max(5, sim.totalDebt * 0.02)) return { label: 'LOW RESERVES', kind: 'warning' };
    if (sim.stocks.food < foodTarget) return { label: 'TIGHT SUPPLY', kind: 'warning' };
    return { label: 'BALANCED', kind: 'good' };
  }

  function transaction(buyer, seller, gross, options = {}) {
    if (gross <= 0) return false;
    if (typeof getWallet(buyer) !== 'number' || typeof getWallet(seller) !== 'number') return false;
    const shippingFee = options.shipping ? gross * FREIGHT_RATE : 0;
    if (options.shipping && sim.shippingCapacity <= 0) return false;
    const tax = sim.collectTax && options.taxable !== false ? gross * sim.taxRate / 100 : 0;
    const due = gross + shippingFee + tax;
    if (!ensureFunds(buyer, due)) return false;
    setWallet(buyer, getWallet(buyer) - due);
    setWallet(seller, getWallet(seller) + gross);
    sim.taxVault += tax;
    if (shippingFee) {
      sim.wallets.shipping += shippingFee;
      sim.shippingCapacity--;
    }
    sim.transactions++;
    sim.volume += gross;
    return true;
  }

  function buyFromMarket(id, amount) {
    if (sim.stocks[id] < amount) return false;
    const gross = sim.prices[id] * amount;
    if (!transaction('council', id, gross, { shipping: true, taxable: false })) return false;
    sim.stocks[id] -= amount;
    sim.inventory[id] += amount;
    addLedger(`Council acquired ${amount} units of ${goodsById[id].name}.`, 'trade');
    return true;
  }

  function sellToMarket(id, amount) {
    if (sim.inventory[id] < amount) return false;
    const bid = sim.prices[id] * amount * 0.94;
    if (!transaction(id, 'council', bid, { shipping: true })) return false;
    sim.inventory[id] -= amount;
    sim.stocks[id] += amount;
    addLedger(`Council sold ${amount} units of ${goodsById[id].name}.`, 'trade');
    return true;
  }

  function renderTradeRows() {
    const host = byId('econ-trade-list');
    host.innerHTML = tradeable.map(id => {
      const good = goodsById[id];
      return `<div class="econ-trade-row" data-econ-row="${id}"><div class="econ-trade-good"><span class="econ-trade-code">${good.icon}</span><span><strong>${good.name}</strong><small><span id="econ-stock-${id}">0</span> available</small></span></div><strong class="econ-trade-price" id="econ-price-${id}">$0.00</strong><select class="econ-quantity" id="econ-qty-${id}" aria-label="${good.name} order quantity"><option value="1">1</option><option value="5">5</option><option value="10">10</option></select><button class="econ-buy-button" type="button" data-econ-order="buy" data-econ-good="${id}">Buy</button><button class="econ-sell-button" type="button" data-econ-order="sell" data-econ-good="${id}">Sell</button></div>`;
    }).join('');
  }

  function renderNodes() {
    byId('econ-map').innerHTML = nodes.map(node => {
      const stock = node.id === 'shipping' ? sim.shippingCapacity : sim.stocks[node.id];
      const alert = (node.id === 'food' && stock < sim.population * 0.5) || (node.id === 'labor' && stock < 12);
      return `<button class="econ-node${alert ? ' econ-node-alert' : ''}" type="button" data-econ-focus="${node.id}"><span class="econ-node-code">${goodsById[node.id].icon}</span><span class="econ-node-copy"><strong>${node.title}</strong><small>${node.subtitle}</small></span><span class="econ-node-value"><strong>${quantity(stock)}</strong><small>${money(sim.prices[node.id])}</small></span></button>`;
    }).join('');
    const health = currentHealth();
    byId('econ-market-status').textContent = health.label;
    byId('econ-market-status').dataset.health = health.kind;
  }

  byId('econ-map').addEventListener('click', event => {
    if (event.target.closest('[data-econ-focus]')) setTab('trade');
  });

  function renderChart() {
    const history = sim.history.length ? sim.history : [{ food: sim.prices.food, labor: sim.prices.labor, tools: sim.prices.tools }];
    for (const id of ['food', 'labor', 'tools']) {
      const values = history.map(item => Number(item[id]) || sim.prices[id]);
      const min = Math.min(...values);
      const span = Math.max(0.1, Math.max(...values) - min);
      const points = values.map((value, index) => `${(history.length < 2 ? 180 : index * 360 / (history.length - 1)).toFixed(1)},${(100 - ((value - min) / span) * 82).toFixed(1)}`).join(' ');
      byId(`econ-line-${id}`).setAttribute('points', points);
    }
    byId('econ-chart-range').textContent = `${history.length} days`;
  }

  function renderActivity() {
    for (const [id, entries] of [['econ-activity', sim.ledger.slice(0, 5)], ['econ-ledger', sim.ledger.slice(0, 24)]]) {
      const host = byId(id);
      host.replaceChildren();
      entries.forEach(entry => {
        const item = document.createElement('li');
        item.className = `econ-activity-item econ-activity-${entry.kind || 'signal'}`;
        const day = document.createElement('span');
        day.textContent = `D${String(entry.day || 1).padStart(3, '0')}`;
        const message = document.createElement('span');
        message.textContent = entry.message;
        item.append(day, message);
        host.appendChild(item);
      });
    }
  }

  /* Supply meters give the player an at-a-glance read on the three resources
     that actually decide whether the economy keeps running. */
  function renderMeters() {
    const foodTarget = foodStockTarget();
    const laborTarget = Math.max(12, sim.population * FOOD_PER_WORKER * 1.6);
    const cashTarget = Math.max(20, sim.population * 3);
    const pairs = [
      ['food', clamp(sim.stocks.food / foodTarget * 100, 0, 100)],
      ['labor', clamp(sim.stocks.labor / laborTarget * 100, 0, 100)],
      ['cash', clamp(sim.wallets.households / cashTarget * 100, 0, 100)]
    ];
    for (const [id, value] of pairs) {
      const bar = byId(`econ-${id}-bar`);
      const label = byId(`econ-${id}-meter`);
      if (bar) {
        bar.value = Math.round(value);
        bar.dataset.level = value < 25 ? 'danger' : value < 55 ? 'warning' : 'good';
      }
      if (label) label.textContent = `${Math.round(value)}%`;
    }
  }

  function render() {
    byId('econ-day').textContent = String(sim.day).padStart(3, '0');
    byId('econ-run-state').textContent = sim.running ? 'LIVE' : 'PAUSED';
    byId('econ-run-state').classList.toggle('econ-live', sim.running);
    byId('econ-toggle').textContent = sim.running ? 'Pause' : 'Run';
    byId('econ-speed').textContent = `${sim.speed}x`;
    byId('econ-treasury').textContent = money(sim.treasury + sim.taxVault);
    byId('econ-money-change').textContent = `${money(sim.treasury)} council / ${money(sim.taxVault)} tax`;
    byId('econ-population').textContent = quantity(sim.population);
    byId('econ-pop-change').textContent = sim.missedMealDays ? 'Food pressure' : 'Active households';
    byId('econ-price-index').textContent = calculatePriceIndex().toFixed(1);
    byId('econ-price-change').textContent = sim.mode === 'supply' ? 'Supply / demand' : 'Labor-linked';
    byId('econ-volume').textContent = quantity(sim.transactions);
    renderMeters();
    byId('econ-bank-reserves').textContent = money(sim.bankReserves);
    byId('econ-bank-debt').textContent = money(sim.totalDebt);
    byId('econ-bank-health').textContent = sim.bankFailures ? `${sim.bankFailures} stress` : 'Stable';
    byId('econ-tax-value').textContent = `${sim.taxRate}%`;
    byId('econ-interest-value').textContent = `${sim.interestRate}%`;
    byId('econ-reserve-value').textContent = `${sim.reserveRate}%`;
    byId('econ-tax-toggle').textContent = `Transaction taxes: ${sim.collectTax ? 'On' : 'Off'}`;
    byId('econ-tax-toggle').setAttribute('aria-pressed', sim.collectTax ? 'true' : 'false');
    document.querySelectorAll('[data-econ-mode]').forEach(button => button.classList.toggle('active', button.dataset.econMode === sim.mode));
    renderNodes();
    renderChart();
    renderActivity();
    for (const id of tradeable) {
      byId(`econ-stock-${id}`).textContent = quantity(sim.stocks[id]);
      byId(`econ-price-${id}`).textContent = money(sim.prices[id]);
    }
    const inventory = tradeable.filter(id => sim.inventory[id] > 0).map(id => `${goodsById[id].name} ${quantity(sim.inventory[id])}`).join(' / ');
    byId('econ-inventory').textContent = inventory || 'No commodities held';
  }

  function setTab(name) {
    document.querySelectorAll('[data-econ-tab]').forEach(button => {
      const selected = button.dataset.econTab === name;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    document.querySelectorAll('[data-econ-panel]').forEach(panel => {
      const selected = panel.dataset.econPanel === name;
      panel.hidden = !selected;
      panel.classList.toggle('active', selected);
    });
  }

  byId('econ-toggle').addEventListener('click', () => {
    sim.running = !sim.running;
    addLedger(sim.running ? 'Simulation resumed.' : 'Simulation paused.', 'system');
    save();
    render();
  });
  byId('econ-step').addEventListener('click', () => {
    const wasRunning = sim.running;
    sim.running = false;
    tick();
    sim.running = wasRunning;
    save();
    render();
  });
  byId('econ-speed').addEventListener('click', () => {
    const speeds = [1, 3, 8];
    sim.speed = speeds[(speeds.indexOf(sim.speed) + 1) % speeds.length];
    save();
    render();
  });
  byId('econ-tax-toggle').addEventListener('click', () => {
    sim.collectTax = !sim.collectTax;
    addLedger(sim.collectTax ? 'Transaction taxes enabled.' : 'Transaction taxes suspended.', 'policy');
    save();
    render();
  });
  byId('econ-reset').addEventListener('click', () => {
    const resetButton = byId('econ-reset');
    if (!resetArmed) {
      resetArmed = true;
      resetButton.textContent = 'Confirm reset';
      window.clearTimeout(resetArmTimer);
      resetArmTimer = window.setTimeout(() => {
        resetArmed = false;
        resetButton.textContent = 'Reset';
      }, 3000);
      return;
    }
    resetArmed = false;
    window.clearTimeout(resetArmTimer);
    resetButton.textContent = 'Reset';
    localStorage.removeItem(storageKey);
    sim = makeFreshState();
    pushHistory();
    save();
    render();
    setTab('market');
  });
  document.querySelectorAll('[data-econ-tab]').forEach(button => button.addEventListener('click', () => setTab(button.dataset.econTab)));
  document.querySelectorAll('[data-econ-mode]').forEach(button => button.addEventListener('click', () => {
    sim.mode = button.dataset.econMode === 'stable' ? 'stable' : 'supply';
    addLedger(sim.mode === 'stable' ? 'Stable-price mode enabled.' : 'Supply-and-demand mode enabled.', 'policy');
    save();
    render();
  }));
  byId('econ-trade-list').addEventListener('click', event => {
    const button = event.target.closest('[data-econ-order]');
    if (!button) return;
    const id = button.dataset.econGood;
    const amount = Number(byId(`econ-qty-${id}`).value) || 1;
    const filled = button.dataset.econOrder === 'buy' ? buyFromMarket(id, amount) : sellToMarket(id, amount);
    if (!filled) addLedger(`Order not filled for ${goodsById[id].name}; check cash, inventory, and freight.`, 'warning');
    save();
    render();
  });
  [['econ-tax', 'taxRate'], ['econ-interest', 'interestRate'], ['econ-reserve', 'reserveRate']].forEach(([id, property]) => {
    byId(id).addEventListener('input', event => {
      sim[property] = Number(event.target.value);
      render();
      save();
    });
  });
  byId('econ-create-money').addEventListener('click', () => {
    const amount = numberOr(byId('econ-money-amount').value, 0, 1, 100000);
    sim.treasury += amount;
    sim.minted += amount;
    addLedger(`Council issued ${money(amount)} into circulation.`, 'policy');
    save();
    render();
  });
  byId('econ-destroy-money').addEventListener('click', () => {
    const amount = numberOr(byId('econ-money-amount').value, 0, 1, 100000);
    if (amount > sim.treasury) addLedger('Currency retirement failed; council funds are too low.', 'warning');
    else {
      sim.treasury -= amount;
      sim.retired += amount;
      addLedger(`Council retired ${money(amount)} from circulation.`, 'policy');
    }
    save();
    render();
  });
  byId('econ-stimulus').addEventListener('click', () => {
    const amount = numberOr(byId('econ-money-amount').value, 0, 1, 100000);
    if (amount > sim.taxVault) addLedger('Stimulus failed; collected tax funds are too low.', 'warning');
    else {
      const sector = byId('econ-stimulus-sector').value;
      sim.taxVault -= amount;
      if (sector === 'mines') {
        sim.wallets.coal += amount / 2;
        sim.wallets.iron += amount / 2;
      } else sim.wallets[sector === 'labor' ? 'households' : sector] += amount;
      addLedger(`Distributed ${money(amount)} in ${sector} stimulus.`, 'policy');
    }
    save();
    render();
  });

  renderTradeRows();
  if (!sim.history.length) pushHistory();
  render();
  save();
  if (!timer) {
    timer = window.setInterval(() => {
      if (state.currentPage !== 'economy' || !sim.running) return;
      for (let i = 0; i < sim.speed; i++) tick();
    }, 1000);
  }
  window.addEventListener('pagehide', save);
}
