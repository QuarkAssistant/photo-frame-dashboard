import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND, TIMEZONE } from '../family.js';
import {
  clockLabel, DEFAULT_NIGHT_END, DEFAULT_NIGHT_START, parseClockMinutes,
} from '../night.js';
import { calendarPayload } from './calendar.js';
import { loadEnv } from './env.js';
import { listPhotos, photoJpeg } from './photos.js';
import { loadGroceries, saveGrocery } from './reminders.js';
import { openStore } from './store.js';
import { weatherPayload } from './weather.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

export function dashboardRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function send(res, code, body, headers) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(code, { 'Content-Length': buf.length, ...headers });
  res.end(buf);
}

function sendJson(res, code, obj) {
  send(res, code, JSON.stringify(obj), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 65536) {
        reject(Object.assign(new Error('body too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(Object.assign(new Error('bad json'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function safeFile(root, urlPath) {
  let pathname = decodeURIComponent((urlPath || '/').split('?')[0]);
  if (pathname.includes('\0')) return null;
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.normalize(path.join(root, pathname));
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  return file;
}

function sendFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  const icon = /\/(emblem|icon-\d+|favicon-\d+)\.png$/.test(file);
  const cache = ext === '.html' || icon ? 'no-cache' : 'public, max-age=3600';
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cache,
  });
  fs.createReadStream(file).pipe(res);
}

function nightConfig() {
  const fallbackStart = parseClockMinutes(DEFAULT_NIGHT_START, 23 * 60);
  const fallbackEnd = parseClockMinutes(DEFAULT_NIGHT_END, 6 * 60);
  return {
    nightStart: clockLabel(parseClockMinutes(process.env.NIGHT_START, fallbackStart)),
    nightEnd: clockLabel(parseClockMinutes(process.env.NIGHT_END, fallbackEnd)),
    timezone: TIMEZONE,
  };
}

export function createApi({ root }) {
  loadEnv(path.join(root, '.env'));
  const store = openStore(root);
  const dist = path.join(root, 'dist');

  return async function handle(req, res) {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname;
    try {
      if (pathname === '/api/health') return sendJson(res, 200, { ok: true, brand: BRAND });
      if (pathname === '/api/config' && req.method === 'GET') return sendJson(res, 200, nightConfig());
      if (pathname === '/api/calendar' && req.method === 'GET') return sendJson(res, 200, await calendarPayload());
      if (pathname === '/api/weather' && req.method === 'GET') return sendJson(res, 200, await weatherPayload());
      if (pathname === '/api/photos' && req.method === 'GET') return sendJson(res, 200, listPhotos());
      if (pathname.startsWith('/api/photos/') && req.method === 'GET') {
        let file = null;
        try { file = await photoJpeg(pathname.slice('/api/photos/'.length)); } catch { file = null; }
        if (!file) return sendJson(res, 404, { error: 'not found' });
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' });
        fs.createReadStream(file).pipe(res);
        return;
      }
      if (pathname === '/api/chores') {
        if (req.method === 'GET') return sendJson(res, 200, store.chores());
        if (req.method === 'POST') {
          const body = await readBody(req);
          return sendJson(res, 200, await store.setChore(String(body.id || ''), body.done));
        }
      }
      if (pathname === '/api/groceries' || pathname === '/api/grocery') {
        if (req.method === 'GET') return sendJson(res, 200, await loadGroceries(store));
        if (req.method === 'POST') return sendJson(res, 200, await saveGrocery(store, await readBody(req)));
      }
      if (pathname === '/api/homework') {
        if (req.method === 'GET') return sendJson(res, 200, store.homework());
        if (req.method === 'POST') {
          const body = await readBody(req);
          return sendJson(res, 200, await store.setHomework(String(body.id || ''), body.done));
        }
      }
      if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'not found' });

      if (!fs.existsSync(dist)) {
        return send(res, 503, 'Dashboard is not built. Run npm run build.', { 'Content-Type': 'text/plain' });
      }
      let file = safeFile(dist, pathname);
      if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        if (!path.extname(pathname)) file = path.join(dist, 'index.html');
        else return send(res, 404, 'not found', { 'Content-Type': 'text/plain' });
      }
      if (!fs.existsSync(file)) return send(res, 404, 'not found', { 'Content-Type': 'text/plain' });
      sendFile(res, file);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) sendJson(res, err.status || 500, { error: err.status ? err.message : 'error' });
    }
  };
}

export function start(root = dashboardRoot()) {
  loadEnv(path.join(root, '.env'));
  const port = Number(process.env.PORT) || 4173;
  const handle = createApi({ root });
  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('error');
      }
    });
  });
  server.listen(port, '0.0.0.0', () => {
    const mode = process.env.ICLOUD_USER && process.env.ICLOUD_APP_PASSWORD ? 'icloud' : 'mock calendar';
    console.log(`${BRAND} dashboard on http://0.0.0.0:${port} (${mode})`);
  });
  return server;
}
