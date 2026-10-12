import { collapseColonDup, isMidnightPlaceholder } from '../events.js';
import { EVERYONE, memberById } from '../family.js';
import { addDaysYmd, parts, TIMEZONE, ymd } from '../time.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function pstyle(p) {
  return `--c:${p.color};--c-rgb:${p.rgb};--c-ink:${p.ink}`;
}

export function avatar(p) {
  const wide = p.initial && p.initial.length > 1 ? ' avatar--wide' : '';
  return `<span class="avatar${wide}" style="${pstyle(p)}">${esc(p.initial)}</span>`;
}

export function clockBits(date) {
  const p = parts(date);
  let h = p.hour % 12;
  if (h === 0) h = 12;
  return { h, m: String(p.minute).padStart(2, '0'), ap: p.hour >= 12 ? 'PM' : 'AM', hour24: p.hour };
}

// The only event-time formatter. Always includes a space and AM/PM.
export function formatTime(date) {
  const c = clockBits(date instanceof Date ? date : new Date(date));
  return `${c.h}:${c.m} ${c.ap}`;
}

export function formatRange(aIso, bIso) {
  return `${formatTime(aIso)} – ${formatTime(bIso)}`;
}

// Home columns already name the person, so the academy prefix is noise.
export function compactTitle(title) {
  const stripped = collapseColonDup(title).replace(/^U1[34] Boys Academy\s*[-–—]\s*/i, '');
  return collapseColonDup(stripped);
}

export function eventTitle(event) {
  const raw = event && typeof event === 'object' ? (event.displayTitle || event.title || '') : event;
  return collapseColonDup(raw);
}

// Next timed event for one person inside the 14-day board window.
// Personal events win. Shared all-day holidays are skipped. None → en dash.
export function nextPersonWhen(events, personId, now = new Date()) {
  const today = ymd(now);
  const horizon = addDaysYmd(today, 14);
  const timed = (events || [])
    .filter((e) => e.people && e.people.includes(personId) && !e.allDay && !isMidnightPlaceholder(e))
    .filter((e) => {
      const start = new Date(e.start);
      if (Number.isNaN(start.getTime()) || new Date(e.end) <= now) return false;
      return ymd(start) < horizon;
    })
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const next = timed.find((e) => !e.everyone) || timed[0];
  if (!next) return '\u2013';
  if (new Date(next.start) <= now) return 'Now';
  const day = ymd(new Date(next.start));
  const t = formatTime(next.start);
  if (day === today) return t;
  const weekday = (dayParts(day).weekday || '').slice(0, 3);
  return `${weekday} ${t}`;
}

export function dayParts(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 18, 0, 0));
  const map = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, weekday: 'long', month: 'long', day: 'numeric',
  }).formatToParts(dt)) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return map;
}

export function relDay(iso, now = new Date()) {
  const t = ymd(now);
  if (iso === t) return 'Today';
  if (iso === addDaysYmd(t, 1)) return 'Tomorrow';
  if (iso === addDaysYmd(t, -1)) return 'Yesterday';
  return dayParts(iso).weekday;
}

export function onDay(ev, iso) {
  if (ev.allDay) return ev.start <= iso && iso < ev.end;
  return ymd(new Date(ev.start)) === iso;
}

export function owner(ev) {
  if (!ev || ev.everyone || ev.people.length !== 1) return EVERYONE;
  return memberById(ev.people[0]);
}

export function nextUp(events, now) {
  const timed = events.filter((e) => !e.allDay && !isMidnightPlaceholder(e));
  const live = timed
    .filter((e) => new Date(e.start) <= now && new Date(e.end) > now)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  if (live[0]) return { event: live[0], phase: 'now' };
  const up = timed
    .filter((e) => new Date(e.start) > now)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  if (up[0]) return { event: up[0], phase: 'soon' };
  const today = ymd(now);
  const ad = events.find((e) => e.allDay && onDay(e, today));
  if (ad) return { event: ad, phase: 'allday' };
  return null;
}

export function ring(done, total) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const f = total ? Math.max(0, Math.min(1, done / total)) : 0;
  const fg = f > 0
    ? `<circle cx="32" cy="32" r="${r}" class="ring-fg" stroke-dasharray="${(c * f).toFixed(2)} ${(c - c * f).toFixed(2)}" transform="rotate(-90 32 32)"/>`
    : '';
  return `<svg class="ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${r}" class="ring-bg"/>${fg}</svg>`;
}
