import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrayerCategoryMenu } from '../src/utils/prayerCategoryMenu.js';

const globals = [
  { id: 'mary', name: 'Марыйныя', tags: ['Марыя'] },
  { id: 'litanies', name: 'Літаніі', tags: ['Літанія'] },
];

test('new users see global categories followed by their personal categories', () => {
  const menu = buildPrayerCategoryMenu(
    globals,
    [{ name: 'На раніцу', tags: ['Ранішняя'] }],
    [],
  );

  assert.deepEqual(menu.map(({ name, scope }) => ({ name, scope })), [
    { name: 'Марыйныя', scope: 'global' },
    { name: 'Літаніі', scope: 'global' },
    { name: 'На раніцу', scope: 'personal' },
  ]);
});

test('a global category can be hidden locally without changing the global list', () => {
  const menu = buildPrayerCategoryMenu(globals, [], ['mary']);

  assert.deepEqual(menu.map((category) => category.name), ['Літаніі']);
  assert.equal(globals.length, 2);
});

test('clearing local hidden ids restores the default global list', () => {
  const hiddenMenu = buildPrayerCategoryMenu(globals, [], ['mary', 'litanies']);
  const restoredMenu = buildPrayerCategoryMenu(globals, [], []);

  assert.deepEqual(hiddenMenu, []);
  assert.deepEqual(restoredMenu.map((category) => category.name), ['Марыйныя', 'Літаніі']);
});
