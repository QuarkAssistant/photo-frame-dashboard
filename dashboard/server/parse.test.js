import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { dedupeEvents, normEventTitle } from '../events.js';
import { assignEvent, displayTitle } from '../family.js';
import { fToC, hourLabelFromHour } from '../mock.js';
import { clockLabel, inNightWindow, nightAnchor, parseClockMinutes } from '../night.js';
import { chicagoRange, zonedToUtc } from '../time.js';
import { formatRange, formatTime } from '../js/ui.js';
import { createApi } from './app.js';
import { eventsFromIcs } from './ical.js';

test('assigns the name before an em dash and ignores a leading emoji', () => {
  assert.deepEqual(assignEvent('⚽️ JP — U14 Boys Academy - Team Training').people, ['jp']);
  assert.equal(assignEvent('⚽️ JP — U14 Boys Academy - Team Training').everyone, false);
  assert.equal(displayTitle('⚽️ JP — U14 Boys Academy - Team Training'), 'U14 Boys Academy - Team Training');
  assert.equal(assignEvent('🎹 Lucas — Piano lesson').people[0], 'lucas');
  assert.equal(assignEvent('Gilmara — Dentist').people[0], 'gilmara');
  assert.equal(assignEvent('jp — practice').people[0], 'jp');
  assert.equal(assignEvent('Thiago — Office hours').people[0], 'thiago');
  assert.equal(assignEvent('KJHS — No School (Columbus Day)').everyone, true);
  assert.equal(assignEvent('Dinner at home').everyone, true);
  assert.equal(assignEvent('Brunch — Family brunch').everyone, true);
});

test('converts Chicago wall time through daylight and standard time', () => {
  assert.equal(zonedToUtc(2026, 10, 12, 15, 0, 0).toISOString(), '2026-10-12T20:00:00.000Z');
  assert.equal(zonedToUtc(2026, 1, 15, 15, 0, 0).toISOString(), '2026-01-15T21:00:00.000Z');
});

test('parses TZID, UTC, all-day, folded lines, and escaped commas', () => {
  const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:one
SUMMARY:⚽️ JP — U14 Boys Academy - Team Tra
 ining
DTSTART:20261012T200000Z
DTEND:20261012T210000Z
END:VEVENT
BEGIN:VEVENT
UID:two
SUMMARY:KJHS — No School (Columbus Day)
DTSTART;VALUE=DATE:20261012
DTEND;VALUE=DATE:20261013
END:VEVENT
BEGIN:VEVENT
UID:three
SUMMARY:Gilmara — Dentist\\, cleaning
DTSTART;TZID=America/Chicago:20261012T150000
DTEND;TZID=America/Chicago:20261012T160000
LOCATION:Bright Smiles
END:VEVENT
BEGIN:VEVENT
UID:gone
STATUS:CANCELLED
SUMMARY:Thiago — Cancelled
DTSTART:20261012T180000Z
DTEND:20261012T190000Z
END:VEVENT
BEGIN:VEVENT
UID:later
SUMMARY:Lucas — Next month
DTSTART;TZID=America/Chicago:20261201T100000
DTEND;TZID=America/Chicago:20261201T110000
END:VEVENT
END:VCALENDAR`;
  const { start, end } = chicagoRange(new Date('2026-10-12T15:00:00Z'), 14);
  const events = eventsFromIcs(ics, start, end);
  assert.equal(events.length, 3);
  const jp = events.find((e) => e.people[0] === 'jp' && !e.everyone);
  assert.equal(jp.displayTitle, 'U14 Boys Academy - Team Training');
  assert.equal(jp.start, '2026-10-12T20:00:00.000Z');
  const school = events.find((e) => e.allDay);
  assert.equal(school.everyone, true);
  assert.equal(school.start, '2026-10-12');
  assert.equal(school.end, '2026-10-13');
  const dentist = events.find((e) => e.title.includes('Dentist'));
  assert.equal(dentist.people[0], 'gilmara');
  assert.equal(dentist.displayTitle, 'Dentist, cleaning');
  assert.equal(dentist.location, 'Bright Smiles');
  assert.equal(dentist.start, '2026-10-12T20:00:00.000Z');
});

test('serves mock calendar and toggles a chore when env is missing', async () => {
  delete process.env.ICLOUD_USER;
  delete process.env.ICLOUD_APP_PASSWORD;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coelho-'));
  const handle = createApi({ root });
  const server = http.createServer((req, res) => { handle(req, res); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const cal = await (await fetch(`${base}/api/calendar`)).json();
  assert.equal(cal.source, 'mock');
  assert.ok(cal.events.length > 5);
  assert.ok(cal.events.some((e) => e.people.includes('jp')));
  const chores = await (await fetch(`${base}/api/chores`)).json();
  const id = chores.chores[0].id;
  const toggled = await (await fetch(`${base}/api/chores`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, done: true }),
  })).json();
  assert.equal(toggled.chores.find((c) => c.id === id).done, true);
  const added = await (await fetch(`${base}/api/groceries`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'add', name: 'Oats', cat: 'Pantry' }),
  })).json();
  assert.equal(added.source, 'store');
  assert.ok(added.groceries.some((g) => g.name === 'Oats' && !g.done));
  const grocery = await (await fetch(`${base}/api/grocery`)).json();
  assert.equal(grocery.source, 'store');
  assert.ok(grocery.groceries.some((g) => g.name === 'Oats'));
  const cfg = await (await fetch(`${base}/api/config`)).json();
  assert.equal(cfg.nightStart, '23:00');
  assert.equal(cfg.nightEnd, '06:00');
  assert.equal(cfg.timezone, 'America/Chicago');
  const wx = await (await fetch(`${base}/api/weather`)).json();
  assert.equal(typeof wx.temp, 'number');
  assert.equal(typeof wx.tempC, 'number');
  assert.equal(wx.place, 'Naperville');
  assert.ok(wx.hours.length >= 6 && wx.hours.length <= 8);
  assert.equal(wx.hours[0].label, 'Now');
  for (const hour of wx.hours.slice(1)) assert.match(hour.label, /^\d{1,2} (AM|PM)$/);
  assert.equal(wx.days.length, 5);
  server.close();
});

test('event times always include AM/PM', () => {
  const midnight = zonedToUtc(2026, 10, 12, 0, 0, 0);
  const afternoon = zonedToUtc(2026, 10, 13, 16, 30, 0);
  const evening = zonedToUtc(2026, 10, 13, 18, 0, 0);
  assert.equal(formatTime(midnight), '12:00 AM');
  assert.equal(formatTime(afternoon), '4:30 PM');
  assert.equal(formatTime(afternoon.toISOString()), '4:30 PM');
  assert.equal(formatRange(afternoon.toISOString(), evening.toISOString()), '4:30 PM – 6:00 PM');
  assert.match(formatTime(zonedToUtc(2026, 10, 13, 7, 15, 0)), / AM$/);
});

test('night window wraps midnight and a tap is a separate wake', () => {
  assert.equal(parseClockMinutes('23:00', 0), 23 * 60);
  assert.equal(parseClockMinutes('6:00', 0), 6 * 60);
  assert.equal(parseClockMinutes('25:00', 90), 90);
  assert.equal(parseClockMinutes('nope', 90), 90);
  assert.equal(clockLabel(23 * 60), '23:00');
  assert.equal(inNightWindow(22, 59, 23 * 60, 6 * 60), false);
  assert.equal(inNightWindow(23, 0, 23 * 60, 6 * 60), true);
  assert.equal(inNightWindow(0, 0, 23 * 60, 6 * 60), true);
  assert.equal(inNightWindow(5, 59, 23 * 60, 6 * 60), true);
  assert.equal(inNightWindow(6, 0, 23 * 60, 6 * 60), false);
  assert.equal(inNightWindow(8, 59, 9 * 60, 17 * 60), false);
  assert.equal(inNightWindow(9, 0, 9 * 60, 17 * 60), true);
  assert.equal(inNightWindow(17, 0, 9 * 60, 17 * 60), false);
  assert.equal(inNightWindow(12, 0, 8 * 60, 8 * 60), false);
  const a = nightAnchor(10);
  const b = nightAnchor(11);
  assert.notDeepEqual(a, b);
  assert.ok(a.x >= 8 && a.x <= 71 && a.y >= 12 && a.y <= 69);
});

test('hour labels use a full AM/PM and Celsius tracks Fahrenheit', () => {
  assert.equal(hourLabelFromHour(0, true), 'Now');
  assert.equal(hourLabelFromHour(0, false), '12 AM');
  assert.equal(hourLabelFromHour(1, false), '1 AM');
  assert.equal(hourLabelFromHour(12, false), '12 PM');
  assert.equal(hourLabelFromHour(14, false), '2 PM');
  assert.equal(fToC(61), 16);
  assert.equal(fToC(76), 24);
});

test('keeps one all-day school holiday and both trainings', () => {
  const holiday = "No School (Columbus Day / Indigenous Peoples' Day)";
  const midnight = 'No School - Columbus Day/Indigenous People Day';
  assert.equal(normEventTitle(holiday), normEventTitle(midnight));
  assert.notEqual(
    normEventTitle('U14 Boys Academy - Team Training'),
    normEventTitle('U14 Boys Academy - Strength and Conditioning'),
  );
  const events = dedupeEvents([
    {
      id: 'timed', title: midnight, allDay: false,
      start: '2026-10-12T05:00:00.000Z', end: '2026-10-13T04:59:00.000Z', people: ['jp'],
    },
    {
      id: 'day', title: holiday, allDay: true,
      start: '2026-10-12', end: '2026-10-13', people: ['jp'],
    },
    {
      id: 'train', title: 'JP — U14 Boys Academy - Team Training', allDay: false,
      start: '2026-10-13T21:30:00.000Z', end: '2026-10-13T23:00:00.000Z', people: ['jp'],
    },
    {
      id: 'strength', title: 'JP — U14 Boys Academy - Strength and Conditioning', allDay: false,
      start: '2026-10-13T23:00:00.000Z', end: '2026-10-14T00:30:00.000Z', people: ['jp'],
    },
  ]);
  const school = events.filter((e) => normEventTitle(e.title) === normEventTitle(holiday));
  assert.equal(school.length, 1);
  assert.equal(school[0].id, 'day');
  assert.equal(school[0].allDay, true);
  assert.deepEqual(events.filter((e) => e.id === 'train' || e.id === 'strength').map((e) => e.id).sort(), ['strength', 'train']);
});
