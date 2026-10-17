// Radar for the v2 Weather page. Keyless sources, proxied so the frame only talks to the LAN:
//   RainViewer (api.rainviewer.com) latest radar frame, 512 px tiles at zoom 7 (its free limit),
//   Esri World Light Gray Canvas base tiles at zoom 8 (same scale as a 512 px zoom-7 tile).
// The home position is only used for map maths; no address or coordinates are printed.
const META_TTL = 5 * 60 * 1000;
const RAIN_TTL = 10 * 60 * 1000;
const BASE_TTL = 7 * 24 * 3600 * 1000;
const UA = 'coelho-family-dashboard/1.0 (home kiosk)';
let meta = null;
const tiles = new Map(); // key -> { at, ttl, buf, type }

// Web-mercator world pixel at a zoom (256 px tiles).
export function worldPx(lat, lon, z) {
  const n = 256 * 2 ** z;
  const x = ((Number(lon) + 180) / 360) * n;
  const s = Math.sin((Number(lat) * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { x: Math.round(x), y: Math.round(y) };
}

async function latestFrame(now) {
  if (meta && now - meta.at < META_TTL) return meta;
  try {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json', { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`rainviewer ${res.status}`);
    const j = await res.json();
    const past = (j.radar && j.radar.past) || [];
    const f = past[past.length - 1];
    if (!f) throw new Error('no radar frames');
    meta = { at: now, host: j.host || 'https://tilecache.rainviewer.com', time: f.time, path: f.path, stale: false };
  } catch (err) {
    console.error('radar meta:', err.message);
    if (meta) meta = { ...meta, stale: true };
  }
  return meta;
}

export async function radarInfo(now = Date.now()) {
  const lat = Number(process.env.LAT);
  const lon = Number(process.env.LON);
  if (!lat || !lon) return { ok: false, reason: 'no-location' };
  const f = await latestFrame(now);
  if (!f) return { ok: false, reason: 'unavailable' };
  return { ok: true, stale: Boolean(f.stale), time: new Date(f.time * 1000).toISOString(), frame: f.time, center: worldPx(lat, lon, 8) };
}

async function cachedTile(key, ttl, url) {
  const hit = tiles.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const entry = { at: Date.now(), buf, type: res.headers.get('content-type') || 'image/png' };
    tiles.set(key, entry);
    if (tiles.size > 300) tiles.delete(tiles.keys().next().value);
    return entry;
  } catch (err) {
    return hit || null; // last good tile if the source is down
  }
}

// /api/radar/base/8/<x>/<y> and /api/radar/rain/<frame>/<x>/<y> (zoom 7, 512 px).
export async function radarTile(pathname) {
  let m = /^\/api\/radar\/base\/8\/(\d{1,4})\/(\d{1,4})$/.exec(pathname);
  if (m) {
    return cachedTile(`b:${m[1]}:${m[2]}`, BASE_TTL,
      `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/8/${m[2]}/${m[1]}`);
  }
  m = /^\/api\/radar\/rain\/(\d{9,11})\/(\d{1,4})\/(\d{1,4})$/.exec(pathname);
  if (m) {
    const f = await latestFrame(Date.now());
    if (!f || String(f.time) !== m[1]) return null;
    return cachedTile(`r:${m[1]}:${m[2]}:${m[3]}`, RAIN_TTL, `${f.host}${f.path}/512/7/${m[2]}/${m[3]}/2/1_1.png`);
  }
  return null;
}
