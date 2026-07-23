const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4173);
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname);
    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = path.resolve(root, relativePath);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) throw new Error('Invalid path');
    const body = await fs.readFile(filePath);
    response.writeHead(200, {
      'Content-Type': types[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

const keepAliveSockets = new Set();
const idleShutdownMs = Number(process.env.PW_SERVER_IDLE_MS || 10000);
let idleShutdownTimer = null;
server.on('connection', socket => {
  keepAliveSockets.add(socket);
  socket.on('close', () => keepAliveSockets.delete(socket));
});

function scheduleIdleShutdown() {
  if (idleShutdownTimer) clearTimeout(idleShutdownTimer);
  idleShutdownTimer = setTimeout(shutdown, idleShutdownMs);
}

function shutdown() {
  for (const socket of keepAliveSockets) socket.destroy();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
}

server.listen(port, '127.0.0.1', () => {
  console.log(`Smoke-test server listening on http://127.0.0.1:${port}`);
  scheduleIdleShutdown();
});

server.on('request', () => scheduleIdleShutdown());

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
