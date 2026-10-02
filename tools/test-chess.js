// Correctness tests for chess-core.js. Run with: node tools/test-chess.js
//
// These are the cases the previous engine got wrong. Each one is a position
// where pseudo-legal generation and true legality differ, so a passing run
// is real evidence the illegal-move bugs are fixed.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const corePath = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'chess-core.js');
const src = fs.readFileSync(corePath, 'utf8');

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'chess-core.js' });

const {
  chessInitialState, chessFromFen, chessToFen, chessGenerateLegalMoves,
  chessIsInCheck, chessIsSquareAttacked, chessApplyMove, chessGameStatus,
  chessUciToMoveObj, chessMoveToUci, chessCloneState, chessMoveToSan,
  chessParseSquare
} = sandbox;

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (extra ? '  [' + extra + ']' : '')); }
}

function fen(str) {
  const s = chessFromFen(str);
  if (!s) throw new Error('bad FEN: ' + str);
  return s;
}

// Render a position as a grid of piece letters, '.' for empty, for
// eyeballing failures in the output.
function dump(state) {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let line = '';
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      line += p ? (p.c === 'w' ? p.t.toUpperCase() : p.t) : '.';
    }
    rows.push(line);
  }
  return rows.join('/');
}

function uciSet(state) {
  return new Set(chessGenerateLegalMoves(state).map(chessMoveToUci));
}

function hasMove(state, uci) {
  return uciSet(state).has(uci);
}

console.log('=== 1. Pins: a pinned piece may not leave the pin line ===');
{
  // Black rook b8 pins the white knight on b2 against the white king on b1,
  // straight down the b-file. Every knight move leaves the file, so the
  // knight has no legal move at all.
  const s = fen('1r6/8/8/8/8/8/1N6/1K6 w - - 0 1');
  ok('pinned knight generates no moves at all',
     chessGenerateLegalMoves(s).filter(m => m.piece.t === 'n').length === 0);
  // The king on b1 is itself on the b-file, which the rook covers, so it may
  // only step off the file and cannot remain on it.
  const set = uciSet(s);
  ok('king cannot stay on the pinned file', !set.has('b1b2'));
  ok('king can step off the file', set.has('b1a1') || set.has('b1c1'));
  ok('king cannot step up the b-file into the rook', !set.has('b1b2'));

  // A knight that is NOT pinned moves freely. Bishop h4 does not pin the
  // knight on g3 because the white king is on h1, not on the diagonal.
  const s2 = fen('7k/8/8/8/7b/6N1/8/7K w - - 0 1');
  ok('an unpinned knight has moves',
     chessGenerateLegalMoves(s2).filter(m => m.piece.t === 'n').length > 0);
}

console.log('=== 2. King may not move onto an attacked square ===');
{
  // Black rook on a8 covers the whole 8th rank and the a-file.
  // White king on e1 must not go to a1 or a2.
  const s = fen('r3k3/8/8/8/8/8/8/4K3 w - - 0 1');
  const set = uciSet(s);
  ok('king cannot step onto a1 (rook file)', !set.has('e1a1'));
  ok('king cannot step onto a2 (rook file)', !set.has('e1a2'));
  ok('king can retreat to d1', set.has('e1d1'));
  ok('king can retreat to d2', set.has('e1d2'));
  ok('king can step to f2 (unattacked here)', set.has('e1f2'));
}

console.log('=== 3. King may not remain in check ===');
{
  // Rook e8 checks the white king on e1 straight down the e-file.
  const s = fen('4r2k/8/8/8/8/8/8/4K3 w - - 0 1');
  ok('king is in check', chessIsInCheck(s.board, 'w'));
  const set = uciSet(s);
  ok('king cannot stay on the e-file', !set.has('e1e2'));
  ok('king can flee to d1', set.has('e1d1'));
  ok('king can flee to f1', set.has('e1f1'));
  ok('king can flee to d2', set.has('e1d2'));
  // Nothing else may move, because every non-king move would leave the king
  // in check.
  ok('no non-king moves are legal while in check',
     chessGenerateLegalMoves(s).every(m => m.piece.t === 'k'));
}

console.log('=== 4. A pinned pawn may advance along the pin, but not off it ===');
{
  // The white pawn on e2 is pinned by the black rook on e8 against the white
  // king on e1. The pawn may advance up the file, because that keeps the
  // king blocked, but it may not capture sideways, which would expose the
  // king on the open e-file.
  const s = fen('4r2k/8/8/8/8/3r4/4P3/4K3 w - - 0 1');
  ok('white is not in check: the pawn blocks the rook',
     !chessIsInCheck(s.board, 'w'));
  const set = uciSet(s);
  ok('pinned pawn may push along the pin', set.has('e2e3'));
  ok('pinned pawn may double-push along the pin', set.has('e2e4'));
  // Capturing the rook on d3 would move the pawn off the e-file and expose
  // the king to the rook on e8, so it must not be offered.
  ok('pinned pawn may not capture off the pin line', !set.has('e2d3'));

  // A pawn pinned along the e-file by a rook cannot leap past the rank where
  // the pinning rook sits: e2-e4 stays on the file and is therefore still
  // legal, which the case above already covers. What must be rejected is the
  // capture in either direction, so assert both are absent rather than
  // asserting a tautology.
  ok('pinned pawn may not capture toward the pinning side', !set.has('e2d3'));
  ok('pinned pawn may not capture the other way either', !set.has('e2f3'));

  // A white pawn on e2 attacks d3 and f3 even when pinned, because attack
  // geometry is absolute: it is about where the pawn points, not whether it
  // could legally move there. The white king is parked far away so it cannot
  // be the thing attacking these squares - otherwise the test would be
  // measuring the king's reach rather than the pawn's.
  const pa = fen('7k/8/8/8/8/8/4P3/8 w - - 0 1');
  ok('white pawn attacks d3', chessIsSquareAttacked(pa.board, 5, 3, 'w'));
  ok('white pawn attacks f3', chessIsSquareAttacked(pa.board, 5, 5, 'w'));
  // A white pawn points up the board, so it does not attack the square behind
  // it, nor the square in front of it.
  ok('white pawn does not attack the square behind it', !chessIsSquareAttacked(pa.board, 6, 3, 'w'));
  ok('white pawn does not attack the square in front', !chessIsSquareAttacked(pa.board, 5, 4, 'w'));
}

console.log('=== 5. Castling: blocked, through check, out of check ===');
{
  // The white king on e1 is attacked by the black rook on e8, so no castling
  // is allowed at all. Only one black king, on e8.
  const inCheck = fen('4r2k/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  ok('king is in check', chessIsInCheck(inCheck.board, 'w'));
  ok('cannot castle out of check (kingside)', !hasMove(inCheck, 'e1g1'));
  ok('cannot castle out of check (queenside)', !hasMove(inCheck, 'e1c1'));

  // Not in check, but f1 is covered by the black rook on f7, so the king may
  // not pass through f1. Queenside castling is still fine because b1, c1 and
  // d1 are all unattacked.
  const through = fen('5r1k/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  ok('not in check in the through-test position', !chessIsInCheck(through.board, 'w'));
  ok('cannot castle through an attacked f1', !hasMove(through, 'e1g1'));
  ok('queenside castle still legal when only f1 attacked', hasMove(through, 'e1c1'));

  // b1 attacked does NOT block queenside castling. Under FIDE rules only the
  // square the king starts on, crosses, and lands on matter, so for
  // queenside that is e1, d1 and c1. The king never occupies b1 - the rook
  // passes over it, and a rook crossing an attacked square is harmless.
  const b1Attacked = fen('1r5k/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  ok('an attacked b1 does not block queenside castling', hasMove(b1Attacked, 'e1c1'));
  ok('kingside still legal when only b1 attacked', hasMove(b1Attacked, 'e1g1'));

  // d1 attacked blocks queenside castling: the king must cross d1.
  const d1Attacked = fen('3r3k/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  ok('cannot castle through an attacked d1', !hasMove(d1Attacked, 'e1c1'));

  // c1 attacked blocks queenside castling: the king must land on c1.
  const c1Attacked = fen('2r4k/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  ok('cannot castle into an attacked c1', !hasMove(c1Attacked, 'e1c1'));

  // g1 attacked blocks kingside castling: the king LANDS on g1. Only the rook
  // may be left en prise, not the king.
  const g1Attacked = fen('k5r1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  ok('cannot castle into an attacked g1', !hasMove(g1Attacked, 'e1g1'));

  // Rights lost after the rook moves: no castling.
  const noRights = fen('7k/8/8/8/8/8/8/R3K2R w - - 0 1');
  ok('no kingside castle without rights', !hasMove(noRights, 'e1g1'));
  ok('no queenside castle without rights', !hasMove(noRights, 'e1c1'));

  // Path occupied.
  const blocked = fen('7k/8/8/8/8/8/8/R3KB1R w KQ - 0 1');
  ok('no kingside castle when f1 occupied', !hasMove(blocked, 'e1g1'));
  ok('queenside castle allowed when b1 empty', hasMove(blocked, 'e1c1'));

  // A rook of the wrong colour is not a castling rook.
  const wrongRook = fen('7k/8/8/8/8/8/8/R3K1rR w KQ - 0 1');
  ok('no kingside castle when h1 holds a black rook', !hasMove(wrongRook, 'e1g1'));

  // A rook that has already moved cannot castle even if the FEN wrongly
  // claims rights: chessFromFen derives hasMoved from the rights, so this
  // checks the FEN is the source of truth rather than piece flags.
  const moved = fen('7k/8/8/8/8/8/8/R3K2R w - - 0 1');
  ok('no castling when the FEN grants no rights',
     !hasMove(moved, 'e1g1') && !hasMove(moved, 'e1c1'));
}

console.log('=== 6. En passant ===');
{
  // After 1.e4 d5 2.e5, white may capture exd6 e.p. Note d6 must be EMPTY:
  // the black pawn sits on d5, having just moved two squares.
  const s = fen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2');
  ok('en passant capture is generated', hasMove(s, 'e5d6'));
  const m = chessUciToMoveObj('e5d6', s);
  ok('en passant move is flagged', m && m.isEnPassant === true);
  chessApplyMove(s, m);
  ok('en passant removes the pawn that passed over',
     s.board[3][3] === null && s.board[2][3] && s.board[2][3].t === 'p' && s.board[2][3].c === 'w');
  // FEN must clear the target after the capture.
  ok('ep target cleared after capture', s.epTarget === null);

  // Without a recorded target the same pawn cannot capture onto d6.
  const s2 = fen('4k3/8/8/3pP3/8/8/8/4K3 w - - 0 2');
  ok('no en passant without a target', !hasMove(s2, 'e5d6'));

  // The classic ambiguity: a black pawn ON d6 means exd6 is an ordinary
  // capture, not en passant, even with an ep target recorded on d6. The
  // lookup must not silently convert a real capture into an ep move. The
  // white pawn sits on e5 so exd6 is genuinely on offer.
  const s3 = fen('4k3/8/3p4/4P3/8/8/8/4K3 w - d6 0 2');
  const m3 = chessUciToMoveObj('e5d6', s3);
  ok('a real capture is not misread as en passant', m3 && m3.isEnPassant === false);
  ok('the real capture is still offered', !!m3);

  // Black may also capture en passant. The black pawn sits on d4 and the
  // white pawn that just double-pushed is on e4, so the target square is e3
  // and the capture is dxe3, i.e. d4e3.
  const s4 = fen('4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1');
  ok('black en passant is generated', hasMove(s4, 'd4e3'));
  const m4 = chessUciToMoveObj('d4e3', s4);
  ok('black en passant is flagged', m4 && m4.isEnPassant === true);
  chessApplyMove(s4, m4);
  // The white pawn that double-pushed stood on e4, which is row 4, column 4.
  // After the capture it must be gone and the black pawn must sit on e3,
  // which is row 5, column 4.
  ok('black en passant removes the white pawn that passed over',
     s4.board[4][4] === null && s4.board[5][4] && s4.board[5][4].c === 'b');

  // En passant may not expose the king along the fifth rank. The white king
  // on a5, the black pawn d5 and white pawn e5 sit on the fifth rank with a
  // black rook on h5, so removing both pawns by ep would expose the king.
  const s5 = fen('8/8/8/K2pP2r/8/8/8/7k w - d6 0 1');
  ok('en passant that exposes the king is illegal', !hasMove(s5, 'e5d6'));
  // The same position still allows the ordinary pawn push.
  ok('the ordinary push is unaffected', hasMove(s5, 'e5e6'));
}

console.log('=== 7. Promotion ===');
{
  // White pawn on b7 with b8 empty, so the push is available and all four
  // promotion choices must be offered.
  const s = fen('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1');
  const set = uciSet(s);
  ok('promotion to queen available', set.has('b7b8q'));
  ok('promotion to rook available', set.has('b7b8r'));
  ok('promotion to bishop available', set.has('b7b8b'));
  ok('promotion to knight available', set.has('b7b8n'));
  // The same pawn must not offer a promotion by capturing onto empty a8.
  ok('no capture-promotion onto an empty square', !set.has('b7a8q'));

  const m = chessUciToMoveObj('b7b8n', s);
  ok('underpromotion parsed', m && m.promotionPiece === 'n');
  chessApplyMove(s, m);
  ok('underpromotion places a knight', s.board[0][1].t === 'n');

  // A capturing promotion must also be offered, and must capture.
  const s2 = fen('r3k3/1P6/8/8/8/8/8/4K3 w - - 0 1');
  ok('capturing promotion available', hasMove(s2, 'b7a8q'));
  const cap = chessUciToMoveObj('b7a8q', s2);
  ok('capturing promotion records the captured rook', cap && cap.captured && cap.captured.t === 'r');
  chessApplyMove(s2, cap);
  ok('capturing promotion replaces the rook with a queen',
     s2.board[0][0].t === 'q' && s2.board[0][0].c === 'w');

  // A pawn blocked by a piece on the last rank cannot promote at all, because
  // the push square is occupied and it is not a capture.
  const blocked = fen('1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1');
  ok('no promotion when the push square is occupied', !hasMove(blocked, 'b7b8q'));

  // No promotion flag when not reaching the last rank.
  const s3 = fen('4k3/8/8/8/8/8/P7/4K3 w - - 0 1');
  ok('no promotion flag off the last rank', !hasMove(s3, 'a2a3q'));

  // Black promotes downward, onto row 7.
  const s4 = fen('4k3/8/8/8/8/8/1p6/4K3 b - - 0 1');
  ok('black promotes on the correct rank', hasMove(s4, 'b2b1q'));
}

console.log('=== 8. Checkmate and stalemate ===');
{
  // Back-rank mate: the black king on h8 is boxed in by its own pawns on h7
  // and g7, and the white rook on a8 checks along the eighth rank. The white
  // king on f6 covers g7, so neither pawn can move and the king has nowhere
  // to go: g8 and h8 are on the rook's rank, g7 and h7 are its own pawns.
  const mate = fen('R6k/6pp/5K2/8/8/8/8/8 b - - 0 1');
  ok('back-rank position is checkmate for black', chessGameStatus(mate) === 'checkmate');
  ok('mated side is in check', chessIsInCheck(mate.board, 'b'));
  ok('mated side has no legal moves', chessGenerateLegalMoves(mate).length === 0);

  // Scholar's mate: 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6? 4.Qxf7#
  // The mating position is reached by white playing Qxf7, so the FEN must
  // have WHITE to move with the queen on h5 and the f7 pawn still standing.
  const scholarsMate = fen('r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/5N2/PPPP1PPP/RNB1K2R w KQkq - 3 3');
  const qx = chessUciToMoveObj('h5f7', scholarsMate);
  ok('Qxf7 is available', !!qx, chessMoveToUci(qx || { from: {}, to: {} }));
  if (qx) {
    chessApplyMove(scholarsMate, qx);
    ok('scholars mate detected', chessGameStatus(scholarsMate) === 'checkmate',
       chessGameStatus(scholarsMate));
  }

  // Fool's mate: 1.f3 e5 2.g4 Qh4#
  const fools = fen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
  ok('fools mate detected', chessGameStatus(fools) === 'checkmate');

  // Anastasia's mate: the black king on h8 is mated by a rook on h7
  // supported by a knight on f6, with the g8 square blocked by its own pawn.
  const anastasia = fen('5R1k/5Npp/8/8/8/8/8/6K1 b - - 0 1');
  ok('anastasia mate detected', chessGameStatus(anastasia) === 'checkmate',
     chessGameStatus(anastasia));

  // Stalemate: the black king on a8, the white king on c7 and the white
  // queen on b6. It is black to move, not in check, and has no legal move:
  // a8 is covered by the queen, b8 by the king, and b7 by the queen.
  const stale = fen('k7/2K5/1Q6/8/8/8/8/8 b - - 0 1');
  ok('stalemate detected', chessGameStatus(stale) === 'stalemate');
  ok('stalemate side is not in check', !chessIsInCheck(stale.board, 'b'));
  ok('stalemate side has no legal moves', chessGenerateLegalMoves(stale).length === 0);

  // Check but not mate: the defender can still capture or block.
  const checkOnly = fen('4k3/8/8/8/8/8/8/4R1K1 b - - 0 1');
  ok('check without mate is reported as check', chessGameStatus(checkOnly) === 'check');
  ok('the checked side does have legal moves', chessGenerateLegalMoves(checkOnly).length > 0);

  // A queen mate in the middle of the board with no defenders.
  const simpleMate = fen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
  ok('Ra8 is mate', chessMoveToSan(chessUciToMoveObj('a1a8', simpleMate), simpleMate) === 'Ra8#');
}

console.log('=== 9. King can never be captured ===');
{
  // A generator that offered king captures would let the side to move grab
  // the enemy king, which ends the game illegally. Every position here has
  // both kings on the board and reachable, so the check is meaningful.
  const positions = [
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
    '4k3/8/8/3q4/8/8/8/4K3 w - - 0 1',
    'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1',
    '3qk3/8/8/8/8/8/3QK3/8 w - - 0 1'
  ];
  let anyKingCapture = false;
  const seen = [];
  for (const p of positions) {
    const st = fen(p);
    // Both kings must be present for this test to be about anything.
    const wk = [], bk = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const pc = st.board[r][c];
      if (pc && pc.t === 'k') (pc.c === 'w' ? wk : bk).push(1);
    }
    if (!wk.length || !bk.length) { seen.push('skipped (missing king): ' + p); continue; }
    for (const m of chessGenerateLegalMoves(st)) {
      if (st.board[m.to.r][m.to.c] && st.board[m.to.r][m.to.c].t === 'k') {
        anyKingCapture = true;
        seen.push('king capture offered in ' + p + ' as ' + chessMoveToUci(m));
      }
    }
  }
  ok('every test position had both kings', seen.filter(s => s.startsWith('skipped')).length === 0, seen.join(' ; '));
  ok('no generated move ever captures a king', !anyKingCapture, seen.join(' ; '));
}

console.log('=== 10. FEN round-trip ===');
{
  const cases = [
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
    '7k/8/8/8/8/8/8/R3K2R w KQ - 0 1',
    '4k3/8/3p4/4P3/8/8/8/4K3 b - d6 0 2'
  ];
  let allMatch = true;
  const mismatches = [];
  for (const f of cases) {
    const back = chessToFen(fen(f));
    if (back !== f) { allMatch = false; mismatches.push(f + ' -> ' + back); }
  }
  ok('FEN round-trips exactly', allMatch, mismatches.join(' ; '));
}

console.log('=== 11. Castling rights are lost correctly ===');
{
  // Rook moves, then castling must be unavailable. Black is on move next, so
  // the only white move available after the reply is the one being tested.
  const s = fen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const rookMove = chessUciToMoveObj('a1b1', s);
  chessApplyMove(s, rookMove);
  ok('queenside right lost after a1 rook moves', s.castling.Q === false);
  ok('kingside right intact', s.castling.K === true);
  ok('black queenside right intact', s.castling.q === true);
  ok('black kingside right intact', s.castling.k === true);
  // It is now black's turn, so no white castling move may be generated.
  ok('it is black to move after the rook move', s.turn === 'b');
  ok('no queenside castle available after rook moved', !hasMove(s, 'e1c1'));
  ok('no white castling of any kind while black is to move',
     !hasMove(s, 'e1g1'));

  // King moves: both rights gone for that colour, and only for that colour.
  const s2 = fen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  chessApplyMove(s2, chessUciToMoveObj('e1d1', s2));
  ok('both rights lost after the king moves', !s2.castling.K && !s2.castling.Q);
  ok('black rights untouched when only the white king moves', s2.castling.k && s2.castling.q);

  // Capturing a rook on its home square removes that side's right. The white
  // rook on a1 takes the black rook on a8, so black loses the q-file right
  // only, and keeps the k-file one.
  const s3 = fen('r3k2r/8/8/8/8/8/8/R3K3 w kq - 0 1');
  const takeRook = chessUciToMoveObj('a1a8', s3);
  ok('the rook capture on a8 is legal', !!takeRook);
  chessApplyMove(s3, takeRook);
  ok('black queenside right lost when the a8 rook is captured', s3.castling.q === false);
  ok('black kingside right intact', s3.castling.k === true);

  // A rook returning to its home square does NOT restore the right. White
  // plays a1-b1 (losing the queenside right), black replies with a waiting
  // move, then the rook walks back to a1. The right must stay gone.
  const s4 = fen('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  chessApplyMove(s4, chessUciToMoveObj('a1b1', s4));
  ok('right lost as soon as the rook left a1', s4.castling.Q === false);
  // Black replies so it is white's turn again, which is what makes the
  // rook-walks-back move a legal white move at all.
  chessApplyMove(s4, chessUciToMoveObj('e8e7', s4));
  ok('it is white to move again', s4.turn === 'w');
  const back = chessUciToMoveObj('b1a1', s4);
  ok('the rook can walk back to a1', !!back);
  chessApplyMove(s4, back);
  ok('a rook returning home does not restore castling rights', s4.castling.Q === false);
  // With the queenside right gone, that castling move must not be offered
  // even though every square it needs is empty and unattacked.
  ok('no queenside castle after the rook returned home', !hasMove(s4, 'e1c1'));
  ok('kingside rights untouched throughout', s4.castling.K === true);
}

console.log('=== 12. Perft: move counts must match known values ===');
{
  // Perft is the standard correctness proof for a move generator. These
  // reference numbers are the published values for the initial position.
  function perft(state, depth) {
    if (depth === 0) return 1;
    const moves = chessGenerateLegalMoves(state);
    if (depth === 1) return moves.length;
    let total = 0;
    for (const m of moves) {
      const next = chessCloneState(state);
      chessApplyMove(next, m);
      total += perft(next, depth - 1);
    }
    return total;
  }

  const start = chessInitialState();
  ok('perft(1) from the start = 20', perft(start, 1) === 20, 'got ' + perft(start, 1));
  ok('perft(2) from the start = 400', perft(start, 2) === 400, 'got ' + perft(start, 2));
  ok('perft(3) from the start = 8902', perft(start, 3) === 8902, 'got ' + perft(start, 3));
  ok('perft(4) from the start = 197281', perft(start, 4) === 197281, 'got ' + perft(start, 4));
}

console.log('=== 13. SAN notation ===');
{
  const s = fen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const e4 = chessUciToMoveObj('e2e4', s);
  ok('e4 has no piece prefix', chessMoveToSan(e4, s) === 'e4', chessMoveToSan(e4, s));

  const nf3 = chessUciToMoveObj('g1f3', s);
  ok('Nf3 is written with the piece letter', chessMoveToSan(nf3, s) === 'Nf3', chessMoveToSan(nf3, s));

  // Two white knights on b1 and f2 both reach d3 and d1... use the pair that
  // actually shares a destination: b1 and f3 both reach d2. The knight on f3
  // and the one on b1 both attack d2, so file disambiguation is required.
  const s2 = fen('7k/8/8/8/8/5N2/8/1N5K w - - 0 1');
  const sanList = chessGenerateLegalMoves(s2)
    .filter(m => m.piece.t === 'n' && m.to.r === 6 && m.to.c === 3)
    .map(m => chessMoveToSan(m, s2));
  ok('knight moves to d2 are disambiguated by file',
     sanList.includes('Nbd2') && sanList.includes('Nfd2'), sanList.join(','));

  // Rooks on a1 and h1 both reach d1. Since the rooks are on different
  // files, SAN disambiguates by file, giving Rad1 and Rhd1 - not by rank.
  // (Rank disambiguation is only used when the rooks share a file, which
  // cannot happen here since two same-colour rooks cannot occupy one file.)
  const s5 = fen('8/8/8/7k/8/8/6K1/R6R w - - 0 1');
  const rookSan = chessGenerateLegalMoves(s5)
    .filter(m => m.piece.t === 'r' && m.to.r === 7 && m.to.c === 3)
    .map(m => chessMoveToSan(m, s5).replace(/\+$/, ''));
  ok('rook moves to d1 are disambiguated',
     rookSan.includes('Rad1') && rookSan.includes('Rhd1'), rookSan.join(','));

  // Capture notation. The white rook takes the black rook on d5, so the white
  // rook must be on the SAME rank as d5, i.e. e5. In a FEN the first rank
  // group is rank 8, so rank 5 is the fourth group and both pieces must be
  // written in that one group: 3r4R would be wrong, because the FEN rank
  // group holds one rank only. Use 3rR2 style: black rook d5, white rook e5
  // are adjacent, so the group reads "3rR2" - three empties, r, R, two
  // empties is seven, so it is "3rR3" with three empties after.
  const s3 = fen('4k3/8/8/3rR3/8/8/8/7K w - - 0 1');
  ok('the capture target really holds a black rook',
     s3.board[3][3] && s3.board[3][3].t === 'r' && s3.board[3][3].c === 'b');
  ok('the capturing rook really is on e5', !!s3.board[3][4]);
  const exd5 = chessUciToMoveObj('e5d5', s3);
  ok('the rook capture on d5 is available', !!exd5);
  ok('a capture is marked with x', exd5 && chessMoveToSan(exd5, s3) === 'Rxd5',
     exd5 && chessMoveToSan(exd5, s3));

  // A pawn capture carries the file it came from: exd6, not xd6. The black
  // pawn must be on d6, which is the 6th rank, so the FEN reads 3p4 there.
  const s3b = fen('4k3/8/3p4/4P3/8/8/8/7K w - - 0 2');
  const epCap = chessUciToMoveObj('e5d6', s3b);
  ok('the pawn capture on d6 is available', !!epCap);
  ok('a pawn capture is written with its origin file',
     epCap && chessMoveToSan(epCap, s3b) === 'exd6',
     epCap && chessMoveToSan(epCap, s3b));
  // A plain pawn push carries no file prefix.
  const push = chessUciToMoveObj('e5e6', s3b);
  ok('a pawn push has no file prefix', push && chessMoveToSan(push, s3b) === 'e6',
     push && chessMoveToSan(push, s3b));

  // Castling SAN. Both castles must be legal here, so the kings are kept far
  // apart and no rook or bishop crosses the castling paths.
  const s4 = fen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const oo = chessUciToMoveObj('e1g1', s4);
  const ooo = chessUciToMoveObj('e1c1', s4);
  ok('kingside castling is available', !!oo);
  ok('queenside castling is available', !!ooo);
  ok('kingside castling SAN is O-O', oo && chessMoveToSan(oo, s4) === 'O-O');
  ok('queenside castling SAN is O-O-O', ooo && chessMoveToSan(ooo, s4) === 'O-O-O');

  // Check and mate suffixes.
  const mateFen = 'R6k/7p/7K/8/8/8/8/8 b - - 0 1';
  const s6 = fen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
  const ra8 = chessUciToMoveObj('a1a8', s6);
  ok('a move delivering mate is marked with #', chessMoveToSan(ra8, s6) === 'Ra8#', chessMoveToSan(ra8, s6));
}

console.log('=== 14. Starting position sanity ===');
{
  const s = chessInitialState();
  ok('20 legal opening moves', chessGenerateLegalMoves(s).length === 20);
  ok('neither side starts in check', !chessIsInCheck(s.board, 'w') && !chessIsInCheck(s.board, 'b'));
  const set = uciSet(s);
  ok('knight can move from b1', set.has('b1c3') && set.has('b1a3'));
  ok('pawn can double-move', set.has('e2e4') && set.has('d2d4'));
  ok('pawn cannot move backwards', !set.has('e2e1'));
  ok('no castling at the start of a game', !set.has('e1g1') && !set.has('e1c1'));
}

console.log('');
console.log('PASS: ' + pass + '   FAIL: ' + fail);
if (fail > 0) {
  console.log('');
  console.log('Failures:');
  failures.forEach(f => console.log('  x ' + f));
  process.exit(1);
} else {
  console.log('All chess rules tests passed.');
}
