import { FAMILY } from '../../family.js';
import { addDaysYmd, weekdayIndex, ymd } from '../../time.js';
import { state } from '../data.js';
import { icon } from '../icons.js';
import { now, register } from '../app.js';
import { dayParts, esc, eventTitle, formatRange, formatTime, onDay, owner, pstyle, relDay } from '../ui.js';

const calQ = typeof location !== 'undefined' ? (location.search.match(/[?&]cal=(week|month)\b/) || [])[1] : null;
let mode = calQ || 'agenda';
let monthShift = 0;
let weekShift = 0;
const WK_SLOTS = 6;

function weekStart(iso) {
  const dow = weekdayIndex(iso);
  return addDaysYmd(iso, -dow + weekShift * 7);
}

function eventRow(e) {
  const p = owner(e);
  const time = e.allDay ? 'All day' : formatTime(new Date(e.start));
  const who = e.everyone ? 'Everyone' : (FAMILY.find((m) => m.id === e.people[0])?.name || '');
  return `<button class="ag" type="button" data-ev="${esc(e.id)}" style="${pstyle(p)}">` +
    `<span class="ag-time">${esc(time)}</span>` +
    `<span class="ag-main"><b>${esc(eventTitle(e))}</b>` +
    (e.location ? `<small>${esc(e.location)}</small>` : '') +
    `</span><span class="ag-who">${esc(who)}</span></button>`;
}

function agenda() {
  const today = ymd(now());
  let html = '';
  for (let i = 0; i < 14; i++) {
    const day = addDaysYmd(today, i);
    const list = state.events.filter((e) => onDay(e, day))
      .sort((a, b) => (a.allDay === b.allDay ? String(a.start).localeCompare(String(b.start)) : (a.allDay ? -1 : 1)));
    if (!list.length) continue;
    const dp = dayParts(day);
    html += `<section class="ag-day${day === today ? ' is-today' : ''}">` +
      `<header><b>${esc(relDay(day))}</b><span class="serif">${esc(dp.month)} ${esc(dp.day)}</span></header>` +
      list.map(eventRow).join('') +
      `</section>`;
  }
  if (!html) html = `<div class="empty serif">Nothing on the calendar for the next two weeks.</div>`;
  return html;
}

function week() {
  const start = weekStart(ymd(now()));
  const today = ymd(now());
  let cols = '';
  for (let i = 0; i < 7; i++) {
    const day = addDaysYmd(start, i);
    const dp = dayParts(day);
    const list = state.events.filter((e) => onDay(e, day))
      .sort((a, b) => (a.allDay === b.allDay ? String(a.start).localeCompare(String(b.start)) : (a.allDay ? -1 : 1)));
    // Equal day cells: same slot count every day, overflow -> "+N more".
    const shownList = list.length > WK_SLOTS ? list.slice(0, WK_SLOTS - 1) : list;
    const more = list.length - shownList.length;
    const chips = shownList.map((e) => {
      const p = owner(e);
      const time = e.allDay ? 'All day' : formatTime(e.start);
      return `<button class="wk-ev" type="button" data-ev="${esc(e.id)}" style="${pstyle(p)}">` +
        `<span>${esc(time)}</span><b>${esc(eventTitle(e))}</b></button>`;
    }).join('') + (more > 0 ? `<button class="wk-ev wk-more" type="button" data-cal="agenda">+${more} more</button>` : '') ||
      '<div class="wk-free serif"><i>Clear</i></div>';
    cols += `<div class="wk-col${day === today ? ' is-today' : ''}">` +
      `<div class="wk-h"><b>${esc(dp.weekday.slice(0, 3))}</b><span class="num">${esc(dp.day)}</span></div>` +
      `<div class="wk-list">${chips}</div></div>`;
  }
  return cols;
}

// Full month: Sunday-first table, fixed-height cells, up to 3 chips + "+N".
function month() {
  const today = ymd(now());
  const [y, m] = today.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + monthShift, 1));
  const firstYmd = first.toISOString().slice(0, 10);
  const start = addDaysYmd(firstYmd, -first.getUTCDay());
  const monthNo = first.getUTCMonth();
  let rows = '';
  for (let w = 0; w < 6; w++) {
    let cells = '';
    for (let d = 0; d < 7; d++) {
      const day = addDaysYmd(start, w * 7 + d);
      const inMonth = new Date(`${day}T12:00:00Z`).getUTCMonth() === monthNo;
      const list = state.events.filter((e) => onDay(e, day))
        .sort((a, b) => (a.allDay === b.allDay ? String(a.start).localeCompare(String(b.start)) : (a.allDay ? -1 : 1)));
      const shown = list.length > 3 ? list.slice(0, 2) : list;
      const more = list.length - shown.length;
      const chips = shown.map((e) => `<button class="mo-ev" type="button" data-ev="${esc(e.id)}" style="${pstyle(owner(e))}">` +
        `${e.allDay ? '' : `<b>${esc(formatTime(e.start).replace(':00', ''))}</b> `}${esc(eventTitle(e))}</button>`).join('') +
        (more > 0 ? `<span class="mo-more">+${more} more</span>` : '');
      cells += `<td class="mo-c${inMonth ? '' : ' is-out'}${day === today ? ' is-today' : ''}"><span class="mo-d num">${Number(day.slice(8))}</span>${chips}</td>`;
    }
    rows += `<tr>${cells}</tr>`;
    if (addDaysYmd(start, (w + 1) * 7) > addDaysYmd(firstYmd, 31) && w >= 4) break;
  }
  const head = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((n) => `<th>${n}</th>`).join('');
  return `<table class="month"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function legend() {
  const sw = (color, label) => `<span class="lg"><i style="background:${color}"></i>${esc(label)}</span>`;
  return FAMILY.map((p) => sw(p.color, p.name)).join('') + sw('#1F3A3A', 'Family / everyone') +
    sw('#2E6B3F', 'Holiday BR') + sw('#1F3A5A', 'Holiday US') + sw('#C8102E', 'Flamengo');
}

function paint(el) {
  el.querySelector('.cal-body').innerHTML = mode === 'week' ? `<div class="week">${week()}</div>` : mode === 'month' ? month() : `<div class="agenda">${agenda()}</div>`;
  el.querySelector('.cal-legend').innerHTML = legend();
  el.querySelectorAll('[data-cal]').forEach((b) => b.classList.toggle('is-on', b.dataset.cal === mode));
  const label = el.querySelector('.cal-range');
  if (label) {
    if (mode === 'month') {
      const [y, m] = ymd(now()).split('-').map(Number);
      label.textContent = new Date(Date.UTC(y, m - 1 + monthShift, 1)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
    } else if (mode === 'week') {
      const start = weekStart(ymd(now()));
      const end = addDaysYmd(start, 6);
      const a = dayParts(start);
      const b = dayParts(end);
      label.textContent = `${a.month.slice(0, 3)} ${a.day} – ${b.month.slice(0, 3)} ${b.day}`;
    } else label.textContent = 'Next 14 days';
  }
  const prev = el.querySelector('[data-week="-1"]');
  const next = el.querySelector('[data-week="1"]');
  const sh = mode === 'month' ? monthShift : weekShift;
  if (prev) prev.disabled = sh <= 0;
  if (next) next.disabled = sh >= 1;
  el.querySelector('.cal-nav').hidden = mode === 'agenda';
}

register('calendar', {
  show(el) {
    if (!el.dataset.built) {
      el.dataset.built = '1';
      el.innerHTML = `<div class="cal">` +
        `<header class="cal-head"><h1 class="serif">Calendar</h1><span class="cal-range"></span>` +
        `<div class="cal-nav"><button type="button" data-week="-1" aria-label="Previous week">${icon('left', 26)}</button>` +
        `<button type="button" data-week="1" aria-label="Next week">${icon('right', 26)}</button></div>` +
        `<div class="seg"><button type="button" data-cal="agenda">Agenda</button><button type="button" data-cal="week">Week</button><button type="button" data-cal="month">Month</button></div>` +
        `</header><div class="cal-body"></div><div class="cal-legend"></div></div>`;
      el.addEventListener('click', (e) => {
        const w = e.target.closest('[data-week]');
        if (!w || w.disabled) return;
        if (mode === 'month') monthShift = Math.max(0, Math.min(1, monthShift + Number(w.dataset.week)));
        else weekShift = Math.max(0, Math.min(1, weekShift + Number(w.dataset.week)));
        paint(el);
      });
    }
    paint(el);
  },
  setMode(next) {
    mode = next === 'week' || next === 'month' ? next : 'agenda';
    const el = document.getElementById('view-calendar');
    if (el) paint(el);
  },
});
