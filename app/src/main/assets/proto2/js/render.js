/* ------------------------------------------------------------------
 * Proto Web â€” canvas renderer
 * Replaces MainView (SurfaceView): MAP / GRAPH / STATS modes.
 * Original cleared to 0xFF000000 and used these commodity colours:
 *   labor #00FF00  food #FFFF00  tool #00FFFF
 *   coal  #FF0000  iron #FFA500  transport #FFC0CB
 * Softened here for legibility on dark, hues preserved.
 * ------------------------------------------------------------------ */

import { PALETTE, icon, GLYPH_FOR } from './icons.js';
import { CAUSAL, NODE, seat } from './map.js';
import { clamp } from './util.js';

export const SERIES_COLORS = [
  PALETTE.labor, PALETTE.food, PALETTE.tool,
  PALETTE.coal, PALETTE.iron, PALETTE.transport,
];

const COM_NAMES = ['Labor', 'Food', 'Tools', 'Coal', 'Iron', 'Shipping'];

/* Node colours, keyed by the NODE ids in map.js.
 *
 * These are PALETTE values rather than a second hand-written table, and that is
 * the point of the change. The map used to carry its own saturated set — labour
 * at #22e06a neon green, coal at #ff5a5f signal red — while the icons, the
 * chart series and every panel chip used the pastel set in icons.js. Two
 * palettes for the same seven commodities: the trader list showed a mint icon
 * and the map showed a butter-yellow one, and neither matched its own graph
 * series.
 *
 * Deriving from PALETTE makes that drift structurally impossible rather than a
 * thing to remember. */
const NODE_COLOR = {
  [NODE.LABOR]: PALETTE.labor,
  [NODE.FOOD]: PALETTE.food,
  [NODE.TOOL]: PALETTE.tool,
  [NODE.COAL]: PALETTE.coal,
  [NODE.IRON]: PALETTE.iron,
  [NODE.SHIPPING]: PALETTE.transport,
  [NODE.CROWN]: PALETTE.master,
};

/* #rrggbb + alpha -> rgba() */
function hexa(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* No sprite cache here any more.
 *
 * There was one because every map tile blitted a rasterized icon — 400 cells
 * times a decoded image each. The cell map is gone; the bubble map draws its
 * bubbles, rings and flow arrows as canvas paths, and the DOM (not the canvas)
 * owns every SVG icon now. So the rasterizer, its cache and its per-size key
 * are all dead weight: nothing calls getSprite, and leaving it in place
 * suggested the map still rasterized icons, which is the opposite of what a
 * reader should conclude from this file. */

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.viewMode = 'map';   // 'map' | 'graph' | 'stats'
    this.graphSpread = 1;    // 1 = auto, 0 = infinite
    this.graphHistory = [];
    this.dpr = window.devicePixelRatio || 1;
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    /* A canvas that is `hidden` (or inside a display:none ancestor) measures
     * 0x0, and drawing into it is not merely wrong — it throws. drawMap
     * computes a scale from `w - 168`, which goes negative below ~168px, and
     * createRadialGradient rejects a negative radius outright with
     * IndexSizeError. That is exactly how a restore could tear down the shell
     * and leave the app with no map at all: go('map') un-hides the canvas and
     * renders in the same pass, and the measure happened before layout settled.
     *
     * So: floor the dimensions at something drawable, and let draw() bail out
     * rather than trusting the numbers. */
    this.w = Math.max(1, rect.width || 1);
    this.h = Math.max(1, rect.height || 1);
    this.visible = rect.width > 0 && rect.height > 0;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  clear() {
    const c = this.ctx;
    c.fillStyle = '#0b0e14';
    c.fillRect(0, 0, this.w, this.h);
  }

  /* ---------------- BUBBLE MAP ----------------
   * The economy drawn as a network of industries rather than a grid of
   * squares. Each industry is a bubble sized by its population, wrapped in a
   * ring whose arc shows how much of it sits in each social class, and threaded
   * onto a causal web that says why it matters to anything else.
   *
   * Everything here is read-only observation: the bubbles do not simulate
   * anything, they report it. */
  drawMap(sim) {
    const c = this.ctx;
    this.clear();
    const map = sim.map;
    map.measure(sim);

    const pad = 84;
    const cx = this.w / 2, cy = this.h / 2;
    /* Clamped at a small positive value. The raw expression goes NEGATIVE when
     * the canvas is under ~168px in either axis — which is exactly what a canvas
     * that is still display:none measures — and every radius and offset below is
     * derived from this, so a negative scale does not merely look wrong, it throws
     * inside createRadialGradient and takes the whole frame down with it. */
    const scale = Math.max(1, Math.min(this.w - pad * 2, this.h - pad * 2) / 2.15);
    const P = node => ({ x: cx + node.x * scale, y: cy + node.y * scale });
    this._mapScale = scale;
    this._hit = [];

    const rel = this._hoverNode ?? this._focusNode;

    /* backdrop: a faint disc so the network sits in a space */
    const bg = c.createRadialGradient(cx, cy, scale * 0.05, cx, cy, scale * 1.2);
    bg.addColorStop(0, 'rgba(40,52,70,.55)');
    bg.addColorStop(1, 'rgba(11,14,20,0)');
    c.fillStyle = bg;
    c.fillRect(0, 0, this.w, this.h);

    this._flows(map, P, rel);        // shipments in flight
    this._causalWeb(map, P, rel);    // why each industry matters
    for (const id of map.order) this._bubble(map.nodes[id], P, sim, rel);
    this._legend(sim, map);
  }

  /* ---- causal edges: the structure of the economy ---- */
  _causalWeb(map, P, rel) {
    const c = this.ctx;
    for (const [from, to, , note] of CAUSAL) {
      const a = P(map.nodes[from]), b = P(map.nodes[to]);
      const live = rel != null && (rel === from || rel === to);
      const dim = rel != null && !live;

      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const nx = -(b.y - a.y), ny = b.x - a.x;
      const nl = Math.hypot(nx, ny) || 1;
      const qx = mx + (nx / nl) * 18, qy = my + (ny / nl) * 18;

      c.beginPath();
      c.moveTo(a.x, a.y);
      c.quadraticCurveTo(qx, qy, b.x, b.y);
      c.strokeStyle = live ? 'rgba(163,193,255,.66)' : 'rgba(122,142,178,.16)';
      c.lineWidth = live ? 1.9 : 0.9;
      if (dim) c.setLineDash([2, 5]);
      c.stroke();
      c.setLineDash([]);

      if (!live) continue;

      // arrowhead: which way the causation runs
      const t = 0.7, u = 1 - t;
      const px = u * u * a.x + 2 * u * t * qx + t * t * b.x;
      const py = u * u * a.y + 2 * u * t * qy + t * t * b.y;
      c.save(); c.translate(px, py); c.rotate(Math.atan2(b.y - py, b.x - px));
      c.fillStyle = 'rgba(163,193,255,.9)';
      c.beginPath(); c.moveTo(0, 0); c.lineTo(-7, -3.4); c.lineTo(-7, 3.4); c.closePath();
      c.fill(); c.restore();

      // the reason, spelled out
      c.font = '10px system-ui, sans-serif';
      c.fillStyle = 'rgba(196,210,235,.92)';
      c.textAlign = 'center';
      c.textBaseline = 'bottom';
      c.fillText(note, qx, qy - 4);
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
    }
  }

  /* ---- shipments, as travelling beads along the arcs ---- */
  _flows(map, P, rel) {
    const c = this.ctx;
    const list = map.travellers;
    if (!list.length) return;
    const shown = Math.min(list.length, 80);
    for (let i = 0; i < shown; i++) {
      const tv = list[i];
      const a = P(map.nodes[tv.seller.node] || map.nodes[NODE.LABOR]);
      const b = P(map.nodes[tv.buyer.node] || map.nodes[NODE.LABOR]);
      const live = rel == null || rel === tv.seller.node || rel === tv.buyer.node
        || rel === tv.comType;

      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const nx = -(b.y - a.y), ny = b.x - a.x;
      const nl = Math.hypot(nx, ny) || 1;
      const bow = tv.bow * (this._mapScale || 200);
      const qx = mx + (nx / nl) * bow, qy = my + (ny / nl) * bow;
      const t = tv.t, u = 1 - t;

      const x = u * u * a.x + 2 * u * t * qx + t * t * b.x;
      const y = u * u * a.y + 2 * u * t * qy + t * t * b.y;
      const ang = Math.atan2(2 * u * (qy - a.y) + 2 * t * (b.y - qy),
                             2 * u * (qx - a.x) + 2 * t * (b.x - qx));

      const col = tv.comType === 0 ? PALETTE.labor
        : [null, PALETTE.food, PALETTE.tool, PALETTE.coal, PALETTE.iron, PALETTE.transport][tv.comType]
          || PALETTE.transport;

      c.save();
      c.translate(x, y);
      c.rotate(ang);
      c.globalAlpha = live ? 0.95 : 0.14;
      c.fillStyle = col;
      const s = tv.comType === 0 ? 2.8 : 3.6;
      c.beginPath();
      c.moveTo(5.5, 0); c.lineTo(-3.4, 2.6); c.lineTo(-3.4, -2.6); c.closePath();
      c.fill();
      c.restore();
    }
    c.globalAlpha = 1;
    if (list.length > shown) {
      /* Sits above the ORDERS block, not on its baseline.
       *
       * At this.h - 14 the note shared a row with the order labels in
       * _legend() (baseline this.h - 22), so on a 360px screen the right-aligned
       * string ran back into the "Houses" label and the corner read
       * "Houses542 more in transit" — two strings drawn through each other.
       * this.h - 58 clears the "ORDERS" heading at h - 46 as well, and that
       * band is empty: the bubble cluster is laid out from the centre outwards
       * and its lowest node finishes well above it. */
      c.font = '10px ui-monospace, monospace';
      c.fillStyle = '#6b7686';
      c.textAlign = 'right';
      c.fillText(`+${(list.length - shown).toLocaleString()} more in transit`,
                 this.w - 18, this.h - 58);
      c.textAlign = 'left';
    }
  }

  /* ---- one industry bubble ---- */
  _bubble(node, P, sim, rel) {
    const c = this.ctx;
    const p = P(node);
    const active = rel === node.id;
    const pop = node.count;
    const color = NODE_COLOR[node.id] || '#8aa0c0';
    const dead = pop === 0;

    /* Area, not radius, carries the population — a radius-linear bubble makes
     * 40 look four times bigger than 10 instead of twice. */
    const r = node.r * (this._mapScale || 200)
      * (0.66 + 0.40 * Math.sqrt(Math.min(pop, 1200) / 60));
    node._r = r; node._p = p;
    this._hit.push({ id: node.id, x: p.x, y: p.y, r });

    /* --- body ---------------------------------------------------------
     * Body, gloss and rim are drawn as three separate passes rather than one
     * radial gradient, because a single gradient can only describe a sphere
     * and these bubbles are meant to read as lit glass discs sitting on a dark
     * plane. The radial gradient alone left every node a flat wash with a
     * hairline edge — legible, but unfinished, and seven of them at once looked
     * like a status board.
     *
     * Pass 1 casts the disc onto the background so it sits above the plane
     * instead of being printed on it. */
    c.save();
    c.shadowColor = 'rgba(0,0,0,.55)';
    c.shadowBlur = r * 0.5;
    c.shadowOffsetY = r * 0.10;
    c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2);
    c.fillStyle = hexa(color, dead ? 0.05 : 0.22);
    c.fill();
    c.restore();

    /* Pass 2: the coloured body, lit from above. */
    const g = c.createRadialGradient(p.x, p.y - r * 0.45, r * 0.06, p.x, p.y, r);
    g.addColorStop(0, hexa(color, dead ? 0.10 : 0.32));
    g.addColorStop(0.62, hexa(color, dead ? 0.05 : 0.17));
    g.addColorStop(1, hexa(color, dead ? 0.02 : 0.07));
    c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2);
    c.fillStyle = g; c.fill();

    /* Pass 3: specular. An ellipse rather than a point, because a point highlight
     * reads as a lamp and an ellipse reads as a curved surface. Clipped to the
     * body so it cannot spill onto the ring. */
    c.save();
    c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.clip();
    c.beginPath();
    c.ellipse(p.x, p.y - r * 0.52, r * 0.74, r * 0.34, 0, 0, Math.PI * 2);
    const gl = c.createLinearGradient(0, p.y - r * 0.86, 0, p.y - r * 0.18);
    gl.addColorStop(0, 'rgba(255,255,255,' + (dead ? 0.05 : 0.16) + ')');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gl; c.fill();
    c.restore();

    /* Pass 4: the glyph. This is the identity the bubble map was missing —
     * before it, the seven nodes were the same disc in seven hues, which is a
     * legend restated rather than a picture. Drawn as a watermark behind the
     * numbers so it can never crowd them or fight the label for room, at an
     * alpha low enough that the text stays the figure and the glyph the
     * ground. */
    const glyph = GLYPH_FOR[node.id];
    if (glyph && !this._glyphCache) this._glyphCache = new Map();
    if (glyph) {
      let path2d = this._glyphCache.get(node.id);
      if (!path2d) {
        try { path2d = new Path2D(glyph); this._glyphCache.set(node.id, path2d); }
        catch (e) { path2d = null; }
      }
      if (path2d) {
        /* Oversized and faint, so it reads as texture under the numbers rather
         * than as a third piece of information competing with them.
         *
         * At r*1.42 and 0.30 alpha the first attempt was neither: it landed
         * squarely between the label and the count and drew a line through
         * both — "Labor 75" became "Labor [person] 75". A watermark has to be
         * big enough that no edge of it reads as a shape, and dim enough that
         * the text wins wherever they overlap. */
        const gs = (r * 1.95) / 24;
        c.save();
        c.translate(p.x, p.y);
        c.scale(gs, gs);
        c.translate(-12, -12);
        c.fillStyle = hexa(color, dead ? 0.07 : 0.17);
        c.fill(path2d);
        c.restore();
      }
    }

    /* Pass 5: rim. A bright inner arc along the top edge is what actually sells
     * the curvature — the body gradient alone is too even to read as a sphere
     * once it is small. */
    c.beginPath();
    c.arc(p.x, p.y, r - 0.75, Math.PI * 1.06, Math.PI * 1.94);
    c.strokeStyle = `rgba(255,255,255,${dead ? 0.07 : 0.20})`;
    c.lineWidth = 1.4;
    c.lineCap = 'round';
    c.stroke();

    c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2);
    c.strokeStyle = active ? color : hexa(color, dead ? 0.28 : 0.5);
    c.lineWidth = active ? 2.2 : 1.2;
    c.stroke();

    /* Class ring. Each arc segment is the share of this industry held by one
     * social class, so the bubble shows the composition of its population and
     * not merely its size. */
    let commons = 0, middle = 0, elite = 0;
    for (const t of node.members) {
      if (t.isDead) continue;
      if (t.socialClass === 'elite') elite++;
      else if (t.socialClass === 'middle') middle++;
      else commons++;
    }
    const tot = commons + middle + elite;
    const R = r + 6;
    if (tot > 0) {
      let a0 = -Math.PI / 2;
      const parts = [[commons / tot, '#8f9bb0'], [middle / tot, '#3fd8ff'],
                     [elite / tot, '#e0b64a']];
      /* A dark track under the arcs, at the same radius and a touch wider.
       * The arcs sit 6px outside the bubble, over whatever the backdrop happens
       * to be there — a causal edge, another node's pulse, the grid — and a 3.4px
       * coloured stroke on an unpredictable background is the kind of thing
       * that reads fine in one frame and vanishes in the next. The track is
       * what makes the ring a dial instead of three loose marks. */
      c.beginPath();
      c.arc(p.x, p.y, R, 0, Math.PI * 2);
      c.strokeStyle = 'rgba(6,9,14,.62)';
      c.lineWidth = 5.2;
      c.stroke();

      for (const [frac, col] of parts) {
        if (frac <= 0.001) continue;
        const a1 = a0 + frac * Math.PI * 2;
        c.beginPath();
        /* A fixed 0.04rad inset was a proportional gap that vanished on thin
         * slices and opened up a visible notch on fat ones. Half the line width
         * is a constant gap in pixels, which is what a segment boundary looks
         * like. Round caps then close the ends instead of leaving them sheared. */
        const gap = 5.2 / R;
        c.arc(p.x, p.y, R, a0 + (a1 - a0 > gap * 2 ? gap : 0), a1 - (a1 - a0 > gap * 2 ? gap : 0));
        c.strokeStyle = col;
        c.lineWidth = 3.4;
        c.lineCap = 'round';
        c.globalAlpha = active ? 1 : 0.75;
        c.stroke();
        a0 = a1;
      }
      c.globalAlpha = 1;
      c.lineCap = 'butt';
    }

    // breathing pulse while the industry is actually trading
    if (node.sold > 0) {
      const beat = 0.5 + 0.5 * Math.sin(sim.tickCount * 0.03 + node.id * 1.7);
      c.beginPath(); c.arc(p.x, p.y, R + 5 + beat * 3, 0, Math.PI * 2);
      c.strokeStyle = hexa(color, 0.10 + beat * 0.10);
      c.lineWidth = 1;
      c.stroke();
    }

    /* Labels.
     *
     * The label is drawn in the node's own colour over a body filled with that
     * same colour, so it has to carry a shadow to stay readable — the pastel
     * fills are light, and 32%-alpha pastel over the dark backdrop lands close
     * to the label's own value. The number is near-white and does not need it
     * as much, but it gets the same treatment so the pair reads as one object.
     *
     * Shadow state is set once and cleared at the end; leaving it on would leak
     * into every later fillText in the frame, including the corner readouts. */
    c.save();
    c.shadowColor = 'rgba(0,0,0,.75)';
    c.shadowBlur = 4;
    c.shadowOffsetY = 1;

    c.textAlign = 'center';
    c.textBaseline = 'middle';

    /* Both strings are shrunk to fit the bubble rather than allowed to overrun
     * it.
     *
     * Population is a function of the node's radius, so the two widest labels
     * belong to the smallest bubbles: the Crown (r scale 0.120) and Shipping
     * (0.140). At a fixed 11px, "The Crown" is wider than the disc it is
     * centred on and ran straight across the neighbouring Coal bubble and its
     * class ring — the map's least ambiguous node was the one whose name was
     * hardest to place.
     *
     * Fitting rather than abbreviating is deliberate: "The Crown" is the only
     * node whose name says what it IS rather than what it trades, and
     * "Crwn"/"Shp" would cost more than a slightly smaller type size. The floor
     * is 7px, below which shrinking stops helping and the name is simply longer
     * than the disc can say. */
    const fitFont = (text, size, weight, family, maxW, floor) => {
      c.font = `${weight} ${size}px ${family}`;
      const w = c.measureText(text).width;
      if (w <= maxW || w === 0) return size;
      return Math.max(floor, size * (maxW / w));
    };
    const FAMILY = 'system-ui, sans-serif';
    const MONO = 'ui-monospace, monospace';
    /* 1.7r leaves the label inside the rim with a little air, and stays clear of
     * the class ring that sits 6px further out. */
    const labelPx = fitFont(node.label, 11, 600, FAMILY, r * 1.7, 7);
    const popStr = String(pop);
    const popPx = fitFont(popStr, 16, 600, MONO, r * 1.5, 9);

    /* A label that still overhangs at the floor size is placed OUTSIDE the
     * bubble, above it, rather than left to cross its neighbours.
     *
     * The Crown is the case that forces this: it is the smallest node (r scale
     * 0.120) and the only one whose name is a two-word phrase, so at r≈8 even
     * 7px "The Crown" is twice the width of the disc. Drawn inside, it lay
     * across the Coal bubble's class ring — the player's own node was the one
     * whose label was least legible. Above the bubble the space is empty on
     * every layout, because the cluster is centred and the Crown is the topmost
     * node. */
    c.font = `600 ${labelPx.toFixed(1)}px ${FAMILY}`;
    const overhangs = c.measureText(node.label).width > r * 1.7;

    if (overhangs) {
      c.fillStyle = dead ? '#6b7686' : hexa(color, 0.92);
      c.fillText(node.label, p.x, p.y - r - 7);
    } else {
      c.fillStyle = dead ? '#6b7686' : color;
      c.fillText(node.label, p.x, p.y - 7);
    }
    c.font = `600 ${popPx.toFixed(1)}px ${MONO}`;
    c.fillStyle = dead ? '#5c6675' : '#f2f7fb';
    c.fillText(popStr, p.x, p.y + 11);

    if (active) {
      c.font = '9.5px ui-monospace, monospace';
      c.fillStyle = '#a8b3c2';
      c.fillText(`${node.stock.toLocaleString()} in stock`, p.x, p.y + r - 7);
    }
    c.restore();

    /* A dead node is dimmed rather than struck through. The old diagonal cross
     * was drawn at 55% red across the glyph watermark and both numbers, which
     * at small radii became an X over illegible text — it signalled nothing the
     * dimming and the zero did not already say, and it obscured the one fact
     * that matters (this industry is empty). Kept as a thin ring instead, so a
     * dead node is distinguishable from a small live one at a glance. */
    if (dead) {
      c.beginPath();
      c.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
      c.strokeStyle = 'rgba(255,90,95,.42)';
      c.lineWidth = 1.3;
      c.setLineDash([3, 4]);
      c.stroke();
      c.setLineDash([]);
    }
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
  }

  /* ---- corner readouts: the infographic frame ---- */
  _legend(sim, map) {
    const c = this.ctx;
    const st = sim.stats();
    const m = st.macro || {};
    const pol = st.politics || {};

    c.font = '600 9.5px system-ui, sans-serif';
    c.fillStyle = '#5c6675';
    c.textBaseline = 'top';
    c.textAlign = 'left';
    c.fillText('THE PRODUCTION WEB', 20, 16);
    c.font = '11px ui-monospace, monospace';
    c.fillStyle = '#8b95a6';
    [`tick       ${st.tick.toLocaleString()}`,
     `currency   $${(st.currency / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
     `transit    ${st.travelers.toLocaleString()}`,
     `insolv.    ${st.insolvency.toLocaleString()}`,
    ].forEach((l, i) => c.fillText(l, 20, 33 + i * 14));

    c.font = '600 9.5px system-ui, sans-serif';
    c.fillStyle = '#5c6675';
    c.textAlign = 'right';
    c.fillText('BUSINESS CYCLE', this.w - 20, 16);
    c.font = '600 13px system-ui, sans-serif';
    c.fillStyle = m.phaseTone === 'good' ? PALETTE.labor
      : m.phaseTone === 'bad' ? '#ff5a5f' : PALETTE.food;
    c.fillText(m.phaseLabel || '', this.w - 20, 33);
    c.font = '11px system-ui, sans-serif';
    c.fillStyle = '#8b95a6';
    c.fillText(m.regimeLabel || '', this.w - 20, 50);

    if (pol.approval !== undefined) {
      c.font = '600 9.5px system-ui, sans-serif';
      c.fillStyle = '#5c6675';
      c.fillText('APPROVAL', this.w - 20, 72);
      c.font = '600 14px ui-monospace, monospace';
      c.fillStyle = '#e6edf3';
      c.fillText(`${pol.approval.toFixed(0)}%`, this.w - 20, 88);
      c.font = '10px system-ui, sans-serif';
      c.fillStyle = pol.coupProtected ? '#22e06a' : '#ff5a5f';
      c.fillText(pol.coupProtected ? 'army loyal' : 'coup risk', this.w - 20, 107);
    }
    c.textAlign = 'left';

    c.font = '600 9.5px system-ui, sans-serif';
    c.fillStyle = '#5c6675';
    c.fillText('ORDERS', 20, this.h - 46);
    [['#8f9bb0', 'Commons'], ['#3fd8ff', 'Middle'], ['#e0b64a', 'Houses']]
      .forEach(([col, name], i) => {
        const x = 20 + i * 80, y = this.h - 26;
        c.strokeStyle = col; c.lineWidth = 3;
        c.beginPath(); c.arc(x + 5, y, 5, -0.7, 2.6); c.stroke();
        c.fillStyle = '#8b95a6';
        c.font = '10.5px system-ui, sans-serif';
        c.textAlign = 'left';
        c.fillText(name, x + 15, y + 4);
      });
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
  }

  /* ---- interaction ---- */
  nodeAt(mx, my) {
    for (let i = (this._hit || []).length - 1; i >= 0; i--) {
      const h = this._hit[i];
      if (Math.hypot(mx - h.x, my - h.y) <= h.r + 12) return h.id;
    }
    return null;
  }

  /* ---------------- GRAPH ---------------- */
  drawGraph(sim) {
    const c = this.ctx;
    this.clear();

    const stats = sim.comStats();
    // rolling history
    this.graphHistory.push(stats.map(s => s.price));
    if (this.graphHistory.length > 180) this.graphHistory.shift();

    const padL = 58, padR = 16, padT = 46, padB = 34;
    const gw = this.w - padL - padR;
    const gh = this.h - padT - padB;
    if (gw < 40 || gh < 40) return;

    // max price across series
    let max = 1;
    for (const row of this.graphHistory) for (const v of row) max = Math.max(max, v);
    if (this.graphSpread > 0) max = Math.ceil(max * this.graphSpread);
    max = Math.ceil(max * 1.1);

    // gridlines
    c.strokeStyle = 'rgba(255,255,255,.07)';
    c.fillStyle = '#7d8797';
    c.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    const lines = 5;
    for (let i = 0; i <= lines; i++) {
      const y = padT + (gh * i) / lines;
      c.beginPath();
      c.moveTo(padL, y + .5);
      c.lineTo(padL + gw, y + .5);
      c.stroke();
      const val = max - (max * i) / lines;
      c.fillText(val.toFixed(val < 10 ? 1 : 0), padL - 8, y);
    }

    // series
    const H = this.graphHistory;
    if (H.length > 1) {
      for (let s = 0; s < 6; s++) {
        c.beginPath();
        c.strokeStyle = SERIES_COLORS[s];
        c.lineWidth = 1.8;
        c.lineJoin = 'round';
        for (let i = 0; i < H.length; i++) {
          const x = padL + (gw * i) / (H.length - 1);
          const y = padT + gh - (H[i][s] / max) * gh;
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.stroke();
      }
    }

    // legend
    let lx = padL;
    const ly = 12;
    c.font = '11px system-ui, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    for (let s = 0; s < 6; s++) {
      c.fillStyle = SERIES_COLORS[s];
      c.fillRect(lx, ly - 4, 9, 9);
      c.fillStyle = '#9aa4b2';
      c.fillText(COM_NAMES[s], lx + 13, ly);
      lx += 13 + c.measureText(COM_NAMES[s]).width + 14;
    }

    // axis labels â€” 'price' is right-aligned with the tick labels so it never
    // collides with the legend or the topmost gridline value
    c.fillStyle = '#7d8797';
    c.font = '10px ui-monospace, monospace';
    c.textAlign = 'right';
    c.fillText('price', padL - 8, padT - 12);
    c.textAlign = 'left';
    c.fillText('time â†’', padL, this.h - 12);
    c.textAlign = 'right';
    c.fillText(`spread ${this.graphSpread === 0 ? 'âˆž' : 'x' + this.graphSpread}`, this.w - padR, this.h - 12);
  }

  /* ---------------- TEXT STATS ---------------- */
  drawStats(sim) {
    const c = this.ctx;
    this.clear();
    const st = sim.stats();
    const cs = sim.comStats();

    const money = v => '$' + (v / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // A single vertical cursor: the old index/column grid spread a plain
    // number back into `p`, dropping `p.x` and hiding every row after the
    // first in each section.
    const LEFT = 24, RIGHT = this.w - 24;
    const rowH = 20;
    let cursorY = 52;

    const section = (label) => {
      c.fillStyle = '#5c6675';
      c.font = '600 10px system-ui, sans-serif';
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      c.fillText(label.toUpperCase(), LEFT, cursorY);
      cursorY += 15;
    };

    const row = (label, value, color) => {
      const valFont = '600 13px ui-monospace, monospace';
      const valW0 = (() => { c.font = valFont; return c.measureText(value).width; })();
      const budget = RIGHT - LEFT - valW0 - 14;

      // shrink the label rather than let it collide with the value
      c.font = '13px system-ui, sans-serif';
      const fits = c.measureText(label).width <= budget;
      if (!fits) c.font = '12px system-ui, sans-serif';

      c.textAlign = 'left';
      c.fillStyle = '#9aa4b2';
      c.fillText(label, LEFT, cursorY);
      c.font = valFont;
      c.fillStyle = color || '#e6edf3';
      c.textAlign = 'right';
      c.fillText(value, RIGHT, cursorY);
      cursorY += rowH;
    };

    // headline
    c.fillStyle = '#e6edf3';
    c.font = '600 15px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText('Economy Statistics', LEFT, 30);
    c.fillStyle = '#5c6675';
    c.font = '11px ui-monospace, monospace';
    c.textAlign = 'right';
    c.fillText(`tick ${st.tick}`, RIGHT, 30);

    section('Totals');
    row('Total value of transactions', money(st.gdp), PALETTE.food);
    row('Transaction count', st.transactions.toLocaleString());
    row('Total currency in economy', money(st.currency), PALETTE.labor);
    row('Labor population', String(st.laborPop), PALETTE.labor);
    row('Active traders', String(st.traders));

    cursorY += 8;
    section('Central Bank');
    row('Bank balance', money(st.bankBalance), PALETTE.master);
    row('Bank reserve', money(st.reserve));
    row('Debt holdings', money(st.debt), PALETTE.coal);
    row('New money created', money(st.created));
    row('Money destroyed', money(st.destroyed));
    row('Insolvency hits', String(st.insolvency),
        st.insolvency > 0 ? PALETTE.coal : '#5c6675');

    // commodity table along the bottom â€” numeric columns are right-aligned on
    // fractional offsets so they can never crowd into each other
    const TL = 24, TR = this.w - 24, TW = TR - TL;
    const tableTop = this.h - 168;
    c.strokeStyle = '#232c3a';
    c.beginPath(); c.moveTo(TL, tableTop - 14); c.lineTo(TR, tableTop - 14); c.stroke();

    const headers = ['Commodity', 'Traders', 'Stock', 'Sold', 'Avg Price'];
    const hAlign = ['left', 'right', 'right', 'right', 'right'];
    const hx = [TL, TL + TW * 0.34, TL + TW * 0.54, TL + TW * 0.74, TR];
    c.font = '600 10px system-ui, sans-serif';
    c.fillStyle = '#5c6675';
    c.textBaseline = 'middle';
    headers.forEach((h, i) => {
      c.textAlign = hAlign[i];
      c.fillText(h.toUpperCase(), hx[i], tableTop);
    });

    cs.forEach((s, i) => {
      const y = tableTop + 20 + i * 21;
      if (y > this.h - 8) return;
      c.fillStyle = SERIES_COLORS[i];
      c.fillRect(TL, y - 7, 9, 9);
      c.font = '12px system-ui, sans-serif';
      c.fillStyle = '#9aa4b2';
      c.textAlign = 'left';
      c.fillText(COM_NAMES[i], TL + 14, y);
      c.font = '12px ui-monospace, monospace';
      c.fillStyle = '#c9d1d9';
      c.textAlign = 'right';
      c.fillText(String(s.count), hx[1], y);
      c.fillText(s.stock.toLocaleString(), hx[2], y);
      c.fillText(s.sold.toLocaleString(), hx[3], y);
      c.fillStyle = SERIES_COLORS[i];
      c.fillText('$' + s.price.toFixed(2), hx[4], y);
    });
  }

  /* Draw one frame.
   *
   * `force` skips the visibility guard. It exists for the restore path, where
   * the canvas has just been un-hidden but has not been laid out yet, so
   * getBoundingClientRect() still reports 0x0 and the guard would skip the one
   * frame that actually matters. The caller that knows better (App.refreshCanvas)
   * passes it; everything else lets the guard protect it. */
  render(sim, force = false) {
    if (!force && !this.visible) {
      /* Nothing drawable on screen. Returning here rather than throwing is the
       * difference between a blank canvas and a dead app: the map's scale is
       * derived from the canvas size and goes negative below ~168px, which
       * createRadialGradient rejects with IndexSizeError. */
      if (!this.w || !this.h || this.w < 8 || this.h < 8) return false;
    }
    if (!sim) return false;
    if (this.viewMode === 'map') this.drawMap(sim);
    else if (this.viewMode === 'graph') this.drawGraph(sim);
    else this.drawStats(sim);
    return true;
  }
}
