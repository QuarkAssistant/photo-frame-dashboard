// Driving ETA from home to an event location.
// Geocoding: OpenStreetMap Nominatim (free, 1 req/s, cached forever in memory).
// Routing: Waze live-map (live traffic) when it answers, otherwise OSRM demo server
// (free, no traffic). Results cached 10 min per destination.
// Home comes from HOME_LAT/HOME_LON (or HOME_ADDRESS) in .env — never committed.
const UA = 'CoelhoDashboard/0.3 (family wall display)';
const ETA_TTL = 10 * 60 * 1000;
const geoCache = new Map();
const etaCache = new Map();
let lastGeo = 0;

async function geocode(q) {
  const key = q.trim().toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key);
  const wait = 1100 - (Date.now() - lastGeo);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeo = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`geocode HTTP ${res.status}`);
  const d = await res.json();
  const hit = d && d[0] ? { lat: Number(d[0].lat), lon: Number(d[0].lon) } : null;
  geoCache.set(key, hit);
  return hit;
}

async function home() {
  const lat = Number(process.env.HOME_LAT);
  const lon = Number(process.env.HOME_LON);
  if (Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon)) return { lat, lon };
  if (process.env.HOME_ADDRESS) return geocode(process.env.HOME_ADDRESS);
  return null;
}

async function waze(a, b) {
  const res = await fetch('https://www.waze.com/live-map/api/user-drive?geo_env=na', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Referer: 'https://www.waze.com/live-map/directions', Origin: 'https://www.waze.com' },
    body: JSON.stringify({ from: { y: a.lat, x: a.lon }, to: { y: b.lat, x: b.lon }, nPaths: 1, useCase: 'LIVEMAP_PLANNING', interval: 15, arriveAt: false }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`waze HTTP ${res.status}`);
  const d = await res.json();
  const alt = (d.alternatives || [])[0];
  const r = alt && alt.response;
  if (!r) throw new Error('waze: no route');
  const secs = r.totalSeconds || (r.results || []).reduce((s, x) => s + (x.crossTime || 0), 0);
  const meters = r.totalLength || (r.results || []).reduce((s, x) => s + (x.length || 0), 0);
  if (!secs) throw new Error('waze: empty');
  return { seconds: secs, meters, source: 'waze' };
}

async function osrm(a, b) {
  const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`osrm HTTP ${res.status}`);
  const d = await res.json();
  const r = d.routes && d.routes[0];
  if (!r) throw new Error('osrm: no route');
  return { seconds: r.duration, meters: r.distance, source: 'osrm' };
}

export async function etaPayload(to) {
  const dest = String(to || '').trim().slice(0, 300);
  if (!dest) return { ok: false, reason: 'no destination' };
  const c = etaCache.get(dest);
  if (c && Date.now() - c.at < ETA_TTL) return c.data;
  let data;
  try {
    const a = await home();
    if (!a) return { ok: false, reason: 'HOME not configured' };
    const lines = dest.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const tries = [lines.join(', '), ...lines.slice().reverse(), dest.replace(/ United States$/, '')];
    let b = null;
    for (const q of [...new Set(tries)]) { b = await geocode(q); if (b) break; }
    if (!b) data = { ok: false, reason: 'address not found' };
    else {
      let r;
      try { r = await waze(a, b); } catch { r = await osrm(a, b); }
      data = { ok: true, minutes: Math.max(1, Math.round(r.seconds / 60)), km: Math.round(r.meters / 100) / 10, source: r.source };
    }
  } catch (e) {
    if (c) return c.data;
    data = { ok: false, reason: String(e.message || e) };
  }
  etaCache.set(dest, { at: Date.now(), data });
  return data;
}
