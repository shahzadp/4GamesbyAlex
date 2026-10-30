/* Compares two png files pixel by pixel, in the browser, so the difference
 * between two renders of the same scene can be measured.
 *
 * Usage: node tools/compare-shots.js <a.png> <b.png>
 */
const fs = require("fs");
const { evaluate, launchEdge } = require("./cdp-harness");

async function main() {
  const [, , aPath, bPath] = process.argv;
  const a = fs.readFileSync(aPath).toString("base64");
  const b = fs.readFileSync(bPath).toString("base64");

  const { cdp, close } = await launchEdge({ port: 9337, width: 800, height: 600 });
  try {
    await cdp.send("Page.navigate", { url: "about:blank" });
    const result = await evaluate(
      cdp,
      `(async function () {
        function load(src) {
          return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = 'data:image/png;base64,' + src;
          });
        }
        const ia = await load(${JSON.stringify(a)});
        const ib = await load(${JSON.stringify(b)});
        if (ia.width !== ib.width || ia.height !== ib.height) {
          return { error: 'different size' };
        }
        const w = ia.width, h = ia.height;
        const ca = document.createElement('canvas');
        ca.width = w; ca.height = h;
        const cb = document.createElement('canvas');
        cb.width = w; cb.height = h;
        const xa = ca.getContext('2d');
        const xb = cb.getContext('2d');
        xa.drawImage(ia, 0, 0);
        xb.drawImage(ib, 0, 0);
        const pa = xa.getImageData(0, 0, w, h).data;
        const pb = xb.getImageData(0, 0, w, h).data;
        let differing = 0;
        let maxDelta = 0;
        let sum = 0;
        let worst = null;
        for (let i = 0; i < pa.length; i += 4) {
          const d = Math.max(
            Math.abs(pa[i] - pb[i]),
            Math.abs(pa[i + 1] - pb[i + 1]),
            Math.abs(pa[i + 2] - pb[i + 2])
          );
          if (d > 0) {
            differing++;
            sum += d;
            if (d > maxDelta) {
              maxDelta = d;
              worst = [Math.floor((i / 4) % w), Math.floor((i / 4) / w)];
            }
          }
        }
        return {
          size: w + 'x' + h,
          pixels: w * h,
          differing: differing,
          percent: +(differing / (w * h) * 100).toFixed(3),
          maxDelta: maxDelta,
          meanDelta: +(sum / Math.max(1, differing)).toFixed(2),
          worst: worst
        };
      })()`
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
