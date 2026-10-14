import assert from 'node:assert/strict';
import { test } from 'node:test';
import { remindersFake, resetFakeReminders, fakeList, saveGrocery, loadGroceries } from './reminders.js';

test('tests always use the fake Reminders backend', () => {
  assert.equal(remindersFake(), true);
});

test('adds go to the in-memory list, never the real one', async () => {
  resetFakeReminders([{ title: 'Tomate' }]);
  const store = { groceries: () => ({ groceries: [] }), grocery: async () => ({ groceries: [] }) };
  const out = await saveGrocery(store, { action: 'add', name: 'Test item' });
  assert.ok(fakeList.items.some((i) => i.title === 'Test item'));
  assert.ok(out.groceries.some((g) => g.name === 'Test item'));
  const again = await loadGroceries(store);
  assert.equal(again.groceries.length, 2);
});
