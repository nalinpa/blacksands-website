// scripts/design-review/server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', 'public');
const PORT = process.argv[2] ? parseInt(process.argv[2], 10) : 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, data, contentType) {
  res.writeHead(status, contentType ? { 'Content-Type': contentType } : undefined);
  res.end(data);
}

const server = http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const rel = urlPath === '/' ? '/index.html' : urlPath;
    const resolved = path.join(ROOT, rel);

    if (!resolved.startsWith(ROOT)) {
      send(res, 403, 'Forbidden');
      return;
    }

    fs.readFile(resolved, (err, data) => {
      if (!err) {
        send(res, 200, data, MIME[path.extname(resolved)] || 'application/octet-stream');
        return;
      }
      if (!path.extname(resolved)) {
        fs.readFile(resolved + '.html', (err2, data2) => {
          if (err2) {
            send(res, 404, 'Not found');
            return;
          }
          send(res, 200, data2, MIME['.html']);
        });
        return;
      }
      send(res, 404, 'Not found');
    });
  } catch (err) {
    send(res, 400, 'Bad Request');
  }
});

server.listen(PORT, () => {
  console.log(`design-review server listening on http://localhost:${PORT}`);
});
