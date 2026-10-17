// v2 Calendar: pure helpers (no DOM), so the week grid, filters and colours are testable.
// Real feeds only: family calendar events, /api/extras holidays and Flamengo fixtures.
import { FAMILY } from '../family.js';
import { addDaysYmd, weekdayIndex, ymd } from '../time.js';
import { dayParts, eventTitle, formatTime, onDay } from './ui.js';
import { holidayName } from './homev2data.js';

const MON = (iso) => dayParts(iso).month.slice(0, 3);
const DAYN = (iso) => Number(iso.slice(8, 10));

// Card colours (mockup 04 legend). rgb is for the tinted card background.
export const CAT = {
  family: { color: '#1F6F6B', rgb: '31, 111, 107', label: 'Family' },
  parents: { color: '#8B7355', rgb: '139, 115, 85', label: 'Parents' },
  holiday: { color: '#D9A42B', rgb: '217, 164, 43', label: 'Holiday US / BR' },
  flamengo: { color: '#1F1F1F', rgb: '31, 31, 31', label: 'Flamengo' },
};
const KIDS = ['jp', 'lucas'];
const PARENTS = ['thiago', 'gilmara'];

export const FILTERS = {
  all: { label: 'Everyone', sub: 'Family calendar · everyone’s events' },
  kids: { label: 'Kids', sub: 'JP and Lucas · plus family events' },
  parents: { label: 'Parents', sub: 'Thiago and Gilmara · plus family events' },
};

// Sunday-first week containing iso, shifted by whole weeks.
export function weekStart(iso, shift = 0) {
  return addDaysYmd(iso, -weekdayIndex(iso) + shift * 7);
}

// "Oct 18 – 24", or "Oct 25 – Nov 1" across a month.
export function weekLabel(start) {
  const end = addDaysYmd(start, 6);
  const a = `${MON(start)} ${DAYN(start)}`;
  return MON(start) === MON(end) ? `${a} – ${DAYN(end)}` : `${a} – ${MON(end)} ${DAYN(end)}`;
}

// Who a calendar event belongs to, as a card colour and a label.
export function category(e) {
  if (e.kind === 'holiday' || e.kind === 'flamengo') return { key: e.kind, ...CAT[e.kind], label: e.who };
  const people = e.people || [];
  if (e.everyone || !people.length) return { key: 'family', ...CAT.family };
  if (people.length === 1) {
    const p = FAMILY.find((m) => m.id === people[0]);
    if (p) return { key: p.id, color: p.color, rgb: p.rgb, label: p.name };
  }
  if (people.length === 2 && PARENTS.every((id) => people.includes(id))) return { key: 'parents', ...CAT.parents };
  const names = people.map((id) => (FAMILY.find((m) => m.id === id) || {}).name).filter(Boolean);
  return { key: 'family', ...CAT.family, label: names.join(' & ') || CAT.family.label };
}

// Everyone: all. Kids / Parents: their own events plus family-wide ones and holidays.
// Flamengo games stay with Everyone and Parents.
export function inFilter(e, filter) {
  if (!filter || filter === 'all') return true;
  if (e.kind === 'holiday') return true;
  if (e.kind === 'flamengo') return filter === 'parents';
  if (e.everyone) return true;
  const want = filter === 'kids' ? KIDS : PARENTS;
  return (e.people || []).some((id) => want.includes(id));
}

// Holidays and Flamengo fixtures from /api/extras as calendar-like items (not tappable).
export function extraItems(extras) {
  const out = [];
  for (const h of (extras && extras.holidays) || []) {
    if (!h.date) continue;
    out.push({ id: `hol:${h.date}:${h.country || ''}`, kind: 'holiday', allDay: true, start: h.date, end: addDaysYmd(h.date, 1),
      title: holidayName(h), who: h.country ? `Holiday ${h.country}` : 'Holiday' });
  }
  for (const f of (extras && extras.fixtures) || []) {
    if (!f.start || !f.opponent) continue;
    const end = new Date(Date.parse(f.start) + 2 * 3600000).toISOString();
    out.push({ id: `fla:${f.start}`, kind: 'flamengo', allDay: false, start: f.start, end, timeTBD: Boolean(f.timeTBD),
      title: f.home === false ? `${f.opponent} × Flamengo` : `Flamengo × ${f.opponent}`, who: 'Flamengo' });
  }
  return out;
}

const order = (a, b) => (a.allDay === b.allDay ? String(a.start).localeCompare(String(b.start)) : (a.allDay ? -1 : 1));

// Everything on one day for a filter, all-day first, then by start time.
export function dayItems(events, extras, day, filter) {
  return (events || []).concat(extraItems(extras))
    .filter((e) => onDay(e, day) && inFilter(e, filter))
    .sort(order);
}

// Today only: happening now, then upcoming, then ended, so a live event is never pushed
// under "+N more" by ones that are over. Chronological (all-day first) inside each group.
export function todayOrder(list, now) {
  const group = (e) => {
    if (isPast(e, now)) return 2;
    if (e.allDay || new Date(e.start) <= now) return 0;
    return 1;
  };
  return list.map((e, i) => [group(e), i, e]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
}

// A fixed number of card slots per column; overflow becomes "+N more" in the last slot.
export function slots(list, max) {
  if (list.length <= max) return { shown: list, more: 0 };
  return { shown: list.slice(0, max - 1), more: list.length - (max - 1) };
}

// Card time line: full AM/PM time or "All day". Titles are shown exactly as written.
export function cardTime(e) {
  if (e.allDay) return 'All day';
  if (e.timeTBD) return 'Time TBD';
  return formatTime(e.start);
}
export function cardTitle(e) {
  return e.kind ? e.title : eventTitle(e);
}

export function isPast(e, now) {
  const end = e.allDay ? `${e.end}` : e.end;
  return e.allDay ? end <= ymd(now) : new Date(end) <= now;
}

// Month grid: Sunday-first weeks covering the month shifted from today's.
export function monthGrid(todayIso, shift = 0) {
  const [y, m] = todayIso.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + shift, 1)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(y, m + shift, 0)).toISOString().slice(0, 10);
  const start = weekStart(first);
  const weeks = [];
  for (let d = start; d <= last; d = addDaysYmd(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDaysYmd(d, i)));
  return { first, last, weeks, label: `${dayParts(first).month} ${first.slice(0, 4)}` };
}

// "Tue Oct 20".
export function shortDay(iso) {
  return `${dayParts(iso).weekday.slice(0, 3)} ${MON(iso)} ${DAYN(iso)}`;
}
