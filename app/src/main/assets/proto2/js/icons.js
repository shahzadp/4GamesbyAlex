/* ------------------------------------------------------------------
 * Proto Web — hand-authored SVG asset set (pastel)
 *
 * Replaces the original BMP sprites (master.bmp crown, shipping.bmp
 * warehouse, food/tool/coal/iron.bmp, house/ground/tree.bmp,
 * car/truck.bmp, icon.bmp).
 *
 * Restyled to a pastel palette. Pastels on a dark surface is the whole point:
 * a light, low-chroma fill reads as a soft accent against the dark UI instead
 * of the neon-on-black it replaced, and it stops the map from looking like a
 * status board.
 *
 * Two rules make pastel work here, and both are load-bearing:
 *
 *   1. Every pastel fill carries a DEEPER stroke in the same hue. Pastel on its
 *      own has too little weight to hold a 24px silhouette — without the
 *      stroke the icons dissolve into the background at map-bubble size. The
 *      stroke is roughly two steps down from the fill, not a neutral grey, so
 *      the hue still reads.
 *   2. Gradients run light -> base, never light -> dark. The old set darkened
 *      toward its stroke colour, which is what gave it the hard, plasticky
 *      look; keeping the ramp inside the pastel range is what makes it soft.
 *
 * PALETTE is not decorative — render.js feeds these exact values to the chart
 * series and the map bubbles, so the six commodity colours have to stay
 * distinguishable as thin lines as well as icon fills. They are pitched at
 * mid-pastel (roughly a 200-300 tint), not the 100 tints, which would be
 * indistinguishable as series lines on the dark plot background.
 * ------------------------------------------------------------------ */

/* Commodity palette — pastel, hue-stable from the original set so graph
 * continuity survives the restyle. */
export const PALETTE = {
  labor:       '#7ee0b8',   // mint
  food:        '#ffd08a',   // butter
  tool:        '#8ed0f0',   // sky
  coal:        '#c0aedc',   // lavender
  iron:        '#f5b08c',   // clay
  transport:   '#f7a8c4',   // rose
  master:      '#ffdf94',   // champagne
  /* Map tiles are surfaces, not icons, so these stay dark. A pastel ground
   * would fight the bubbles sitting on it. */
  ground:      '#1b2431',
  groundAlt:   '#1e2836',
  tree:        '#a9dfbf',
  house:       '#bfc6f5',
  water:       '#b8cce0',
};

/* Deeper companion tone per hue — the stroke colour for each icon. Kept here
 * rather than inline so the pairing can never drift apart. */
const INK = {
  labor:     '#2f7d5e',
  food:      '#a66a18',
  tool:      '#2f6e90',
  coal:      '#4e3f73',
  iron:      '#a2542a',
  transport: '#9e4468',
  master:    '#a8801f',
  house:     '#5a63a8',
  tree:      '#4c8a5e',
};

const S = (inner, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" fill="none">${inner}</svg>`;

/* ---------------- commodity / trader icons ---------------- */

const crown = S(`
  <defs><linearGradient id="g-cg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff2cd"/><stop offset="1" stop-color="#ffdf94"/>
  </linearGradient></defs>
  <path d="M3.4 8.6l3.5 2.9L12 4.8l5.1 6.7 3.5-2.9-1.4 8.8H4.8L3.4 8.6z"
        fill="url(#g-cg)" stroke="${INK.master}" stroke-width="1.15" stroke-linejoin="round"/>
  <path d="M5.2 15.4h13.6" stroke="${INK.master}" stroke-width="1.1" stroke-linecap="round"/>
  <circle cx="12" cy="13.2" r="1.5" fill="#fffaf0"/>
  <circle cx="3.4" cy="8.6" r="1.5" fill="#fff2cd"/>
  <circle cx="20.6" cy="8.6" r="1.5" fill="#fff2cd"/>
  <circle cx="12" cy="4.8" r="1.6" fill="#fffaf0"/>`);

const warehouse = S(`
  <defs><linearGradient id="g-wg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffdce9"/><stop offset="1" stop-color="#f7a8c4"/>
  </linearGradient></defs>
  <path d="M3.4 10.6L12 5l8.6 5.6v9.2H3.4v-9.2z"
        fill="url(#g-wg)" stroke="${INK.transport}" stroke-width="1.15" stroke-linejoin="round"/>
  <path d="M7.8 19.8v-5.9h8.4v5.9" fill="#fdf1f6" stroke="${INK.transport}"
        stroke-width="1.15" stroke-linejoin="round"/>
  <path d="M7.8 16.2h8.4M7.8 18h8.4" stroke="${INK.transport}"
        stroke-width=".95" stroke-linecap="round" opacity=".7"/>
  <path d="M3.4 10.6h17.2" stroke="${INK.transport}" stroke-width="1.15" stroke-linecap="round"/>`);

/* Wheat, not fruit.
 *
 * This was a round apple with a leaf. The map glyph (GLYPH.food) is an ear, so
 * for a while the same industry was an apple in the trader list and a sheaf on
 * the map — two objects for one commodity, which is worse than either being
 * wrong on its own. An ear is also the better read: this is a farm sector, and
 * at 20px a stalk with paired grains is as legible as an apple while saying
 * something more specific. */
const food = S(`
  <defs><linearGradient id="g-fg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffe6bd"/><stop offset="1" stop-color="#ffd08a"/>
  </linearGradient></defs>
  <path d="M11.35 21.6V6.4h1.3v15.2h-1.3z" fill="#e8c489" stroke="${INK.food}"
        stroke-width=".9" stroke-linejoin="round"/>
  <g fill="url(#g-fg)" stroke="${INK.food}" stroke-width="1" stroke-linejoin="round">
    <path d="M11.5 6.4c0-1.7-1.1-2.9-2.9-2.9 0 1.7 1.1 2.9 2.9 2.9z"/>
    <path d="M12.5 6.4c0-1.7 1.1-2.9 2.9-2.9 0 1.7-1.1 2.9-2.9 2.9z"/>
    <path d="M11.5 11.3c-2.6 0-4.2-1.5-4.2-3.9 2.6 0 4.2 1.5 4.2 3.9z"/>
    <path d="M12.5 11.3c2.6 0 4.2-1.5 4.2-3.9-2.6 0-4.2 1.5-4.2 3.9z"/>
    <path d="M11.5 16.2c-2.6 0-4.2-1.5-4.2-3.9 2.6 0 4.2 1.5 4.2 3.9z"/>
    <path d="M12.5 16.2c2.6 0 4.2-1.5 4.2-3.9-2.6 0-4.2 1.5-4.2 3.9z"/>
  </g>
  <path d="M11.7 8.2v11.4" stroke="#fff8ec" stroke-width=".8" stroke-linecap="round" opacity=".7"/>`);

const tool = S(`
  <defs><linearGradient id="g-tg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#d5ecfa"/><stop offset="1" stop-color="#8ed0f0"/>
  </linearGradient></defs>
  <path d="M14.8 3.8a4.7 4.7 0 00-5.8 6.1L3.8 15.1a1.85 1.85 0 002.6 2.6l5.2-5.2a4.7 4.7 0 006.1-5.8l-2.6 2.6-2.4-.6-.6-2.4 2.7-2.5z"
        fill="url(#g-tg)" stroke="${INK.tool}" stroke-width="1.15" stroke-linejoin="round"/>
  <path d="M5.4 17.4l1.2 1.2" stroke="${INK.tool}" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M15 5.6l2.6 2.6" stroke="#f2fbff" stroke-width="1.1" stroke-linecap="round" opacity=".9"/>`);

const coal = S(`
  <defs><linearGradient id="g-kg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ddd4ee"/><stop offset="1" stop-color="#c0aedc"/>
  </linearGradient></defs>
  <path d="M4.6 13.6L8.1 7.4l5.3-2.3 5.9 4.7-1.4 7.4-6.3 3.5-6.3-3.3.3-3.8z"
        fill="url(#g-kg)" stroke="${INK.coal}" stroke-width="1.15" stroke-linejoin="round"/>
  <path d="M8.1 7.4l4.1 5.5 5.5-3.1M12.2 12.9l-.6 7.2"
        stroke="${INK.coal}" stroke-width="1" stroke-linecap="round" opacity=".65"/>
  <path d="M9.3 8.8l2.1 1.5" stroke="#f7f4fd" stroke-width="1.1" stroke-linecap="round" opacity=".9"/>
  <circle cx="8.7" cy="14.4" r=".9" fill="${PALETTE.transport}" opacity=".6"/>
  <circle cx="14.5" cy="15.6" r=".7" fill="${PALETTE.iron}" opacity=".55"/>`);

const iron = S(`
  <defs><linearGradient id="g-ig" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fbdcc8"/><stop offset="1" stop-color="#f5b08c"/>
  </linearGradient></defs>
  <path d="M3.6 16.4l2.9-4.5h11l2.9 4.5v2.7H3.6v-2.7z"
        fill="url(#g-ig)" stroke="${INK.iron}" stroke-width="1.15" stroke-linejoin="round"/>
  <path d="M6.5 11.9l1.8-3.1h7.4l1.8 3.1"
        fill="url(#g-ig)" stroke="${INK.iron}" stroke-width="1.15" stroke-linejoin="round"/>
  <path d="M6.5 15.3h11" stroke="${INK.iron}" stroke-width="1" stroke-linecap="round"/>
  <path d="M7.7 13.3h3.1" stroke="#fff4ec" stroke-width="1.2" stroke-linecap="round" opacity=".9"/>`);

const labor = S(`
  <defs><linearGradient id="g-lg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#c9f2e0"/><stop offset="1" stop-color="#7ee0b8"/>
  </linearGradient></defs>
  <circle cx="12" cy="7.5" r="3.3" fill="url(#g-lg)" stroke="${INK.labor}" stroke-width="1.15"/>
  <path d="M5.6 20.3c0-3.6 2.9-6.2 6.4-6.2s6.4 2.6 6.4 6.2v.6H5.6v-.6z"
        fill="url(#g-lg)" stroke="${INK.labor}" stroke-width="1.15" stroke-linejoin="round"/>
  <path d="M12 14.3v6.4" stroke="${INK.labor}" stroke-width="1" stroke-linecap="round"/>
  <path d="M8.8 17.5h6.4" stroke="${INK.labor}" stroke-width="1" stroke-linecap="round"/>`);

const transport = S(`
  <defs><linearGradient id="g-shg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffdce9"/><stop offset="1" stop-color="#f7a8c4"/>
  </linearGradient></defs>
  <rect x="2.8" y="7.6" width="10.8" height="8.8" rx="1.6" fill="url(#g-shg)"
        stroke="${INK.transport}" stroke-width="1.15"/>
  <path d="M13.6 10.6h3.7l2.9 3.1v2.7h-6.6v-5.8z" fill="#fff0f6"
        stroke="${INK.transport}" stroke-width="1.15" stroke-linejoin="round"/>
  <path d="M15.4 11.6v2.3h3.5" stroke="${INK.transport}" stroke-width="1" stroke-linejoin="round"/>
  <circle cx="7.1" cy="17.9" r="2.1" fill="#f6e6ee" stroke="${INK.transport}" stroke-width="1.15"/>
  <circle cx="17.3" cy="17.9" r="2.1" fill="#f6e6ee" stroke="${INK.transport}" stroke-width="1.15"/>
  <path d="M4.7 10.6h5.2M4.7 13h3.5" stroke="#fffafc" stroke-width="1.1" stroke-linecap="round" opacity=".95"/>`);

/* ---------------- map tiles ---------------- */

const house = S(`
  <defs><linearGradient id="g-hg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#dde1fb"/><stop offset="1" stop-color="#bfc6f5"/>
  </linearGradient></defs>
  <path d="M12 3.8l8.2 6.6H3.8L12 3.8z" fill="url(#g-hg)" stroke="${INK.house}"
        stroke-width="1.15" stroke-linejoin="round"/>
  <rect x="5.8" y="10.4" width="12.4" height="9.4" rx="1.1" fill="#f4f6ff"
        stroke="${INK.house}" stroke-width="1.15"/>
  <rect x="9.7" y="13.9" width="4.6" height="5.9" rx=".7" fill="#aab2ea"/>
  <rect x="7.3" y="12.3" width="2.5" height="2.3" rx=".5" fill="#cfd5f8"/>
  <rect x="14.2" y="12.3" width="2.5" height="2.3" rx=".5" fill="#cfd5f8"/>`);

const tree = S(`
  <defs><linearGradient id="g-trg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#cdeedb"/><stop offset="1" stop-color="#a9dfbf"/>
  </linearGradient></defs>
  <rect x="10.9" y="14" width="2.2" height="6.4" rx=".9" fill="#8a6a52" stroke="#5c4636" stroke-width="1"/>
  <path d="M12 3.4l4.9 6.2h-3.1l3.5 4.5H6.7l3.5-4.5H7.1L12 3.4z"
        fill="url(#g-trg)" stroke="${INK.tree}" stroke-width="1.15" stroke-linejoin="round"/>`);

const car = S(`
  <defs><linearGradient id="g-crg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#c9f2e0"/><stop offset="1" stop-color="#7ee0b8"/>
  </linearGradient></defs>
  <path d="M3.6 15.3l1.8-4.5c.3-.8 1-1.3 1.9-1.3h9.4c.9 0 1.6.5 1.9 1.3l1.8 4.5v2.4H3.6v-2.4z"
        fill="url(#g-crg)" stroke="${INK.labor}" stroke-width="1.15" stroke-linejoin="round"/>
  <path d="M6.8 10.6l1-2.1h8.4l1 2.1" fill="#eefbf5" stroke="${INK.labor}"
        stroke-width="1.15" stroke-linejoin="round"/>
  <circle cx="7.3" cy="17.7" r="1.9" fill="#eaf8f1" stroke="${INK.labor}" stroke-width="1.15"/>
  <circle cx="16.7" cy="17.7" r="1.9" fill="#eaf8f1" stroke="${INK.labor}" stroke-width="1.15"/>
  <path d="M4.6 13.5h2.1M17.3 13.5h2.1" stroke="#f4fff9" stroke-width="1.2" stroke-linecap="round"/>`);

const truck = S(`
  <defs><linearGradient id="g-trkg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffdce9"/><stop offset="1" stop-color="#f7a8c4"/>
  </linearGradient></defs>
  <rect x="2.8" y="7.7" width="11.1" height="8.8" rx="1.4" fill="url(#g-trkg)"
        stroke="${INK.transport}" stroke-width="1.15"/>
  <path d="M13.9 11h3.9l3.3 3.3v2.2h-7.2V11z" fill="#fff0f6"
        stroke="${INK.transport}" stroke-width="1.15" stroke-linejoin="round"/>
  <path d="M16.1 12.2v2.5h4.3" stroke="${INK.transport}" stroke-width="1" stroke-linejoin="round"/>
  <circle cx="7.1" cy="17.9" r="2" fill="#f6e6ee" stroke="${INK.transport}" stroke-width="1.15"/>
  <circle cx="17.9" cy="17.9" r="2" fill="#f6e6ee" stroke="${INK.transport}" stroke-width="1.15"/>
  <path d="M5.1 10.5h5.8M5.1 12.9h3.9" stroke="#fffafc" stroke-width="1.1" stroke-linecap="round" opacity=".95"/>`);

const ground = S(`
  <rect width="24" height="24" rx="2" fill="${PALETTE.ground}"/>
  <path d="M0 18h24" stroke="#232e3e" stroke-width="1"/>
  <path d="M4 8.4c1.6-1 3-.4 4.4.4M14 5.6c1.4-.8 3-.4 4.2.6"
        stroke="#263244" stroke-width="1.2" stroke-linecap="round"/>
  <circle cx="7.5" cy="14" r=".9" fill="#263244"/>
  <circle cx="17.5" cy="12.4" r=".8" fill="#263244"/>`);

/* ---------------- navigation icons ---------------- */

const nav = {
  map: S(`<path d="M9 4.4L3.4 6.6v13L9 17.4l6 2.2 5.6-2.2v-13L15 6.6 9 4.4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 4.4v13M15 6.6v13" stroke="currentColor" stroke-width="1.6"/>`),
  graph: S(`<path d="M3.6 20.4h16.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M6 16.6l4-5 3.4 3 4.6-6.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="16.6" r="1.5" fill="currentColor"/><circle cx="10" cy="11.6" r="1.5" fill="currentColor"/><circle cx="13.4" cy="14.6" r="1.5" fill="currentColor"/><circle cx="18" cy="8.2" r="1.5" fill="currentColor"/>`),
  stats: S(`<path d="M4.6 20V10.4M9.6 20V4.6M14.6 20v-7M19.4 20V7.6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>`),
  trade: S(`<path d="M4 8.4h13.2l-3.4-3.4M20 15.6H6.8l3.4 3.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`),
  currency: S(`<circle cx="12" cy="12" r="8.4" stroke="currentColor" stroke-width="1.6"/><path d="M14.6 9.2c-.7-.9-1.7-1.3-2.9-1.3-1.7 0-2.9.9-2.9 2.2 0 3 6 1.4 6 4.4 0 1.4-1.3 2.3-3.1 2.3-1.4 0-2.5-.5-3.1-1.5M12 6.4v11.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`),
  bank: S(`<path d="M3.6 9.6L12 4.4l8.4 5.2" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M5.6 9.8v7.4M10 9.8v7.4M14 9.8v7.4M18.4 9.8v7.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M3.6 20.2h16.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>`),
  list: S(`<rect x="3.6" y="4.6" width="16.8" height="14.8" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M7.4 9.2h9.2M7.4 12.4h9.2M7.4 15.6h5.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`),
  control: S(`<path d="M4.6 7.6h14.8M4.6 12h14.8M4.6 16.4h14.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="9" cy="7.6" r="2.2" fill="currentColor"/><circle cx="15.4" cy="12" r="2.2" fill="currentColor"/><circle cx="8" cy="16.4" r="2.2" fill="currentColor"/>`),
  /* business cycle: an oscillating wave around a flat trend line */
  cycle: S(`<path d="M3 20.2h18" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".45"/><path d="M3.4 13.6c2-1.4 3.4-5.4 5.6-5.4 2.4 0 2.6 8 5 8s2.8-6.6 5.2-6.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`),
  info: S(`<circle cx="12" cy="12" r="8.6" stroke="currentColor" stroke-width="1.6"/><path d="M12 11v5.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="7.9" r="1.15" fill="currentColor"/>`),
  gavel: S(`<path d="M13.6 6.8l3.6 3.6M10.4 5.2l3.6 3.6M15.2 8.8l-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M8.2 12.8l3 3-4.6 4.6-3-3 4.6-4.6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 20.2h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity=".55"/>`),
  shield: S(`<path d="M12 3.4l6.6 2.4v5.4c0 4-2.7 7.4-6.6 8.8-3.9-1.4-6.6-4.8-6.6-8.8V5.8L12 3.4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`),
  fist: S(`<path d="M7 11.4V8.2a1.6 1.6 0 013.2 0v2.4m0-.4V6.8a1.6 1.6 0 013.2 0v3.4m0-.2V8a1.6 1.6 0 013.2 0v6.6c0 3-2.4 5.4-5.4 5.4H11c-1.6 0-2.6-.6-3.4-1.8L4.8 14c-.6-.8-.4-1.8.4-2.3.7-.5 1.6-.4 2.2.2L7 11.4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>`),
  /* The Debt screen: a bond certificate with a seal. Distinct from 'currency'
     (a coin) and 'bank' (a colonnade) because the screen is about an
     obligation, not an institution or a unit of money. */
  bond: S(`<rect x="3.4" y="5.6" width="17.2" height="12.8" rx="1.6" stroke="currentColor" stroke-width="1.6"/><path d="M3.4 9.6h17.2" stroke="currentColor" stroke-width="1.4" opacity=".55"/><circle cx="12" cy="14.4" r="2.6" stroke="currentColor" stroke-width="1.5"/><path d="M7.4 12.6h1.6M15 12.6h1.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`),
  play: S(`<path d="M7.6 4.8l11.4 7.2-11.4 7.2V4.8z" fill="currentColor"/>`),
  pause: S(`<rect x="6.6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.4" y="5" width="4" height="14" rx="1.2" fill="currentColor"/>`),
  speed: S(`<path d="M4.4 16.6a8 8 0 1115.2 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M12 15.6l4.4-4.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.6" fill="currentColor"/>`),
  reset: S(`<path d="M19.4 12a7.4 7.4 0 11-2.4-5.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M19.6 4.4v4.2h-4.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`),
  /* Back out of an embedding host. Chevron-left, matching the convention the other
   three games in that launcher use, and heavier than the nav strokes because this
   one is a button rather than a label. */
  back: S(`<path d="M14.8 5.2 8 12l6.8 6.8" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>`),
  logo: S(`<path d="M3 8.2l3.6 3.1L12 4.4l5.4 6.9L21 8.2l-1.5 9.4H4.5L3 8.2z" fill="currentColor" opacity=".92"/><path d="M4.8 15.2h14.4" stroke="#0b0e14" stroke-width="1.4"/>`),
};

/* ---------------- registry ---------------- */

export const ICONS = {
  master: crown,
  crown,
  warehouse,
  shipping: warehouse,
  food,
  tool,
  coal,
  iron,
  labor,
  transport,
  house,
  tree,
  car,
  truck,
  ground,
  ...nav,
};

/* ComType ordinal -> icon key (matches original renderTile mapping) */
export const COM_ICON = ['labor', 'food', 'tool', 'coal', 'iron', 'transport'];
export const COM_LABEL = ['Labor', 'Food', 'Tools', 'Coal', 'Iron', 'Shipping'];

/* ------------------------------------------------------------------
 * GLYPH — silhouette path data for the CANVAS bubble map.
 *
 * The map is drawn with Canvas2D, so the SVG set above never reaches it: the
 * bubbles were a radial gradient, a coloured ring and a text label, which meant
 * seven identical discs differing only in hue. Two industries that were merely
 * "not the same colour" were the whole of the visual distinction.
 *
 * These are separate paths rather than the SVG markup above for two reasons:
 *
 *   1. `new Path2D(d)` takes SVG path data synchronously, so a bubble can draw
 *      a real glyph inside a single frame. Rasterising the SVG through an
 *      Image() would be async (a blank bubble for a frame, or a late pop-in on
 *      a canvas that repaints ~8x/second) and would risk tainting the canvas.
 *   2. Detail dies at bubble size. The SVG icons carry highlights, gradients and
 *      0.7px facet lines that are invisible at 18px and turn to mush. These are
 *      drawn for the size they will actually be seen at: one closed silhouette
 *      per commodity, no strokes, no sub-pixel features.
 *
 * Keys match ICONS so the bubble and the trader list cannot disagree.
 * ------------------------------------------------------------------ */
export const GLYPH = {
  master: 'M3.6 8.4l3.6 3L12 4.6l4.8 6.8 3.6-3-1.5 9.2H5.1L3.6 8.4z',

  labor: 'M8.8 6.6A3.2 3.2 0 1 0 15.2 6.6A3.2 3.2 0 1 0 8.8 6.6z'
       + 'M5.2 20.8c0-3.8 3.1-6.6 6.8-6.6s6.8 2.8 6.8 6.6v.6H5.2v-.6z',

  /* wheat, not fruit: the industry is a farm sector, and an ear reads as grain
     at 18px where an apple would read as "health food" */
  food:  'M11.6 21.4V7.6h1.6v13.8h-1.6z'
       + 'M12 10.9c-2.5 0-4-1.4-4-3.6 2.5 0 4 1.4 4 3.6z'
       + 'M12 10.9c2.5 0 4-1.4 4-3.6-2.5 0-4 1.4-4 3.6z'
       + 'M12 15.4c-2.5 0-4-1.4-4-3.6 2.5 0 4 1.4 4 3.6z'
       + 'M12 15.4c2.5 0 4-1.4 4-3.6-2.5 0-4 1.4-4 3.6z'
       + 'M12 6.2c-1.6 0-2.6-1-2.6-2.5 1.6 0 2.6 1 2.6 2.5z'
       + 'M12 6.2c1.6 0 2.6-1 2.6-2.5-1.6 0-2.6 1-2.6 2.5z',

  /* A wrench, one closed silhouette. Every arc endpoint is written ABSOLUTE even
   though the command letters are lowercase, because that is the one place the
   SVG spec ignores relativity: `a`'s x/y is the destination point, not an
   offset. Reading them as offsets put the head at (-6,-9) — outside the 24x24
   box, and therefore outside the bubble it gets drawn in. */
  tool:  'M15.2 3.8A4.9 4.9 0 1 0 9.1 10.1L3.9 15.3'
       + 'A2 2 0 1 0 6.6 18L11.8 12.8'
       + 'A4.9 4.9 0 1 0 18.1 6.5L15.4 9.2 12.8 8.6 12.2 11.2Z',

  /* coal: an irregular lump, convex-ish and blunt. A cube would read as "box". */
  coal:  'M5.2 12.6l2.6-5 5-2.4 5.6 3.4.4 6.2-3.4 4.6-6 .6-4.2-3.2V12.6z',

  /* iron: a cast ingot — trapezoid, wider at the base */
  iron:  'M3.6 16.8l2.8-5.6h11.2l2.8 5.6v3.6H3.6v-3.6z'
       + 'M8.4 11.2l1.4-2.4h4.4l1.4 2.4H8.4z',

  /* shipping: a sealed parcel, tied */
  transport: 'M3.2 8.6L12 4.2l8.8 4.4-1.6 3.6H4.8L3.2 8.6z'
           + 'M4.8 12.2h14.4v8.2H4.8v-8.2z'
           + 'M10.8 12.2h2.4v8.2h-2.4v-8.2z',
};

/* Map node id -> glyph path.
 *
 * Keyed by map.js NODE, not by ComType: the network has seven nodes, and node 6
 * is the Crown, which is not a commodity and has no ComType at all. Getting this
 * wrong is silent — every bubble would still draw, just the wrong shape — so it
 * is written out rather than derived from an offset that would drift.
 *
 *   NODE = { LABOR:0, FOOD:1, TOOL:2, COAL:3, IRON:4, SHIPPING:5, CROWN:6 }
 */
export const GLYPH_FOR = {
  0: GLYPH.labor,       // NODE.LABOR
  1: GLYPH.food,        // NODE.FOOD
  2: GLYPH.tool,        // NODE.TOOL
  3: GLYPH.coal,        // NODE.COAL
  4: GLYPH.iron,        // NODE.IRON
  5: GLYPH.transport,   // NODE.SHIPPING
  6: GLYPH.master,      // NODE.CROWN
};

export function icon(name) {
  return ICONS[name] || ICONS.ground;
}
