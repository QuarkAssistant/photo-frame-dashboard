// v2 Weather page data (/api/weather/detail). Real data only, keyless sources:
//   Open-Meteo forecast (current, hourly, daily) and Open-Meteo air quality (US AQI),
//   RainViewer radar frames over Esri Light Gray Canvas tiles (proxied, see radar.js).
// "Now" (temperature, condition) comes from /api/weather so it always matches Home.
// Responses are cached 12 minutes; on failure the last good data is returned with stale: true.
import { wmoIcon, weatherPayload } from './weather.js';

const TTL = 12 * 60 * 1000;
const TZ = 'America/Chicago';
let last = null; // { at, data }

const toC = (f) => Math.round(((Number(f) - 32) * 5) / 9);
const r = (v) => (v == null || Number.isNaN(Number(v)) ? null : Math.round(Number(v)));

// "3 PM", "12 AM" from a local "YYYY-MM-DDTHH:MM" string.
export function hourText(local) {
  const h = Number(String(local).slice(11, 13));
  return `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? 'PM' : 'AM'}`;
}
// "7:09 AM" from a local "YYYY-MM-DDTHH:MM" string.
export function clockText(local) {
  const h = Number(String(local).slice(11, 13));
  const m = String(local).slice(14, 16);
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function aqiLabel(aqi) {
  if (aqi == null) return null;
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for some';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very unhealthy';
  return 'Hazardous';
}
export function uvLabel(uv) {
  if (uv == null) return null;
  if (uv < 3) return 'Low';
  if (uv < 6) return 'Moderate';
  if (uv < 8) return 'High';
  if (uv < 11) return 'Very high';
  return 'Extreme';
}
export function compass(deg) {
  if (deg == null) return null;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((Number(deg) % 360) + 360) % 360) / 45) % 8];
}

const ICON_LABEL = { sun: 'Sunny', moon: 'Clear', partly: 'Partly cloudy', night: 'Partly cloudy', cloud: 'Cloudy', rain: 'Rain', storm: 'Storms', snow: 'Snow', fog: 'Fog' };

// Kind of wet weather for a WMO code, or null when dry.
export function wetKind(code) {
  const n = Number(code);
  if (n >= 95) return 'Storms';
  if ((n >= 71 && n <= 77) || n === 85 || n === 86) return 'Snow';
  if (n >= 80 && n <= 82) return 'Showers';
  if (n >= 51 && n <= 57) return 'Drizzle';
  if (n >= 61 && n <= 67) return 'Rain';
  return null;
}

// "Showers 5–9 PM": the first run of hours with rain chance ≥ 40 % in the next 24 h.
export function rainWindow(hours) {
  const wet = (h) => h.pop >= 40;
  const a = hours.findIndex(wet);
  if (a < 0) return null;
  let b = a;
  while (b + 1 < hours.length && wet(hours[b + 1])) b++;
  const kinds = hours.slice(a, b + 1).map((h) => wetKind(h.wmo)).filter(Boolean);
  const kind = kinds.includes('Storms') ? 'Storms' : kinds.includes('Snow') ? 'Snow' : kinds[0] || 'Rain';
  const start = hours[a].time;
  const endH = (Number(hours[b].time.slice(11, 13)) + 1) % 24;
  const end = `${hours[b].time.slice(0, 11)}${String(endH).padStart(2, '0')}:00`;
  const s = hourText(start);
  const e = hourText(end);
  const same = s.slice(-2) === e.slice(-2);
  return { kind, from: a, to: b, peak: Math.max(...hours.slice(a, b + 1).map((h) => h.pop)), text: `${kind} ${same ? s.slice(0, -3) : s}–${e}` };
}

// Simple, documented rules (dashboard-v2.md): coldest "feels like" in the next 12 h picks the
// layer; rain chance ≥ 50 % adds an umbrella; snow adds boots.
export function whatToWear(hours) {
  const next = hours.slice(0, 12);
  if (!next.length) return null;
  const cold = Math.min(...next.map((h) => (h.feels != null ? h.feels : h.temp)));
  let layer = 't-shirt';
  if (cold < 32) layer = 'winter coat + hat';
  else if (cold < 45) layer = 'warm coat';
  else if (cold < 58) layer = 'jacket';
  else if (cold < 68) layer = 'light layer';
  const extras = [];
  if (next.some((h) => wetKind(h.wmo) === 'Snow' && h.pop >= 40)) extras.push('boots');
  else if (next.some((h) => h.pop >= 50)) extras.push('umbrella');
  return [layer, ...extras].join(' + ');
}

// Shapes raw Open-Meteo forecast + air-quality JSON (pure; tested with fixtures).
export function shapeDetail(fc, aq, nowLocal) {
  const H = fc.hourly || {};
  const times = H.time || [];
  let i0 = times.findIndex((t) => t.slice(0, 13) === String(nowLocal).slice(0, 13));
  if (i0 < 0) i0 = 0;
  const hours = [];
  for (let i = i0; i < Math.min(times.length, i0 + 25); i++) {
    const temp = r(H.temperature_2m?.[i]);
    const isDay = H.is_day ? Boolean(H.is_day[i]) : true;
    hours.push({
      time: times[i], label: hourText(times[i]), temp, tempC: temp == null ? null : toC(H.temperature_2m[i]),
      feels: r(H.apparent_temperature?.[i]), pop: r(H.precipitation_probability?.[i]) || 0,
      wind: r(H.wind_speed_10m?.[i]), gust: r(H.wind_gusts_10m?.[i]), wmo: H.weather_code?.[i] ?? null,
      icon: wmoIcon(H.weather_code?.[i] ?? 0, isDay ? 12 : 0), day: isDay,
    });
  }
  const C = fc.current || {};
  const D = fc.daily || {};
  const today = String(nowLocal).slice(0, 10);
  let d0 = (D.time || []).indexOf(today);
  if (d0 < 0) d0 = 0;
  const days = [];
  for (let i = d0; i < Math.min((D.time || []).length, d0 + 7); i++) {
    const hi = r(D.temperature_2m_max?.[i]);
    const lo = r(D.temperature_2m_min?.[i]);
    days.push({ date: D.time[i], hi, hiC: hi == null ? null : toC(D.temperature_2m_max[i]), lo, loC: lo == null ? null : toC(D.temperature_2m_min[i]),
      pop: r(D.precipitation_probability_max?.[i]) || 0, icon: wmoIcon(D.weather_code?.[i] ?? 0, 12) });
  }
  const windPeak = hours.reduce((best, h) => (h.wind != null && (!best || h.wind > best.mph) ? { mph: h.wind, at: h.label } : best), null);
  const sunrise = D.sunrise?.[d0] || null;
  const sunset = D.sunset?.[d0] || null;
  const aqi = r(aq?.current?.us_aqi);
  const uv = C.uv_index != null ? Math.round(Number(C.uv_index)) : null;
  const curIcon = wmoIcon(C.weather_code ?? 0, C.is_day === 0 ? 0 : 12);
  return {
    current: C.temperature_2m == null ? null : { temp: r(C.temperature_2m), tempC: toC(C.temperature_2m), code: curIcon, label: ICON_LABEL[curIcon] || '' },
    feelsC: C.apparent_temperature != null ? toC(C.apparent_temperature) : null,
    feels: r(C.apparent_temperature),
    air: aqi == null ? null : { aqi, label: aqiLabel(aqi) },
    uv: uv == null ? null : { value: uv, label: uvLabel(uv) },
    wind: { mph: r(C.wind_speed_10m), gust: r(C.wind_gusts_10m), from: r(C.wind_direction_10m), compass: compass(C.wind_direction_10m) },
    daylight: sunrise && sunset ? {
      sunrise, sunset, rise: clockText(sunrise), set: clockText(sunset),
      minutes: D.daylight_duration?.[d0] != null ? Math.round(D.daylight_duration[d0] / 60) : null,
    } : null,
    hours, days,
    rain: rainWindow(hours),
    windPeak: windPeak && windPeak.mph >= 1 ? windPeak : null,
    wear: whatToWear(hours),
  };
}

function localNow(now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

export async function weatherDetail(now = new Date()) {
  const lat = Number(process.env.LAT) || 41.7859;
  const lon = Number(process.env.LON) || -88.1473;
  const base = await weatherPayload(now).catch(() => null);
  const nowBlock = base && base.source !== 'mock'
    ? { temp: base.temp, tempC: base.tempC ?? toC(base.temp), code: base.code, label: base.label, place: base.place } : null;
  if (last && now.getTime() - last.at < TTL) return { ok: true, cached: true, at: new Date(last.at).toISOString(), ...last.data, now: nowBlock || last.data.current };
  const q = `latitude=${lat}&longitude=${lon}&timezone=${encodeURIComponent(TZ)}`;
  const fcUrl = `https://api.open-meteo.com/v1/forecast?${q}&forecast_days=8&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch` +
    '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index,is_day' +
    '&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,is_day' +
    '&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,sunrise,sunset,daylight_duration';
  const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?${q}&current=us_aqi`;
  try {
    const [fc, aq] = await Promise.all([getJson(fcUrl), getJson(aqUrl).catch(() => null)]);
    const data = shapeDetail(fc, aq || (last && last.aq), localNow(now));
    last = { at: now.getTime(), data, aq: aq || (last && last.aq) };
    return { ok: true, at: now.toISOString(), ...data, now: nowBlock || data.current };
  } catch (err) {
    console.error('weather detail:', err.message);
    if (last) return { ok: true, stale: true, at: new Date(last.at).toISOString(), ...last.data, now: nowBlock || last.data.current };
    return { ok: false, now: nowBlock, reason: 'unavailable' };
  }
}
