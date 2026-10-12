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
      `<b class="num wx-pair">${Math.round(h.temp)} °F <i>/</i> ${celsius(h.temp, h.tempC)} °C</b>${pop}</div>`;
  }).join('');
  return `<div class="wx-hours" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${cells}</div>`;
}

export function dayStrip(days, size, withLow) {
  const list = days || [];
  if (!list.length) return '';
  const cells = list.map((d) => {
    const low = withLow
      ? `<span class="wx-day-lo num">Low ${Math.round(d.lo)} °F / ${celsius(d.lo, d.loC)} °C</span>`
      : '';
    return `<div class="wx-day">` +
      `<span class="wx-day-l">${esc(d.label)}</span>` +
      `<span class="wx-day-i">${wxIcon(d.code, size)}</span>` +
      `<b class="num wx-pair">${Math.round(d.hi)} °F <i>/</i> ${celsius(d.hi, d.hiC)} °C</b>${low}</div>`;
  }).join('');
  return `<div class="wx-days" style="grid-template-columns:repeat(${list.length},minmax(0,1fr))">${cells}</div>`;
}

export function tempChart(points) {
  const list = points || [];
  if (list.length < 2) return '';
  const temps = list.map((p) => Math.round(Number(p.temp) || 0));
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const n = list.length;
  const plotTop = 6;
  const plotBot = 94;
  const plotH = plotBot - plotTop;
  const x = (i) => (i / (n - 1)) * 100;
  const y = (t) => (hi === lo
    ? (plotTop + plotBot) / 2
    : plotTop + (1 - (t - lo) / (hi - lo)) * plotH);
  const line = list.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(Math.round(p.temp)).toFixed(2)}`).join(' ');
  const area = `${line} L100,${plotBot} L0,${plotBot} Z`;
  const tickCount = (hi - lo) >= 8 ? 4 : 3;
  const ticks = [];
  for (let i = 0; i < tickCount; i++) {
    const frac = i / (tickCount - 1);
    ticks.push({
      t: Math.round(lo + (hi - lo) * frac),
      y: plotBot - frac * plotH,
    });
  }
  const grid = ticks.map((tick) =>
    `<line x1="0" y1="${tick.y.toFixed(2)}" x2="100" y2="${tick.y.toFixed(2)}" stroke="rgba(31, 58, 58, 0.4)" stroke-width="1.25" vector-effect="non-scaling-stroke"></line>`
  ).join('');
  const bars = list.map((p, i) => {
    const pop = Math.max(0, Math.min(100, Number(p.pop) || 0));
    if (!pop) return '';
    const bw = (100 / n) * 0.55;
    const bh = (pop / 100) * plotH;
    return `<rect x="${(x(i) - bw / 2).toFixed(2)}" y="${(plotBot - bh).toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" fill="rgba(122, 138, 60, 0.45)"></rect>`;
  }).join('');
  const marks = [];
  for (let i = 0; i < n; i += 3) marks.push(i);
  if (marks[marks.length - 1] !== n - 1) marks.push(n - 1);
  const labels = marks.map((i) => {
    const left = x(i);
    const align = i === 0 ? 'left:0' : i === n - 1 ? 'right:0' : `left:${left.toFixed(2)}%;transform:translateX(-50%)`;
    return `<span style="${align}">${esc(list[i].label)}</span>`;
  }).join('');
  const seen = new Set();
  const yLabels = ticks.map((tick) => {
    const label = seen.has(tick.t) ? '' : `${tick.t}°`;
    seen.add(tick.t);
    return `<span class="num" style="top:${tick.y.toFixed(2)}%">${label}</span>`;
  }).join('');
  return `<div class="wx-chart-plot">` +
    `<div class="wx-yaxis">${yLabels}</div>` +
    `<svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Next 24 hours">` +
    bars +
    `<path d="${area}" fill="rgba(31, 58, 58, 0.14)"></path>` +
    grid +
    `<path d="${line}" fill="none" stroke="#1F3A3A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>` +
    `</svg></div>` +
    `<div class="wx-chart-x">${labels}</div>`;
}

export function nowBlock(w, iconSize) {
  const place = w.place || 'Naperville';
  const note = w.summary ? `<p class="wx-note">${esc(w.summary)}</p>` : '';
  return `<div class="wx-now">` +
    `<span class="wx-icon">${wxIcon(w.code, iconSize)}</span>` +
    `<div class="wx-temps"><span class="wx-temp num wx-pair">${Math.round(w.temp)} °F <i>/</i> ${celsius(w.temp, w.tempC)} °C</span></div>` +
    `<div class="wx-meta"><b>${esc(w.label)}</b><span>${esc(place)}</span></div>` +
    `<div class="wx-hl">` +
    `<span class="wx-line">${wxIcon('up', 14)}<span class="num">${Math.round(w.hi)} °F / ${celsius(w.hi, w.hiC)} °C</span></span>` +
    `<span class="wx-line">${wxIcon('down', 14)}<span class="num">${Math.round(w.lo)} °F / ${celsius(w.lo, w.loC)} °C</span></span>` +
    `</div></div>${note}`;
}
