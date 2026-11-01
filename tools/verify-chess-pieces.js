/* Checks the chess set: six bold outline pieces in both colours, drawn from
 * one shared box, with the start page card showing the same pawn.
 *
 * Usage: node tools/verify-chess-pieces.js [url]
 */
const { evaluate, launchEdge, sleep } = require("./cdp-harness");

const URL_UNDER_TEST = process.argv[2] || "http://127.0.0.1:8099/index.html";

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? "ok   " : "FAIL "} ${what}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures++;
};

async function main() {
  const { cdp, close } = await launchEdge({ port: 9351, width: 900, height: 900 });
  try {
    await cdp.send("Page.navigate", { url: URL_UNDER_TEST });
    await sleep(1200);
    await evaluate(cdp, `switchPage('chess')`);
    await sleep(600);

    const board = JSON.parse(
      await evaluate(
        cdp,
        `(function () {
           const squares = document.querySelectorAll('#chessboard .chess-square');
           const pieces = document.querySelectorAll('#chessboard .chess-piece');
           const svgs = document.querySelectorAll('#chessboard .chess-piece svg');
           return JSON.stringify({
             squares: squares.length,
             pieces: pieces.length,
             viewBoxes: Array.from(new Set(Array.from(svgs).map(function (s) { return s.getAttribute('viewBox'); }))),
             gradients: document.querySelectorAll('#chessboard linearGradient, #chessboard defs').length,
             pieceSize: pieces.length ? Math.round(pieces[0].getBoundingClientRect().width) : 0
           });
         })()`
      )
    );
    check(board.squares === 64, "the board has 64 squares", `${board.squares}`);
    check(board.pieces === 32, "a start position draws 32 pieces", `${board.pieces}`);
    check(
      board.viewBoxes.length === 1 && board.viewBoxes[0] === "8 -1 48 61",
      "every piece uses one shared drawing box",
      board.viewBoxes.join(",")
    );
    check(board.gradients === 0, "the pieces are flat vector art", `${board.gradients} defs/gradients`);
    check(board.pieceSize >= 40, "pieces fill their squares", `${board.pieceSize}px`);

    // Measure each of the twelve drawings and make sure none is clipped by the
    // view box or wildly out of proportion with the rest of the set.
    const measured = JSON.parse(
      await evaluate(
        cdp,
        `(function () {
           const host = document.createElement('div');
           host.style.cssText = 'position:fixed;left:-9999px;top:0;width:200px;height:250px';
           document.body.appendChild(host);
           const types = ['k','q','b','n','r','p'];
           const out = [];
           for (const color of ['w','b']) {
             for (const type of types) {
               host.innerHTML = getPieceSvg(type, color);
               const svg = host.querySelector('svg');
               const body = svg.querySelector('g');
               const art = body.getBBox();
               out.push({
                 type: type + color,
                 x: art.x, y: art.y, w: art.width, h: art.height,
                 right: art.x + art.width, bottom: art.y + art.height,
                 fill: body.getAttribute('fill'),
                 stroke: body.getAttribute('stroke'),
                 detail: svg.querySelectorAll('g')[1].getAttribute('stroke'),
                 paths: Array.from(body.children).map(function (el) { return el.getAttribute('d') || el.tagName; }).join('|')
               });
             }
           }
           host.remove();
           return JSON.stringify(out);
         })()`
      )
    );

    check(measured.length === 12, "all six pieces exist in both colours", `${measured.length}`);
    for (const art of measured) {
      const white = art.type.endsWith("w");
      check(
        art.x >= 8 && art.y >= -1 && art.right <= 56 && art.bottom <= 60,
        `${art.type} stays inside the shared box`,
        `x ${art.x.toFixed(1)} y ${art.y.toFixed(1)} r ${art.right.toFixed(1)} b ${art.bottom.toFixed(1)}`
      );
      check(
        art.h >= 42 && art.h <= 58 && art.w >= 30 && art.w <= 46,
        `${art.type} is a full-size piece`,
        `${art.w.toFixed(1)}x${art.h.toFixed(1)}`
      );
      check(
        art.bottom >= 55 && art.bottom <= 56.5,
        `${art.type} stands on the shared baseline`,
        art.bottom.toFixed(1)
      );
      check(
        art.fill === (white ? "#fbfaf3" : "#171610"),
        `${art.type} is the right colour`,
        art.fill
      );
      check(
        art.stroke === "#14130e",
        `${art.type} is outlined in ink`,
        art.stroke
      );
      check(
        art.detail === (white ? "#14130e" : "#f4f1e5"),
        `${art.type} engraving contrasts with its body`,
        art.detail
      );
    }

    // The six silhouettes must differ, otherwise a type is falling through to
    // another piece's artwork.
    const silhouettes = new Set(measured.map((art) => art.paths));
    check(silhouettes.size === 6, "each piece has its own silhouette", `${silhouettes.size} distinct`);

    // The start page card draws the same pawn the board does.
    const card = JSON.parse(
      await evaluate(
        cdp,
        `(function () {
           switchPage('main');
           const svg = document.querySelector('.chess-card-pawn');
           if (!svg) return JSON.stringify({ found: false });
           return JSON.stringify({
             found: true,
             viewBox: svg.getAttribute('viewBox'),
             defs: svg.querySelectorAll('defs, linearGradient').length,
             path: svg.querySelector('path').getAttribute('d'),
             fill: svg.querySelector('g').getAttribute('fill'),
             board: getPieceSvg('p', 'w')
           });
         })()`
      )
    );
    check(card.found, "the start page has a chess card pawn");
    if (card.found) {
      check(card.viewBox === "8 -1 48 61", "the card pawn uses the board drawing box", card.viewBox);
      check(card.defs === 0, "the card pawn is flat art too", `${card.defs}`);
      check(
        card.board.includes(card.path),
        "the card pawn is the same pawn the board draws",
        `${card.path.slice(0, 32)}...`
      );
    }

    console.log(failures ? `\nFAIL (${failures})` : "\nPASS: the bold outline chess set is in place");
    process.exitCode = failures ? 1 : 0;
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
