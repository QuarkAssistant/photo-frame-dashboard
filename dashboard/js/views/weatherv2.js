// v2 Weather (proposal mockup 03). Registers only with the v2 shell; v1 keeps views/weather.js.
// Real data only: /api/weather/detail (Open-Meteo forecast + air quality, cached on the
// server) and /api/radar (RainViewer over Esri tiles, proxied). Nothing here invents a number:
// a card whose data is missing says so instead.
import { now, register, UI_V2 } from '../app.js';
import { state } from '../data.js';
import { moonPhase, moonSvg } from '../moon.js';
import { esc } from '../ui.js';
import { weatherArt } from '../v2icons.js';
import {
  aqiPos, arcPoint, dayLength, nightRuns, rainArrival, smoothPath, sunProgress, tempPoints, uvPos, weekBars,
} from '../wxchart.js';

const REFRESH = 10 * 60 * 1000;
let detail = null;
let radar = null;
let fetchedAt = 0;
let loading = false;
const isDark = () => document.documentElement.classList.contains('theme-dark');
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function load(el) {
  if (loading) return;
  loading = true;
  try {
    const [d, r] = await Promise.all([getJson('/api/weather/detail').catch(() => null), getJson('/api/radar').catch(() => null)]);
    if (d && d.ok) detail = d;
    else if (detail) detail = { ...detail, stale: true }; // keep the last good data
    if (r) radar = r.ok ? r : (radar && radar.ok ? { ...radar, stale: true } : r);
    fetchedAt = Date.now();
  } finally {
    loading = false;
  }
  paint(el);
}

const clock = (iso) => {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const deg = (f, c) => `${f}°F <small>/ ${c}°C</small>`;

function nowCard(d, n) {
  const w = d.now || {};
  const m = moonPhase(n);
  const place = (state.weather && state.weather.place) || 'Naperville';
  const feels = d.feels != null ? `Feels ${d.feels}°F / ${d.feelsC}°C` : '';
  return `<section class="wv2-card wv2-now"><div class="wv2-lbl">Now · ${esc(place)}</div>` +
    `<span class="wv2-art">${weatherArt(w.code, isDark(), 92)}</span>` +
    `<div class="wv2-temp">${w.temp != null ? `${Math.round(w.temp)}°F<small>/ ${w.tempC}°C</small>` : '—'}</div>` +
    `<div class="wv2-cond">${esc(w.label || '')}</div><div class="wv2-feels">${esc(feels)}</div>` +
    `<div class="wv2-moonl">${moonSvg(m, 20)}<span>${esc(m.name)} · ${m.pct}%</span></div></section>`;
}

function gauge(pos, cls) {
  const p = Math.round(Math.max(0, Math.min(1, pos)) * 1000) / 10;
  return `<div class="wv2-bar ${cls}"><i style="left:${p}%"></i></div>`;
}

const AQI_DOT = ['#6DBE6D', '#F2C744', '#F29A3D', '#E0533D', '#9B4FA8', '#7A2E3A'];
const UV_DOT = (v) => (v < 3 ? '#6DBE6D' : v < 6 ? '#F2B544' : v < 8 ? '#F29A3D' : v < 11 ? '#E0533D' : '#9B4FA8');

function airCard(d) {
  if (!d.air) return '<section class="wv2-card wv2-air"><div class="wv2-lbl">Air</div><div class="wv2-na">No reading</div></section>';
  const band = Math.min(5, Math.floor(aqiPos(d.air.aqi) * 6));
  return `<section class="wv2-card wv2-air"><div class="wv2-lbl">Air</div>` +
    `<div class="wv2-big">${d.air.aqi}<small>AQI</small></div>` +
    `<div class="wv2-tag"><i style="background:${AQI_DOT[band]}"></i>${esc(d.air.label)}</div>${gauge(aqiPos(d.air.aqi), 'is-aqi')}</section>`;
}
function uvCard(d) {
  if (!d.uv) return '<section class="wv2-card wv2-uv"><div class="wv2-lbl">UV</div><div class="wv2-na">No reading</div></section>';
  return `<section class="wv2-card wv2-uv"><div class="wv2-lbl">UV</div>` +
    `<div class="wv2-big">${d.uv.value}<small>of 11+</small></div>` +
    `<div class="wv2-tag"><i style="background:${UV_DOT(d.uv.value)}"></i>${esc(d.uv.label)}</div>${gauge(uvPos(d.uv.value), 'is-uv')}</section>`;
}
function windCard(d) {
  const w = d.wind || {};
  // The arrow points where the wind blows to (meteorological "from" + 180°).
  const arrow = w.from == null ? '' : `<span class="wv2-dir"><svg viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(${(w.from + 180) % 360} 12 12)">` +
    '<path d="M12 4.5 17 17.5 12 14.6 7 17.5Z"/></g></svg></span>';
  return `<section class="wv2-card wv2-wind"><div class="wv2-lbl">Wind</div>${arrow}` +
    `<div class="wv2-big">${w.mph != null ? w.mph : '—'}<small>mph${w.compass ? ` ${esc(w.compass)}` : ''}</small></div>` +
    `<div class="wv2-tag"><i class="is-acc"></i>${w.gust != null ? `Gusts ${w.gust}` : ''}</div></section>`;
}

function daylightCard(d, n) {
  const dl = d.daylight;
  if (!dl) return '<section class="wv2-card wv2-day"><div class="wv2-lbl">Daylight</div><div class="wv2-na">No data</div></section>';
  const nl = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}T${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
  let p = sunProgress(dl.sunrise, dl.sunset, nl);
  const after = p == null && nl.slice(11) > dl.sunset.slice(11);
  const X0 = 26; const X1 = 174; const Y0 = 96; const R = 70;
  const pt = (q) => arcPoint(q, X0, X1, Y0, R).map((v) => v.toFixed(1)).join(' ');
  const full = `M${X0} ${Y0}A74 ${R} 0 0 1 ${X1} ${Y0}`;
  let arcs;
  let sun = '';
  if (p == null) {
    arcs = `<path class="${after ? 'wv2-arc' : 'wv2-arc-rest'}" d="${full}"/>`;
  } else {
    p = Math.max(0.01, Math.min(0.99, p));
    const [sx, sy] = arcPoint(p, X0, X1, Y0, R);
    arcs = `<path class="wv2-arc-rest" d="M${pt(p)}A74 ${R} 0 0 1 ${X1} ${Y0}"/><path class="wv2-arc" d="M${X0} ${Y0}A74 ${R} 0 0 1 ${pt(p)}"/>`;
    sun = `<circle class="wv2-glow" cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="17"/><circle class="wv2-glow" cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="12"/>` +
      `<circle class="wv2-sun" cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="8.5"/>`;
  }
  const t = (s) => { const [hm, ap] = s.split(' '); return `<b>${hm}</b><span>${ap}</span>`; };
  return `<section class="wv2-card wv2-day"><div class="wv2-lbl">Daylight</div>` +
    `<svg class="wv2-arcsvg" viewBox="0 0 200 110" aria-hidden="true">${arcs}${sun}` +
    `<text x="100" y="${Y0 - 22}" text-anchor="middle" class="wv2-dlen">${esc(dayLength(dl.minutes))}</text></svg>` +
    `<div class="wv2-rise">${t(dl.rise)}</div><div class="wv2-set">${t(dl.set)}</div></section>`;
}

// Next 24 hours: smooth temperature line with a soft fill, labeled dots every 3 h, night band,
// rounded rain bars with the peak labeled. The SVG is laid out at the frame's 814 × 299 card size.
function chartSvg(d) {
  const hours = d.hours.slice(0, 23);
  if (hours.length < 2) return '';
  const W = 814;
  const X0 = 96;
  const step = (775 - X0) / (hours.length - 1);
  const x = (i) => X0 + i * step;
  const pts = tempPoints(hours.map((h) => h.temp), { x: X0, y: 104, w: step * (hours.length - 1), h: 58 });
  const line = smoothPath(pts);
  const area = `${line}L${pts[pts.length - 1][0].toFixed(1)} 236L${X0} 236Z`;
  const BASE = 240;
  let night = '';
  for (const [a, b] of nightRuns(hours)) {
    const l = Math.max(X0 - step / 2, x(a) - step / 2);
    const r = Math.min(x(hours.length - 1) + step / 2, x(b) + step / 2);
    night += `<rect class="wv2-night" x="${l.toFixed(1)}" y="66" width="${(r - l).toFixed(1)}" height="${BASE + 8 - 66}" rx="12"/>` +
      `<text class="wv2-nightl" x="${((l + r) / 2).toFixed(1)}" y="292" text-anchor="middle">night</text>`;
  }
  let peak = -1;
  hours.forEach((h, i) => { if (h.pop >= 20 && (peak < 0 || h.pop > hours[peak].pop)) peak = i; });
  const bw = Math.min(20, step * 0.68);
  const bars = hours.map((h, i) => {
    const hgt = h.pop >= 5 ? Math.max(6, (h.pop / 100) * 64) : 3.5;
    return `<rect class="${h.pop >= 5 ? 'wv2-rb' : 'wv2-rb0'}" x="${(x(i) - bw / 2).toFixed(1)}" y="${(BASE - hgt).toFixed(1)}" width="${bw.toFixed(1)}" height="${hgt.toFixed(1)}" rx="${h.pop >= 5 ? 4 : 1.75}"/>`;
  }).join('');
  const peakL = peak < 0 ? '' : `<text class="wv2-peak" x="${x(peak).toFixed(1)}" y="${(BASE - Math.max(6, (hours[peak].pop / 100) * 64) - 10).toFixed(1)}" text-anchor="middle">${hours[peak].pop}%</text>`;
  let dots = '';
  let labels = '';
  for (let i = 0; i < hours.length; i += 3) {
    const [px, py] = pts[i];
    dots += `<circle class="wv2-dot" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="6"/>` +
      `<text class="wv2-tl" x="${px.toFixed(1)}" y="${(py - 15).toFixed(1)}" text-anchor="middle">${hours[i].temp}°</text>`;
    labels += `<text class="wv2-hl" x="${px.toFixed(1)}" y="269" text-anchor="middle">${esc(hours[i].label)}</text>`;
  }
  return `<svg class="wv2-chart" viewBox="0 0 ${W} 299" aria-hidden="true"><defs>` +
    '<linearGradient id="wv2fill" x1="0" y1="0" x2="0" y2="1"><stop class="wv2-f0" offset="0" stop-color="#F2A93B" stop-opacity="0.42"/><stop offset="1" stop-color="#F2B544" stop-opacity="0"/></linearGradient>' +
    `</defs>${night}<path d="${area}" fill="url(#wv2fill)"/><path class="wv2-line" d="${line}"/>${bars}${peakL}${dots}${labels}` +
    `<text class="wv2-ax" x="22" y="134">°F</text><text class="wv2-ax is-rain" x="22" y="${BASE - 10}">rain</text></svg>`;
}

function hoursCard(d) {
  const pill = d.rain ? `<span class="wv2-pill">${esc(d.rain.text)}</span>` : '';
  const wind = d.windPeak ? `<span class="wv2-wpk"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8.5H14.5A2.75 2.75 0 1 0 11.75 5.75M3 12.5H19A2.75 2.75 0 1 1 16.25 15.25M3 16.5H10"/></svg>Wind peak ${d.windPeak.mph} mph · ${esc(d.windPeak.at)}</span>` : '';
  return `<section class="wv2-card wv2-24"><div class="wv2-hrow"><span class="wv2-lbl">Next 24 hours</span>${pill}${wind}</div>${chartSvg(d)}</section>`;
}

// Radar: Esri gray base (zoom 8) + RainViewer rain (512 px zoom-7 tiles, the same scale),
// centred on home. The home marker has no text; only "Esri · RainViewer" credit is printed.
function radarCard(d) {
  const arrival = rainArrival(d.hours || [], d.rain && d.rain.kind);
  if (!radar || !radar.ok) {
    return `<section class="wv2-card wv2-radar is-off"><span class="wv2-chip">Rain · next 24 h</span><div class="wv2-noradar">${esc(arrival)}</div></section>`;
  }
  const W = 303; const H = 299;
  const left = radar.center.x - W / 2;
  const top = radar.center.y - H / 2;
  let imgs = '';
  const pct = (v, s) => `${((v / s) * 100).toFixed(2)}%`;
  for (let tx = Math.floor(left / 256); tx <= Math.floor((left + W) / 256); tx++) {
    for (let ty = Math.floor(top / 256); ty <= Math.floor((top + H) / 256); ty++) {
      imgs += `<img class="wv2-tb" alt="" src="/api/radar/base/8/${tx}/${ty}" style="left:${pct(tx * 256 - left, W)};top:${pct(ty * 256 - top, H)};width:${pct(256, W)};height:${pct(256, H)}">`;
    }
  }
  for (let tx = Math.floor(left / 512); tx <= Math.floor((left + W) / 512); tx++) {
    for (let ty = Math.floor(top / 512); ty <= Math.floor((top + H) / 512); ty++) {
      imgs += `<img class="wv2-tr" alt="" src="/api/radar/rain/${radar.frame}/${tx}/${ty}" style="left:${pct(tx * 512 - left, W)};top:${pct(ty * 512 - top, H)};width:${pct(512, W)};height:${pct(512, H)}">`;
    }
  }
  return `<section class="wv2-card wv2-radar"><div class="wv2-map">${imgs}</div>` +
    '<svg class="wv2-home" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 20.2 7.25V16.75L12 21.5 3.8 16.75V7.25Z"/></svg>' +
    `<span class="wv2-chip">Radar · ${radar.stale ? esc(clock(radar.time)) : 'now'}</span>` +
    `<span class="wv2-arr">${esc(arrival)}</span><span class="wv2-attr">Esri · RainViewer</span></section>`;
}

function daysCard(d, n) {
  const days = d.days || [];
  const bars = weekBars(days.length ? days : [{ lo: 0, hi: 1 }]);
  const lo = Math.min(...days.map((x) => x.lo));
  const hi = Math.max(...days.map((x) => x.hi));
  const cols = days.map((x, i) => {
    const b = bars[i];
    const wd = DAY[new Date(`${x.date}T12:00:00`).getDay()];
    // Inner span is as wide as the whole week scale, so each bar shows its slice of one gradient.
    const inner = `<i style="left:${(b.left * 100).toFixed(1)}%;width:${(b.width * 100).toFixed(1)}%"><s style="width:${(100 / b.width).toFixed(1)}%;margin-left:-${((b.left / b.width) * 100).toFixed(1)}%"></s></i>`;
    return `<div class="wv2-dcol${i === 0 ? ' is-today' : ''}"><b class="wv2-dn">${i === 0 ? 'Today' : wd}</b>` +
      `<div class="wv2-di">${weatherArt(x.icon, false, 34)}<span class="${x.pop >= 30 ? 'is-wet' : ''}">${x.pop}%</span></div>` +
      `<div class="wv2-hi">${deg(x.hi, x.hiC)}</div><div class="wv2-rng">${inner}</div><div class="wv2-lo">${deg(x.lo, x.loC)}</div></div>`;
  }).join('');
  const wear = d.wear ? `<span class="wv2-wear"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 3.5 3.5 6.5 5.5 10.5 7.5 9.5V20.5H16.5V9.5L18.5 10.5 20.5 6.5 15.5 3.5C15 5 13.7 6 12 6S9 5 8.5 3.5Z"/></svg>What to wear: ${esc(d.wear)}</span>` : '';
  const scale = days.length ? `<span class="wv2-scale">${lo}° – ${hi}°F this week</span>` : '';
  return `<section class="wv2-card wv2-7"><div class="wv2-hrow"><span class="wv2-lbl">Next 7 days</span>${scale}${wear}</div><div class="wv2-days">${cols}</div></section>`;
}

function page(n) {
  const d = detail;
  if (!d) {
    return `<div class="wv2"><div class="wv2-wait">${loading || !fetchedAt ? 'Loading the forecast…' : 'Weather is unavailable right now.'}</div></div>`;
  }
  const stale = d.stale ? `<div class="wv2-stale">Offline · showing ${esc(clock(d.at))} forecast</div>` : '';
  return `<div class="wv2">${nowCard(d, n)}${airCard(d)}${uvCard(d)}${windCard(d)}${daylightCard(d, n)}` +
    `${hoursCard(d)}${radarCard(d)}${daysCard(d, n)}${stale}</div>`;
}

function paint(el) {
  const html = page(now());
  if (el.__html === html) return;
  el.__html = html;
  el.innerHTML = html;
}

if (UI_V2) {
  register('weather', {
    show(el) {
      paint(el);
      if (!fetchedAt || Date.now() - fetchedAt > REFRESH) load(el);
    },
    tick(el) {
      if (Date.now() - fetchedAt > REFRESH) load(el);
      else paint(el);
    },
  });
}
