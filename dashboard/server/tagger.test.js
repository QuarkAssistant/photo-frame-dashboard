import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify, loadMap, plan } from './tagger.js';

const map = loadMap();

test('classifies Portuguese grocery names', () => {
  assert.deepEqual(classify('Toddy grande', map), ['#intlfresh', '#napervillefresh']);
  assert.deepEqual(classify('Sabonete', map), ['#target', '#walmart', '#costco', '#jewel', '#marianos', '#dollartree']);
  assert.deepEqual(classify('Creme dental', map), ['#target', '#walmart', '#costco', '#jewel', '#marianos', '#dollartree']);
  assert.deepEqual(classify('Cebola', map), ['#any']);
  assert.equal(classify('Something unknown', map), null);
});

test('adds a line, keeping other notes', () => {
  const r = plan('buy 2\nthe big one', ['#any'], null);
  assert.equal(r.action, 'add');
  assert.equal(r.notes, 'buy 2\nthe big one\nstores: #any');
  assert.equal(plan('', ['#any'], null).notes, 'stores: #any');
});

test('replaces only a line the tagger wrote itself', () => {
  const r = plan('note\nstores: #costco', ['#any'], 'stores: #costco');
  assert.equal(r.action, 'replace');
  assert.equal(r.notes, 'note\nstores: #any');
});

test('never overwrites a hand-edited line', () => {
  assert.equal(plan('stores: #costco #hmart', ['#any'], 'stores: #costco').action, 'hand-edited');
  assert.equal(plan('stores: #jewel', ['#any'], null).action, 'hand-edited');
});

test('same line is a no-op', () => {
  assert.equal(plan('x\nstores: #any', ['#any'], null).action, 'same');
});
