// v2 Calendar (proposal mockups 04 and 05). Registers only with the v2 shell; v1 keeps
// views/calendar.js. Week (default), Agenda, Month and Coming up share one header.
// Real data only: family calendar, /api/extras holidays + Flamengo, FAMILY_BIRTHDAYS.
import { FAMILY } from '../../family.js';
import { addDaysYmd, ymd } from '../../time.js';
import { state } from '../data.js';
import { currentRoute, go, now, register, UI_V2 } from '../app.js';
import {
  cardTime, cardTitle, category, shortTitle, CAT, dayItems, FILTERS, isPast, monthGrid, shortDay, slots, weekLabel, weekStart,
} from '../calv2data.js';
import { comingUp, daysUntil, heroDetails } from '../homev2data.js';
import { ui } from '../v2icons.js';
import { dayParts, esc, formatTime, onDay } from '../ui.js';

const WEEK_SLOTS = 4;
const AGENDA_DAYS = 14;
let mode = 'week';
let filter = 'all';
let weekShift = 0;
let monthShift = 0;
const WEEK_MIN = -2;
const WEEK_MAX = 4;
const MONTH_MIN = -1;
const MONTH_MAX = 1;

const MODES = [['agenda', 'Agenda'], ['week', 'Week'], ['month', 'Month'], ['coming', 'Coming up']];
const KIND = {
  birthday: ['cake', '#8EAD74'], trip: ['plane', '#3D78BC'], outing: ['bus', '#3D78BC'], game: ['trophy', '#E08A2E'],
  holiday: ['flag', '#1F6F6B'], flamengo: ['ball', '#AB2320'],
};
const ARROW_L = '<svg class="cv2-ar" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>';
const ARROW_R = '<svg class="cv2-ar" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>';

function card(e, n, cls = 'cv2-ev') {
  const c = category(e);
  const tag = e.kind ? 'div' : 'button';
  const attrs = e.kind ? '' : ` type="button" data-ev="${esc(e.id)}"`;
  return `<${tag} class="${cls}${isPast(e, n) ? ' is-past' : ''}"${attrs} style="--k:${c.color};--k-rgb:${c.rgb}">` +
    `<span class="cv2-t">${esc(cardTime(e))}</span><b>${esc(shortTitle(e))}</b><span class="cv2-w">${esc(c.label)}</span></${tag}>`;
}

function head(n) {
  let title;
  let nav = '';
  if (mode === 'coming') title = '<h1>Coming up</h1><span class="cv2-sub">next up · countdowns</span>';
  else {
    const today = ymd(n);
    if (mode === 'week') title = `<h1>${esc(weekLabel(weekStart(today, weekShift)))}</h1>`;
    else if (mode === 'month') title = `<h1>${esc(monthGrid(today, monthShift).label)}</h1>`;
    else title = '<h1>Next 14 days</h1>';
    if (mode !== 'agenda') {
      const sh = mode === 'week' ? weekShift : monthShift;
      const lo = mode === 'week' ? WEEK_MIN : MONTH_MIN;
      const hi = mode === 'week' ? WEEK_MAX : MONTH_MAX;
      nav = `<div class="cv2-nav">${sh !== 0 ? '<button class="cv2-today" type="button" data-cvnav="0">Today</button>' : ''}` +
        `<button class="cv2-rb" type="button" data-cvnav="-1" aria-label="Previous"${sh <= lo ? ' disabled' : ''}>${ARROW_L}</button>` +
        `<button class="cv2-rb is-fill" type="button" data-cvnav="1" aria-label="Next"${sh >= hi ? ' disabled' : ''}>${ARROW_R}</button></div>`;
    }
  }
  const seg = MODES.map(([id, label]) =>
    `<button type="button" ${id === 'coming' ? 'data-go="coming-up"' : `data-cal="${id}"`}${id === mode ? ' class="is-on"' : ''}>${label}</button>`).join('');
  const chips = mode === 'coming' ? '' : `<div class="cv2-filters">${Object.entries(FILTERS).map(([id, f]) =>
    `<button type="button" data-cvf="${id}"${id === filter ? ' class="is-on"' : ''}>${esc(f.label)}</button>`).join('')}` +
    `<span class="cv2-fsub">${esc(FILTERS[filter].sub)}</span></div>`;
  return `<header class="cv2-head${mode === 'coming' ? ' is-coming' : ''}">${title}<div class="cv2-seg">${seg}</div>${nav}</header>${chips}`;
}

function week(n) {
  const today = ymd(n);
  const start = weekStart(today, weekShift);
  let cols = '';
  for (let i = 0; i < 7; i++) {
    const day = addDaysYmd(start, i);
    const dp = dayParts(day);
    const { shown, more } = slots(dayItems(state.events, state.extras, day, filter), WEEK_SLOTS);
    cols += `<div class="cv2-col${day === today ? ' is-today' : ''}">` +
      `<div class="cv2-dh"><span>${esc(dp.weekday.slice(0, 3))} ${Number(day.slice(8))}</span></div>` +
      shown.map((e) => card(e, n)).join('') +
      (more ? `<button class="cv2-more" type="button" data-cvday="${day}">+${more} more</button>` : '') + '</div>';
  }
  return `<div class="cv2-panel cv2-week">${cols}</div>${legend()}`;
}

function agenda(n) {
  const today = ymd(n);
  let html = '';
  for (let i = 0; i < AGENDA_DAYS; i++) {
    const day = addDaysYmd(today, i);
    const list = dayItems(state.events, state.extras, day, filter);
    if (!list.length) continue;
    const rel = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dayParts(day).weekday;
    html += `<section class="cv2-ag-day"><h2>${esc(rel)}<span>${esc(shortDay(day).slice(4))}</span></h2>` +
      list.map((e) => {
        const c = category(e);
        const tag = e.kind ? 'div' : 'button';
        const place = !e.kind && e.location ? String(e.location).split(/\n|,/)[0].trim() : '';
        return `<${tag} class="cv2-ag${isPast(e, n) ? ' is-past' : ''}"${e.kind ? '' : ` type="button" data-ev="${esc(e.id)}"`} style="--k:${c.color};--k-rgb:${c.rgb}">` +
          `<span class="cv2-ag-t">${esc(cardTime(e))}</span><b>${esc(cardTitle(e))}</b>` +
          `<span class="cv2-ag-w">${esc(place ? `${c.label} · ${place}` : c.label)}</span></${tag}>`;
      }).join('') + '</section>';
  }
  return `<div class="cv2-panel cv2-agenda">${html || '<div class="cv2-none">Nothing on the calendar for the next two weeks</div>'}</div>${legend()}`;
}

function month(n) {
  const today = ymd(n);
  const g = monthGrid(today, monthShift);
  const headRow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<span>${d}</span>`).join('');
  const rows = g.weeks.map((wk) => `<div class="cv2-mrow">${wk.map((day) => {
    const list = dayItems(state.events, state.extras, day, filter);
    const { shown, more } = slots(list, g.weeks.length > 5 ? 2 : 3);
    const out = day < g.first || day > g.last;
    const chips = shown.map((e) => {
      const c = category(e);
      const t = e.allDay || e.timeTBD ? '' : `<i>${esc(formatTime(e.start).replace(':00', ''))}</i> `;
      const tag = e.kind ? 'div' : 'button';
      return `<${tag} class="cv2-mev${isPast(e, n) ? ' is-past' : ''}"${e.kind ? '' : ` type="button" data-ev="${esc(e.id)}"`} style="--k:${c.color};--k-rgb:${c.rgb}">${t}${esc(shortTitle(e))}</${tag}>`;
    }).join('');
    return `<div class="cv2-mc${out ? ' is-out' : ''}${day === today ? ' is-today' : ''}"><span class="cv2-md">${Number(day.slice(8))}</span>${chips}` +
      (more ? `<button class="cv2-mmore" type="button" data-cvday="${day}">+${more} more</button>` : '') + '</div>';
  }).join('')}</div>`).join('');
  return `<div class="cv2-panel cv2-month g${g.weeks.length}"><div class="cv2-mhead">${headRow}</div>${rows}</div>${legend()}`;
}

function legend() {
  const sw = (color, label) => `<span><i style="background:${color}"></i>${esc(label)}</span>`;
  return `<div class="cv2-legend">${FAMILY.map((p) => sw(p.color, p.name)).join('')}` +
    `${sw(CAT.family.color, 'Family')}${sw(CAT.parents.color, 'Parents')}${sw(CAT.holiday.color, CAT.holiday.label)}${sw(CAT.flamengo.color, 'Flamengo')}</div>`;
}

// ---- Coming up tab (mockup 05): today's next events, countdown tiles, the rest as a list.
function who(e) {
  const c = category(e);
  return `<span class="cv2-who"><i style="background:${c.color}"></i>${esc(c.label)}</span>`;
}
function bigCount(item, n) {
  const day = item.allDay ? item.start : ymd(new Date(item.start));
  const d = daysUntil(day, n);
  if (d <= 0) return '<b class="is-word">Today</b><span>&nbsp;</span>';
  return `<b>${d}</b><span>${d === 1 ? 'DAY' : 'DAYS'}</span>`;
}
function itemDay(item) {
  return shortDay(item.allDay ? item.start : ymd(new Date(item.start)));
}
function coming(n) {
  const today = ymd(n);
  const tomorrow = addDaysYmd(today, 1);
  const todayLeft = dayItems(state.events, state.extras, today, 'all')
    .filter((e) => !e.allDay && new Date(e.end) > n).slice(0, 3);
  const cards = todayLeft.map((e, i) => {
    const place = e.kind ? '' : String(e.location || '').split(/\n|,/)[0].trim();
    const live = new Date(e.start) <= n;
    const tag = e.kind ? 'div' : 'button';
    return `<${tag} class="cv2-nu${i === 0 ? ' is-first' : ''}"${e.kind ? '' : ` type="button" data-ev="${esc(e.id)}"`}>` +
      `<div class="cv2-nu-top"><b>${live ? 'Now' : esc(formatTime(e.start))}</b>${who(e)}</div>` +
      `<div class="cv2-nu-n">${esc(cardTitle(e))}</div>` +
      `<div class="cv2-nu-d">${esc(live ? `Until ${formatTime(e.end)}${place ? ` · ${place}` : ''}` : place || heroDetails(e, n).split(' · ')[1] || '')}</div></${tag}>`;
  }).join('');
  const tom = dayItems(state.events, state.extras, tomorrow, 'all').slice(0, todayLeft.length > 1 ? 2 : 4)
    .map((e) => `<div class="cv2-tm"><b>${esc(cardTime(e))}</b> ${esc(cardTitle(e))} · ${esc(category(e).label)}</div>`).join('');
  const left = `<div class="cv2-panel cv2-cu-left"><div class="cv2-lbl">Next up · Today</div>` +
    (cards || '<div class="cv2-none">Nothing else today</div>') +
    `<div class="cv2-lbl cv2-lbl-tm">Tomorrow</div>${tom || '<div class="cv2-tm">Nothing on the calendar</div>'}</div>`;

  const items = comingUp(state.events, state.extras, n, 11);
  const tiles = items.slice(0, 4).map((i) => {
    const [ic, col] = KIND[i.kind] || KIND.holiday;
    return `<div class="cv2-tile"><span class="cv2-ti" style="background:${col}">${ui(ic, 26, 2.4)}</span>` +
      `<div class="cv2-tn">${bigCount(i, n)}</div><b class="cv2-tt">${esc(i.title)}</b><span class="cv2-td">${esc(itemDay(i))}</span></div>`;
  }).join('');
  const rows = items.slice(4).map((i) => {
    const [ic, col] = KIND[i.kind] || KIND.holiday;
    const t = i.allDay || i.timeTBD ? '' : ` · ${formatTime(i.start)}`;
    return `<div class="cv2-cl"><span class="cv2-ti" style="background:${col}">${ui(ic, 22, 2.4)}</span>` +
      `<b>${esc(i.title)}</b><span class="cv2-cl-d">${esc(itemDay(i) + t)}</span><b class="cv2-cl-w">${esc(i.when)}</b></div>`;
  }).join('');
  return left + `<div class="cv2-tiles">${tiles || '<div class="cv2-none">No countdowns yet</div>'}</div>` +
    `<div class="cv2-panel cv2-cu-list"><div class="cv2-lbl">Later · birthdays, holidays, games and trips</div>${rows || '<div class="cv2-none">Nothing further out yet</div>'}</div>`;
}

function body(n) {
  if (mode === 'coming') return coming(n);
  if (mode === 'month') return month(n);
  if (mode === 'agenda') return agenda(n);
  return week(n);
}

function paint(el) {
  const n = now();
  const html = `<div class="cv2${mode === 'coming' ? ' is-coming' : ''} m-${mode}">${head(n)}<div class="cv2-body">${body(n)}</div></div>`;
  if (el.__html === html) return;
  el.__html = html;
  el.innerHTML = html;
}

function closeLayer() {
  const layer = document.getElementById('sheetLayer');
  layer.classList.remove('is-open');
  layer.innerHTML = '';
}

// "+N more": the whole day in a v2 sheet; each row opens the usual event popup.
function openDay(day) {
  const n = now();
  const list = dayItems(state.events, state.extras, day, filter);
  const layer = document.getElementById('sheetLayer');
  layer.innerHTML = '<div class="sheet-scrim" data-close></div><div class="sheet cv2-daysheet">' +
    '<button class="sheet-x" type="button" data-close aria-label="Close">' +
    '<svg viewBox="0 0 24 24" class="cv2-x"><path d="M6 6 18 18M18 6 6 18"/></svg></button>' +
    `<div class="sheet-pad"><div class="sheet-who">${esc(FILTERS[filter].label)}</div><h2 class="sheet-h">${esc(dayParts(day).weekday)}, ${esc(shortDay(day).slice(4))}</h2>` +
    `<div class="cv2-dlist">${list.map((e) => card(e, n, 'cv2-ev cv2-drow')).join('')}</div></div></div>`;
  layer.classList.add('is-open');
  layer.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeLayer));
}

function bindOnce(el) {
  if (el.dataset.cv2) return;
  el.dataset.cv2 = '1';
  el.addEventListener('click', (e) => {
    const f = e.target.closest('[data-cvf]');
    if (f) { filter = f.dataset.cvf; paint(el); return; }
    const nav = e.target.closest('[data-cvnav]');
    if (nav && !nav.disabled) {
      const d = Number(nav.dataset.cvnav);
      if (mode === 'month') monthShift = d === 0 ? 0 : Math.max(MONTH_MIN, Math.min(MONTH_MAX, monthShift + d));
      else weekShift = d === 0 ? 0 : Math.max(WEEK_MIN, Math.min(WEEK_MAX, weekShift + d));
      paint(el);
      return;
    }
    const day = e.target.closest('[data-cvday]');
    if (day) openDay(day.dataset.cvday);
  });
}

if (UI_V2) {
  const calendarQ = typeof location !== 'undefined' ? (location.search.match(/[?&]cal=(agenda|week|month)\b/) || [])[1] : null;
  if (calendarQ) mode = calendarQ;
  register('calendar', {
    show(el) {
      if (mode === 'coming') mode = 'week';
      bindOnce(el);
      paint(el);
    },
    setMode(next) {
      mode = next === 'agenda' || next === 'month' ? next : 'week';
      const r = currentRoute();
      if (!r || r.view !== 'calendar') { go('calendar'); return; }
      const el = document.getElementById('view-calendar');
      if (el) paint(el);
    },
  });
  register('coming-up', {
    show(el) {
      mode = 'coming';
      bindOnce(el);
      paint(el);
    },
  });
}
