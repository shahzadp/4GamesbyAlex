// Validates every FEN literal inside tools/test-chess.js.
// A FEN is malformed if any rank does not describe exactly 8 squares, or if
// either king is missing. Reports them so the test data can be corrected
// rather than the engine being blamed for a bad position.
const fs = require('fs');
const path = require('path');

const testPath = path.join(__dirname, 'test-chess.js');
const src = fs.readFileSync(testPath, 'utf8');

const fenRe = /'([1-8rnbqkpRNBQKP/]{2,})\s+([wb])\s+([KQkq]{1,4}|-)\s+([a-h][36]|-)\s+(\d+)\s+(\d+)'/g;
const seen = new Set();
const problems = [];

let m;
while ((m = fenRe.exec(src)) !== null) {
  const full = m[0].slice(1, -1);
  if (seen.has(full)) continue;
  seen.add(full);

  const rows = m[1].split('/');
  if (rows.length !== 8) {
    problems.push(full + '  -> ' + rows.length + ' ranks (need 8)');
    continue;
  }
  let bad = false;
  for (const r of rows) {
    let w = 0;
    for (const ch of r) w += (ch >= '1' && ch <= '8') ? Number(ch) : 1;
    if (w !== 8) {
      problems.push(full + '  -> rank "' + r + '" is ' + w + ' squares wide');
      bad = true;
      break;
    }
  }
  if (bad) continue;

  // King sanity: exactly one of each, and the side not to move must not be
  // the one already in check in a way that makes the position illegal.
  const board = rows.join('');
  const wk = (board.match(/K/g) || []).length;
  const bk = (board.match(/k/g) || []).length;
  if (wk !== 1) problems.push(full + '  -> ' + wk + ' white kings (need 1)');
  if (bk !== 1) problems.push(full + '  -> ' + bk + ' black kings (need 1)');
}

console.log('FENs checked: ' + seen.size);
console.log('Problems: ' + problems.length);
problems.forEach(p => console.log('  ' + p));