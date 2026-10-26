// =======================================================
// CHESS QUIZ - COUNTING THE LEGAL MOVES
// =======================================================
//
// The quiz asks, after every move, how many legal moves each side has. A
// legal move that is a blunder does not count: the exercise is to count the
// moves that are actually playable, not to enumerate every geometric
// possibility and then hang a piece on the fifth one.
//
// A blunder here is a move that leaves the mover with a piece the opponent
// can take for material. That is the mistake this quiz is about, and it is
// the one thing about a position that the player counting the moves and this
// code can agree on. The answer is therefore something the player can check
// on the board, rather than a number they have to take on trust.
//
// The test is made with the opponent's LEGAL moves, so a capture that cannot
// be made because of a pin, or because it would expose the opponent's own
// king, is not counted. A capture that wins nothing - trading a knight for a
// knight - is not a blunder either.
//
// The counting itself lives here, away from the DOM, so the same code backs
// the quiz on screen and the tests that check it.
//
// This file must be loaded after chess-core.js: everything below uses the
// rules engine directly.

const CHESS_QUIZ = {
  // The value of a piece, in centipawns. The exchange values are the usual
  // ones, and they are only ever compared with each other.
  VALUES: { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 },
  // What the capture has to be worth before the move counts as a blunder.
  // Half a pawn: a move that throws away a piece is one, and a trade that
  // comes out even is not.
  MIN_GAIN_CP: 50
};

// The value of a piece type.
function chessQuizValue(type) {
  const value = CHESS_QUIZ.VALUES[type];
  return typeof value === 'number' ? value : 0;
}

// The position as the given side sees it: the same board, with that side to
// move.
//
// The side that is not to move in the real game still has a set of legal
// moves, and they are found by asking for them from this position. The board
// is shared, not copied, because the rules engine only ever reads it.
//
// The en passant target is dropped when the turn is flipped. It belongs to
// the side that is to move - it is the square the other side's pawn passed
// over - so a position with the other side to move and that square still
// set describes a capture that cannot happen.
function chessQuizPositionFor(state, side) {
  const sameTurn = side === state.turn;
  return { ...state, turn: side, epTarget: sameTurn ? state.epTarget : null };
}

// The legal moves of one side, counted from that side's point of view.
function chessQuizLegalMoves(state, side) {
  return chessGenerateLegalMoves(chessQuizPositionFor(state, side), side);
}

// The pieces of `color` that the opponent can take for material, as a map
// of square index to what the capture is worth.
//
// The captures are the opponent's legal ones, so a capture that is impossible
// because of a pin or because it would expose the opponent's own king is
// never found.
//
// What a capture is worth depends on whether the piece can be taken back.
// When it can, the attacker has traded its own piece for the victim and the
// difference is what it won. When it cannot, the attacker keeps its piece
// and takes the victim whole. That is the difference between losing a pawn
// to a pawn that can be recaptured, which is a trade, and losing one to a
// pawn that cannot, which is a pawn down.
function chessQuizHangingSquares(state, color) {
  const attacker = color === 'w' ? 'b' : 'w';
  // The opponent's moves are generated from the position with the turn
  // flipped, which is the only way to ask what the opponent could do.
  const flipped = { ...state, turn: attacker };
  const moves = chessGenerateLegalMoves(flipped);
  const hanging = new Map();

  for (const move of moves) {
    const victim = move.captured;
    if (!victim || victim.c !== color) continue;
    // A king cannot be taken, so it can never hang.
    if (victim.t === 'k') continue;

    // An en passant capture takes the pawn on a square the move does not
    // land on, so the square of the victim is not the destination.
    const victimRow = move.isEnPassant ? move.from.r : move.to.r;
    const victimCol = move.to.c;

    const defended = chessIsSquareAttacked(state.board, victimRow, victimCol, color);
    const gain = defended
      ? chessQuizValue(victim.t) - chessQuizValue(move.piece.t)
      : chessQuizValue(victim.t);

    if (gain < CHESS_QUIZ.MIN_GAIN_CP) continue;

    const key = victimRow * 8 + victimCol;
    const best = hanging.get(key);
    if (best === undefined || gain > best) hanging.set(key, gain);
  }

  return hanging;
}

// Is this move a blunder? A blunder leaves the mover with a piece the
// opponent can take for material.
//
// `side` is the colour the move belongs to, which is not always the side to
// move in the position: the quiz counts the moves of the side that is
// waiting as well, and those moves are played from a position where the
// other side is on move.
function chessQuizIsBlunder(stateBefore, move, side) {
  const mover = side || stateBefore.turn;

  // The move is applied to a copy, and the copy is given the mover's turn
  // first, so that the position after the move is the one the rules would
  // produce: the opponent to move.
  const after = chessCloneState(stateBefore);
  after.turn = mover;
  chessApplyMove(after, move);

  const hanging = chessQuizHangingSquares(after, mover);
  return hanging.size > 0;
}

// Splits a side's legal moves into the ones that count and the ones that do
// not.
function chessQuizTally(state, moves, side) {
  const mover = side || state.turn;
  const counted = [];
  const blunders = [];

  for (const move of moves) {
    if (chessQuizIsBlunder(state, move, mover)) blunders.push(move);
    else counted.push(move);
  }

  return {
    count: counted.length,
    counted,
    blunders,
    total: moves.length
  };
}
