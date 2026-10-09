// Replays every line in chess-openings.js through the rules engine.
//
// The opening book is hand-written SAN, so it is the one part of the app
// where a typo silently becomes a broken match: an illegal line would leave
// the board in a position the engines disagree with, and a line that is one
// token out of step would quietly hand a castling token to the wrong side.
// Run this after touching the book or the SAN parser:
//
//   node tools/check-openings.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const assets = path.join(__dirname, '..', 'app', 'src', 'main', 'assets');
const ctx = {};
vm.createContext(ctx);
for (const file of ['chess-core.js', 'chess-openings.js']) {
  vm.runInContext(fs.readFileSync(path.join(assets, file), 'utf8'), ctx, { filename: file });
}

// `const` declarations live in the script's lexical scope rather than on the
// context object, so they have to be read back by evaluating an expression.
const G = name => vm.runInContext(name, ctx);
const CHESS_OPENINGS = G('CHESS_OPENINGS');
const chessSanToMove = G('chessSanToMove');
const chessInitialState = G('chessInitialState');
const chessApplyMove = G('chessApplyMove');
const chessToFen = G('chessToFen');
const chessToUci = G('chessMoveToUci');
const chessSanOf = G('chessMoveToSan');
const chessFromFen = G('chessFromFen');
const chessSearch = G('chessSearchOpenings');

let failures = 0;
let checked = 0;

function fail(message) {
  console.log('FAIL ' + message);
  failures++;
}

// --- Every book line ------------------------------------------------------
for (const entry of CHESS_OPENINGS) {
  let state = chessInitialState();
  let ply = 0;
  let ok = true;

  for (const san of entry.moves) {
    const sideToMove = state.turn;
    const move = chessSanToMove(state, san);

    if (!move) {
      fail(`${entry.eco} ${entry.name}: "${san}" is not a unique legal move at ply ${ply + 1}`);
      fail(`     position: ${chessToFen(state)}`);
      ok = false;
      break;
    }

    // The parser has to agree with the rules about whose move this is. Both
    // kings castle to the same files, so a misaligned token would otherwise
    // become the other side's castling move and go unnoticed.
    if (move.piece.c !== sideToMove) {
      fail(`${entry.eco} ${entry.name}: "${san}" produced a move for ${move.piece.c} when ${sideToMove} was to move`);
      ok = false;
      break;
    }

    // The notation in the book has to be the canonical notation, decorations
    // included: a stray "+" or a missing capture mark would be copied straight
    // into the saved PGN.
    const canonical = chessSanOf(move, state);
    if (canonical !== san) {
      fail(`${entry.eco} ${entry.name}: ply ${ply + 1} is written "${san}" but should be "${canonical}"`);
      ok = false;
      break;
    }

    chessApplyMove(state, move);
    ply++;
    checked++;
  }

  if (ok && ply !== entry.moves.length) {
    fail(`${entry.eco} ${entry.name}: only ${ply}/${entry.moves.length} moves replayed`);
  }
}

// --- Parser tolerance for real-world notation ------------------------------
// The book is written in clean notation, but imported games and hand-typed
// input are not, so the parser has to absorb the decoration. Fixtures are
// given as FEN rather than move sequences because "the side to move" is
// exactly what these cases are about, and a move list makes that easy to get
// subtly wrong.
// Fixtures are FENs, where the first rank field is rank 8 and the side to
// move is whoever is named. Note that a black pawn promotes on rank *one* -
// getting that backwards is easy and produces a pawn that can never promote.
const KINGS_AND_ROOKS = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';
const WHITE_CASTLED = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R4RK1 w kq - 0 1';
// Knights on c3 and g3, both of which reach e2.
const TWO_KNIGHTS = '4k3/8/8/8/8/2N3N1/8/4K3 w - - 0 1';
// Knight on c4, black pawn on e5: a knight's move away, and the only piece
// that can take it.
const CAPTURE_ON_E5 = 'rnbqkbnr/pppppp1p/8/4p3/2N5/8/PPPPPPPP/R1BQKBNR w KQkq - 0 1';
const BLACK_PROMOTES = '4k3/8/8/8/8/8/1p6/4K3 b - - 0 1';
const WHITE_PROMOTES = '4K3/1P6/8/8/8/8/8/4k3 w - - 0 1';
const EN_PASSANT_READY = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2';
const KNIGHT_ON_G1 = '4k3/8/8/8/8/8/8/4K1N1 w - - 0 1';

const tolerance = [
  // Castling, in every spelling it turns up in. Both kings reach the same two
  // files, so these also pin down that the side to move is honoured.
  { fen: KINGS_AND_ROOKS, token: 'O-O', uci: 'e1g1' },
  { fen: KINGS_AND_ROOKS, token: '0-0', uci: 'e1g1' },
  { fen: KINGS_AND_ROOKS, token: 'o-o', uci: 'e1g1' },
  { fen: KINGS_AND_ROOKS, token: 'O-O+', uci: 'e1g1' },
  { fen: KINGS_AND_ROOKS, token: '  O-O  ', uci: 'e1g1' },
  { fen: KINGS_AND_ROOKS, token: 'O-O-O', uci: 'e1c1' },
  // Already castled, so there is no second castle to find.
  { fen: WHITE_CASTLED, token: 'O-O', uci: null },
  { fen: WHITE_CASTLED, token: 'O-O-O', uci: null },

  // Annotation noise.
  { fen: KNIGHT_ON_G1, token: 'Nf3?!', uci: 'g1f3' },
  { fen: KNIGHT_ON_G1, token: 'Nf3$14', uci: 'g1f3' },
  { fen: KNIGHT_ON_G1, token: 'Nf3!', uci: 'g1f3' },

  // Ambiguity is refused rather than guessed at, and either hint resolves it.
  { fen: TWO_KNIGHTS, token: 'Ne2', uci: null },
  { fen: TWO_KNIGHTS, token: 'Nce2', uci: 'c3e2' },
  { fen: TWO_KNIGHTS, token: 'Nge2', uci: 'g3e2' },

  // A capture marker is honoured when present, tolerated when missing, and
  // never invents a capture that is not there.
  { fen: CAPTURE_ON_E5, token: 'Nxe5', uci: 'c4e5' },
  { fen: CAPTURE_ON_E5, token: 'Ne5', uci: 'c4e5' },
  { fen: CAPTURE_ON_E5, token: 'Nxf5', uci: null },

  // Promotion, including the trailing check mark that used to defeat the
  // "=Q at the end of the string" pattern.
  { fen: BLACK_PROMOTES, token: 'b1=Q+', uci: 'b2b1q' },
  { fen: BLACK_PROMOTES, token: 'b1=Q', uci: 'b2b1q' },
  { fen: BLACK_PROMOTES, token: 'b1Q', uci: null },
  { fen: WHITE_PROMOTES, token: 'b8=N', uci: 'b7b8n' },

  // En passant, with and without the "e.p." suffix.
  { fen: EN_PASSANT_READY, token: 'exd6', uci: 'e5d6' },
  { fen: EN_PASSANT_READY, token: 'exd6 e.p.', uci: 'e5d6' },
  { fen: EN_PASSANT_READY, token: 'ed6', uci: 'e5d6' }
];

for (const t of tolerance) {
  const state = chessFromFen(t.fen);
  if (!state) {
    fail(`tolerance fixture FEN does not load: ${t.fen}`);
    continue;
  }
  const move = chessSanToMove(state, t.token);
  const got = move ? chessToUci(move) : null;
  if (got !== t.uci) {
    fail(`tolerance: "${t.token}" in ${t.fen} parsed to ${got}, expected ${t.uci}`);
  }
}

// --- Search ----------------------------------------------------------------
const searchCases = [
  ['dragon', 'Sicilian Defense: Dragon Variation'],
  ['grunfeld', 'Grünfeld Defense'],
  ['najdorf', 'Sicilian Defense: Najdorf Variation'],
  ['queens indian', 'Queen\'s Indian Defense'],
  ['nimzo larsen', 'Nimzo-Larsen Attack'],
  ['nimzo-larsen', 'Nimzo-Larsen Attack'],
  ['kings indian', 'King\'s Indian Defense'],
  ['kings indian attack', 'King\'s Indian Attack'],
  ['kings fianchetto', 'King\'s Fianchetto Opening'],
  ['catalan', 'Catalan Opening'],
  ['english', 'English Opening'],
  ['b76', 'Sicilian Defense: Dragon, Yugoslav Attack'],
  ['e4 c5', 'Sicilian Defense'],
  ['e4c5', 'Sicilian Defense'],
  ['nxe4', 'Caro-Kann Defense: Classical Variation']
];

for (const [query, expected] of searchCases) {
  const hits = chessSearch(query).map(h => h.entry.name);
  if (!hits.includes(expected)) {
    fail(`search "${query}" did not find "${expected}" (got: ${hits.slice(0, 4).join(' | ')})`);
  }
}

// Relevance: the opening somebody actually asked for has to be first, not
// merely present somewhere in the list.
const ranked = [
  ['dragon', 'Sicilian Defense: Dragon Variation'],
  ['kings fianchetto', 'King\'s Fianchetto Opening'],
  ['grunfeld', 'Grünfeld Defense'],
  ['sicilian', 'Sicilian Defense'],
  ['nimzo indian', 'Nimzo-Indian Defense'],
  ['queens gambit', 'Queen\'s Gambit'],
  ['english', 'English Opening'],
  ['catalan', 'Catalan Opening'],
  ['b90', 'Sicilian Defense: Najdorf Variation']
];

for (const [query, expected] of ranked) {
  const first = chessSearch(query)[0];
  if (!first || first.entry.name !== expected) {
    fail(`search "${query}" ranked "${first ? first.entry.name : 'nothing'}" first, expected "${expected}"`);
  }
}

// Accents must not be required: "grunfeld" and "nimzo-larsen" are how people
// type these, and neither spells the umlaut.
for (const [ascii, accented] of [['grunfeld', 'Grünfeld Defense'], ['nimzo-larsen', 'Nimzo-Larsen Attack']]) {
  const names = chessSearch(ascii).map(h => h.entry.name);
  if (!names.includes(accented)) fail(`search "${ascii}" did not find "${accented}"`);
}

if (chessSearch('').length !== CHESS_OPENINGS.length) {
  fail('an empty search should return the whole book');
}

console.log(`\n${checked} book moves over ${CHESS_OPENINGS.length} openings, ` +
            `${tolerance.length} parser cases, ${searchCases.length} search cases. ` +
            `${failures} failure(s).`);
process.exit(failures ? 1 : 0);