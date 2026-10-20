import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ownFolder = path.dirname(fileURLToPath(import.meta.url));
const arg = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const root = path.resolve(arg('--root') ?? path.join(ownFolder, '..', 'game'));
const port = Number(arg('--port') ?? 5280);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
await stat(path.join(root, 'index.html'));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.wasm': 'application/wasm' };
const server = http.createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/__health') {
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ game: 'frog-ascent', portable: true })); return;
    }
    const decoded = decodeURIComponent(url.pathname);
    if (decoded.includes('\0') || decoded.includes('\\')) { response.writeHead(400); response.end(); return; }
    const file = path.resolve(root, '.' + (decoded === '/' ? '/index.html' : decoded));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream',
      'Content-Length': content.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('File not found'); }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Close the other game launcher and try again.` : error);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`Frog Ascent: ${url}\nKeep this window open. Stop: Ctrl+C.`);
  if (process.argv.includes('--open') && process.platform === 'win32') {
    const browser = spawn('cmd.exe', ['/d', '/c', 'start', '', url], { windowsHide: true, stdio: 'ignore' });
    browser.on('error', () => console.log('Open the URL above in Chrome or Edge.'));
  }
});
process.on('SIGINT', () => server.close(() => process.exit(0)));
