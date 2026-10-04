/* ------------------------------------------------------------------
 * Proto Web — shared numeric helpers
 * Extracted so macro.js and politics.js cannot drift on the definitions of
 * clamp/lerp — they feed each other, and a subtly different clamp in each
 * would show up as an unexplainable divergence between the cycle and the
 * approval curve.
 * ------------------------------------------------------------------ */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/* ~N(0,1) from four uniforms — cheap, no trig. */
export function randn() {
  return (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 1.732;
}

export const money = v =>
  '$' + (v / 100).toLocaleString(undefined, { maximumFractionDigits: 0 });

/* Signed percent for readouts: -2.4% / +0.0% */
export const signPct = v => {
  const r = Math.round(v * 10) / 10;
  return (r > 0 ? '+' : '') + r.toFixed(1);
};