import { TIMEZONE } from './family.js';

export { TIMEZONE };

export function pad(n) {
  return String(n).padStart(2, '0');
}

// Building an Intl.DateTimeFormat is very slow on old Android WebViews (it was
// ~35% of main-thread time on the PF1007L frame), so build one per zone and reuse it.
const formatters = new Map();
function partsFormatter(timeZone) {
  const key = timeZone || '';
  let dtf = formatters.get(key);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatters.set(key, dtf);
  }
  return dtf;
}

// Renders ask for the same instants many times (every event, every cell), so keep
// a small cache of results per (zone, second). Callers get a fresh copy each time.
const partsCache = new Map();
const PARTS_CACHE_MAX = 2000;

export function parts(date, timeZone = TIMEZONE) {
  const ms = +date;
  const ckey = Number.isFinite(ms) ? `${timeZone || ''}|${Math.floor(ms / 1000)}` : null;
  if (ckey) {
    const hit = partsCache.get(ckey);
    if (hit) return { ...hit };
  }
  const out = computeParts(date, timeZone);
  if (ckey) {
    if (partsCache.size >= PARTS_CACHE_MAX) partsCache.clear();
    partsCache.set(ckey, out);
    return { ...out };
  }
  return out;
}

function computeParts(date, timeZone) {
  const dtf = partsFormatter(timeZone);
  const map = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  let hour = Number(map.hour);
  let day = Number(map.day);
  let month = Number(map.month);
  let year = Number(map.year);
  if (hour === 24) {
    hour = 0;
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }
  return {
    year, month, day, hour,
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: map.weekday,
  };
}

const zoneOk = new Map();
function validZone(zone) {
  if (zoneOk.has(zone)) return zoneOk.get(zone);
  let ok = true;
  try { partsFormatter(zone); } catch { ok = false; }
  zoneOk.set(zone, ok);
  return ok;
}

function zoneOffsetMs(utcMs, timeZone) {
  const p = parts(new Date(utcMs), timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - utcMs;
}

export function zonedToUtc(year, month, day, hour, minute, second, timeZone = TIMEZONE) {
  let zone = timeZone || TIMEZONE;
  if (!validZone(zone)) zone = TIMEZONE;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = zoneOffsetMs(utcGuess, zone);
  let utc = utcGuess - offset;
  const offset2 = zoneOffsetMs(utc, zone);
  if (offset2 !== offset) utc = utcGuess - offset2;
  return new Date(utc);
}

export function ymd(date, timeZone = TIMEZONE) {
  const p = parts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function addDaysYmd(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function weekdayIndex(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function formatCalUtc(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function chicagoRange(now = new Date(), days = 14) {
  const startY = ymd(now);
  const [y, m, d] = startY.split('-').map(Number);
  const start = zonedToUtc(y, m, d, 0, 0, 0);
  const endY = addDaysYmd(startY, days);
  const [ey, em, ed] = endY.split('-').map(Number);
  const end = zonedToUtc(ey, em, ed, 0, 0, 0);
  return { start, end, startY, endY };
}
