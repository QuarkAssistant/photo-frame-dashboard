import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const CACHE = path.join(os.homedir(), 'Library', 'Caches', 'coelho-photos');
const MAX_W = 1280;
const MAX_H = 800;
const pending = new Map();
import { metaFor, refreshMeta } from './photometa.js';

const EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.tif', '.tiff']);
const files = new Map();
const EMBLEM = { source: 'emblem', photos: [] };

function safeDir() {
  let dir = process.env.PHOTOS_DIR || '~/coelho-photos';
  if (dir.startsWith('~')) dir = path.join(os.homedir(), dir.slice(1));
  try {
    const real = fs.realpathSync(dir);
    if (!fs.statSync(real).isDirectory()) return null;
    return real;
  } catch {
    return null;
  }
}

export function listPhotos() {
  files.clear();
  const dir = safeDir();
  if (!dir) return EMBLEM;
  const photos = [];
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return EMBLEM; }
  for (const name of names) {
    const ext = path.extname(name).toLowerCase();
    if (!EXT.has(ext)) continue;
    const full = path.resolve(dir, name);
    if (!full.startsWith(dir + path.sep)) continue;
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (!st.isFile()) continue;
    const id = crypto.createHash('sha1').update(`${name}:${st.size}:${st.mtimeMs}`).digest('hex').slice(0, 16);
    files.set(id, full);
    photos.push({
      id,
      ...metaFor(id),
      url: `/api/photos/${id}`,
      caption: name.startsWith('icloud-') ? '' : path.basename(name, ext).replace(/[_-]+/g, ' '),
    });
  }
  photos.sort((a, b) => (a.caption + a.id).localeCompare(b.caption + b.id));
  if (!photos.length) return EMBLEM;
  refreshMeta(new Map(files)).catch(() => {});
  return { source: 'folder', photos };
}

export function photoPath(id) {
  if (!files.has(id)) listPhotos();
  const full = files.get(id);
  if (!full) return null;
  const dir = safeDir();
  if (!dir || !full.startsWith(dir + path.sep)) return null;
  return full;
}

export function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  }[ext] || 'application/octet-stream';
}

// Resize/re-encode to a JPEG that fits 1280x800, cached on disk (macOS sips).
async function build(id, src) {
  fs.mkdirSync(CACHE, { recursive: true });
  const out = path.join(CACHE, `${id}.jpg`);
  if (fs.existsSync(out)) return out;
  const tmp = `${out}.tmp.jpg`;
  const { stdout } = await run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', src]);
  const w = Number((stdout.match(/pixelWidth: (\d+)/) || [])[1]) || MAX_W;
  const h = Number((stdout.match(/pixelHeight: (\d+)/) || [])[1]) || MAX_H;
  const k = Math.min(1, MAX_W / w, MAX_H / h);
  await run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80',
    '-z', String(Math.max(1, Math.round(h * k))), String(Math.max(1, Math.round(w * k))), src, '--out', tmp]);
  fs.renameSync(tmp, out);
  return out;
}

export function photoJpeg(id) {
  const src = photoPath(id);
  if (!src) return Promise.resolve(null);
  if (!pending.has(id)) {
    pending.set(id, build(id, src).finally(() => pending.delete(id)));
  }
  return pending.get(id);
}
