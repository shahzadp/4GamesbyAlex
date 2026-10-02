// =======================================================
// CHESS RULES CORE
// =======================================================
//
// A correct, self-contained rules implementation. The previous engine
// generated pseudo-legal moves only: it never checked whether a move left
// its own king in check, so pinned pieces could move freely, the king
// could walk into an attacked square, and the king could be captured
// outright because nothing ever detected check or checkmate.
//
// Everything here is pure board logic with no DOM reference, so the same
// code backs the on-screen board, the FEN serialiser that feeds the
// engine, and the tests.
//
// Board is indexed board[row][col] with row 0 = rank 8 and col 0 = file a,
// which matches both the existing renderer and FEN reading order.
//
// A piece is { t, c, hasMoved } where t is one of
// p n b r q k and c is 'w' or 'b'.

const CHESS_FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function chessSquareName(r, c) {
  return CHESS_FILES[c] + (8 - r);
}

function chessParseSquare(name) {
  if (!name || name.length < 2) return null;
  const c = CHESS_FILES.indexOf(name[0].toLowerCase());
  const rank = parseInt(name[1], 10);
  if (c < 0 || !rank || rank < 1 || rank > 8) return null;
  return { r: 8 - rank, c };
}

// The back rank in the order the existing renderer expects.
const CHESS_BACK_RANK = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

function chessInitialBoard() {
  const board = [];
  for (let r = 0; r < 8; r++) board.push(new Array(8).fill(null));
  for (let c = 0; c < 8; c++) {
    board[0][c] = { t: CHESS_BACK_RANK[c], c: 'b', hasMoved: false };
    board[1][c] = { t: 'p', c: 'b', hasMoved: false };
    board[6][c] = { t: 'p', c: 'w', hasMoved: false };
    board[7][c] = { t: CHESS_BACK_RANK[c], c: 'w', hasMoved: false };
  }
  return board;
}

function chessCloneBoard(board) {
  return board.map(row => row.map(p => (p ? { ...p } : null)));
}

function chessFindKing(board, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.t === 'k' && p.c === color) return { r, c };
    }
  }
  return null;
}

// --- Attack detection -----------------------------------------------------
//
// Deliberately geometric and pawn-direction aware. It ignores whether the
// attacking piece is itself pinned, which is exactly what the rules
// require: a pinned piece still gives check for the purpose of "can the
// king legally move here".

function chessIsSquareAttacked(board, r, c, byColor) {
  // Pawns. A white pawn on row-1 attacks row-2, so to see if (r,c) is
  // attacked by a white pawn we look one row below and one file either side.
  const pawnDir = byColor === 'w' ? -1 : 1;
  const pawnRow = r - pawnDir;
  if (pawnRow >= 0 && pawnRow < 8) {
    for (const dc of [-1, 1]) {
      const pc = c + dc;
      if (pc < 0 || pc > 7) continue;
      const p = board[pawnRow][pc];
      if (p && p.t === 'p' && p.c === byColor) return true;
    }
  }

  // Knights
  for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
    const p = board[nr][nc];
    if (p && p.t === 'n' && p.c === byColor) return true;
  }

  // King, one square in any direction
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
      const p = board[nr][nc];
      if (p && p.t === 'k' && p.c === byColor) return true;
    }
  }

  // Rooks and queens along ranks and files
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const p = board[nr][nc];
      if (p) {
        if (p.c === byColor && (p.t === 'r' || p.t === 'q')) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }

  // Bishops and queens along diagonals
  for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const p = board[nr][nc];
      if (p) {
        if (p.c === byColor && (p.t === 'b' || p.t === 'q')) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }

  return false;
}

function chessIsInCheck(board, color) {
  const king = chessFindKing(board, color);
  if (!king) return false; // king captured: treat as "not in check" so callers stop
  return chessIsSquareAttacked(board, king.r, king.c, color === 'w' ? 'b' : 'w');
}

// --- Move application -----------------------------------------------------
//
// Moves are plain descriptors so the same shape can be generated, filtered,
// applied to a clone for legality testing, and rendered.
//
//   { from:{r,c}, to:{r,c}, piece, captured, isCastle, isEnPassant,
//     isPromotion, promotionPiece }
//
// Chess state that cannot be inferred from the board alone lives alongside
// it: epTarget is the square a pawn may capture onto via en passant, and
// halfmoveClock feeds the FEN fifty-move counter.

function chessInitialState() {
  return {
    board: chessInitialBoard(),
    turn: 'w',
    castling: { K: true, Q: true, k: true, q: true },
    epTarget: null,
    halfmoveClock: 0,
    fullmoveNumber: 1
  };
}

// Applies a move to `state` in place. Callers that need to speculate pass a
// clone made with chessCloneState.
function chessApplyMove(state, move) {
  const { board } = state;
  const piece = board[move.from.r][move.from.c];
  if (!piece) return state;

  let captured = board[move.to.r][move.to.c];

  // En passant removes a pawn that is not on the destination square.
  if (move.isEnPassant) {
    const capRow = move.from.r;
    captured = board[capRow][move.to.c];
    board[capRow][move.to.c] = null;
  }

  if (captured && captured.t === 'r') {
    if (captured.c === 'w') {
      if (move.to.c === 0) state.castling.Q = false;
      if (move.to.c === 7) state.castling.K = false;
    } else {
      if (move.to.c === 0) state.castling.q = false;
      if (move.to.c === 7) state.castling.k = false;
    }
  }

  // Castling moves the rook alongside the king.
  if (move.isCastle) {
    const row = move.from.r;
    if (move.to.c === 6) {
      const rook = board[row][7];
      board[row][7] = null;
      board[row][5] = rook ? { ...rook, hasMoved: true } : null;
    } else if (move.to.c === 2) {
      const rook = board[row][0];
      board[row][0] = null;
      board[row][3] = rook ? { ...rook, hasMoved: true } : null;
    }
  }

  board[move.from.r][move.from.c] = null;
  const placed = { ...piece, hasMoved: true };
  if (move.isPromotion) placed.t = move.promotionPiece || 'q';
  board[move.to.r][move.to.c] = placed;

  // A rook that has just been moved loses castling rights for its side.
  if (piece.t === 'r') {
    if (piece.c === 'w') {
      if (move.from.c === 0) state.castling.Q = false;
      if (move.from.c === 7) state.castling.K = false;
    } else {
      if (move.from.c === 0) state.castling.q = false;
      if (move.from.c === 7) state.castling.k = false;
    }
  }
  // Likewise a king that moves, whether or not it was castling.
  if (piece.t === 'k') {
    if (piece.c === 'w') { state.castling.K = false; state.castling.Q = false; }
    else { state.castling.k = false; state.castling.q = false; }
  }

  // Set the en passant target only when a pawn just made a two-square push.
  // It is recorded regardless of whether a capture is available, which is
  // what FEN requires and what engines expect.
  const dir = piece.c === 'w' ? -1 : 1;
  state.epTarget = null;
  if (piece.t === 'p' && Math.abs(move.to.r - move.from.r) === 2) {
    state.epTarget = { r: move.from.r + dir, c: move.from.c };
  }

  if (piece.t === 'p' || captured) state.halfmoveClock = 0;
  else state.halfmoveClock++;

  if (piece.c === 'b') state.fullmoveNumber++;
  state.turn = state.turn === 'w' ? 'b' : 'w';

  return state;
}

function chessCloneState(state) {
  return {
    board: chessCloneBoard(state.board),
    turn: state.turn,
    castling: { ...state.castling },
    epTarget: state.epTarget ? { ...state.epTarget } : null,
    halfmoveClock: state.halfmoveClock,
    fullmoveNumber: state.fullmoveNumber
  };
}

// --- Move generation ------------------------------------------------------

// Pseudo-legal moves: geometry only. Every one of these is filtered through
// chessIsLegalMove before it can be shown to the player or sent to a test.
function chessGeneratePseudoMoves(state) {
  const { board, turn } = state;
  const moves = [];
  const enemy = turn === 'w' ? 'b' : 'w';

  const push = (from, to, extra) => {
    moves.push({
      from: { ...from },
      to: { ...to },
      piece: board[from.r][from.c],
      captured: board[to.r][to.c],
      isCastle: false,
      isEnPassant: false,
      isPromotion: false,
      promotionPiece: null,
      ...extra
    });
  };

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece || piece.c !== turn) continue;

      if (piece.t === 'p') {
        const dir = piece.c === 'w' ? -1 : 1;
        const startRow = piece.c === 'w' ? 6 : 1;
        const promoRow = piece.c === 'w' ? 0 : 7;
        const one = { r: r + dir, c };

        // Push
        if (one.r >= 0 && one.r < 8 && !board[one.r][c]) {
          if (one.r === promoRow) {
            for (const promo of ['q', 'r', 'b', 'n']) {
              push({ r, c }, one, { isPromotion: true, promotionPiece: promo });
            }
          } else {
            push({ r, c }, one);
            // Two-square push from the starting rank
            const two = { r: r + 2 * dir, c };
            if (r === startRow && !board[two.r][c]) push({ r, c }, two);
          }
        }

        // Captures, including en passant onto the recorded target square.
        for (const dc of [-1, 1]) {
          const nc = c + dc;
          if (nc < 0 || nc > 7 || one.r < 0 || one.r > 7) continue;
          const target = board[one.r][nc];
          if (target && target.c === enemy) {
            if (one.r === promoRow) {
              for (const promo of ['q', 'r', 'b', 'n']) {
                push({ r, c }, { r: one.r, c: nc }, { isPromotion: true, promotionPiece: promo });
              }
            } else {
              push({ r, c }, { r: one.r, c: nc });
            }
          } else if (!target && state.epTarget &&
                     state.epTarget.r === one.r && state.epTarget.c === nc) {
            // The recorded target square alone is not enough. En passant is
            // only possible if the enemy pawn that just double-stepped is
            // actually standing beside the capturing pawn. Without this check
            // a stale or hand-written epTarget manufactures a phantom capture
            // out of an ordinary pawn push onto an empty square.
            const beside = board[r][nc];
            if (beside && beside.t === 'p' && beside.c === enemy) {
              push({ r, c }, { r: one.r, c: nc }, { isEnPassant: true });
            }
          }
        }
      }

      if (piece.t === 'n') {
        for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
          const dest = board[nr][nc];
          if (!dest) push({ r, c }, { r: nr, c: nc });
          else if (dest.c === enemy) push({ r, c }, { r: nr, c: nc });
        }
      }

      if (piece.t === 'b' || piece.t === 'q') {
        for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          let nr = r + dr, nc = c + dc;
          while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const dest = board[nr][nc];
            if (!dest) push({ r, c }, { r: nr, c: nc });
            else { if (dest.c === enemy) push({ r, c }, { r: nr, c: nc }); break; }
            nr += dr; nc += dc;
          }
        }
      }

      if (piece.t === 'r' || piece.t === 'q') {
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          let nr = r + dr, nc = c + dc;
          while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const dest = board[nr][nc];
            if (!dest) push({ r, c }, { r: nr, c: nc });
            else { if (dest.c === enemy) push({ r, c }, { r: nr, c: nc }); break; }
            nr += dr; nc += dc;
          }
        }
      }

      if (piece.t === 'k') {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
            const dest = board[nr][nc];
            if (!dest) push({ r, c }, { r: nr, c: nc });
            else if (dest.c === enemy) push({ r, c }, { r: nr, c: nc });
          }
        }

        // Castling. Rights, occupancy and the empty squares between are
        // checked here; whether the king is in check or passes through an
        // attacked square is checked in chessIsLegalMove, since that needs
        // the board with the king removed.
        const homeRow = piece.c === 'w' ? 7 : 0;
        const kingRight = piece.c === 'w' ? 'K' : 'k';
        const queenRight = piece.c === 'w' ? 'Q' : 'q';
        if (r === homeRow && !piece.hasMoved) {
          if (state.castling[kingRight] &&
              !board[r][5] && !board[r][6] &&
              board[r][7] && board[r][7].t === 'r' && board[r][7].c === piece.c) {
            push({ r, c }, { r, c: 6 }, { isCastle: true });
          }
          if (state.castling[queenRight] &&
              !board[r][1] && !board[r][2] && !board[r][3] &&
              board[r][0] && board[r][0].t === 'r' && board[r][0].c === piece.c) {
            push({ r, c }, { r, c: 2 }, { isCastle: true });
          }
        }
      }
    }
  }

  return moves;
}

// A move is legal only if, after making it, our own king is not attacked.
// This is what filters out pins and king moves into check.
//
// Castling needs two extra tests that this "is the king safe afterwards"
// check cannot make, because both depend on where the king came from and
// that information is gone once the move has been applied:
//   - the king may not be in check at the start of the move, and
//   - the king may not pass through an attacked square.
// Without these, castling out of check and castling through check are both
// offered as legal, which is exactly the class of illegal move this engine
// previously allowed.
function chessIsLegalMove(state, move) {
  const opponent = state.turn === 'w' ? 'b' : 'w';

  if (move.isCastle) {
    if (chessIsInCheck(state.board, state.turn)) return false;
    // Every square the king travels over must be unattacked, not just the one
    // it lands on. Kingside travels e1-f1-g1, so f1 must be safe. Queenside
    // travels e1-d1-c1, so BOTH d1 and c1 must be safe - the king does pass
    // through d1, and it also lands on c1. Checking only d1 (the square
    // between start and destination) let queenside castling through an
    // attacked b1 or an attacked c1 slip through as legal.
    const row = move.from.r;
    const path = move.to.c === 6
      ? [{ r: row, c: 5 }, { r: row, c: 6 }]
      : [{ r: row, c: 3 }, { r: row, c: 2 }];
    for (const sq of path) {
      if (chessIsSquareAttacked(state.board, sq.r, sq.c, opponent)) return false;
    }
  }

  const probe = chessCloneState(state);
  chessApplyMove(probe, move);
  return !chessIsInCheck(probe.board, state.turn);
}

function chessGenerateLegalMoves(state, color) {
  const side = color || state.turn;
  const scoped = side === state.turn ? state : { ...state, turn: side };
  return chessGeneratePseudoMoves(scoped).filter(m => chessIsLegalMove(scoped, m));
}

function chessHasLegalMoves(state) {
  return chessGenerateLegalMoves(state).length > 0;
}

function chessGameStatus(state) {
  if (chessIsInCheck(state.board, state.turn)) {
    return chessHasLegalMoves(state) ? 'check' : 'checkmate';
  }
  return chessHasLegalMoves(state) ? 'ongoing' : 'stalemate';
}

// --- FEN ------------------------------------------------------------------

// Produces a FEN string an engine will accept. This is the only channel the
// Stockfish bot uses, so it must be exactly right.
function chessToFen(state) {
  const { board, turn, castling, epTarget, halfmoveClock, fullmoveNumber } = state;

  let placement = '';
  for (let r = 0; r < 8; r++) {
    let run = 0;
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) { run++; continue; }
      if (run) { placement += run; run = 0; }
      const upper = p.t.toUpperCase();
      placement += p.c === 'w' ? upper : upper.toLowerCase();
    }
    if (run) placement += run;
    if (r < 7) placement += '/';
  }

  let rights = '';
  if (castling.K) rights += 'K';
  if (castling.Q) rights += 'Q';
  if (castling.k) rights += 'k';
  if (castling.q) rights += 'q';
  if (!rights) rights = '-';

  const ep = epTarget ? chessSquareName(epTarget.r, epTarget.c) : '-';

  return [placement, turn, rights, ep, halfmoveClock, fullmoveNumber].join(' ');
}

// Accepts a FEN from the engine, so the bot can adopt the position the engine
// reports rather than assuming the client's board is authoritative.
function chessFromFen(fen) {
  const parts = String(fen).trim().split(/\s+/);
  if (parts.length < 4) return null;

  const rows = parts[0].split('/');
  if (rows.length !== 8) return null;

  const board = [];
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (const ch of rows[r]) {
      if (ch >= '1' && ch <= '8') {
        for (let i = 0; i < parseInt(ch, 10); i++) row.push(null);
      } else {
        const lower = ch.toLowerCase();
        if (!'pnbrqk'.includes(lower)) return null;
        row.push({ t: lower, c: ch === lower ? 'b' : 'w', hasMoved: true });
      }
    }
    if (row.length !== 8) return null;
    board.push(row);
  }

  const state = {
    board,
    turn: parts[1] === 'b' ? 'b' : 'w',
    castling: { K: false, Q: false, k: false, q: false },
    epTarget: null,
    halfmoveClock: parseInt(parts[4], 10) || 0,
    fullmoveNumber: parseInt(parts[5], 10) || 1
  };

  if (parts[2] !== '-') {
    for (const ch of parts[2]) {
      if ('KQkq'.includes(ch)) state.castling[ch] = true;
    }
  }

  if (parts[3] !== '-') {
    const sq = chessParseSquare(parts[3]);
    if (sq) state.epTarget = sq;
  }

  // Castling rights are only meaningful if the king and rook are actually
  // home, so recompute hasMoved to match the rights we were handed.
  for (let c = 0; c < 8; c++) {
    const bk = board[0][c], wk = board[7][c];
    if (bk && bk.t === 'k') {
      board[0][c] = { ...bk, hasMoved: !(state.castling.k || state.castling.q) };
    }
    if (wk && wk.t === 'k') {
      board[7][c] = { ...wk, hasMoved: !(state.castling.K || state.castling.Q) };
    }
  }
  const br = board[0][7], wr = board[7][7];
  if (br && br.t === 'r') board[0][7] = { ...br, hasMoved: !state.castling.k };
  if (wr && wr.t === 'r') board[7][7] = { ...wr, hasMoved: !state.castling.K };
  const bq = board[0][0], wq = board[7][0];
  if (bq && bq.t === 'r') board[0][0] = { ...bq, hasMoved: !state.castling.q };
  if (wq && wq.t === 'r') board[7][0] = { ...wq, hasMoved: !state.castling.Q };

  return state;
}

// --- Move notation for UCI ------------------------------------------------

// UCI needs algebraic coordinates, which is also what we show in the move
// log, so one function serves both.
function chessMoveToUci(move) {
  const from = chessSquareName(move.from.r, move.from.c);
  const to = chessSquareName(move.to.r, move.to.c);
  const promo = move.isPromotion ? (move.promotionPiece || 'q') : '';
  return from + to + promo;
}

function chessUciToMoveObj(uci, state) {
  if (!uci || uci.length < 4) return null;
  const from = chessParseSquare(uci.slice(0, 2));
  const to = chessParseSquare(uci.slice(2, 4));
  if (!from || !to) return null;
  const promoChar = uci.length > 4 ? uci[4] : '';

  const candidates = chessGenerateLegalMoves(state).filter(
    m => m.from.r === from.r && m.from.c === from.c &&
         m.to.r === to.r && m.to.c === to.c
  );
  if (candidates.length === 0) return null;

  if (promoChar) {
    const match = candidates.find(m => m.isPromotion && m.promotionPiece === promoChar);
    if (match) return match;
  }

  // A pawn capturing onto the en passant square is ambiguous by destination
  // alone: the same from/to pair also describes an ordinary capture whenever
  // an enemy piece happens to sit on the target square. UCI carries no flag
  // for it, so prefer the en passant reading when one is legal, because a
  // normal capture would also have been legal and is the rarer intent when
  // the target square is empty. Checking emptiness first keeps this from
  // stealing a real capture.
  const target = state.board[to.r][to.c];
  if (!target) {
    const ep = candidates.find(m => m.isEnPassant);
    if (ep) return ep;
  }

  // Prefer a queen promotion when the engine omitted the suffix.
  return candidates.find(m => m.isPromotion) || candidates[0];
}

// --- Move notation for the log -------------------------------------------

function chessMoveToSan(move, stateBefore) {
  const piece = move.piece;
  const isPawn = piece.t === 'p';
  // Start from an empty string. Starting undefined would make the first
  // string concatenation produce "undefinede4" for a plain pawn push, since a
  // pawn has no piece letter to seed the value.
  let san = '';

  if (move.isCastle) {
    san = move.to.c === 6 ? 'O-O' : 'O-O-O';
  } else {
    // Disambiguation: when two of the same piece can legally reach the
    // target, include the file, and the rank too if the files collide.
    const rivals = chessGenerateLegalMoves(stateBefore).filter(
      m => m.piece.t === piece.t && m.piece.c === piece.c &&
           m.to.r === move.to.r && m.to.c === move.to.c &&
           (m.from.r !== move.from.r || m.from.c !== move.from.c)
    );

    if (!isPawn) {
      san += piece.t.toUpperCase();
      if (rivals.length) {
        const sameFile = rivals.some(m => m.from.c === move.from.c);
        san += sameFile ? String(8 - move.from.r) : CHESS_FILES[move.from.c];
      }
    } else if (move.captured || move.isEnPassant) {
      // A pawn capture is written with the file it came from, e.g. "exd5".
      // A plain pawn push has no letter at all ("e4"). Checking the capture
      // here rather than adding the file for every pawn move is what keeps
      // pawn pushes from coming out as "ee4".
      san += CHESS_FILES[move.from.c];
    }

    if (move.captured || move.isEnPassant) san += 'x';
    san += chessSquareName(move.to.r, move.to.c);
    if (move.isPromotion) san += '=' + (move.promotionPiece || 'q').toUpperCase();
  }

  const after = chessCloneState(stateBefore);
  chessApplyMove(after, move);
  if (chessIsInCheck(after.board, after.turn)) {
    san += chessHasLegalMoves(after) ? '+' : '#';
  }
  return san;
}
