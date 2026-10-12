// Driving ETA from home to an event location.
// Geocoding: OpenStreetMap Nominatim (free, 1 req/s, cached forever in memory).
// Routing: TomTom Routing API with live traffic (TOMTOM_API_KEY), otherwise OSRM demo server
// (free, no traffic). Results cached 10 min per destination.
// Home comes from HOME_LAT/HOME_LON (or HOME_ADDRESS) in .env — never committed.
const UA = 'CoelhoDashboard/0.3 (family wall display)';
const ETA_TTL = 10 * 60 * 1000; // within 3 h of the event
const FAR_TTL = 60 * 60 * 1000; // further out: refresh hourly
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

async function tomtom(a, b) {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) throw new Error('tomtom: no key');
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${a.lat},${a.lon}:${b.lat},${b.lon}/json` +
    `?traffic=true&departAt=now&travelMode=car&routeType=fastest&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`tomtom HTTP ${res.status}`);
  const d = await res.json();
  const sum = d.routes && d.routes[0] && d.routes[0].summary;
  if (!sum) throw new Error('tomtom: no route');
  return { seconds: sum.travelTimeInSeconds, meters: sum.lengthInMeters, delay: sum.trafficDelayInSeconds || 0, source: 'tomtom' };
}

async function tomtomGeocode(q) {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://api.tomtom.com/search/2/geocode/${encodeURIComponent(q)}.json?countrySet=US&limit=1&key=${encodeURIComponent(key)}`,
    { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const d = await res.json();
  const p = d.results && d.results[0] && d.results[0].position;
  return p ? { lat: p.lat, lon: p.lon } : null;
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

export async function etaPayload(to, startIso) {
  const startMs = Date.parse(startIso || '');
  const ttl = Number.isFinite(startMs) && startMs - Date.now() > 3 * 3600 * 1000 ? FAR_TTL : ETA_TTL;
  const dest = String(to || '').trim().slice(0, 300);
  if (!dest) return { ok: false, reason: 'no destination' };
  const c = etaCache.get(dest);
  if (c && Date.now() - c.at < ttl) return c.data;
  let data;
  try {
    const a = await home();
    if (!a) return { ok: false, reason: 'HOME not configured' };
    const lines = dest.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const tries = [lines.join(', '), ...lines.slice().reverse(), dest.replace(/ United States$/, '')];
    let b = null;
    for (const q of [...new Set(tries)]) { b = await geocode(q); if (b) break; }
    if (!b) b = await tomtomGeocode(lines.join(', '));
    if (!b) data = { ok: false, reason: 'address not found' };
    else {
      let r;
      try { r = await tomtom(a, b); } catch { r = await osrm(a, b); }
      data = { ok: true, minutes: Math.max(1, Math.round(r.seconds / 60)), km: Math.round(r.meters / 100) / 10, source: r.source, delayMin: Math.round((r.delay || 0) / 60) };
    }
  } catch (e) {
    if (c) return c.data;
    data = { ok: false, reason: String(e.message || e) };
  }
  etaCache.set(dest, { at: Date.now(), data });
  return data;
}
