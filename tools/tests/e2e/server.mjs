// Servidor estático que publica a raiz do projeto em /rocks-hero/, como no GitHub Pages.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const BASE = '/rocks-hero/';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
};

export function startServer(port = 0) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith(BASE)) {
      res.writeHead(url.pathname === '/rocks-hero' ? 301 : 404, url.pathname === '/rocks-hero' ? { Location: BASE } : {});
      return res.end();
    }
    let rel = decodeURIComponent(url.pathname.slice(BASE.length)) || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(root, rel));
    if (!file.startsWith(root + sep) || rel.split('/').some((p) => p.startsWith('.') || p === 'node_modules')) {
      res.writeHead(403);
      return res.end();
    }
    try {
      if (!(await stat(file)).isFile()) throw new Error('not file');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('404');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}${BASE}` })));
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const { url } = await startServer(Number(process.argv[2]) || 8080);
  console.log(`Servindo ${root} em ${url}`);
}
