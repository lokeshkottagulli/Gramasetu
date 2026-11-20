import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './api.js';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const types = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.jpg', 'image/jpeg'], ['.png', 'image/png'],
  ['.mp3', 'audio/mpeg'], ['.svg', 'image/svg+xml'],
]);

async function serveFile(request, response) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  const file = resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (/[\\:\0]/.test(pathname) || !file.startsWith(dist + sep) || !types.has(extname(file))) {
    response.writeHead(404).end();
    return;
  }

  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': types.get(extname(file)),
    'Content-Length': info.size,
    'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  const stream = createReadStream(file);
  stream.on('error', () => response.destroy());
  response.on('close', () => stream.destroy());
  stream.pipe(response);
}

await access(join(dist, 'index.html')).catch(() => {
  console.error('Build Gramasetu with npm run build before starting the server.');
  process.exit(1);
});

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 5173);
createServer((request, response) => {
  handleApi(request, response, () => void serveFile(request, response));
}).listen(port, host, () => console.log(`Gramasetu listening on http://${host}:${port}`));
