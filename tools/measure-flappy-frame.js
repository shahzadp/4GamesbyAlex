/* Times the parts of a Flappy Bird frame, so the expensive one can be found
 * out instead of guessed at.
 *
 * Usage: node tools/measure-flappy-frame.js [url]
 */
const { evaluate, launchEdge, sleep } = require("./cdp-harness");

const URL_UNDER_TEST = process.argv[2] || "http://127.0.0.1:8099/index.html";

async function main() {
  const { cdp, close } = await launchEdge({ width: 900, height: 420 });
  try {
    await cdp.send("Page.navigate", { url: URL_UNDER_TEST });
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      await sleep(250);
      ready = await evaluate(
        cdp,
        `typeof flappyGame === 'object' && Boolean(flappyGame.canvas)`
      );
      if (ready) break;
    }
    if (!ready) throw new Error("the launcher never came up");
    await evaluate(cdp, `switchPage('flappy')`);
    await sleep(800);

    const result = await evaluate(
      cdp,
      `(function () {
        const game = flappyGame;
        const ctx = game.ctx;
        const N = 200;
        const sky = game.skyNow();
        const night = 1 - sky.light;

        function time(label, fn) {
          fn();
          const t0 = performance.now();
          for (let i = 0; i < N; i++) fn();
          return { label: label, ms: +((performance.now() - t0) / N).toFixed(4) };
        }

        const rows = [];
        rows.push(time('skyNow', () => game.skyNow()));
        rows.push(time('mixHex x 9', () => {
          for (let i = 0; i < 9; i++) mixHex('#73bf2e', '#2b4430', night + i * 0.0001);
        }));
        rows.push(time('createLinearGradient', () => {
          const g = ctx.createLinearGradient(0, 0, 0, game.height - game.groundHeight);
          g.addColorStop(0, sky.top);
          g.addColorStop(0.7, sky.mid);
          g.addColorStop(1, sky.low);
        }));
        rows.push(time('fillRect with a gradient', () => {
          const g = ctx.createLinearGradient(0, 0, 0, game.height - game.groundHeight);
          g.addColorStop(0, sky.top);
          g.addColorStop(0.7, sky.mid);
          g.addColorStop(1, sky.low);
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, game.width, game.height);
        }));
        rows.push(time('fillRect with a flat colour', () => {
          ctx.fillStyle = sky.top;
          ctx.fillRect(0, 0, game.width, game.height);
        }));

        // The same picture in an offscreen canvas, blitted back
        const off = document.createElement('canvas');
        off.width = game.canvas.width;
        off.height = game.canvas.height;
        const octx = off.getContext('2d');
        const g2 = octx.createLinearGradient(0, 0, 0, off.height);
        g2.addColorStop(0, sky.top);
        g2.addColorStop(0.7, sky.mid);
        g2.addColorStop(1, sky.low);
        octx.fillStyle = g2;
        octx.fillRect(0, 0, off.width, off.height);
        rows.push(time('drawImage of a ready sky', () => {
          ctx.drawImage(off, 0, 0, game.width, game.height);
        }));

        // The whole frame, as the best of five rounds: a single round is
        // noisy enough to hide the difference it is meant to show
        let best = Infinity;
        for (let round = 0; round < 5; round++) {
          const t0 = performance.now();
          for (let i = 0; i < N; i++) game.draw();
          const each = (performance.now() - t0) / N;
          if (each < best) best = each;
        }
        rows.push({ label: 'a whole draw()', ms: +best.toFixed(4) });

        return {
          canvas: game.canvas.width + 'x' + game.canvas.height,
          css: game.width + 'x' + game.height,
          rows: rows
        };
      })()`
    );

    console.log(`canvas ${result.canvas} (css ${result.css})`);
    result.rows.forEach((row) => {
      console.log(`  ${row.label.padEnd(30)} ${row.ms.toFixed(4)} ms`);
    });
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
