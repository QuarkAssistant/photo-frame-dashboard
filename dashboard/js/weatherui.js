import { fToC } from '../mock.js';
import { icon } from './icons.js';
import { esc } from './ui.js';

export function celsius(f, given) {
  if (given == null || given === '') return fToC(f);
  const n = Number(given);
  return Number.isFinite(n) ? Math.round(n) : fToC(f);
}

function wxIcon(name, size) {
  return icon(name || 'partly', size, 2);
}

export function hourStrip(hours, size) {
  const list = hours || [];
  const cols = Math.max(list.length, 1);
  const anyPop = list.some((h) => Number(h.pop) > 0);
  const cells = list.map((h) => {
    const pop = anyPop
      ? `<span class="wx-hr-pop">${Number(h.pop) > 0 ? `${Math.round(h.pop)}%` : ''}</span>`
      : '';
    return `<div class="wx-hr${anyPop ? ' has-pop' : ''}">` +
      `<span class="wx-hr-l">${esc(h.label)}</span>` +
      `<span class="wx-hr-i">${wxIcon(h.code, size)}</span>` +
      `<b class="num">${Math.round(h.temp)}°F</b>` +
      `<small class="num">${celsius(h.temp, h.tempC)}°C</small>${pop}</div>`;
  }).join('');
  return `<div class="wx-hours" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${cells}</div>`;
}

export function dayStrip(days, size, withLow) {
  const list = days || [];
  if (!list.length) return '';
  const cells = list.map((d) => {
    const low = withLow
      ? `<span class="wx-day-lo num">${Math.round(d.lo)}°F / ${celsius(d.lo, d.loC)}°C</span>`
      : '';
    return `<div class="wx-day">` +
      `<span class="wx-day-l">${esc(d.label)}</span>` +
      `<span class="wx-day-i">${wxIcon(d.code, size)}</span>` +
      `<b class="num">${Math.round(d.hi)}°F</b>` +
      `<small class="num">${celsius(d.hi, d.hiC)}°C</small>${low}</div>`;
  }).join('');
  return `<div class="wx-days" style="grid-template-columns:repeat(${list.length},minmax(0,1fr))">${cells}</div>`;
}

export function tempChart(points) {
  const list = points || [];
  if (list.length < 2) return '';
  const temps = list.map((p) => Math.round(p.temp));
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const span = Math.max(1, hi - lo);
  const n = list.length;
  const x = (i) => (n === 1 ? 0 : (i / (n - 1)) * 100);
  const y = (t) => 8 + (1 - (t - lo) / span) * 78;
  const line = list.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(Math.round(p.temp)).toFixed(2)}`).join(' ');
  const area = `${line} L100,100 L0,100 Z`;
  const bars = list.map((p, i) => {
    const pop = Math.max(0, Math.min(100, Number(p.pop) || 0));
    if (!pop) return '';
    const bw = 100 / n * 0.55;
    const bh = pop * 0.42;
    return `<rect x="${(x(i) - bw / 2).toFixed(2)}" y="${(100 - bh).toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" fill="rgba(122, 138, 60, 0.45)"></rect>`;
  }).join('');
  const marks = [];
  for (let i = 0; i < n; i += 3) marks.push(i);
  if (marks[marks.length - 1] !== n - 1) marks.push(n - 1);
  const labels = marks.map((i) => {
    const left = x(i);
    const align = i === 0 ? 'left:0' : i === n - 1 ? 'right:0' : `left:${left.toFixed(2)}%;transform:translateX(-50%)`;
    return `<span style="${align}">${esc(list[i].label)}</span>`;
  }).join('');
  return `<div class="wx-chart-plot">` +
    `<div class="wx-yaxis"><span class="num">${hi}°</span><span class="num">${lo}°</span></div>` +
    `<svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Next 24 hours">` +
    bars +
    `<path d="${area}" fill="rgba(31, 58, 58, 0.14)"></path>` +
    `<path d="${line}" fill="none" stroke="#1F3A3A" stroke-width="1.6" vector-effect="non-scaling-stroke"></path>` +
    `</svg></div>` +
    `<div class="wx-chart-x">${labels}</div>`;
}

export function nowBlock(w, iconSize) {
  const place = w.place || 'Naperville';
  const note = w.summary ? `<p class="wx-note">${esc(w.summary)}</p>` : '';
  return `<div class="wx-now">` +
    `<span class="wx-icon">${wxIcon(w.code, iconSize)}</span>` +
    `<div class="wx-temps"><span class="wx-temp num">${Math.round(w.temp)}°F</span>` +
    `<span class="wx-tempc num">${celsius(w.temp, w.tempC)}°C</span></div>` +
    `<div class="wx-meta"><b>${esc(w.label)}</b><span>${esc(place)}</span></div>` +
    `<div class="wx-hl">` +
    `<span class="wx-line">${wxIcon('up', 14)}<span class="num">${Math.round(w.hi)}°F / ${celsius(w.hi, w.hiC)}°C</span></span>` +
    `<span class="wx-line">${wxIcon('down', 14)}<span class="num">${Math.round(w.lo)}°F / ${celsius(w.lo, w.loC)}°C</span></span>` +
    `</div></div>${note}`;
}
