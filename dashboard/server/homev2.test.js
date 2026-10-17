import assert from 'node:assert/strict';
import test from 'node:test';
import { displayTitle } from '../family.js';
import {
  comingUp, countdownLabel, homeTitle, liveProgress, daysUntil, englishTitle, fullDate, heroBig, heroDetails, holidayName, leaveBy,
  nextAndThen, rainLine, weatherContext,
} from '../js/homev2data.js';

// Fixtures are made up. Saturday Oct 17 2026, 2:18 PM America/Chicago (UTC-5).
const NOW = new Date('2026-10-17T19:18:00Z');
const ev = (id, title, start, end, extra = {}) => ({ id, title, displayTitle: displayTitle(title), start, end, allDay: false, people: ['jp'], everyone: false, ...extra });

test('full date line', () => {
  assert.equal(fullDate(NOW), 'Saturday, October 17');
  assert.equal(fullDate(new Date('2026-10-18T04:30:00Z')), 'Saturday, October 17'); // 11:30 PM local
});

test('Brazilian holidays show in English; unknown names stay', () => {
  assert.equal(holidayName({ local: 'Dia de Finados', name: '', country: 'BR' }), "All Souls' Day");
  assert.equal(holidayName({ local: 'Proclamação da República', name: 'x', country: 'BR' }), 'Republic Proclamation Day');
  assert.equal(holidayName({ local: 'Veterans Day', name: 'Veterans Day', country: 'US' }), 'Veterans Day');
  assert.equal(holidayName({ local: 'Festa Local', name: '', country: 'BR' }), 'Festa Local');
  assert.equal(englishTitle('Natal'), 'Christmas Day');
  assert.equal(englishTitle('Team Training'), 'Team Training');
});

test('countdown labels keep the full time and never cut it', () => {
  assert.equal(daysUntil('2026-11-02', NOW), 16);
  assert.equal(countdownLabel({ start: '2026-11-02', allDay: true }, NOW), '16 days');
  assert.equal(countdownLabel({ start: '2026-10-18', allDay: true }, NOW), 'Tomorrow');
  assert.equal(countdownLabel({ start: '2026-10-18T21:30:00Z', allDay: false }, NOW), 'Sun 4:30 PM');
  assert.equal(countdownLabel({ start: '2026-10-17T23:00:00Z', allDay: false }, NOW), 'Today 6:00 PM');
  assert.equal(countdownLabel({ start: '2026-10-30T23:00:00Z', allDay: false }, NOW), '13 days');
});

test('coming up mixes birthdays, trips, holidays and Flamengo, soonest first', () => {
  const events = [
    ev('a', 'Lucas — 12th Birthday Party', '2026-10-17T19:00:00Z', '2026-10-17T23:00:00Z'), // already started
    ev('b', 'Lucas — Zoo Field Trip', '2026-10-23T13:00:00Z', '2026-10-23T20:00:00Z'),
    ev('c', 'Trip — Informational Meeting', '2026-10-20T00:00:00Z', '2026-10-20T01:00:00Z'),
    ev('d', 'Team Training', '2026-10-19T00:00:00Z', '2026-10-19T01:30:00Z'),
    { id: 'e1', title: 'Midwest November Cup', start: '2026-11-13', end: '2026-11-14', allDay: true, people: ['lucas'] },
    { id: 'e2', title: 'Midwest November Cup', start: '2026-11-14', end: '2026-11-15', allDay: true, people: ['lucas'] },
  ];
  const extras = {
    holidays: [{ date: '2026-11-02', name: "All Souls' Day", local: 'Dia de Finados', country: 'BR' }],
    fixtures: [{ start: '2026-10-18T21:30Z', home: false, opponent: 'Bahia', timeTBD: false }],
  };
  const list = comingUp(events, extras, NOW, 5);
  assert.deepEqual(list.map((i) => [i.kind, i.title, i.when]), [
    ['flamengo', 'Bahia × Flamengo', 'Sun 4:30 PM'],
    ['outing', 'Zoo Field Trip', 'Fri 8:00 AM'],
    ['holiday', "All Souls' Day", '16 days'],
    ['game', 'Midwest November Cup', '27 days'],
  ]);
  assert.equal(comingUp(events, extras, NOW).length, 3);
  assert.deepEqual(comingUp([], {}, NOW), []);
});

test('next up, then, big number and details', () => {
  const events = [
    ev('x', 'Soccer practice', '2026-10-17T19:40:00Z', '2026-10-17T21:00:00Z', { location: 'Practice field, 1 Main St' }),
    ev('y', 'Guitar lesson', '2026-10-17T23:00:00Z', '2026-10-18T00:00:00Z'),
  ];
  const { up, then } = nextAndThen(events, NOW);
  assert.equal(up.event.id, 'x');
  assert.equal(then.id, 'y');
  assert.deepEqual(heroBig(up, NOW), { text: '22', unit: 'min' });
  assert.deepEqual(heroBig(up, new Date('2026-10-17T17:00:00Z')), { text: '2:40', unit: 'PM' });
  assert.deepEqual(heroBig({ event: events[0], phase: 'now' }, NOW), { text: 'Now', unit: '' });
  assert.equal(heroDetails(events[0], NOW), 'Today · 2:40 PM – 4:00 PM · Practice field');
  assert.equal(heroDetails(ev('z', 'x', '2026-10-21T14:00:00Z', '2026-10-21T15:00:00Z'), NOW), 'Wed, Oct 21 · 9:00 AM – 10:00 AM');
  assert.deepEqual(nextAndThen([], NOW), { up: null, then: null });
});

test('leave by comes only from a real drive time', () => {
  const e = ev('x', 'Game', '2026-10-17T21:30:00Z', '2026-10-17T23:00:00Z', { location: 'Field' });
  assert.equal(leaveBy(e, null, NOW), null);
  assert.equal(leaveBy(e, { ok: false }, NOW), null);
  assert.deepEqual(leaveBy(e, { ok: true, minutes: 14, source: 'tomtom' }, NOW),
    { text: 'Leave by 4:11 PM', drive: '14 min · live traffic', state: 'ok' });
  assert.equal(leaveBy(e, { ok: true, minutes: 14, source: 'osrm' }, new Date('2026-10-17T21:05:00Z')).state, 'soon');
  assert.equal(leaveBy(e, { ok: true, minutes: 14 }, new Date('2026-10-17T21:13:00Z')).text, 'Leave now');
  assert.match(leaveBy(e, { ok: true, minutes: 14 }, new Date('2026-10-17T21:20:00Z')).text, /^Running late · 4 min$/);
});

test('rain and context lines', () => {
  const chart = [{ label: 'Now', pop: 5 }, { label: '3 PM', pop: 20 }, { label: '6 PM', pop: 45 }, { label: '7 PM', pop: 60 }];
  assert.equal(rainLine(chart), 'Rain likely from 6 PM · 60%');
  assert.equal(rainLine([{ label: 'Now', pop: 70 }]), 'Rain now · 70%');
  assert.equal(rainLine([{ label: 'Now', pop: 10 }]), '');
  const toC = (f, c) => c;
  const w = { chart: [{ label: 'Now', pop: 0 }], sunset: '2026-10-17T18:07', days: [{}, { hi: 61, hiC: 16 }] };
  assert.deepEqual(weatherContext(w, false, toC), { icon: 'sunset', text: 'Sunset 6:07 PM' });
  assert.deepEqual(weatherContext(w, true, toC), { icon: 'moonl', text: 'Tomorrow · High 61°F / 16°C' });
  assert.equal(weatherContext({ ...w, chart }, true, toC).icon, 'drop');
});

test('v2 Home CSS stays inside WebView 106 limits', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../css/v2/home.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /oklch|color-mix|:has\(/);
  assert.doesNotMatch(css, /#[0-9a-f]{8}\b|#[0-9a-f]{4}\b/i);
  assert.doesNotMatch(css, /\{[^}]*\{/); // no nesting
  assert.doesNotMatch(css, /Instrument Serif|Archivo/);
});

test('calendar titles are shown as written, birthdays included (no renaming)', () => {
  const at = (title) => ev('x', title, '2026-10-24T19:00:00Z', '2026-10-24T23:00:00Z', { people: ['lucas'] });
  assert.equal(homeTitle(at('Lucas — 12th Birthday Party')), '12th Birthday Party');
  assert.equal(homeTitle(at('Lucas — Sam’s 12th Birthday Celebration')), 'Sam’s 12th Birthday Celebration');
  assert.equal(homeTitle(at("Maya's surprise birthday")), "Maya's surprise birthday");
  assert.equal(homeTitle(at('JP birthday dinner')), 'JP birthday dinner');
  const list = comingUp([at('Lucas — Sam’s 12th Birthday Celebration')], {}, NOW);
  assert.deepEqual(list.map((x) => x.title), ['Sam’s 12th Birthday Celebration']);
  assert.equal(list[0].kind, 'birthday');
});

test('live event shows when it ends and how long is left', () => {
  const e = ev('x', 'Party', '2026-10-17T19:00:00Z', '2026-10-17T23:00:00Z');
  assert.deepEqual(liveProgress(e, new Date('2026-10-17T19:50:00Z')), { pct: 21, ends: 'Ends 6:00 PM', left: '3 hr 10 min left' });
  assert.equal(liveProgress(e, new Date('2026-10-17T22:15:00Z')).left, '45 min left');
  assert.equal(liveProgress(e, new Date('2026-10-17T22:00:00Z')).left, '1 hr left');
  assert.equal(liveProgress(e, new Date('2026-10-17T22:59:30Z')).left, 'Ending now');
  assert.equal(liveProgress(e, new Date('2026-10-17T18:00:00Z')), null);
  assert.equal(liveProgress({ ...e, allDay: true }, NOW), null);
});
