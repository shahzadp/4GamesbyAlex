/* Checks the chess set: the twelve Cburnett pieces in both colours, the start
 * page card showing the same pawn, and a board made of sixty-four equal cells.
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
           const grid = document.getElementById('chessboard');
           const squares = Array.from(grid.querySelectorAll('.chess-square'));
           const clients = squares.map(function (sq) {
             const r = sq.getBoundingClientRect();
             return { w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 };
           });
           const pieces = grid.querySelectorAll('.chess-piece');
           const svgs = grid.querySelectorAll('.chess-piece svg');
           const rows = Array.from(grid.children);
           return JSON.stringify({
             squares: squares.length,
             pieces: pieces.length,
             viewBoxes: Array.from(new Set(Array.from(svgs).map(function (s) { return s.getAttribute('viewBox'); }))),
             rowCounts: rows.map(function (r) { return r.children.length; }),
             widthSet: Array.from(new Set(clients.map(function (c) { return c.w; }))),
             heightSet: Array.from(new Set(clients.map(function (c) { return c.h; }))),
             boardW: Math.round(grid.getBoundingClientRect().width * 100) / 100,
             pieceSize: pieces.length ? Math.round(pieces[0].getBoundingClientRect().width) : 0
           });
         })()`
      )
    );

    check(board.squares === 64, "the board has 64 squares", `${board.squares}`);
    check(board.pieces === 32, "a start position draws 32 pieces", `${board.pieces}`);
    check(
      board.viewBoxes.length === 1 && board.viewBoxes[0] === "0 0 45 45",
      "every piece uses the Cburnett 45x45 box",
      board.viewBoxes.join(",")
    );
    check(board.pieceSize >= 40, "pieces fill their squares", `${board.pieceSize}px`);

    // The empty boxes used to get squeezed: every cell must measure the same.
    check(
      board.widthSet.length === 1,
      "every board cell is the same width",
      board.widthSet.join(", ")
    );
    check(
      board.heightSet.length === 1,
      "every board cell is the same height",
      board.heightSet.join(", ")
    );
    check(
      board.widthSet[0] === board.heightSet[0],
      "the board cells are square",
      `${board.widthSet[0]}x${board.heightSet[0]}`
    );
    check(
      board.widthSet[0] === Math.round((board.boardW / 8) * 100) / 100,
      "the cells divide the board exactly",
      `cell ${board.widthSet[0]} vs board/8 ${Math.round((board.boardW / 8) * 100) / 100}`
    );

    // Measure each of the twelve drawings and make sure none is clipped by the
    // view box or wildly out of proportion with the rest of the set.
    const measured = JSON.parse(
      await evaluate(
        cdp,
        `(function () {
           const host = document.createElement('div');
           host.style.cssText = 'position:fixed;left:-9999px;top:0;width:200px;height:200px';
           document.body.appendChild(host);
           const out = [];
           for (const color of ['w','b']) {
             for (const type of ['k','q','b','n','r','p']) {
               host.innerHTML = getPieceSvg(type, color);
               const svg = host.querySelector('svg');
               const art = svg.getBBox();
               const paths = Array.from(svg.querySelectorAll('path'));
               // The king opens with the unfilled cross, so take the first
               // path that actually paints a body colour.
               const fills = paths.map(function (el) { return getComputedStyle(el).fill; });
               const bodyFill = fills.find(function (f) { return f !== 'none' && f !== 'transparent'; }) || fills[0];
               out.push({
                 type: type + color,
                 x: art.x, y: art.y, w: art.width, h: art.height,
                 right: art.x + art.width, bottom: art.y + art.height,
                 // cburnett sets the body fill on the wrapping <g> for some
                 // pieces and per path for others, so read what the browser
                 // actually paints rather than one attribute.
                 fill: bodyFill,
                 stroke: svg.querySelector('[stroke]').getAttribute('stroke'),
                 paths: paths.map(function (el) { return el.getAttribute('d'); }).join('|')
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
        art.x >= 0 && art.y >= 0 && art.right <= 45 && art.bottom <= 45,
        `${art.type} stays inside the 45x45 box`,
        `x ${art.x.toFixed(2)} y ${art.y.toFixed(2)} r ${art.right.toFixed(2)} b ${art.bottom.toFixed(2)}`
      );
      // cburnett draws the pieces between the collar and the base, so they do
      // not reach the edges of the box; these are the real measured ranges.
      check(
        art.w >= 22 && art.w <= 39 && art.h >= 29 && art.h <= 36,
        `${art.type} is a full-size piece`,
        `${art.w.toFixed(2)}x${art.h.toFixed(2)}`
      );
      check(
        art.bottom >= 38 && art.bottom <= 41,
        `${art.type} stands on the set baseline`,
        art.bottom.toFixed(2)
      );
      // White pieces paint #fff bodies; black pieces paint #000. The knight is
      // a single filled path on both colours, and the black pawn carries no
      // fill attribute at all, so compare resolved colours.
      check(
        art.fill === (white ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)"),
        `${art.type} is the right colour`,
        String(art.fill)
      );
      check(art.stroke === "#000", `${art.type} is outlined in ink`, String(art.stroke));
    }

    // Six silhouettes in the white half, each different, otherwise a type is
    // falling through to another piece's artwork. (The black half adds its own
    // light detail paths, so it is compared separately below.)
    const whiteSilhouettes = new Set(
      measured.filter((art) => art.type.endsWith("w")).map((art) => art.paths)
    );
    check(whiteSilhouettes.size === 6, "each piece has its own silhouette", `${whiteSilhouettes.size} distinct`);

    // White and black art must be the two halves of the set, not one reused.
    const wPawn = measured.find((a) => a.type === "pw");
    const bPawn = measured.find((a) => a.type === "pb");
    check(wPawn.paths !== bPawn.paths, "black and white pawns are different drawings");

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
             path: svg.querySelector('path').getAttribute('d'),
             fill: svg.querySelector('path').getAttribute('fill'),
             board: getPieceSvg('p', 'w')
           });
         })()`
      )
    );
    check(card.found, "the start page has a chess card pawn");
    if (card.found) {
      check(card.viewBox === "0 0 45 45", "the card pawn uses the Cburnett box", card.viewBox);
      check(card.fill === "#fff", "the card pawn is white", String(card.fill));
      check(
        card.board.includes(card.path),
        "the card pawn is the same pawn the board draws",
        `${card.path.slice(0, 32)}...`
      );
    }

    console.log(failures ? `\nFAIL (${failures})` : "\nPASS: the Cburnett chess set is in place");
    process.exitCode = failures ? 1 : 0;
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
