import test from 'node:test';
import assert from 'node:assert/strict';
import { isHomePlace, labelHome } from './homeplace.js';
const ADDR = '12 Example Circle, Springfield, ZZ 00000';
test('device at home street becomes Home', () => {
  const p = { a: { source: 'device', place: 'Example Cir, Springfield', detail: 'findmy' }, b: { source: 'device', place: 'Main St, Springfield' }, c: { source: 'people', place: 'Example Cir' } };
  labelHome(p, ADDR);
  assert.equal(p.a.place, 'Home'); assert.equal(p.a.detail, 'home');
  assert.equal(p.b.place, 'Main St, Springfield');
  assert.equal(p.c.place, 'Example Cir');
});
test('no address means no change', () => { assert.equal(isHomePlace('Example Cir', ''), false); });

import { isHomeAddress, labelHomeEvents } from './homeplace.js';
test('calendar locations at the home address become Home', () => {
  assert.equal(isHomeAddress('12 Example Circle, Springfield, ZZ 00000, United States', ADDR), true);
  assert.equal(isHomeAddress('Home\n12 Example Cir, Springfield', ADDR), true);
  assert.equal(isHomeAddress('12 example circle', ADDR), true);
  assert.equal(isHomeAddress('14 Example Circle, Springfield', ADDR), false);
  assert.equal(isHomeAddress('12 Main Street, Springfield', ADDR), false);
  assert.equal(isHomeAddress('Example Circle', ADDR), false);
  assert.equal(isHomeAddress('12 Example Circle', ''), false);
  const out = labelHomeEvents([{ id: 'a', location: '12 Example Cir, Springfield' }, { id: 'b', location: 'Field 3' }, { id: 'c' }], ADDR);
  assert.deepEqual(out[0], { id: 'a', location: 'Home', atHome: true });
  assert.deepEqual(out[1], { id: 'b', location: 'Field 3' });
  assert.deepEqual(out[2], { id: 'c' });
});
