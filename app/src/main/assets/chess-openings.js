// =======================================================
// OPENING DATABASE + EXPLORER SEARCH
// =======================================================
//
// A small, hand-checked opening book for the 2x Stockfish match. Each entry
// is a name, an ECO code, and a principal line written in SAN. The controller
// replays the line from the starting position, so an entry has to be a
// genuinely legal sequence - there is a test in tools/ that replays every line
// through the rules engine and fails if one does not.
//
// Lines are deliberately short (typically 3-10 plies). A long line would not
// make a better match, it would just move the decision from the engines to
// whoever typed the book, and every extra ply is one more chance for the
// engines to reach an uninteresting position.
//
// Search matches against name, ECO, the SAN of the line and an optional alias
// list, so "dragon", "b97", "nxe4 c5" and "sicilian" all find their way in.

const CHESS_OPENINGS = [
  // --- 1.e4 e5 family ---------------------------------------------------
  { eco: 'B00', name: 'King\'s Pawn Opening', moves: ['e4'], alias: ['kings pawn', 'king pawn'] },
  { eco: 'C20', name: 'Open Game', moves: ['e4', 'e5'], alias: ['open game'] },
  { eco: 'C44', name: 'King\'s Pawn Game: Tayler Opening', moves: ['e4', 'e5', 'Nf3', 'd6'], alias: ['tayler'] },
  { eco: 'C60', name: 'Ruy Lopez', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], alias: ['spanish', 'sp gambit'] },
  { eco: 'C77', name: 'Ruy Lopez: Morphy Defence', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'], alias: ['morphy', 'spanish', 'defence'] },
  { eco: 'C67', name: 'Ruy Lopez: Berlin Defence', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'], alias: ['berlin', 'spanish'] },
  { eco: 'C68', name: 'Ruy Lopez: Exchange Variation', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6'], alias: ['exchange', 'spanish'] },
  { eco: 'C64', name: 'Ruy Lopez: Classical Defence', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Bc5'], alias: ['spanish', 'classical'] },

  // --- Sicilian ---------------------------------------------------------
  { eco: 'B20', name: 'Sicilian Defense', moves: ['e4', 'c5'], alias: ['sicilian', 'defence'] },
  { eco: 'B21', name: 'Sicilian Defense: Smith-Morra Gambit', moves: ['e4', 'c5', 'd4', 'cxd4', 'c3'], alias: ['smith morra', 'sicilian'] },
  { eco: 'B22', name: 'Sicilian Defense: Alapin Variation', moves: ['e4', 'c5', 'c3'], alias: ['alapin', 'sicilian'] },
  { eco: 'B23', name: 'Sicilian Defense: Closed', moves: ['e4', 'c5', 'Nc3'], alias: ['closed sicilian', 'sicilian'] },
  { eco: 'B27', name: 'Sicilian Defense: Hyperaccelerated Dragon', moves: ['e4', 'c5', 'Nf3', 'g6'], alias: ['hyper dragon', 'sicilian'] },
  { eco: 'B30', name: 'Sicilian Defense: Old Sicilian', moves: ['e4', 'c5', 'Nf3', 'Nc6'], alias: ['old sicilian'] },
  { eco: 'B33', name: 'Sicilian Defense: Four Knights', moves: ['e4', 'c5', 'Nf3', 'Nc6', 'Nc3', 'Nf6'], alias: ['four knights', 'sicilian'] },
  { eco: 'B36', name: 'Sicilian Defense: Rossolimo Variation', moves: ['e4', 'c5', 'Nf3', 'Nc6', 'Bb5'], alias: ['rossolimo', 'sicilian'] },
  { eco: 'B44', name: 'Sicilian Defense: Taimanov Variation', moves: ['e4', 'c5', 'Nf3', 'e6'], alias: ['taimanov', 'sicilian'] },
  { eco: 'B50', name: 'Sicilian Defense: Modern Variations', moves: ['e4', 'c5', 'Nf3', 'd6'], alias: ['sicilian', 'modern'] },
  { eco: 'B54', name: 'Sicilian Defense: Open', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4'], alias: ['open sicilian', 'sicilian'] },
  { eco: 'B70', name: 'Sicilian Defense: Dragon Variation', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'], alias: ['dragon', 'sicilian', 'yugoslav'] },
  { eco: 'B76', name: 'Sicilian Defense: Dragon, Yugoslav Attack', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6', 'Be3', 'Bg7', 'f3'], alias: ['dragon', 'yugoslav attack'] },
  { eco: 'B90', name: 'Sicilian Defense: Najdorf Variation', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'], alias: ['najdorf', 'sicilian'] },
  { eco: 'B96', name: 'Sicilian Defense: Najdorf, Opocensky', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be2'], alias: ['najdorf', 'opocensky'] },

  // --- French / Caro-Kann ------------------------------------------------
  { eco: 'C00', name: 'French Defense', moves: ['e4', 'e6'], alias: ['french', 'defence'] },
  { eco: 'C01', name: 'French Defense: Exchange Variation', moves: ['e4', 'e6', 'd4', 'd5', 'exd5', 'exd5'], alias: ['french', 'exchange'] },
  { eco: 'C02', name: 'French Defense: Advance Variation', moves: ['e4', 'e6', 'd4', 'd5', 'e5'], alias: ['french', 'advance'] },
  { eco: 'C03', name: 'French Defense: Tarrasch Variation', moves: ['e4', 'e6', 'd4', 'd5', 'Nd2'], alias: ['french', 'tarrasch'] },
  { eco: 'C11', name: 'French Defense: Classical Variation', moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6'], alias: ['french', 'classical', 'winawer line'] },
  { eco: 'C15', name: 'French Defense: Winawer Variation', moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4'], alias: ['french', 'winawer'] },
  { eco: 'B10', name: 'Caro-Kann Defense', moves: ['e4', 'c6'], alias: ['caro kann', 'defence'] },
  { eco: 'B12', name: 'Caro-Kann Defense: Advance Variation', moves: ['e4', 'c6', 'd4', 'd5', 'e5'], alias: ['caro kann', 'advance'] },
  { eco: 'B13', name: 'Caro-Kann Defense: Exchange Variation', moves: ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5'], alias: ['caro kann', 'exchange'] },
  { eco: 'B18', name: 'Caro-Kann Defense: Classical Variation', moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5'], alias: ['caro kann', 'classical'] },
  { eco: 'B01', name: 'Caro-Kann Defense: Panov Attack', moves: ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'c4'], alias: ['caro kann', 'panov'] },

  // --- English ----------------------------------------------------------
  { eco: 'A10', name: 'English Opening', moves: ['c4'], alias: ['english', 'four knights'] },
  { eco: 'A20', name: 'English Opening: King\'s English Variation', moves: ['c4', 'e5'], alias: ['english', 'kings english'] },
  { eco: 'A25', name: 'English Opening: Closed System', moves: ['c4', 'e5', 'Nc3', 'Nc6', 'g3', 'g6', 'Bg2', 'Bg7', 'd3', 'd6'], alias: ['english', 'closed'] },
  { eco: 'A30', name: 'English Opening: Symmetrical Variation', moves: ['c4', 'c5'], alias: ['english', 'symmetrical'] },
  { eco: 'A34', name: 'English Opening: Symmetrical, Three Knights', moves: ['c4', 'c5', 'Nf3', 'Nf6', 'Nc3', 'Nc6'], alias: ['english', 'symmetrical'] },
  { eco: 'A43', name: 'English Opening: Botvinnik System', moves: ['c4', 'e6', 'Nf3', 'f5', 'g3'], alias: ['english', 'botvinnik'] },
  { eco: 'A50', name: 'English Opening: Agincourt Defense', moves: ['c4', 'e6'], alias: ['english', 'agincourt'] },
  { eco: 'A80', name: 'English Opening: Reverse Sicilian', moves: ['c4', 'e5', 'Nf3', 'Nc6'], alias: ['english', 'reverse sicilian'] },

  // --- 1.d4 d5 family ---------------------------------------------------
  { eco: 'D00', name: 'Queen\'s Pawn Game', moves: ['d4', 'd5'], alias: ['queens pawn', 'd4'] },
  { eco: 'D06', name: 'Queen\'s Gambit', moves: ['d4', 'd5', 'c4'], alias: ['queens gambit'] },
  { eco: 'D20', name: 'Queen\'s Gambit Accepted', moves: ['d4', 'd5', 'c4', 'dxc4'], alias: ['queens gambit accepted'] },
  { eco: 'D30', name: 'Queen\'s Gambit Declined', moves: ['d4', 'd5', 'c4', 'e6'], alias: ['qgd', 'queens gambit declined'] },
  { eco: 'D37', name: 'Queen\'s Gambit Declined: Four Knights', moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Nf3'], alias: ['qgd', 'four knights'] },
  { eco: 'D10', name: 'Slav Defense', moves: ['d4', 'd5', 'c4', 'c6'], alias: ['slav', 'defence'] },
  { eco: 'D15', name: 'Slav Defense: Three Knights', moves: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3'], alias: ['slav', 'three knights'] },

  // --- Indian defences ---------------------------------------------------
  { eco: 'E00', name: 'Indian Game: Anti-Nimzo-Indian', moves: ['d4', 'Nf6', 'c4', 'e6'], alias: ['indian', 'anti nimzo'] },
  { eco: 'E20', name: 'Nimzo-Indian Defense', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], alias: ['nimzo', 'nimzo indian', 'defence'] },
  { eco: 'E32', name: 'Nimzo-Indian Defense: Classical Variation', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'Qc2'], alias: ['nimzo', 'classical'] },
  { eco: 'E20', name: 'Nimzo-Indian Defense: Sämisch Variation', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'a3', 'Bxc3+', 'bxc3'], alias: ['nimzo', 'samisch'] },
  { eco: 'E60', name: 'King\'s Indian Defense', moves: ['d4', 'Nf6', 'c4', 'g6'], alias: ['kings indian', 'kid', 'defence'] },
  { eco: 'E61', name: 'King\'s Indian Defense: Semi-Classical Variation', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'Nf3'], alias: ['kid', 'kings indian'] },
  { eco: 'E90', name: 'King\'s Indian Defense: Normal Variation', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3'], alias: ['kid', 'kings indian', 'normal'] },
  { eco: 'E97', name: 'King\'s Indian Defense: Classical Variation', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O', 'Be2', 'e5', 'O-O', 'Nc6'], alias: ['kid', 'kings indian', 'classical', 'mar del plata'] },
  { eco: 'E80', name: 'King\'s Indian Defense: Fianchetto Variation', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'g3', 'd5', 'Bg2'], alias: ['kid', 'fianchetto'] },
  { eco: 'E12', name: 'Queen\'s Indian Defense', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6'], alias: ['queens indian', 'qid', 'defence'] },
  { eco: 'E16', name: 'Queen\'s Indian Defense: Classical Variation', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6', 'a3', 'Bb7', 'Nc3', 'd5', 'cxd5', 'exd5'], alias: ['qid', 'queens indian', 'classical'] },
  { eco: 'D80', name: 'Grünfeld Defense', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5'], alias: ['grunfeld', 'defence'] },
  { eco: 'D85', name: 'Grünfeld Defense: Exchange Variation', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5', 'cxd5', 'Nxd5'], alias: ['grunfeld', 'exchange'] },
  { eco: 'D90', name: 'Grünfeld Defense: Russian Variation', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5', 'Qb3'], alias: ['grunfeld', 'russian'] },
  { eco: 'D70', name: 'Neo-Grünfeld Defense', moves: ['d4', 'Nf6', 'c4', 'g6', 'f3'], alias: ['neo grunfeld', 'grunfeld'] },
  { eco: 'A56', name: 'Benoni Defense: Modern Benoni', moves: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'e6', 'Nc3', 'exd5', 'cxd5'], alias: ['benoni', 'modern benoni'] },
  { eco: 'A57', name: 'Benko Gambit', moves: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'b5'], alias: ['benko', 'gambit'] },

  // --- Catalan and flank openings ---------------------------------------
  { eco: 'E01', name: 'Catalan Opening', moves: ['d4', 'Nf6', 'c4', 'e6', 'g3'], alias: ['catalan'] },
  { eco: 'E05', name: 'Catalan Opening: Classical Line', moves: ['d4', 'Nf6', 'c4', 'e6', 'g3', 'd5', 'Bg2'], alias: ['catalan', 'classical'] },
  { eco: 'E15', name: 'Catalan Opening: Fianchetto Line', moves: ['d4', 'Nf6', 'c4', 'e6', 'g3', 'd5', 'Bg2', 'a6'], alias: ['catalan', 'fianchetto'] },
  { eco: 'A07', name: 'King\'s Indian Attack', moves: ['d4', 'Nf6', 'Nf3', 'g6', 'g3', 'Bg7', 'Bg2', 'd6', 'O-O'], alias: ['kings indian attack', 'kia'] },
  { eco: 'A04', name: 'King\'s Fianchetto Opening', moves: ['Nf3', 'g6', 'g3', 'Bg7', 'Bg2', 'd6', 'O-O'], alias: ['kings fianchetto', 'fianchetto', 'reti'] },
  { eco: 'A02', name: 'Bird\'s Opening', moves: ['f4'], alias: ['birds', 'bird'] },
  { eco: 'A05', name: 'Réti Opening', moves: ['Nf3', 'Nf6'], alias: ['reti'] },
  { eco: 'A09', name: 'Réti Opening: Advance Variation', moves: ['Nf3', 'd5', 'c4'], alias: ['reti'] },

  // --- Irregular --------------------------------------------------------
  { eco: 'A00', name: 'Nimzo-Larsen Attack', moves: ['b3'], alias: ['nimzo larsen', 'larsen', 'larsens'] },
  { eco: 'A00', name: 'Nimzo-Larsen Attack: Indian Variation', moves: ['b3', 'e5'], alias: ['nimzo larsen', 'larsen'] },
  { eco: 'A00', name: 'Bongcloud Opening', moves: ['e4', 'e5', 'Qh5', 'Nc6'], alias: ['bongcloud'] },
  { eco: 'A00', name: 'Grob Opening', moves: ['g4'], alias: ['grob'] },
  { eco: 'A00', name: 'Van \'t Kruijs Opening', moves: ['e3'], alias: ['vant kruijs', 'kruijs'] },
  { eco: 'A00', name: 'Ware Opening', moves: ['a4'], alias: ['ware'] },
  { eco: 'A00', name: 'Sokolsky Opening', moves: ['b4'], alias: ['sokolsky'] },
  { eco: 'A00', name: 'Hungarian Opening', moves: ['g3'], alias: ['hungarian'] },
  { eco: 'B00', name: 'Owen\'s Defence', moves: ['e4', 'b6'], alias: ['owens', 'defence'] },
  { eco: 'B00', name: 'Elephant Gambit', moves: ['e4', 'e5', 'Nf3', 'd5'], alias: ['elephant', 'gambit'] },
  { eco: 'A56', name: 'Polish (Symmetrical) Opening', moves: ['d4', 'd5', 'c4', 'c5'], alias: ['polish', 'symmetrical', 'slav indian'] }
];

// --- Explorer search -----------------------------------------------------

// Folds a string for matching. Three jobs: case, accents and apostrophes.
// Without the accent step a search for "grunfeld" misses "Grünfeld Defense",
// because the umlaut is a different character and not merely a different font
// - and "grunfeld" is exactly what most people type. Apostrophes go because
// every one of these openings is named "Queen's something" or "King's
// something", and dropping the quote turns those into the words people
// actually search for.
function chessSearchFold(value) {
  let text = String(value == null ? '' : value).toLowerCase();
  if (text.normalize) text = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return text.replace(/['‘’]/g, '');
}

// Precomputed lowercase haystacks. Building them once at load keeps the
// keystroke path free of allocation, which matters on the low-end phones this
// app targets.
const CHESS_OPENING_INDEX = CHESS_OPENINGS.map((entry, i) => ({
  entry,
  index: i,
  eco: chessSearchFold(entry.eco),
  name: chessSearchFold(entry.name),
  // The line as typed, so "1 e4 c5" and "e4 c5" both match, plus a bare
  // space-free form so "e4c5" matches too.
  aliases: chessSearchFold((entry.alias || []).join(' ')),
  moves: chessSearchFold(entry.moves.join(' ')),
  compact: chessSearchFold(entry.moves.join(' ')).replace(/\s+/g, '')
}));

// Ranks a hit so the obvious answer comes first. Matching alone is not enough:
// searching "dragon" hits the Hyperaccelerated Dragon, the Dragon and the
// Yugoslav Attack, and a list ordered purely by the book puts the one nobody
// asked for at the top.
//
// The score is a pair, because a single number cannot separate "the name
// contains the word" from "the name contains the word, but forty characters
// later". Sorting on the pair ranks every Dragon Variation above a
// Hyperaccelerated Dragon, and Nimzo-Indian above Anti-Nimzo-Indian.
const CHESS_SEARCH_RANK = {
  ECO_EXACT: 0,
  NAME_EXACT: 1,
  NAME_PHRASE_AT_START: 2,
  NAME_PHRASE: 3,
  NAME_TOKENS: 4,
  ALIAS: 5,
  MOVES: 6
};

function chessOpeningRank(row, tokens, query) {
  if (row.eco === query) return [CHESS_SEARCH_RANK.ECO_EXACT, 0];
  if (row.name === query) return [CHESS_SEARCH_RANK.NAME_EXACT, 0];

  // The whole query appearing as a phrase is the strongest name signal, and
  // appearing at the very start is stronger still.
  const phrase = row.name.indexOf(query);
  if (phrase === 0) return [CHESS_SEARCH_RANK.NAME_PHRASE_AT_START, 0];
  if (phrase > 0) return [CHESS_SEARCH_RANK.NAME_PHRASE, phrase];

  // Otherwise every word has to be somewhere in the name, and the sum of where
  // they turn up breaks the tie: "Nimzo-Indian Defense" puts both words at the
  // front, "Indian Game: Anti-Nimzo-Indian" scatters one of them.
  let spread = 0;
  for (const token of tokens) {
    const at = row.name.indexOf(token);
    if (at === -1) {
      spread = -1;
      break;
    }
    spread += at;
  }
  if (spread >= 0) return [CHESS_SEARCH_RANK.NAME_TOKENS, spread];

  for (const token of tokens) {
    if (row.aliases.indexOf(token) !== -1) return [CHESS_SEARCH_RANK.ALIAS, 0];
  }
  return [CHESS_SEARCH_RANK.MOVES, 0];
}

// Every token has to appear somewhere rather than just one of them, so
// "sicilian dragon" finds the Dragon rather than every Sicilian.
function chessSearchOpenings(query) {
  const q = chessSearchFold(query).trim();
  if (!q) return CHESS_OPENINGS.map((e, i) => ({ entry: e, index: i }));

  const tokens = q.split(/\s+/).filter(Boolean);
  const hits = [];

  for (const row of CHESS_OPENING_INDEX) {
    let matched = true;
    for (const token of tokens) {
      if (row.name.indexOf(token) === -1 &&
          row.aliases.indexOf(token) === -1 &&
          row.moves.indexOf(token) === -1 &&
          row.eco.indexOf(token) === -1 &&
          row.compact.indexOf(token.replace(/\s+/g, '')) === -1) {
        matched = false;
        break;
      }
    }
    if (matched) {
      hits.push({ entry: row.entry, index: row.index, rank: chessOpeningRank(row, tokens, q) });
    }
  }

  // Stable within a rank, so two openings of equal quality keep book order.
  hits.sort((a, b) => (a.rank[0] - b.rank[0]) || (a.rank[1] - b.rank[1]));
  return hits.map(hit => ({ entry: hit.entry, index: hit.index }));
}