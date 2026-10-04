/* A/B the Flappy canvas backing-store scale.
 *
 * FINDING
 *
 * App.resize() does:
 *
 *     const nextHeight = Math.round(rect.height * this.width / rect.width);
 *     this.canvas.width  = this.width * dpr;      // 360 * 3 = 1080
 *     this.canvas.height = nextHeight * dpr;      // ~700 * 3 = ~2100
 *     this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
 *
 * so the backing store is 1080 x ~2100 = ~2.27 million pixels, cleared and redrawn
 * every animation frame, and then composited DOWN to the 360 x ~700 CSS box it is
 * displayed in. Measured cost of that idle redraw on an itel S685LN: 76% of a core
 * on the start screen, with nothing happening.
 *
 * The resolution is not buying sharpness, because setTransform scales the drawing
 * coordinate system too — the 26px score font is rasterised at 3x and then
 * displayed at 26 CSS px either way. The art is axis-aligned rects and arcs, which
 * upscale and downscale cleanly. So the extra pixels are ~9x the fill rate for
 * almost no visible gain.
 *
 * This script toggles a cap on that scale so the cost can be attributed before
 * anything permanent is written.
 *
 * Usage:
 *   node tools/ab-flappy-dpr.js 1      cap the backing store to 1x
 *   node tools/ab-flappy-dpr.js 2      cap it to 2x
 *   node tools/ab-flappy-dpr.js off    restore devicePixelRatio
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', 'app', 'src', 'main', 'assets');
const p = path.join(ROOT, 'app.js');

const ANCHOR = '    const dpr = window.devicePixelRatio || 1;';
const PATCHED = '    const dpr = Math.min(window.devicePixelRatio || 1, FLAPPY_DPR_CAP);';

let src = fs.readFileSync(p, 'utf8');
const mode = process.argv[2];

/* Always start from the unpatched form so off/on are order-independent. */
if (src.includes('FLAPPY_DPR_CAP')) {
  src = src.replace(PATCHED, ANCHOR);
  src = src.replace(/const FLAPPY_DPR_CAP = [\d.]+;\n/, '');
  fs.writeFileSync(p, src);
  console.log('restored devicePixelRatio');
  if (mode === 'off' || !mode) process.exit(0);
}

if (mode === 'off' || !mode) {
  console.log('nothing to do');
  process.exit(0);
}

const cap = Number(mode);
if (!Number.isFinite(cap) || cap <= 0) {
  console.error('usage: ab-flappy-dpr.js <positive number> | off');
  process.exit(1);
}

if (!src.includes(ANCHOR)) {
  console.error('FATAL: dpr line not found in resize()');
  process.exit(1);
}

/* One replacement, inserting the declaration and its use together. Doing it in
   two steps consumed the anchor on the first replace, so the declaration was
   never written and the build referenced an undeclared identifier — which
   `node --check` does not catch. */
const BOTH = 'const FLAPPY_DPR_CAP = ' + cap + ';\n' + PATCHED;
src = src.replace(ANCHOR, BOTH);
fs.writeFileSync(p, src);

/* Verify both halves landed before claiming success. */
const after = fs.readFileSync(p, 'utf8');
const hasDecl = after.includes('const FLAPPY_DPR_CAP = ' + cap + ';');
const hasUse = after.includes(PATCHED.trim());
if (!hasDecl || !hasUse) {
  console.error('FATAL: cap not fully applied — declaration=' + hasDecl
    + ' use=' + hasUse + '. Refusing to leave a half-patched file.');
  process.exit(1);
}
console.log(`backing-store scale capped to ${cap}x (declared and used)`);