// v2 Home (Phase 1): pure data shaping, no DOM. Tested in server/homev2.test.js.
// Everything here works from real feeds only (calendar, extras, weather, chores,
// groceries). When a feed has nothing, the card shows nothing rather than a sample.
import { isMidnightPlaceholder } from '../events.js';
import { addDaysYmd, parts, weekdayIndex, ymd } from '../time.js';
import { compactTitle, eventTitle, formatRange, formatTime, nextUp } from './ui.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

// "Saturday, October 17" in America/Chicago.
export function fullDate(date) {
  const day = ymd(date);
  const [, m, d] = day.split('-').map(Number);
  return `${WEEKDAYS[weekdayIndex(day)]}, ${MONTHS[m - 1]} ${d}`;
}

// Brazilian holiday names in English. Anything not listed keeps its own name.
export const BR_HOLIDAYS_EN = {
  'Confraternização Universal': "New Year's Day",
  'Ano Novo': "New Year's Day",
  Carnaval: 'Carnival',
  'Sexta-feira Santa': 'Good Friday',
  'Sexta-Feira Santa': 'Good Friday',
  'Paixão de Cristo': 'Good Friday',
  'Páscoa': 'Easter Sunday',
  'Domingo de Páscoa': 'Easter Sunday',
  Tiradentes: 'Tiradentes Day',
  'Dia do Trabalhador': 'Labour Day',
  'Dia do Trabalho': 'Labour Day',
  'Dia Mundial do Trabalho': 'Labour Day',
  'Corpus Christi': 'Corpus Christi',
  'Independência do Brasil': 'Independence Day',
  'Dia da Independência': 'Independence Day',
  'Nossa Senhora Aparecida': 'Our Lady of Aparecida',
  'Dia de Nossa Senhora Aparecida': 'Our Lady of Aparecida',
  'Dia das Crianças': "Children's Day",
  'Dia de Finados': "All Souls' Day",
  Finados: "All Souls' Day",
  'Proclamação da República': 'Republic Proclamation Day',
  'Dia da Consciência Negra': 'Black Consciousness Day',
  'Dia Nacional de Zumbi e da Consciência Negra': 'Black Consciousness Day',
  'Véspera de Natal': 'Christmas Eve',
  Natal: 'Christmas Day',
  'Véspera de Ano Novo': "New Year's Eve",
};

// Holiday from /api/extras ({ local, name, country }) → English display name.
export function holidayName(h) {
  if (!h) return '';
  const local = String(h.local || '').trim();
  if (BR_HOLIDAYS_EN[local]) return BR_HOLIDAYS_EN[local];
  const name = String(h.name || '').trim();
  return name || local;
}

// Any title that is exactly a Brazilian holiday name becomes the English one.
export function englishTitle(title) {
  const t = String(title || '').trim();
  return BR_HOLIDAYS_EN[t] || t;
}

const BIRTHDAY = /birthday|anivers/i;

// Title as v2 Home shows it: the calendar's own title (owner prefix stripped, as in v1),
// with Brazilian holidays in English. No renaming.
export function homeTitle(e) {
  return englishTitle(compactTitle(eventTitle(e)));
}

// Live event: how far along it is and when it ends ("Ends 6:00 PM", "3 hr 10 min left").
export function liveProgress(e, now) {
  if (!e || e.allDay) return null;
  const a = new Date(e.start).getTime();
  const b = new Date(e.end).getTime();
  const t = now.getTime();
  if (!(b > a) || t < a || t >= b) return null;
  const mins = Math.ceil((b - t) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  let left;
  if (mins <= 1) left = 'Ending now';
  else if (h === 0) left = `${m} min left`;
  else left = `${h} hr${m ? ` ${m} min` : ''} left`;
  return { pct: Math.round(((t - a) / (b - a)) * 100), ends: `Ends ${formatTime(new Date(b))}`, left };
}

// Whole calendar days from today to the given day (both America/Chicago).
export function daysUntil(dayIso, now) {
  const a = ymd(now);
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = dayIso.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

// "Today 4:30 PM", "Tomorrow 9:00 AM", "Sun 4:30 PM". Always the full time with AM/PM.
export function dayTime(iso, now) {
  const d = new Date(iso);
  const n = daysUntil(ymd(d), now);
  const t = formatTime(d);
  if (n === 0) return `Today ${t}`;
  if (n === 1) return `Tomorrow ${t}`;
  return `${parts(d).weekday} ${t}`;
}

// Right-hand label of a Coming up row.
export function countdownLabel(item, now) {
  const day = item.allDay ? item.start : ymd(new Date(item.start));
  const n = daysUntil(day, now);
  if (item.daysOnly) return n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${n} days`;
  if (!item.allDay && !item.timeTBD && n < 7) {
    // Short weekday keeps the name readable; the time itself is never cut.
    const t = formatTime(item.start);
    return n <= 0 ? `Today ${t}` : `${parts(new Date(item.start)).weekday} ${t}`;
  }
  if (n <= 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n < 7) return WEEKDAYS[weekdayIndex(day)].slice(0, 3);
  return `${n} days`;
}

const TRIP = /\btrip\b|vacation|viagem|flight/i;
const GAME = /\bcup\b|tournament|showcase|championship|\bfinals?\b/i;

function calendarKind(title) {
  if (BIRTHDAY.test(title)) return 'birthday';
  if (TRIP.test(title) && !/meeting/i.test(title)) return /field trip/i.test(title) ? 'outing' : 'trip';
  if (GAME.test(title)) return 'game';
  return null;
}

// Next three countdowns: birthdays, trips and tournaments from the family calendar,
// US + Brazil holidays and Flamengo games. Real feeds only; nothing is made up.
export function comingUp(events, extras, now, limit = 3) {
  const t = now.getTime();
  const today = ymd(now);
  const out = [];
  const seen = new Set();
  for (const e of events || []) {
    const kind = calendarKind(englishTitle(compactTitle(eventTitle(e))));
    const title = homeTitle(e);
    if (!kind) continue;
    const startDay = e.allDay ? e.start : ymd(new Date(e.start));
    if (e.allDay ? e.end <= today : new Date(e.start).getTime() <= t) continue;
    if (startDay < today) continue; // already running
    const key = `${kind}|${title}`;
    if (seen.has(key)) continue; // a 3-day cup shows once
    seen.add(key);
    out.push({ kind, title, start: e.start, allDay: Boolean(e.allDay), people: e.people || [], everyone: e.everyone });
  }
  for (const b of (extras && extras.familyBirthdays) || []) {
    const date = nextBirthday(b, today);
    if (date) out.push({ kind: 'birthday', title: `${b.name}'s birthday`, start: date, allDay: true, daysOnly: true, people: [b.id] });
  }
  for (const h of (extras && extras.holidays) || []) {
    if (!h.date || h.date < today) continue;
    out.push({ kind: 'holiday', title: holidayName(h), start: h.date, allDay: true, country: h.country });
  }
  for (const f of (extras && extras.fixtures) || []) {
    if (!f.start || Date.parse(f.start) + 2 * 3600000 < t) continue;
    const title = f.home === false ? `${f.opponent} × Flamengo` : `Flamengo × ${f.opponent}`;
    out.push({ kind: 'flamengo', title, start: f.start, allDay: false, timeTBD: Boolean(f.timeTBD) });
  }
  const sortKey = (i) => (i.allDay ? `${i.start}T00:00` : new Date(i.start).toISOString());
  out.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  return out.slice(0, limit).map((i) => ({ ...i, when: countdownLabel(i, now) }));
}

// Next date (YYYY-MM-DD, today included) of a { month, day } family birthday from /api/extras.
// Feb 29 falls on Feb 28 in other years.
export function nextBirthday(b, today) {
  if (!b || !(b.month >= 1 && b.month <= 12) || !(b.day >= 1 && b.day <= 31)) return null;
  const pad = (v) => String(v).padStart(2, '0');
  const on = (y) => {
    const last = new Date(Date.UTC(y, b.month, 0)).getUTCDate();
    return `${y}-${pad(b.month)}-${pad(Math.min(b.day, last))}`;
  };
  const y = Number(today.slice(0, 4));
  return on(y) >= today ? on(y) : on(y + 1);
}

// Next Up plus the one event after it ("Then").
export function nextAndThen(events, now) {
  const up = nextUp(events || [], now);
  if (!up) return { up: null, then: null };
  const cur = up.event;
  const after = (events || [])
    .filter((e) => e.id !== cur.id && !e.allDay && !isMidnightPlaceholder(e))
    .filter((e) => new Date(e.start) >= (cur.allDay ? now : new Date(cur.start)) && new Date(e.start) > now)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return { up, then: after[0] || null };
}

// Big number on the Next Up card: Now, a minute countdown inside the hour, else the time.
export function heroBig(up, now) {
  if (!up) return null;
  const e = up.event;
  if (up.phase === 'now') return { text: 'Now', unit: '' };
  if (up.phase === 'allday' || e.allDay) return { text: 'All', unit: 'day' };
  const mins = Math.round((new Date(e.start) - now) / 60000);
  if (mins >= 0 && mins < 60) return { text: String(Math.max(1, mins)), unit: 'min' };
  const label = formatTime(e.start);
  const sp = label.lastIndexOf(' ');
  return { text: label.slice(0, sp), unit: label.slice(sp + 1) };
}

// "Today · 4:30 – 6:00 PM · Practice field". Only the first part of an address.
export function heroDetails(e, now) {
  const n = e.allDay ? daysUntil(e.start, now) : daysUntil(ymd(new Date(e.start)), now);
  let day = n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : null;
  if (!day) {
    const key = e.allDay ? e.start : ymd(new Date(e.start));
    const [, m, d] = key.split('-').map(Number);
    day = `${WEEKDAYS[weekdayIndex(key)].slice(0, 3)}, ${MONTHS[m - 1].slice(0, 3)} ${d}`;
  }
  const bits = [day, e.allDay ? 'All day' : formatRange(e.start, e.end)];
  const place = String(e.location || '').split(/\n|,/)[0].trim();
  if (place) bits.push(place);
  return bits.join(' · ');
}

// Leave-by pill from /api/eta ({ ok, minutes, source }). 5 min buffer, like v1.
export function leaveBy(e, eta, now) {
  if (!e || e.allDay || !eta || !eta.ok || !Number.isFinite(Number(eta.minutes))) return null;
  const start = new Date(e.start).getTime();
  const minutes = Math.round(Number(eta.minutes));
  const leaveAt = start - (minutes + 5) * 60000;
  const left = (leaveAt - now.getTime()) / 60000;
  const drive = `${minutes} min${eta.source === 'tomtom' ? ' · live traffic' : ' drive'}`;
  if (now.getTime() > start) return null;
  if (left > 0) return { text: `Leave by ${formatTime(new Date(leaveAt))}`, drive, state: left <= 15 ? 'soon' : 'ok' };
  if (now.getTime() <= start - minutes * 60000) return { text: 'Leave now', drive, state: 'now' };
  return { text: `Running late · ${Math.ceil((now.getTime() + minutes * 60000 - start) / 60000)} min`, drive, state: 'late' };
}

// Rain line from the 24 h chart: first hour from now with a 40 %+ chance.
export function rainLine(chart, minPop = 40, hours = 12) {
  const list = (chart || []).slice(0, hours);
  const i = list.findIndex((h) => Number(h.pop) >= minPop);
  if (i < 0) return '';
  const peak = Math.max(...list.slice(i, i + 6).map((h) => Number(h.pop) || 0));
  if (i === 0) return `Rain now · ${Math.round(peak)}%`;
  return `Rain likely from ${list[i].label} · ${Math.round(peak)}%`;
}

const pairC = (f, c) => `${Math.round(f)}°F / ${c}°C`;

// Context line under Inside: rain when relevant, else sunset by day and tomorrow at night.
export function weatherContext(w, dark, toC) {
  if (!w) return null;
  const rain = rainLine(w.chart || w.hours);
  if (rain) return { icon: 'drop', text: rain };
  const tomorrow = (w.days || [])[1];
  if (dark && tomorrow) return { icon: 'moonl', text: `Tomorrow · High ${pairC(tomorrow.hi, toC(tomorrow.hi, tomorrow.hiC))}` };
  if (w.sunset) {
    const m = /T(\d{2}):(\d{2})/.exec(w.sunset);
    if (m) {
      const h = Number(m[1]);
      const label = `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
      return { icon: 'sunset', text: `Sunset ${label}` };
    }
  }
  return null;
}

// Initials inside the chore rings.
export const INITIALS = { thiago: 'T', gilmara: 'G', jp: 'JP', lucas: 'L' };
