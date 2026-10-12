import { displayTitle } from './family.js';
import { addDaysYmd, parts, ymd } from './time.js';

// Collapse punctuation, possessives, and a trailing s so
// "Indigenous Peoples' Day" and "Indigenous People Day" match,
// without treating "Team Training" and "Strength and Conditioning" as one event.
export function normEventTitle(title) {
  let text = displayTitle(String(title || ''));
  text = text.normalize('NFKD').replace(/\p{M}+/gu, '');
  text = text.replace(/\p{Extended_Pictographic}/gu, '');
  text = text.replace(/[\uFE0F\u200D]/g, '');
  text = text.toLowerCase();
  text = text.replace(/['\u2019]s\b/g, '');
  text = text.replace(/s['\u2019]/g, '');
  text = text.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  text = text.replace(/\b([a-z]{2,})s\b/g, '$1');
  return text;
}

export function eventDay(event) {
  if (!event) return '';
  if (event.allDay) return String(event.start || '').slice(0, 10);
  const d = new Date(event.start);
  if (Number.isNaN(d.getTime())) return String(event.start || '').slice(0, 10);
  return ymd(d);
}

export function isMidnightPlaceholder(event) {
  if (!event || event.allDay || !event.start) return false;
  const d = new Date(event.start);
  if (Number.isNaN(d.getTime())) return false;
  const p = parts(d);
  return p.hour === 0 && p.minute === 0;
}

function spansMostOfDay(event) {
  if (!isMidnightPlaceholder(event)) return false;
  const dur = new Date(event.end) - new Date(event.start);
  return dur >= 20 * 60 * 60 * 1000;
}

function asAllDay(event) {
  const day = eventDay(event);
  return { ...event, allDay: true, start: day, end: addDaysYmd(day, 1) };
}

// Same normalized title on the same Chicago day: keep the all-day copy.
export function dedupeEvents(events) {
  const groups = new Map();
  for (const event of events || []) {
    const key = `${eventDay(event)}|${normEventTitle(event.title)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  const out = [];
  for (const group of groups.values()) {
    const allDay = group.filter((event) => event.allDay);
    if (allDay.length) {
      out.push(allDay[0]);
      continue;
    }
    const timed = group.filter((event) => !isMidnightPlaceholder(event));
    const pool = (timed.length ? timed : group)
      .slice()
      .sort((a, b) => String(a.start).localeCompare(String(b.start)));
    const pick = pool[0];
    out.push(spansMostOfDay(pick) ? asAllDay(pick) : pick);
  }
  out.sort((a, b) => {
    const ad = eventDay(a);
    const bd = eventDay(b);
    if (ad !== bd) return ad < bd ? -1 : 1;
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return String(a.start).localeCompare(String(b.start));
  });
  return out;
}
