// Pure geometry for the v2 Weather charts (no DOM): smooth temperature line, rain bars,
// night bands, gauge positions and the shared week scale. Everything is tested.

// Monotone cubic (Fritsch–Carlson) through the points: smooth, never overshoots a min or max.
export function smoothPath(pts) {
  const n = pts.length;
  if (!n) return '';
  if (n === 1) return `M${pts[0][0]} ${pts[0][1]}`;
  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push((pts[i + 1][1] - pts[i][1]) / dx[i]);
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  const f = (v) => Math.round(v * 10) / 10;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${f(pts[i][0] + h)} ${f(pts[i][1] + h * t[i])} ${f(pts[i + 1][0] - h)} ${f(pts[i + 1][1] - h * t[i + 1])} ${f(pts[i + 1][0])} ${f(pts[i + 1][1])}`;
  }
  return d;
}

// Temperatures → chart points inside a box, with a little headroom so labels fit above.
export function tempPoints(temps, box) {
  const vals = temps.filter((v) => v != null);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = Math.max(6, hi - lo);
  const mid = (hi + lo) / 2;
  const step = temps.length > 1 ? box.w / (temps.length - 1) : 0;
  return temps.map((v, i) => [box.x + i * step, box.y + box.h * (0.5 - ((v ?? mid) - mid) / span)]);
}

// Night bands as [fromIndex, toIndex] runs where day === false.
export function nightRuns(hours) {
  const out = [];
  let a = -1;
  hours.forEach((h, i) => {
    if (!h.day && a < 0) a = i;
    if ((h.day || i === hours.length - 1) && a >= 0) { out.push([a, h.day ? i - 1 : i]); a = -1; }
  });
  return out;
}

// Position (0–1) of a value on the AQI bar: six equal bands (Good … Hazardous).
export function aqiPos(aqi) {
  const edges = [0, 50, 100, 150, 200, 300, 500];
  const v = Math.max(0, Math.min(500, Number(aqi) || 0));
  for (let i = 0; i < 6; i++) {
    if (v <= edges[i + 1]) return (i + (v - edges[i]) / (edges[i + 1] - edges[i])) / 6;
  }
  return 1;
}
export function uvPos(uv) {
  return Math.max(0, Math.min(1, (Number(uv) || 0) / 11));
}

// Sun position along the daylight arc (0 at sunrise, 1 at sunset), null at night.
export function sunProgress(sunriseLocal, sunsetLocal, nowLocal) {
  const mins = (s) => Number(String(s).slice(11, 13)) * 60 + Number(String(s).slice(14, 16));
  const a = mins(sunriseLocal);
  const b = mins(sunsetLocal);
  const n = mins(nowLocal);
  if (String(nowLocal).slice(0, 10) !== String(sunriseLocal).slice(0, 10) || n < a || n > b) return null;
  return (n - a) / (b - a);
}
// Point on the arc: a half-ellipse from (x0, y0) to (x1, y0) through the top at y0 - rise.
export function arcPoint(p, x0, x1, y0, rise) {
  const ang = Math.PI * (1 - p);
  return [(x0 + x1) / 2 + ((x1 - x0) / 2) * Math.cos(ang), y0 - rise * Math.sin(ang)];
}

// Shared week scale: each day's low–high as left/width fractions of the week's range.
export function weekBars(days) {
  const lo = Math.min(...days.map((d) => d.lo));
  const hi = Math.max(...days.map((d) => d.hi));
  const span = Math.max(1, hi - lo);
  return days.map((d) => ({ left: (d.lo - lo) / span, width: Math.max(0.04, (d.hi - d.lo) / span) }));
}

// "10 h 58 m"
export function dayLength(minutes) {
  if (minutes == null) return '';
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} m`;
}

// From the hourly rain chances: "Raining now", "Rain arriving ~5 PM" or "No rain in the next 24 h".
export function rainArrival(hours, kind) {
  const i = hours.findIndex((h) => h.pop >= 40);
  if (i < 0) return 'No rain in the next 24 h';
  if (i === 0) return `${kind || 'Rain'} now`;
  return `${kind || 'Rain'} arriving ~${hours[i].label}`;
}
