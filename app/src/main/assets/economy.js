function setupEconomyGame() {
  const stage = document.getElementById('stage-economy');
  if (!stage) return;

  const storageKey = 'micro_economy_save_v1';
  const sectors = [
    { id: 'labor', name: 'Labor', short: 'LAB', icon: 'LAB', basePrice: 1.8, target: 80, producerLabel: '19 workers' },
    { id: 'food', name: 'Food', short: 'FOOD', icon: 'FOOD', basePrice: 2.8, target: 24, producerLabel: '3 farms' },
    { id: 'tools', name: 'Tools', short: 'TOOLS', icon: 'TOOL', basePrice: 11, target: 6, producerLabel: '2 workshops' },
    { id: 'coal', name: 'Coal', short: 'COAL', icon: 'COAL', basePrice: 1.2, target: 20, producerLabel: '2 mines' },
    { id: 'iron', name: 'Iron', short: 'IRON', icon: 'IRON', basePrice: 1.6, target: 20, producerLabel: '2 mines' },
    { id: 'shipping', name: 'Shipping', short: 'PORT', icon: 'PORT', basePrice: 0.65, target: 12, producerLabel: '1 carrier' }
  ];
  const goodsById = Object.fromEntries(sectors.map(good => [good.id, good]));
  const tradeable = ['food', 'tools', 'coal', 'iron'];
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
      history: [],
      ledger: [{ day: 1, message: 'Big Economy simulator loaded. High labor population, segregated map. Press play to start the simulation.', kind: 'system' }]
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
      for (const key of ['day', 'population', 'goodMealDays', 'missedMealDays', 'treasury', 'taxVault', 'bankReserves', 'totalDebt', 'shippingCapacity', 'transactions', 'volume', 'minted', 'retired', 'bankFailures', 'taxRate', 'interestRate', 'reserveRate']) {
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

  function ensureFunds(account, amount) {
    const current = getWallet(account) || 0;
    if (current >= amount) return true;
    const shortfall = amount - current;
    const requiredReserves = currentMoneySupply() * sim.reserveRate / 100;
    const lendable = Math.max(0, sim.bankReserves - requiredReserves);
    if (shortfall > lendable) {
      sim.bankFailures++;
      return false;
    }
    sim.bankReserves -= shortfall;
    setWallet(account, current + shortfall);
    sim.debts[account] = (sim.debts[account] || 0) + shortfall;
    sim.totalDebt += shortfall;
    addLedger(`Bank credit extended: ${money(shortfall)}.`, 'bank');
    return true;
  }

  function transfer(buyer, seller, gross, options = {}) {
    const amount = Math.max(0, gross);
    if (amount <= 0 || typeof getWallet(buyer) !== 'number' || typeof getWallet(seller) !== 'number') return false;
    const usesShipping = Boolean(options.shipping);
    if (usesShipping && sim.shippingCapacity <= 0) return false;
    const fee = usesShipping ? sim.prices.shipping : 0;
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
    return true;
  }

  function buyInput(buyer, goodId, requested, useShipping = goodId !== 'labor') {
    const available = Math.min(Math.max(0, Math.floor(requested)), Math.floor(sim.stocks[goodId] || 0));
    for (let count = available; count > 0; count--) {
      if (transfer(buyer, goodId, sim.prices[goodId] * count, { shipping: useShipping })) {
        sim.stocks[goodId] -= count;
        return count;
      }
    }
    return 0;
  }

  function produceMine(goodId) {
    const labor = buyInput(goodId, 'labor', 2, false);
    if (!labor) return 0;
    const mineHasToolTurn = (sim.day + (goodId === 'iron' ? 1 : 0)) % 2 === 0;
    const tool = sim.stocks.tools > 8 && mineHasToolTurn ? buyInput(goodId, 'tools', Math.min(1, labor), true) : 0;
    const produced = labor + tool * 7;
    sim.stocks[goodId] += produced;
    return produced;
  }

  function produceTools() {
    let made = 0;
    for (let i = 0; i < 2; i++) {
      if (sim.stocks.labor < 1 || sim.stocks.coal < 1 || sim.stocks.iron < 1) break;
      if (!buyInput('tools', 'labor', 1, false)) break;
      if (!buyInput('tools', 'coal', 1, true)) break;
      if (!buyInput('tools', 'iron', 1, true)) break;
      sim.stocks.tools++;
      made++;
    }
    return made;
  }

  function produceFood() {
    const labor = buyInput('food', 'labor', 3, false);
    if (!labor) return 0;
    const tools = buyInput('food', 'tools', Math.min(labor, 1), true);
    const produced = labor + tools * 19;
    sim.stocks.food += produced;
    return produced;
  }

  function settleLoans() {
    for (const account of Object.keys(sim.debts)) {
      const debt = sim.debts[account];
      if (debt <= 0) continue;
      const interest = debt * sim.interestRate / 100 / 10;
      const principal = Math.min(debt, debt * 0.05);
      const due = interest + principal;
      if ((getWallet(account) || 0) >= due) {
        setWallet(account, getWallet(account) - due);
        sim.bankReserves += due;
        sim.debts[account] -= principal;
        sim.totalDebt -= principal;
      } else {
        sim.debts[account] += interest;
        sim.totalDebt += interest;
        sim.bankFailures++;
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
        const laborRatio = sim.prices.labor / goodsById.labor.basePrice;
        const ratios = { labor: 1, food: 1.55, tools: 6.1, coal: 0.67, iron: 0.89 };
        sim.prices[good.id] = clamp(goodsById.labor.basePrice * laborRatio * ratios[good.id], 0.1, 250);
      } else {
        const stock = sim.stocks[good.id];
        const scarcity = clamp((good.target - stock) / good.target, -1.5, 2.5);
        sim.prices[good.id] = clamp(sim.prices[good.id] * (1 + scarcity * 0.018 + moneyPressure), 0.1, 250);
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
    const laborProducedByFarms = produceFood();
    const coalProduced = produceMine('coal');
    const ironProduced = produceMine('iron');
    const toolsProduced = produceTools();

    const foodDemand = Math.max(1, sim.population * 0.42);
    const foodBought = buyInput('households', 'food', foodDemand, true);
    sim.stocks.labor += foodBought;
    sim.stocks.labor = Math.min(1800, sim.stocks.labor);

    if (foodBought >= foodDemand * 0.75) {
      sim.goodMealDays++;
      sim.missedMealDays = 0;
      if (sim.goodMealDays >= 12 && sim.population < 70) {
        sim.population++;
        sim.goodMealDays = 0;
        addLedger('A new household joined the Big Economy workforce.', 'growth');
      }
    } else {
      sim.missedMealDays++;
      sim.goodMealDays = 0;
      if (sim.missedMealDays >= 3 && sim.population > 1) {
        sim.population--;
        sim.missedMealDays = 0;
        addLedger('Big Economy: food shortages reduced workforce by one.', 'warning');
      }
    }

    if (sim.day % 10 === 0) settleLoans();
    updatePrices();
    pushHistory();

    if (sim.day % 3 === 0) {
      addLedger(`Day ${sim.day}: ${foodBought.toFixed(1)} food consumed; ${laborProducedByFarms} food, ${coalProduced} coal, ${ironProduced} iron, ${toolsProduced} tools produced.`, 'production');
    }
    if (sim.transactions === transactionStart) addLedger('Trade stalled. Check liquidity, stock, and freight capacity.', 'warning');
    save();
    render();
  }

  function currentHealth() {
    const foodTarget = Math.max(6, sim.population * 0.42 * 3);
    if (sim.stocks.food < foodTarget * 0.45) return { label: 'FOOD SHORTAGE', kind: 'danger' };
    if (sim.bankReserves < currentMoneySupply() * sim.reserveRate / 100) return { label: 'LOW RESERVES', kind: 'warning' };
    if (sim.stocks.food < foodTarget) return { label: 'TIGHT SUPPLY', kind: 'warning' };
    return { label: 'BALANCED', kind: 'good' };
  }

  function transaction(buyer, seller, gross, options = {}) {
    if (gross <= 0) return false;
    if (typeof getWallet(buyer) !== 'number' || typeof getWallet(seller) !== 'number') return false;
    const shippingFee = options.shipping ? sim.prices.shipping : 0;
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
    addLedger(sim.running ? 'Big Economy simulation resumed.' : 'Big Economy simulation paused.', 'system');
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
