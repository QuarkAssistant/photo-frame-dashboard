import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rankQuickAdd } from './reminders.js';

test('dedupes case/accent-insensitively, ranks by frequency then recency, skips open items', () => {
  const h = [
    { title: 'Leite', completed: '2026-01-01T00:00:00Z' },
    { title: 'leite ', completed: '2026-02-01T00:00:00Z' },
    { title: 'Pão', completed: '2026-03-01T00:00:00Z' },
    { title: 'pao', completed: '2026-01-05T00:00:00Z' },
    { title: 'Café', completed: '2026-03-05T00:00:00Z' },
    { title: 'Ovos', completed: '2026-03-06T00:00:00Z' },
    { title: 'Arroz', completed: '2026-03-07T00:00:00Z' },
  ];
  assert.deepEqual(rankQuickAdd(h, ['ARROZ']), ['Pão', 'leite', 'Ovos', 'Café']);
  assert.equal(rankQuickAdd(h, [], 2).length, 2);
});

