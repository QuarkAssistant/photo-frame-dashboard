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
