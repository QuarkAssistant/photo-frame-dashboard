import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inRoutine, choreSubtitle, sortChores } from '../chores.js';

const R = [{ id: 'morning', name: 'Morning' }, { id: 'after', name: 'After school' }];

test('one-off chores count in every routine', () => {
  const one = { oneOff: true, due: '2026-10-15', done: false };
  assert.ok(inRoutine(one, 'morning') && inRoutine(one, 'evening'));
  assert.ok(inRoutine({ routine: 'after' }, 'after'));
  assert.ok(!inRoutine({ routine: 'after' }, 'morning'));
});

test('subtitle: routine name, today, overdue (still visible after midnight)', () => {
  assert.equal(choreSubtitle({ routine: 'after' }, R, '2026-10-15'), 'After school');
  assert.equal(choreSubtitle({ oneOff: true, due: '2026-10-15' }, R, '2026-10-15'), 'One-off · today');
  assert.equal(choreSubtitle({ oneOff: true, due: '2026-10-15' }, R, '2026-10-16'), 'One-off · overdue');
  assert.equal(choreSubtitle({ oneOff: true, due: '2026-10-20' }, R, '2026-10-15'), 'One-off · Oct 20');
});

test('open one-offs first, then recurring, then done one-offs', () => {
  const s = sortChores([{ id: 'a', oneOff: true, done: true }, { id: 'b', oneOff: true, done: false }, { id: 'c', routine: 'morning' }]);
  assert.deepEqual(s.map((c) => c.id), ['b', 'c', 'a']);
});
