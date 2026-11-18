import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  CATEGORY_ICONS, CATEGORY_ICON_GROUPS, CATEGORY_ICON_KEYS, SEED_CATEGORY_ICON_KEYS, displayCategoryIconKey,
  isValidCategoryIconKey, migratePersonalCategoryIcons, normalizeCategoryIconKey, resolveCategoryIconKey, stableHash, suggestCategoryIconKey,
} from '../src/constants/prayerCategoryIcons.js';
import { DEFAULT_CATEGORIES } from '../src/constants/categories.js';
import { buildPrayerCategoryMenu } from '../src/utils/prayerCategoryMenu.js';
import { storedDocument, publicAppCollections } from '../scripts/content/lib/app-content.mjs';
import { buildCategoryIconPlan, REVIEWED_ASSIGNMENTS } from '../scripts/migrate-prayer-category-icons.mjs';
import { categoryIconCatalog } from '../scripts/export-category-icons.mjs';

const vectors = JSON.parse(readFileSync(new URL('./fixtures/prayer-category-icon-vectors.json', import.meta.url), 'utf8'));

test('exactly 48 unique keys: 36 Phosphor + 12 authored, 12 per group', () => {
  assert.equal(CATEGORY_ICONS.length, 48);
  assert.equal(new Set(CATEGORY_ICON_KEYS).size, 48);
  assert.equal(CATEGORY_ICONS.filter((i) => i.source === 'phosphor').length, 36);
  assert.equal(CATEGORY_ICONS.filter((i) => i.source === 'svg').length, 12);
  for (const group of CATEGORY_ICON_GROUPS) assert.equal(CATEGORY_ICONS.filter((i) => i.group === group.id).length, 12, group.id);
  CATEGORY_ICON_KEYS.forEach((key) => assert.match(key, /^[a-z]+(-[a-z]+)*$/));
});

test('every Phosphor glyph exists in the installed package and every authored SVG is real artwork', () => {
  for (const icon of CATEGORY_ICONS.filter((i) => i.source === 'phosphor')) {
    assert.ok(existsSync(`node_modules/@phosphor-icons/vue/dist/icons/Ph${icon.phosphor}.vue.mjs`), `Ph${icon.phosphor}`);
  }
  const dir = 'src/assets/category-icons';
  assert.equal(readdirSync(dir).filter((f) => f.endsWith('.svg')).length, 12);
  for (const icon of CATEGORY_ICONS.filter((i) => i.source === 'svg')) {
    const svg = readFileSync(path.join(dir, icon.svg), 'utf8');
    assert.match(svg, /viewBox="0 0 24 24"/);
    assert.match(svg, /stroke="currentColor"/);
    assert.doesNotMatch(svg, /<script|onload|href=|<image|<style/i);
    assert.ok((svg.match(/<(path|circle|ellipse)/g) || []).length >= 3, `${icon.key} is not empty`);
  }
});

test('allowlist: unknown values are rejected, not stored', () => {
  assert.equal(normalizeCategoryIconKey('virgin-mary'), 'virgin-mary');
  for (const bad of ['mdi-folder-outline', '<svg/>', '🙏', '', null, undefined, 7, 'PRAYER']) assert.equal(normalizeCategoryIconKey(bad), null);
  assert.equal(isValidCategoryIconKey('nope'), false);
});

test('the three built-in categories carry their required icons', () => {
  assert.deepEqual(Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, c.iconKey])), { mary: 'virgin-mary', litanies: 'litany', novenas: 'novena' });
  assert.deepEqual(SEED_CATEGORY_ICON_KEYS, { mary: 'virgin-mary', litanies: 'litany', novenas: 'novena' });
});

test('suggestions are deterministic and match the shared vectors (also run by the Flutter app)', () => {
  for (const v of vectors) {
    assert.equal(suggestCategoryIconKey(v), v.expected, v.name);
    assert.equal(suggestCategoryIconKey(v), suggestCategoryIconKey({ ...v }));
    assert.ok(isValidCategoryIconKey(v.expected));
  }
  assert.equal(stableHash('abc'), 440920331);
  assert.ok(new Set(vectors.map((v) => v.expected)).size > 15, 'not one icon for everything');
});

test('a stored choice wins over a suggestion; renaming never changes it', () => {
  assert.equal(resolveCategoryIconKey({ id: 'x', name: 'Ружанец', iconKey: 'candle' }), 'candle');
  assert.equal(displayCategoryIconKey({ name: 'Ружанец', iconKey: 'unknown-from-newer-app' }), 'unknown-from-newer-app');
  assert.equal(displayCategoryIconKey({ name: 'Ружанец' }), 'rosary');
});

test('personal migration: fills missing keys once, keeps valid and unknown ones, keeps every other field', () => {
  const stored = [
    { name: 'Мае ружанцы', tags: ['Ружанец'], extra: { keep: 1 } },
    { name: 'Мая', tags: ['t'], iconKey: 'angel' },
    { name: 'Новая', tags: ['t'], iconKey: 'from-the-future' },
    { name: 'Пустая', tags: ['t'], iconKey: '' },
  ];
  const first = migratePersonalCategoryIcons(stored);
  assert.equal(first.changed, true);
  assert.deepEqual(first.list[0], { name: 'Мае ружанцы', tags: ['Ружанец'], extra: { keep: 1 }, iconKey: 'rosary' });
  assert.equal(first.list[1].iconKey, 'angel');
  assert.equal(first.list[2].iconKey, 'from-the-future');
  assert.ok(isValidCategoryIconKey(first.list[3].iconKey));
  const second = migratePersonalCategoryIcons(first.list);
  assert.equal(second.changed, false);
  assert.deepEqual(second.list, first.list);
  assert.deepEqual(migratePersonalCategoryIcons(null), { list: [], changed: false });
  const renamed = migratePersonalCategoryIcons(first.list.map((c) => ({ ...c, name: 'Іншая назва' })));
  assert.deepEqual(renamed.list.map((c) => c.iconKey), first.list.map((c) => c.iconKey));
});

test('menu keeps iconKey, hierarchy and independent direct tags', () => {
  const globals = [
    { id: 'a', name: 'Бацька', tags: ['t1'], iconKey: 'cross' },
    { id: 'b', name: 'Дзіця', tags: ['t2'], parentId: 'a', iconKey: 'angel' },
  ];
  const menu = buildPrayerCategoryMenu(globals, [{ name: 'Мая', tags: ['z'], iconKey: 'candle' }], []);
  assert.deepEqual(menu.map((c) => [c.name, c.iconKey]), [['Бацька', 'cross'], ['Дзіця', 'angel'], ['Мая', 'candle']]);
  assert.deepEqual(menu[0].tags, ['t1']);
});

test('iconKey flows into the Flutter bundle; protected categories stay out', () => {
  const rows = new Map([
    ['prayerCategories', [{ id: 'mary', name: 'Марыйныя', tags: ['Марыя'], iconKey: 'virgin-mary', effectivePriestOnly: false }]],
    ['priestProtectedCategories', [{ id: 'p', name: 'Для святара', tags: ['x'], iconKey: 'cross', effectivePriestOnly: true }]],
    ['prayers', []],
  ]);
  const exported = publicAppCollections(rows).get('prayerCategories');
  assert.deepEqual(exported.map((c) => storedDocument(c.id, c)).map((c) => [c.id, c.iconKey]), [['mary', 'virgin-mary']]);
  assert.equal(JSON.stringify([...publicAppCollections(rows)]).includes('"cross"'), false);
});

test('migration plan: assigns only missing/invalid keys, never moves collections, is idempotent', () => {
  const snapshot = {
    prayerCategories: [{ id: 'mary', name: 'Марыйныя', tags: ['Марыя'] }, { id: 'custom', name: 'Рэдактар', tags: [], iconKey: 'bell' }, { id: 'bad', name: 'Ружанец', tags: [], iconKey: 'mdi-folder' }],
    priestProtectedCategories: [{ id: 'gMzVAGRUogiZa2MAxpr4', name: 'Для святара', tags: ['Сакрамэнт'], priestOnly: true }],
  };
  const plan = buildCategoryIconPlan(snapshot);
  assert.deepEqual(plan.changes.map((c) => [c.collection, c.id, c.proposedIconKey]), [
    ['prayerCategories', 'mary', 'virgin-mary'], ['prayerCategories', 'bad', 'rosary'], ['priestProtectedCategories', 'gMzVAGRUogiZa2MAxpr4', 'cross'],
  ]);
  assert.deepEqual(plan.kept, [{ collection: 'prayerCategories', id: 'custom', iconKey: 'bell' }]);
  const applied = Object.fromEntries(Object.entries(snapshot).map(([name, docs]) => [name, docs.map((d) => ({ ...d, iconKey: plan.changes.find((c) => c.id === d.id)?.proposedIconKey ?? d.iconKey }))]));
  assert.equal(buildCategoryIconPlan(applied).changes.length, 0);
  Object.values(REVIEWED_ASSIGNMENTS).forEach((v) => assert.ok(isValidCategoryIconKey(Array.isArray(v) ? v[0] : v)));
});

test('catalog exported for Flutter lists the same 48 keys, groups and labels', () => {
  const catalog = categoryIconCatalog();
  assert.deepEqual(catalog.icons.map((i) => i.key), CATEGORY_ICON_KEYS);
  assert.equal(catalog.icons.filter((i) => i.kind === 'svg').length, 12);
  const flutter = process.env.CATEGORY_ICONS_FLUTTER_DIR;
  if (flutter && existsSync(path.join(flutter, 'assets/category_icons/catalog.json'))) {
    assert.deepEqual(JSON.parse(readFileSync(path.join(flutter, 'assets/category_icons/catalog.json'), 'utf8')), catalog);
    for (const icon of CATEGORY_ICONS.filter((i) => i.source === 'svg')) {
      assert.equal(readFileSync(path.join(flutter, 'assets/category_icons', icon.svg), 'utf8'), readFileSync(path.join('src/assets/category-icons', icon.svg), 'utf8'));
    }
  }
});
