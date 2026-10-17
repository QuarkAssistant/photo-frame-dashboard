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
import { labelHome } from './homeplace.js';
import { listPhotos, photoJpeg } from './photos.js';
import { albumStatus, syncAlbum } from './album.js';
import { extrasPayload } from './extras.js';
import { etaPayload } from './eta.js';
import { isStale, taggerStatus } from './tagger.js';
import { loadGroceries, saveGrocery } from './reminders.js';
import { openStore } from './store.js';
import { startIndoor } from './indoor.js';
import { weatherPayload } from './weather.js';
import { isFrameReport, sanitizeFrameReport } from '../frameinfo.js';
import { healthPayload } from './framehealth.js';

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
  // The test runner must not poll a real device. node:test sets this.
  if (!process.env.NODE_TEST_CONTEXT) startIndoor();
  const store = openStore(root);
  const dist = path.join(root, 'dist');
  const frameInfoFile = path.join(root, 'data', 'frame-info.json');
  let frameInfo = null;
  try { frameInfo = JSON.parse(fs.readFileSync(frameInfoFile, 'utf8')); } catch { frameInfo = null; }

  return async function handle(req, res) {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname;
    try {
      if (pathname === '/api/health') return sendJson(res, 200, { ok: true, brand: BRAND });
      if (pathname === '/api/frame-info') {
        if (req.method === 'POST') {
          const report = sanitizeFrameReport(await readBody(req));
          if (isFrameReport(report)) {
            frameInfo = report;
            try {
              fs.mkdirSync(path.dirname(frameInfoFile), { recursive: true });
              fs.writeFileSync(`${frameInfoFile}.tmp`, JSON.stringify(report, null, 2));
              fs.renameSync(`${frameInfoFile}.tmp`, frameInfoFile);
            } catch { /* in-memory copy still answers GET */ }
          }
          return sendJson(res, 200, { ok: true, stored: isFrameReport(report) });
        }
        if (req.method === 'GET') return sendJson(res, 200, frameInfo ? { ok: true, ...frameInfo } : { ok: false, reason: 'no-report-yet' });
      }
      if (pathname === '/api/frame-health' && req.method === 'GET') return sendJson(res, 200, healthPayload());
      if (pathname === '/api/config' && req.method === 'GET') return sendJson(res, 200, nightConfig());
      if (pathname === '/api/calendar' && req.method === 'GET') return sendJson(res, 200, await calendarPayload());
      if (pathname === '/api/weather' && req.method === 'GET') return sendJson(res, 200, await weatherPayload());
      if (pathname === '/api/grocery/tagger' && req.method === 'GET') return sendJson(res, 200, { ...taggerStatus, stale: isStale(taggerStatus) });
      if (pathname === '/api/eta' && req.method === 'GET') return sendJson(res, 200, await etaPayload(url.searchParams.get('to'), url.searchParams.get('start')));
      if (pathname === '/api/extras' && req.method === 'GET') return sendJson(res, 200, await extrasPayload());
      if (pathname === '/api/photos/sync') return sendJson(res, 200, req.method === 'POST' ? await syncAlbum() : albumStatus);
      if (pathname === '/api/photos' && req.method === 'GET') return sendJson(res, 200, listPhotos());
      if (pathname.startsWith('/api/photos/') && req.method === 'GET') {
        let file = null;
        try { file = await photoJpeg(pathname.slice('/api/photos/'.length)); } catch { file = null; }
        if (!file) return sendJson(res, 404, { error: 'not found' });
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' });
        fs.createReadStream(file).pipe(res);
        return;
      }
      if (pathname === '/api/whereabouts' && req.method === 'GET') {
        // Written by a separate Find My helper (not committed data). Shape:
        // { updatedAt, people: { thiago: { place, at }, ... } }. Missing file -> unavailable.
        const fs = await import('node:fs/promises');
        const os = await import('node:os');
        const file = process.env.WHEREABOUTS_FILE || `${os.homedir()}/Library/Application Support/coelho-dashboard/whereabouts.json`;
        try {
          const data = JSON.parse(await fs.readFile(file, 'utf8'));
          // Rows without a relative time ("Now", live, or the me-card) get the helper's
          // run time, so every person always has a real timestamp.
          for (const v of Object.values(data.people || {})) {
            if (!v.at || Number.isNaN(new Date(v.at).getTime())) v.at = data.updatedAt || new Date().toISOString();
          }
          labelHome(data.people, process.env.HOME_ADDRESS);
          return sendJson(res, 200, { ok: true, ...data });
        }
        catch { return sendJson(res, 200, { ok: false, reason: 'no-findmy-source', people: {} }); }
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
      const av = /^\/avatars\/([a-z]+)\.jpg$/.exec(pathname);
      if (av) {
        const f = path.join(root, 'local-assets', 'avatars', `${av[1]}.jpg`);
        if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=86400' });
        return fs.createReadStream(f).pipe(res);
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
