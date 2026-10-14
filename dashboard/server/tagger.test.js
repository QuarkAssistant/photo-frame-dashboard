import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify, loadMap, plan } from './tagger.js';

const map = loadMap();

test('classifies Portuguese grocery names', () => {
  assert.deepEqual(classify('Toddy grande', map), ['#intlfresh', '#napervillefresh']);
  assert.deepEqual(classify('Sabonete', map), ['#target', '#walmart', '#costco', '#jewel', '#marianos', '#dollartree']);
  assert.deepEqual(classify('Creme dental', map), ['#target', '#walmart', '#costco', '#jewel', '#marianos', '#dollartree']);
  assert.deepEqual(classify('Cebola', map), ['#any']);
  assert.deepEqual(classify('Something unknown', map), ['#any']);
  for (const n of ['Salsinha','Milho doce','Refrigerante','Gelo','Talheres, prato e copos descartáveis','Guardanapo','Oats']) assert.ok(classify(n, map), n);
  assert.ok(classify('Gelo', map).includes('#costco'));
  assert.ok(classify('Guardanapo', map).includes('#dollartree'));
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

test('failure path: counts failures, flags stale after 3, notifies once, recovers', async () => {
  const { taggerTick, isStale } = await import('./tagger.js');
  const status = { consecutiveFailures: 0, lastSuccess: null, stale: false };
  const logs = [];
  const notes = [];
  const bad = { list: async () => { throw new Error('simulated EventKit failure'); }, log: (l) => logs.push(l), notify: (n) => notes.push(n), dryRun: true };
  for (let i = 0; i < 3; i++) await taggerTick(bad, status);
  assert.equal(status.consecutiveFailures, 3);
  assert.equal(status.lastError, 'simulated EventKit failure');
  assert.equal(status.stale, true);
  assert.equal(notes.length, 1);
  assert.equal(logs.length, 3);
  assert.match(logs[2], / error failures=3 /);
  const good = { list: async () => [], log: (l) => logs.push(l), notify: (n) => notes.push(n), dryRun: true };
  await taggerTick(good, status);
  assert.equal(status.consecutiveFailures, 0);
  assert.equal(status.stale, false);
  assert.ok(status.lastSuccess);
  assert.equal(notes.length, 2);
  assert.equal(isStale({ consecutiveFailures: 0, lastSuccess: new Date(Date.now() - 31 * 60000).toISOString() }), true);
});

test('dashboard never sees store tags', async () => {
  const { stripStoreTags } = await import('./reminders.js');
  assert.equal(stripStoreTags('stores: #any'), '');
  assert.equal(stripStoreTags('buy 2\nStores: #costco #target\nbig one'), 'buy 2\nbig one');
});
