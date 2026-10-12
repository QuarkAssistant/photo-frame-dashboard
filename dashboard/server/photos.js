import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);
const files = new Map();

const PLACEHOLDERS = [
  { id: 'garden', url: '/placeholders/garden.svg', caption: 'Garden' },
  { id: 'evening', url: '/placeholders/evening.svg', caption: 'Evening' },
  { id: 'home', url: '/placeholders/table.svg', caption: 'Home' },
];

function safeDir() {
  const dir = process.env.PHOTOS_DIR;
  if (!dir) return null;
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
  if (!dir) return { source: 'placeholder', photos: PLACEHOLDERS };
  const photos = [];
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return { source: 'placeholder', photos: PLACEHOLDERS }; }
  for (const name of names) {
    const ext = path.extname(name).toLowerCase();
    if (!EXT.has(ext)) continue;
    const full = path.resolve(dir, name);
    if (!full.startsWith(dir + path.sep)) continue;
    const id = crypto.createHash('sha1').update(name).digest('hex').slice(0, 16);
    files.set(id, full);
    photos.push({
      id,
      url: `/api/photos/${id}`,
      caption: path.basename(name, ext).replace(/[_-]+/g, ' '),
    });
  }
  photos.sort((a, b) => a.caption.localeCompare(b.caption));
  if (!photos.length) return { source: 'placeholder', photos: PLACEHOLDERS };
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
