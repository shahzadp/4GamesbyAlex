/* ------------------------------------------------------------------
 * Proto Web — the network (replaces the cell grid)
 * ------------------------------------------------------------------
 * The original map was a grid of cells, one trader per cell. That is the
 * thing this file replaces, and it was replaced for a concrete reason
 * rather than a stylistic one: a cell map caps population at the number of
 * free cells. Measured on the classic 20×20 world, labour converged at 326
 * and stopped dead — not because the economy was saturated, but because the
 * map ran out of squares. Every population question after that ("can the
 * commons grow?", "does the middle class expand?") was really a question
 * about geography.
 *
 * So there is no grid. The world is a *network of industries*:
 *
 *   LABOR ──► FOOD ──► COMMONS (what people eat)
 *     │        ▲
 *     ├──► COAL ──┐
 *     ├──► IRON ──┼──► TOOL ──┘   (tools multiply food output 20×)
 *     └──────────────► SHIPPING    (every trade must be carried)
 *
 * Traders belong to an industry node rather than standing on a square.
 * Addresses still exist, but they are continuous coordinates inside a node's
 * orbital disc, not grid indices — so population is bounded only by food and
 * by the state's willingness to print money, which is the honest limit.
 *
 * Deliveries travel as arcs between nodes rather than walking A* routes
 * around trees. This is not only simpler: it is *more* faithful to what the
 * original was doing. The pathfinder existed to route around obstacles on a
 * map that represented nothing economic; an arc between two industries says
 * exactly what happens — goods move from where they are made to where they
 * are wanted, and the arc's curvature and thickness carry the flow.
 * ------------------------------------------------------------------ */

import { clamp } from './util.js';

/* Commodity indices mirror ComType in economy.js. Declared here as plain
 * numbers to avoid a circular import: economy.js imports nothing from
 * this module's geometry, but it does import the Traveler below. */
export const NODE = Object.freeze({
  LABOR: 0, FOOD: 1, TOOL: 2, COAL: 3, IRON: 4, SHIPPING: 5, CROWN: 6,
});

/* ------------------------------------------------------------------
 * Node layout
 * ------------------------------------------------------------------
 * Positions are in a unit disc; the renderer scales them. The arrangement is
 * chosen so that the production chain reads left-to-right, which makes the
 * causal structure legible at a glance: labour on the left feeds everything,
 * the raw materials gather in the middle, and the finished goods come out on
 * the right. The crown sits above the centre, watching.
 * ------------------------------------------------------------------ */
const LAYOUT = {
  [NODE.LABOR]:    { x: -0.86, y:  0.06, r: 0.215, label: 'Labor' },
  [NODE.COAL]:     { x: -0.42, y: -0.50, r: 0.150, label: 'Coal' },
  [NODE.IRON]:     { x: -0.40, y:  0.52, r: 0.150, label: 'Iron' },
  [NODE.TOOL]:     { x:  0.06, y:  0.00, r: 0.170, label: 'Tools' },
  [NODE.FOOD]:     { x:  0.56, y: -0.30, r: 0.185, label: 'Food' },
  [NODE.SHIPPING]: { x:  0.60, y:  0.48, r: 0.140, label: 'Shipping' },
  [NODE.CROWN]:    { x: -0.02, y: -0.68, r: 0.120, label: 'The Crown' },
};

/* Causal edges: [from, to, weight of causation, description] */
export const CAUSAL = [
  [NODE.LABOR, NODE.FOOD, 1.00, 'Labor is consumed to grow food'],
  [NODE.LABOR, NODE.COAL, 0.55, 'Labor feeds the coal works'],
  [NODE.LABOR, NODE.IRON, 0.55, 'Labor feeds the iron works'],
  [NODE.LABOR, NODE.TOOL, 0.75, 'Labor feeds the tool works'],
  [NODE.LABOR, NODE.SHIPPING, 0.45, 'Labor crews the carriers'],
  [NODE.COAL, NODE.TOOL, 0.85, 'Coal and iron are consumed to forge tools'],
  [NODE.IRON, NODE.TOOL, 0.85, 'Coal and iron are consumed to forge tools'],
  [NODE.TOOL, NODE.FOOD, 0.95, 'A tool makes food twenty times over'],
  [NODE.SHIPPING, NODE.FOOD, 0.70, 'Nothing moves without being carried'],
  [NODE.SHIPPING, NODE.COAL, 0.40, 'Inputs must reach the works'],
  [NODE.SHIPPING, NODE.IRON, 0.40, 'Inputs must reach the works'],
  [NODE.FOOD, NODE.LABOR, 0.90, 'Labor is reproduced only by being fed'],
  [NODE.CROWN, NODE.LABOR, 0.35, 'The crown rules every case'],
];

let addrSeq = 0;

/* Deterministic scatter so a trader's seat does not jitter every frame. */
function seat(node, n) {
  // golden-angle spiral: even fill, stable per index
  const a = n * 2.399963;
  const r = Math.sqrt((n % 97) / 97) * 0.86;
  return {
    x: node.x + Math.cos(a) * r * node.r,
    y: node.y + Math.sin(a) * r * node.r,
  };
}

export class GameMap {
  constructor() {
    this.travellers = [];
    this.dirty = true;

    this.nodes = {};
    this.order = [];
    for (const [id, def] of Object.entries(LAYOUT)) {
      const key = Number(id);
      this.nodes[key] = {
        ...def, id: key,
        members: [],
        // live readouts, refreshed by the renderer each frame
        stock: 0, sold: 0, price: 0, wealth: 0, count: 0,
      };
      this.order.push(key);
    }
    this.seatIndex = new Map();   // trader id -> seat number within its node
  }

  /* ---- membership ---- */

  /* Placing a trader in an industry. Always succeeds: the network is
   * unbounded, which is the entire reason it replaced the grid. */
  place(trader, comType) {
    const node = this.nodes[comType] || this.nodes[NODE.LABOR];
    const n = this.seatIndex.get(trader.id) ?? node.members.length;
    this.seatIndex.set(trader.id, n);
    node.members.push(trader);
    trader.node = node.id;
    const p = seat(node, n);
    trader.address = p;
    this.dirty = true;
    return p;
  }

  unregister(trader) {
    const node = this.nodes[trader.node];
    if (!node) return;
    const i = node.members.indexOf(trader);
    if (i >= 0) node.members.splice(i, 1);
    this.seatIndex.delete(trader.id);
    this.dirty = true;
  }

  /* Refresh the per-node readouts the infographic draws. */
  measure(sim) {
    for (const id of this.order) {
      const n = this.nodes[id];
      let stock = 0, sold = 0, price = 0, priceN = 0, wealth = 0;
      for (const t of n.members) {
        if (t.isDead) continue;
        stock += t.com.length;
        sold += t.sale_count | 0;
        if (t.id !== 'MASTER') { price += t.getPrice(); priceN++; }
        wealth += t.account.balance;
      }
      n.stock = stock; n.sold = sold;
      n.price = priceN ? price / priceN : 0;
      n.wealth = wealth;
      n.count = n.members.length;
    }
    void sim;
  }

  tick() {
    for (const t of this.travellers) t.tick();
    this.travellers = this.travellers.filter(t => !t.done);
    this.dirty = true;
  }
}

/* ------------------------------------------------------------------
 * Deliveries travel along an arc between industries.
 * ------------------------------------------------------------------ */

let travSeq = 0;

export class Traveler {
  constructor(map, seller, buyer, comType, quant) {
    this.id = ++travSeq;
    this.map = map;
    this.seller = seller;
    this.buyer = buyer;
    this.comType = comType;
    this.quant = quant;
    this.done = false;

    const a = map.nodes[seller.node] || map.nodes[NODE.LABOR];
    const b = map.nodes[buyer.node] || map.nodes[NODE.LABOR];

    this.x0 = (seller.address || a).x; this.y0 = (seller.address || a).y;
    this.x1 = (buyer.address || b).x;  this.y1 = (buyer.address || b).y;
    this.x = this.x0; this.y = this.y0;
    this.t = 0;

    // longer hauls take longer, and bow away from the centre of the disc
    const dx = this.x1 - this.x0, dy = this.y1 - this.y0;
    const len = Math.hypot(dx, dy);
    this.bow = clamp(len * 0.30, 0.04, 0.34) * (Math.random() < 0.5 ? -1 : 1);
    this.len = len;
    // speed: roughly one node-width per tick
    this.duration = Math.max(2, Math.round(len * 26));
  }

  /* Point on the arc at parameter t∈[0,1]. */
  positionAt(t) {
    const mx = (this.x0 + this.x1) / 2;
    const my = (this.y0 + this.y1) / 2;
    const nx = -(this.y1 - this.y0);
    const ny = (this.x1 - this.x0);
    const nl = Math.hypot(nx, ny) || 1;
    const cx = mx + (nx / nl) * this.bow;
    const cy = my + (ny / nl) * this.bow;
    // quadratic bezier
    const u = 1 - t;
    return {
      x: u * u * this.x0 + 2 * u * t * cx + t * t * this.x1,
      y: u * u * this.y0 + 2 * u * t * cy + t * t * this.y1,
    };
  }

  get rotation() {
    const e = 0.06;
    const a = this.positionAt(clamp(this.t - e, 0, 1));
    const b = this.positionAt(clamp(this.t + e, 0, 1));
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  }

  tick() {
    if (this.done) return;
    this.t += 1 / this.duration;
    const p = this.positionAt(this.t);
    this.x = p.x; this.y = p.y;
    if (this.t >= 1) this.arrive();
  }

  arrive() {
    if (this.done) return;
    this.done = true;
    this.seller.arrivalNotification(this);
    const idx = this.map.travellers.indexOf(this);
    if (idx >= 0) this.map.travellers.splice(idx, 1);
  }
}

export { seat };