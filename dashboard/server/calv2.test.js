import assert from 'node:assert/strict';
import test from 'node:test';
import { displayTitle } from '../family.js';
import {
  cardTime, cardTitle, category, dayItems, extraItems, inFilter, isPast, monthGrid, shortDay, slots, todayOrder, weekLabel, weekStart,
} from '../js/calv2data.js';

const ev = (id, title, start, end, extra = {}) => ({
  id, title, displayTitle: displayTitle(title), start, end, allDay: false, location: '', everyone: false, people: ['jp'], ...extra,
});
const NOW = new Date('2026-10-17T19:18:00Z'); // Sat Oct 17, 2:18 PM Chicago
const EXTRAS = {
  holidays: [{ date: '2026-10-19', name: 'Sample Day', local: 'Dia de Exemplo', country: 'BR' }],
  fixtures: [{ start: '2026-10-18T21:30Z', home: false, opponent: 'Rivals FC', timeTBD: false }],
};

test('week range is Sunday-first and labelled like the mockup', () => {
  assert.equal(weekStart('2026-10-17'), '2026-10-11');
  assert.equal(weekStart('2026-10-17', 1), '2026-10-18');
  assert.equal(weekLabel('2026-10-18'), 'Oct 18 – 24');
  assert.equal(weekLabel('2026-10-25'), 'Oct 25 – 31');
  assert.equal(weekLabel('2026-11-29'), 'Nov 29 – Dec 5');
  assert.equal(shortDay('2026-10-20'), 'Tue Oct 20');
});

test('card colours follow the legend', () => {
  assert.equal(category(ev('a', 'JP — Practice', '', '')).color, '#3D78BC');
  assert.equal(category(ev('a', 'Lucas — Practice', '', '', { people: ['lucas'] })).label, 'Lucas');
  assert.deepEqual([category(ev('a', 'Dinner', '', '', { everyone: true, people: [] })).key, category(ev('a', 'x', '', '', { everyone: true })).label], ['family', 'Family']);
  assert.equal(category(ev('a', 'x', '', '', { people: ['thiago', 'gilmara'] })).key, 'parents');
  assert.equal(category(ev('a', 'x', '', '', { people: ['jp', 'lucas'] })).label, 'JP & Lucas');
  const [hol, fla] = extraItems(EXTRAS);
  assert.deepEqual([category(hol).key, category(hol).label, category(hol).color], ['holiday', 'Holiday BR', '#D9A42B']);
  assert.deepEqual([category(fla).key, fla.title, cardTime(fla)], ['flamengo', 'Rivals FC × Flamengo', '4:30 PM']);
});

test('filters: kids and parents keep family events and holidays', () => {
  const jp = ev('a', 'JP — Practice', '', '');
  const dad = ev('b', 'Thiago — Work trip', '', '', { people: ['thiago'] });
  const fam = ev('c', 'Dinner', '', '', { everyone: true, people: ['thiago', 'gilmara', 'jp', 'lucas'] });
  const [hol, fla] = extraItems(EXTRAS);
  const keep = (f) => [jp, dad, fam, hol, fla].filter((e) => inFilter(e, f)).map((e) => e.id);
  assert.equal(keep('all').length, 5);
  assert.deepEqual(keep('kids'), ['a', 'c', hol.id]);
  assert.deepEqual(keep('parents'), ['b', 'c', hol.id, fla.id]);
});

test('a day lists all-day first, then by time, with extras mixed in', () => {
  const events = [
    ev('late', 'JP — Late', '2026-10-18T23:00:00Z', '2026-10-19T00:00:00Z'),
    ev('early', 'JP — Early', '2026-10-18T13:00:00Z', '2026-10-18T14:00:00Z'),
    ev('ad', 'Picture day', '2026-10-18', '2026-10-19', { allDay: true, everyone: true }),
    ev('other', 'JP — Monday', '2026-10-19T13:00:00Z', '2026-10-19T14:00:00Z'),
  ];
  assert.deepEqual(dayItems(events, EXTRAS, '2026-10-18', 'all').map((e) => e.id), ['ad', 'early', 'fla:2026-10-18T21:30Z', 'late']);
  assert.deepEqual(dayItems(events, EXTRAS, '2026-10-19', 'kids').map((e) => e.id), ['hol:2026-10-19:BR', 'other']);
});

test('fixed card slots turn overflow into +N more', () => {
  assert.deepEqual(slots([1, 2, 3, 4], 4), { shown: [1, 2, 3, 4], more: 0 });
  assert.deepEqual(slots([1, 2, 3, 4, 5], 4), { shown: [1, 2, 3], more: 2 });
});

test('titles stay exactly as written (only the owner prefix is stripped)', () => {
  const e = ev('a', '⚽️ JP — U14 Boys Academy - Team Training', '2026-10-20T21:30:00Z', '2026-10-20T23:00:00Z');
  assert.equal(cardTitle(e), 'U14 Boys Academy - Team Training');
  assert.equal(cardTitle(ev('b', 'Lucas — 12th Birthday Party', '', '')), '12th Birthday Party');
  assert.equal(cardTime(e), '4:30 PM');
  assert.equal(cardTime({ allDay: true }), 'All day');
});

test('past events are dimmed by their end', () => {
  assert.equal(isPast(ev('a', 'x', '2026-10-17T13:00:00Z', '2026-10-17T14:00:00Z'), NOW), true);
  assert.equal(isPast(ev('a', 'x', '2026-10-17T19:00:00Z', '2026-10-17T23:00:00Z'), NOW), false);
  assert.equal(isPast({ allDay: true, start: '2026-10-16', end: '2026-10-17' }, NOW), true);
  assert.equal(isPast({ allDay: true, start: '2026-10-17', end: '2026-10-18' }, NOW), false);
});

test('month grid covers whole weeks', () => {
  const oct = monthGrid('2026-10-17');
  assert.equal(oct.label, 'October 2026');
  assert.equal(oct.weeks.length, 5);
  assert.equal(oct.weeks[0][0], '2026-09-27');
  assert.equal(monthGrid('2026-10-17', -2).weeks.length, 6); // August 2026 starts on a Saturday
  assert.equal(monthGrid('2026-10-17', 1).label, 'November 2026');
});

test("today's column puts live first, then upcoming, then ended", () => {
  const list = [
    ev('ended1', 'JP — Morning game', '2026-10-17T13:00:00Z', '2026-10-17T14:00:00Z'),
    ev('ended2', 'JP — Late morning', '2026-10-17T15:30:00Z', '2026-10-17T17:00:00Z'),
    ev('live', 'JP — Party', '2026-10-17T19:00:00Z', '2026-10-17T23:00:00Z'),
    ev('next', 'JP — Dinner', '2026-10-17T23:30:00Z', '2026-10-18T01:00:00Z'),
    ev('later', 'JP — Movie', '2026-10-18T02:00:00Z', '2026-10-18T04:00:00Z'),
  ];
  const ad = { ...ev('ad', 'Picture day', '2026-10-17', '2026-10-18'), allDay: true };
  assert.deepEqual(todayOrder([ad, ...list], NOW).map((e) => e.id), ['ad', 'live', 'next', 'later', 'ended1', 'ended2']);
  const { shown, more } = slots(todayOrder(list, NOW), 4);
  assert.deepEqual([shown.map((e) => e.id), more], [['live', 'next', 'later'], 2]);
});
