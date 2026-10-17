import assert from 'node:assert/strict';
import test from 'node:test';
import { eventsFromIcs } from './ical.js';
import { parseUniform } from './uniform.js';

test('parses common uniform lines', () => {
  const a = parseUniform('Arrive 30 min early\\nUniform: White jersey / Navy shorts');
  assert.equal(a.text, 'White jersey / Navy shorts');
  assert.deepEqual(a.colors.map((c) => c.name), ['white', 'navy']);
  assert.deepEqual(parseUniform('Kit - Home').colors, []);
  assert.equal(parseUniform('Uniform colors: red\\, black').colors.length, 2);
  assert.equal(parseUniform('Bring water'), null);
  // Real-world shapes (made-up content):
  const b = parseUniform('Team: Tigers\\n Uniform: Red Jersey/black shorts & socks (Arrival Time: 8:30 AM (Central Time (US & Canada)))');
  assert.equal(b.text, 'Red Jersey/black shorts & socks');
  assert.deepEqual(b.colors.map((c) => c.name), ['red', 'black']);
  const c = parseUniform('Uniforme: “Wear Orange” — laranja. Shorts e meias não especificados.');
  assert.equal(c.text, 'Orange');
  assert.deepEqual(c.colors.map((x) => x.name), ['orange']);
  const d = parseUniform('Kit: Wear Blue (Coach Someone email, Oct 1)');
  assert.equal(d.text, 'Blue');
  assert.equal(parseUniform('Uniform: All black').colors[0].name, 'black');
  assert.equal(parseUniform(''), null);
});

const ICS = (summary, desc) => `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:fixture-1
DTSTART:20300105T150000Z
DTEND:20300105T160000Z
SUMMARY:${summary}
DESCRIPTION:${desc}
END:VEVENT
END:VCALENDAR`;

test('soccer events carry uniform; other events and notes stay private', () => {
  const [ev] = eventsFromIcs(ICS('⚽️ Kid — Tigers vs Hawks', 'Field 9\\nUniform: Yellow / Black'));
  assert.deepEqual(ev.uniform.colors.map((c) => c.name), ['yellow', 'black']);
  assert.equal(JSON.stringify(ev).includes('Field 9'), false);
  const [other] = eventsFromIcs(ICS('Dentist', 'Uniform: White'));
  assert.equal(other.uniform, undefined);
});
