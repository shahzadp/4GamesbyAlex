// Focused debug for a single chess position, printing the board grid and the
// generated moves. Used to tell an engine bug from a bad test FEN.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const corePath = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'chess-core.js');
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(corePath, 'utf8'), sandbox, { filename: 'chess-core.js' });

const { chessFromFen, chessGenerateLegalMoves, chessMoveToUci, chessIsInCheck,
        chessToFen, chessParseSquare, chessIsSquareAttacked } = sandbox;

function grid(f) {
  const s = chessFromFen(f);
  if (!s) return 'FEN REJECTED: ' + f;
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let line = '';
    for (let c = 0; c < 8; c++) {
      const p = s.board[r][c];
      line += p ? (p.c === 'w' ? p.t.toUpperCase() : p.t) : '.';
    }
    rows.push(line);
  }
  return { fen: chessToFen(s), turn: s.turn, rows: rows.join(' / ') };
}

const which = process.argv[2] || 'all';

const cases = {
  // Section 1: black rook b8 pins the knight b2 against king b1.
  pin: '1r2k3/8/8/8/8/8/1N6/4K3 w - - 0 1',
  // Section 3: rook e8 checks king e1 along the e-file.
  check: '4r2k/8/8/8/8/8/8/4K3 w - - 0 1',
  // Section 4: pawn e2 pinned by rook e8.
  pawn: '4r2k/8/8/8/8/8/4P3/4K3 w - - 0 1',
  // Section 5: castling out of check, rook e8, king e1.
  castleCheck: '4r2k/8/8/8/8/8/8/R3K2R w KQ - 0 1',
  // Section 6: a real capture that must not be read as en passant.
  epAmbiguity: '4k3/3p4/4P3/8/8/8/8/4K3 w - d6 0 2',
  // Section 8: back-rank mate.
  backRank: 'R5k1/6pp/7K/8/8/8/8/8 b - - 0 1',
  // Section 13: two knights reaching d2.
  knightDis: '4k3/8/8/8/8/8/8/1N2K1N1 w - - 0 1',
  // Section 13: rooks a1 and h1 both reaching d1.
  rookDis: '4k3/8/8/8/8/8/8/R2K3R w - - 0 1',
  // Section 13: capture notation.
  capture: '4k3/8/3r4/4R3/8/8/8/4K3 w - - 0 1',
  // A real capture onto d6 where a black pawn sits, with an ep target also
  // recorded on d6. The lookup must prefer the ordinary capture.
  epAmbiguity2: '4k3/3p4/4P3/8/8/8/8/4K3 w - d6 0 2',
  // Black en passant: the black pawn is on d4, the white pawn that just
  // double-pushed is on e4, so the target is e3 and the move is d4e3.
  epBlack: '4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1',
  // Scholar's mate.
  scholars: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/5N2/PPPP1PPP/RNB1K2R b KQkq - 4 4',
  // Queenside castling with b1 attacked by a black rook.
  b1Attacked: '1r5k/8/8/8/8/8/8/R3K2R w KQ - 0 1',
  // Two white knights on b1 and g1 that can both reach d2? No. Use knights
  // on a2 and e2, which both reach c3 and c1... simpler: b1 and f3 both
  // reach d2.
  knightDis2: '4k3/8/8/8/8/8/8/1N2K1N1 w - - 0 1',
  // Rooks a1 and h1 both reaching d1.
  rookDis2: '4k3/8/8/8/8/8/8/R2K3R w - - 0 1',
  // A pinned knight for section 1, with the king on b1 rather than e1 so the
  // rook on b8 genuinely pins along the b-file.
  pinReal: '1r6/8/8/8/8/8/1N6/1K6 w - - 0 1',
  // Section 4: white pawn e2, white king e1, black rook e8, black rook d3.
  pawnPin: '4r2k/8/8/8/8/3r4/4P3/4K3 w - - 0 1'
};

const keys = which === 'all' ? Object.keys(cases) : which.split(',');
for (const k of keys) {
  const f = cases[k];
  if (!f) { console.log(k + ': unknown case'); continue; }
  const g = grid(f);
  console.log('--- ' + k + ' ---');
  if (typeof g === 'string') { console.log('  ' + g); continue; }
  console.log('  fenIn : ' + f);
  console.log('  fenOut: ' + g.fen + '   turn=' + g.turn);
  console.log('  board : ' + g.rows);
  const s = chessFromFen(f);
  console.log('  inCheck(w)=' + chessIsInCheck(s.board, 'w') +
              '  inCheck(b)=' + chessIsInCheck(s.board, 'b'));
  const moves = chessGenerateLegalMoves(s).map(chessMoveToUci).sort();
  console.log('  legal (' + moves.length + '): ' + moves.join(' '));
}