import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assignEvent, displayTitle } from '../family.js';
import { chicagoRange, zonedToUtc } from '../time.js';
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
  assert.ok(added.groceries.some((g) => g.name === 'Oats' && !g.done));
  const wx = await (await fetch(`${base}/api/weather`)).json();
  assert.ok(wx.temp != null);
  assert.equal(wx.hours.length, 7);
  server.close();
});
