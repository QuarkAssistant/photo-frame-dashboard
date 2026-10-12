import { FAMILY } from '../../family.js';
import { addDaysYmd, weekdayIndex, ymd } from '../../time.js';
import { state } from '../data.js';
import { icon } from '../icons.js';
import { now, register } from '../app.js';
import { dayParts, esc, formatRange, formatTime, onDay, owner, pstyle, relDay } from '../ui.js';

let mode = 'agenda';
let weekShift = 0;

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
    `<span class="ag-main"><b>${esc(e.displayTitle || e.title)}</b>` +
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
    const list = state.events.filter((e) => onDay(e, day));
    const chips = list.map((e) => {
      const p = owner(e);
      const time = e.allDay ? 'All day' : formatTime(new Date(e.start), false);
      return `<button class="wk-ev" type="button" data-ev="${esc(e.id)}" style="${pstyle(p)}">` +
        `<span>${esc(time)}</span><b>${esc(e.displayTitle || e.title)}</b></button>`;
    }).join('') || '<div class="wk-free serif"><i>Clear</i></div>';
    cols += `<div class="wk-col${day === today ? ' is-today' : ''}">` +
      `<div class="wk-h"><b>${esc(dp.weekday.slice(0, 3))}</b><span class="num">${esc(dp.day)}</span></div>` +
      `<div class="wk-list">${chips}</div></div>`;
  }
  return cols;
}

function paint(el) {
  el.querySelector('.cal-body').innerHTML = mode === 'week' ? `<div class="week">${week()}</div>` : `<div class="agenda">${agenda()}</div>`;
  el.querySelectorAll('[data-cal]').forEach((b) => b.classList.toggle('is-on', b.dataset.cal === mode));
  const label = el.querySelector('.cal-range');
  if (label) {
    if (mode === 'week') {
      const start = weekStart(ymd(now()));
      const end = addDaysYmd(start, 6);
      const a = dayParts(start);
      const b = dayParts(end);
      label.textContent = `${a.month.slice(0, 3)} ${a.day} – ${b.month.slice(0, 3)} ${b.day}`;
    } else label.textContent = 'Next 14 days';
  }
  const prev = el.querySelector('[data-week="-1"]');
  const next = el.querySelector('[data-week="1"]');
  if (prev) prev.disabled = weekShift <= 0;
  if (next) next.disabled = weekShift >= 1;
  el.querySelector('.cal-nav').hidden = mode !== 'week';
}

register('calendar', {
  show(el) {
    if (!el.dataset.built) {
      el.dataset.built = '1';
      el.innerHTML = `<div class="cal">` +
        `<header class="cal-head"><h1 class="serif">Calendar</h1><span class="cal-range"></span>` +
        `<div class="cal-nav"><button type="button" data-week="-1" aria-label="Previous week">${icon('left', 26)}</button>` +
        `<button type="button" data-week="1" aria-label="Next week">${icon('right', 26)}</button></div>` +
        `<div class="seg"><button type="button" data-cal="agenda">Agenda</button><button type="button" data-cal="week">Week</button></div>` +
        `</header><div class="cal-body"></div></div>`;
      el.addEventListener('click', (e) => {
        const w = e.target.closest('[data-week]');
        if (!w || w.disabled) return;
        weekShift = Math.max(0, Math.min(1, weekShift + Number(w.dataset.week)));
        paint(el);
      });
    }
    paint(el);
  },
  setMode(next) {
    mode = next === 'week' ? 'week' : 'agenda';
    const el = document.getElementById('view-calendar');
    if (el) paint(el);
  },
});
