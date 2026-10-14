// Photo date/place captions. Reads EXIF (DateTimeOriginal + GPS) straight from the
// JPEG bytes, reverse-geocodes GPS with OpenStreetMap Nominatim (<= 1 req/s), and
// caches everything outside the repo:
//   ~/Library/Caches/coelho-photos/meta.json            (per photo id)
//   ~/Library/Application Support/coelho-dashboard/places.json (per rounded coords)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const META_FILE = path.join(os.homedir(), 'Library', 'Caches', 'coelho-photos', 'meta.json');
const PLACES_FILE = path.join(os.homedir(), 'Library', 'Application Support', 'coelho-dashboard', 'places.json');
const UA = 'CoelhoDashboard/0.5 (family wall display)';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } }
function writeJson(f, v) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(`${f}.tmp`, JSON.stringify(v));
  fs.renameSync(`${f}.tmp`, f);
}

let meta = readJson(META_FILE);
let places = readJson(PLACES_FILE);

// Minimal EXIF reader: returns { dateTime, lat, lon } or {}.
export function readExif(buf) {
  if (buf.readUInt16BE(0) !== 0xffd8) return {};
  let off = 2;
  while (off + 4 < buf.length) {
    if (buf[off] !== 0xff) break;
    const marker = buf[off + 1];
    const len = buf.readUInt16BE(off + 2);
    if (marker === 0xe1 && buf.toString('ascii', off + 4, off + 10) === 'Exif\0\0') return parseTiff(buf, off + 10);
    if (marker === 0xda) break;
    off += 2 + len;
  }
  return {};
}

function parseTiff(buf, base) {
  const le = buf.toString('ascii', base, base + 2) === 'II';
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const entries = (ifd) => {
    const out = {};
    if (!ifd || base + ifd + 2 > buf.length) return out;
    const n = u16(base + ifd);
    for (let i = 0; i < n; i++) {
      const e = base + ifd + 2 + i * 12;
      if (e + 12 > buf.length) break;
      out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), at: e + 8 };
    }
    return out;
  };
  const ascii = (t) => {
    if (!t) return null;
    const o = t.count > 4 ? base + u32(t.at) : t.at;
    return buf.toString('ascii', o, o + t.count).replace(/\0.*$/, '');
  };
  const rationals = (t) => {
    if (!t) return null;
    const o = base + u32(t.at);
    const r = [];
    for (let i = 0; i < t.count; i++) { const d = u32(o + i * 8 + 4); r.push(d ? u32(o + i * 8) / d : 0); }
    return r;
  };
  const ifd0 = entries(u32(base + 4));
  const res = {};
  if (ifd0[0x8769]) {
    const ex = entries(u32(ifd0[0x8769].at));
    res.dateTime = ascii(ex[0x9003]) || ascii(ex[0x9004]) || null;
  }
  if (!res.dateTime && ifd0[0x0132]) res.dateTime = ascii(ifd0[0x0132]);
  if (ifd0[0x8825]) {
    const g = entries(u32(ifd0[0x8825].at));
    const la = rationals(g[2]); const lo = rationals(g[4]);
    if (la && lo && la.length === 3 && lo.length === 3) {
      let lat = la[0] + la[1] / 60 + la[2] / 3600;
      let lon = lo[0] + lo[1] / 60 + lo[2] / 3600;
      if ((ascii(g[1]) || 'N').startsWith('S')) lat = -lat;
      if ((ascii(g[3]) || 'E').startsWith('W')) lon = -lon;
      if (lat || lon) { res.lat = lat; res.lon = lon; }
    }
  }
  return res;
}

export function formatDate(exifDate) {
  const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(exifDate || '');
  if (!m || m[1] === '0000') return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return `${MONTHS[mo - 1]} ${Number(m[3])}, ${m[1]}`;
}

export function shortPlace(addr) {
  if (!addr) return null;
  const city = addr.city || addr.town || addr.village || addr.municipality || addr.city_district || addr.county || addr.state;
  const cc = String(addr.country_code || '').toUpperCase();
  if (!city) return null;
  if (cc === 'US') {
    const iso = addr['ISO3166-2-lvl4'] || '';
    const st = iso.startsWith('US-') ? iso.slice(3) : addr.state;
    return st ? `${city}, ${st}` : city;
  }
  return cc ? `${city}, ${cc}` : city;
}

export function coordKey(lat, lon) { return `${lat.toFixed(2)},${lon.toFixed(2)}`; }

let lastGeo = 0;
async function reverse(lat, lon) {
  const key = coordKey(lat, lon);
  if (key in places) return places[key];
  const wait = 1100 - (Date.now() - lastGeo);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeo = Date.now();
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&addressdetails=1&lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`reverse HTTP ${res.status}`);
  const d = await res.json();
  places[key] = shortPlace(d.address);
  writeJson(PLACES_FILE, places);
  return places[key];
}

export function metaFor(id) {
  const m = meta[id];
  if (!m) return {};
  return { date: m.date || undefined, place: m.place || undefined };
}

let running = false;
// Fill meta for every photo (id -> absolute path). Safe to call repeatedly.
export async function refreshMeta(files) {
  if (running) return;
  running = true;
  try {
    let dirty = false;
    for (const [id, file] of files) {
      if (meta[id] && meta[id].done) continue;
      let ex = {};
      try {
        const fd = fs.openSync(file, 'r');
        const buf = Buffer.alloc(256 * 1024);
        const n = fs.readSync(fd, buf, 0, buf.length, 0);
        fs.closeSync(fd);
        ex = readExif(buf.subarray(0, n));
      } catch { /* unreadable: no caption */ }
      const entry = { date: formatDate(ex.dateTime), place: null, done: true };
      if (ex.lat != null) {
        try { entry.place = await reverse(ex.lat, ex.lon); } catch { entry.done = false; }
      }
      meta[id] = entry;
      dirty = true;
      if (dirty && Object.keys(meta).length % 20 === 0) writeJson(META_FILE, meta);
    }
    // Drop entries for photos that are gone.
    const keep = new Set([...files.keys()]);
    for (const id of Object.keys(meta)) if (!keep.has(id)) { delete meta[id]; dirty = true; }
    if (dirty) writeJson(META_FILE, meta);
  } finally {
    running = false;
  }
}
