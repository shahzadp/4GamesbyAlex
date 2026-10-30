// Minimal static server for the Android assets, used to exercise the chess
// page in a desktop browser. Serves with the MIME types the engine needs.
//
// Usage: node tools/serve-assets.cjs [root] [port]
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'app', 'src', 'main', 'assets');
const port = parseInt(process.argv[3] || '8099', 10);
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(root, rel);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(port, () => console.log(`serving ${root} on http://127.0.0.1:${port}`));