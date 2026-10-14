// Home v3 pieces (?layout=v2). Old-WebView safe markup: tables, inline-blocks, margins.
import { FAMILY } from '../../family.js';
import { addDaysYmd, ymd } from '../../time.js';
import { state } from '../data.js';
import { now } from '../app.js';
import { avatar, compactTitle, dayParts, esc, formatTime, onDay, owner, pstyle, ring } from '../ui.js';
import { celsius } from '../weatherui.js';
import { icon } from '../icons.js';

const pair = (f, c) => `${Math.round(f)} °F <i>/</i> ${c} °C`;

// Compact weather: big temp, condition, H / L / feels, small hourly bars.
export function weather3() {
  const w = state.weather;
  if (!w) return '';
  const hours = (w.hours || []).slice(0, 5);
  const temps = hours.map((h) => h.temp);
  const lo = Math.min(...temps); const hi = Math.max(...temps);
  const bars = hours.map((h, i) => {
    const pct = hi > lo ? (h.temp - lo) / (hi - lo) : 0.5;
    const hpx = Math.round(10 + pct * 18);
    return `<td class="w3-hr${i === 0 ? ' is-now' : ''}"><span class="w3-t num">${Math.round(h.temp)}°</span>` +
      `<span class="w3-bar-box"><i class="w3-bar" style="height:${hpx}px"></i></span><span class="w3-l">${esc(h.label)}</span></td>`;
  }).join('');
  const feels = w.feels != null ? ` · Feels ${pair(w.feels, celsius(w.feels))}` : '';
  return `<table class="w3"><tr>` +
    `<td class="w3-now"><div class="w3-big num">${icon(w.code || 'partly', 30, 2)}${pair(w.temp, celsius(w.temp, w.tempC))}</div>` +
    `<div class="w3-cond">${esc(w.label || '')} <span>· ${esc(w.place || '')}</span></div>` +
    `<div class="w3-hl num">H ${pair(w.hi, celsius(w.hi, w.hiC))} · L ${pair(w.lo, celsius(w.lo, w.loC))}${feels}</div></td>` +
    `<td class="w3-hours"><table class="w3-bars"><tr>${bars}</tr></table></td></tr></table>`;
}

// Family 2x2 with Find My location + "updated X min ago" (placeholder until a source exists).
let where = { ok: false, people: {} };
let whereAt = 0;
export function loadWhere(onDone) {
  if (Date.now() - whereAt < 5 * 60000) return;
  whereAt = Date.now();
  fetch('/api/whereabouts').then((r) => r.json()).then((d) => { where = d || where; onDone(); }).catch(() => {});
}
function ago(iso) {
  const m = Math.max(0, Math.round((now() - new Date(iso)) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : `${Math.round(h / 24)} d ago`;
}
export function family3() {
  const cell = (p) => {
    const loc = where.ok && where.people && where.people[p.id];
    const place = loc ? esc(loc.place || 'Unknown') : '<span class="f3-na">Location off</span>';
    const when = loc && loc.at ? `Updated ${esc(ago(loc.at))}` : 'Find My not connected';
    return `<td class="f3-c"><button class="f3" type="button" data-go="${p.id}" style="${pstyle(p)}">${avatar(p)}` +
      `<span class="f3-m"><b>${esc(p.name)}</b><span class="f3-p">${place}</span><small>${when}</small></span></button></td>`;
  };
  return `<table class="f3-t"><tr>${cell(FAMILY[0])}${cell(FAMILY[1])}</tr><tr>${cell(FAMILY[2])}${cell(FAMILY[3])}</tr></table>`;
}

// One family calendar: Today + next 4 days, chip color = owner's color.
const SLOTS = 4;
export function days3() {
  const n = now();
  const today = ymd(n);
  let cols = '';
  for (let i = 0; i < 5; i++) {
    const day = addDaysYmd(today, i);
    const dp = dayParts(day);
    const list = state.events.filter((e) => onDay(e, day))
      .filter((e) => i > 0 || e.allDay || new Date(e.end) > n)
      .sort((a, b) => (a.allDay === b.allDay ? String(a.start).localeCompare(String(b.start)) : (a.allDay ? -1 : 1)));
    const shown = list.length > SLOTS ? list.slice(0, SLOTS - 1) : list;
    const more = list.length - shown.length;
    let cells = shown.map((e) => {
      const p = owner(e);
      return `<button class="c3-ev" type="button" data-ev="${esc(e.id)}" style="${pstyle(p)}">` +
        `<span class="c3-t">${esc(e.allDay ? 'All day' : formatTime(e.start))}</span>` +
        `<span class="c3-n">${esc(compactTitle(e.displayTitle || e.title))}</span></button>`;
    }).join('');
    if (more > 0) cells += `<button class="c3-ev c3-more" type="button" data-go="calendar">+${more} more</button>`;
    if (!list.length) cells = '<div class="c3-ev c3-free serif"><i>Free</i></div>';
    for (let k = Math.max(shown.length + (more > 0 ? 1 : 0), 1); k < SLOTS; k++) cells += '<div class="c3-ev c3-empty"></div>';
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dp.weekday.slice(0, 3);
    cols += `<td class="c3-col${i === 0 ? ' is-today' : ''}"><div class="c3-h"><b>${esc(label)}</b><span class="num">${esc(dp.month.slice(0, 3))} ${esc(dp.day)}</span></div>${cells}</td>`;
  }
  return `<div class="label c3-label">Family calendar</div><table class="c3"><tr>${cols}</tr></table>`;
}

// Chores as per-person progress rings (data = existing chores store; actions pending).
export function chores3(routine) {
  const ids = FAMILY.map((p) => p.id).concat(['any']);
  const cells = ids.map((id) => {
    const list = state.chores.filter((c) => c.routine === routine.id && c.who === id);
    const done = list.filter((c) => c.done).length;
    const p = id === 'any'
      ? { id: 'any', name: 'Anyone', color: '#8C8C86', rgb: '140, 140, 134', ink: '#1F3A3A' }
      : FAMILY.find((m) => m.id === id);
    const label = list.length ? `${done}/${list.length}` : '–';
    return `<td class="r3" style="${pstyle(p)}"><div class="r3-dial">${ring(done, list.length)}<b class="num">${label}</b></div><span>${esc(p.name)}</span></td>`;
  }).join('');
  return `<div class="label">Chores · ${esc(routine.name)} <em class="r3-tag">Preview</em></div><table class="r3-t"><tr>${cells}</tr></table>`;
}

export function shop3() {
  const open = state.groceries.filter((g) => !g.done);
  return `<div class="label">Grocery</div><div class="g3-stat"><span class="num">${open.length}</span> <small>items to get</small></div>` +
    `<ul class="g3-list">${open.slice(0, 6).map((g) => `<li><i></i>${esc(g.name)}</li>`).join('')}</ul>`;
}
