// Probes specific SAN outputs and square-mapping assumptions.
// The board is indexed [row][col] with row 0 = rank 8 and col 0 = file a,
// so a UCI square like e2 is row 6, col 4. Several test assertions assumed a
// different mapping, so print the truth rather than reasoning about it.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const corePath = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'chess-core.js');
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(corePath, 'utf8'), sandbox, { filename: 'chess-core.js' });

const { chessFromFen, chessGenerateLegalMoves, chessMoveToUci, chessMoveToSan,
        chessUciToMoveObj, chessParseSquare, chessSquareName,
        chessIsSquareAttacked, chessGameStatus } = sandbox;

console.log('--- square mapping ---');
for (const u of ['a1', 'e1', 'e2', 'd2', 'd3', 'f3', 'a8', 'h8']) {
  const p = chessParseSquare(u);
  console.log('  ' + u + ' -> row=' + p.r + ' col=' + p.c +
              '  name=' + chessSquareName(p.r, p.c));
}

console.log('--- SAN: two knights to d2 (file disambiguation) ---');
{
  // Knights on b1 and f3 both reach d2. That needs a real position with
  // those squares, and both moves to be legal.
  const s = chessFromFen('4k3/8/8/8/8/8/8/1N2K1N1 w - - 0 1');
  const toD2 = chessGenerateLegalMoves(s)
    .filter(m => m.to.r === 6 && m.to.c === 3)
    .map(m => chessMoveToSan(m, s) + '(' + chessMoveToUci(m) + ')');
  console.log('  knights->d2: ' + toD2.join(' , '));

  // Knights on b1 and g1: which of them can reach d2? Neither. Print what
  // the generator actually offers to d2.
  const s1 = chessFromFen('4k3/8/8/8/8/8/8/1N2K1N1 w - - 0 1');
  console.log('  board: ' + chessFromFen('4k3/8/8/8/8/8/8/1N2K1N1 w - - 0 1').board
    .map(row => row.map(p => p ? (p.c === 'w' ? p.t.toUpperCase() : p.t) : '.').join('')).join('/'));
}

console.log('--- SAN: two rooks to d1 (rank disambiguation) ---');
{
  const s = chessFromFen('4k3/8/8/8/8/8/8/R2K3R w - - 0 1');
  const toD1 = chessGenerateLegalMoves(s)
    .filter(m => m.piece.t === 'r' && m.to.r === 7 && m.to.c === 3)
    .map(m => chessMoveToSan(m, s) + '(' + chessMoveToUci(m) + ')');
  console.log('  rooks->d1: ' + toD1.join(' , '));
}

console.log('--- SAN: capture ---');
{
  const s = chessFromFen('4k3/8/3r4/4R3/8/8/8/4K3 w - - 0 1');
  const mv = chessUciToMoveObj('e5d5', s);
  console.log('  e5d5 -> ' + (mv ? chessMoveToSan(mv, s) : 'NULL'));
}

console.log('--- scholars mate ---');
{
  // 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6 4.Qxf7#
  const s = chessFromFen('r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/5N2/PPPP1PPP/RNB1K2R b KQkq - 4 4');
  console.log('  status = ' + chessGameStatus(s));
  console.log('  inCheck(b) = ' + chessIsSquareAttacked(s.board, 0, 5, 'w'));
}

console.log('--- pinned pawn attack geometry ---');
{
  const s = chessFromFen('4r2k/8/8/8/8/3r4/4P3/4K3 w - - 0 1');
  const atk = (name, r, c) =>
    console.log('  ' + name + ' (row ' + r + ',col ' + c + ') attackedByWhite = ' +
                chessIsSquareAttacked(s.board, r, c, 'w'));
  atk('d2', 6, 3);
  atk('f2', 6, 5);
  atk('d3', 5, 3);
  atk('f3', 5, 5);
}