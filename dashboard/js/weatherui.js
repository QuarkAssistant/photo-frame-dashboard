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
