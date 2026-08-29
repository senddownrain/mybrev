import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPrayerTagRemovalPlan,
  buildPrayerTagStats,
} from '../src/utils/prayerCategoryAdmin.js';

test('buildPrayerTagStats counts each tag once per prayer and category', () => {
  const stats = buildPrayerTagStats(
    [
      { id: 'p1', tags: ['Марыя', 'Марыя', 'Навэнна'] },
      { id: 'p2', tags: ['Марыя'] },
    ],
    [
      { id: 'c1', tags: ['Марыя'] },
      { id: 'c2', tags: ['Навэнна', 'Марыя'] },
    ],
  );

  assert.deepEqual(stats, [
    { name: 'Марыя', prayerCount: 2, categoryCount: 2 },
    { name: 'Навэнна', prayerCount: 1, categoryCount: 1 },
  ]);
});

test('buildPrayerTagRemovalPlan updates prayers and deletes categories left empty', () => {
  const plan = buildPrayerTagRemovalPlan(
    'Марыя',
    [
      { id: 'p1', tags: ['Марыя', 'Ружанец'] },
      { id: 'p2', tags: ['Іншы'] },
    ],
    [
      { id: 'c1', tags: ['Марыя'] },
      { id: 'c2', tags: ['Марыя', 'Ружанец'] },
    ],
  );

  assert.deepEqual(plan, {
    tag: 'Марыя',
    prayerUpdates: [{ id: 'p1', tags: ['Ружанец'] }],
    categoryChanges: [
      { id: 'c1', type: 'delete', tags: [] },
      { id: 'c2', type: 'update', tags: ['Ружанец'] },
    ],
    deletedCategories: 1,
  });
});

test('buildPrayerTagRemovalPlan rejects an empty tag', () => {
  assert.throws(() => buildPrayerTagRemovalPlan('  '), /Тэг не пазначаны/);
});
