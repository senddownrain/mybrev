import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { mapRoute } from '../src/utils/analytics/routeMapper.js';
import { validateContentId } from '../src/utils/analytics/contract.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const inventory = new Set(JSON.parse(readFileSync(path.join(root, 'src/utils/analytics/public-inventory.json'), 'utf8')).ids);
const opts = { massOrderPrayerId: 'eMmCtxwyJ75ogmL5rwye' };

test('public routes map to contract sections', () => {
  assert.deepEqual(mapRoute({ name: 'Today' }, opts), { section: 'today' });
  assert.deepEqual(mapRoute({ name: 'OrdoByDate', params: { date: '2026-10-15' } }, opts), { section: 'ordo' });
  assert.deepEqual(mapRoute({ name: 'vesper' }, opts), { section: 'hours', contentId: 'hour:vesper' });
  assert.deepEqual(mapRoute({ name: 'PrayerView', params: { id: 'eMmCtxwyJ75ogmL5rwye' } }, opts), { section: 'mass', contentId: 'mass:order' });
  assert.deepEqual(mapRoute({ name: 'PrayerView', params: { id: 'import-15-malitvy-za-semi' } }, opts), { section: 'prayers', contentId: 'prayer:import-15-malitvy-za-semi' });
  assert.deepEqual(mapRoute({ name: 'Bible', params: { language: 'bel', bookId: 'gn', chapter: '3' } }, opts), { section: 'bible', contentId: 'bible:bel:gn' });
});

test('daily readings are one generic material; catalogs map to catalog ids, never a material', () => {
  assert.deepEqual(mapRoute({ name: 'Readings' }, opts), { section: 'readings', contentId: 'reading:day' });
  assert.deepEqual(mapRoute({ name: 'ReadingsByDate', params: { date: '2026-10-16' } }, opts), { section: 'readings', contentId: 'reading:day' });
  const catalogs = { oras: 'hours_list', Prayers: 'prayers_home', PrayersList: 'prayers_all', FavoritePrayers: 'favorites', Songs: 'songs', Compendium: 'compendium_home' };
  for (const [name, catalogId] of Object.entries(catalogs)) assert.deepEqual(mapRoute({ name, params: { id: 'x' } }, opts), { catalogId }, name);
  assert.ok(!JSON.stringify(mapRoute({ name: 'ReadingsByDate', params: { date: '2026-10-16' } }, opts)).includes('2026'));
});

test('lists, admin, login, personal prayers and incomplete routes are not measured', () => {
  for (const name of ['CompendiumQuestion', 'PrayerAdd', 'PrayerEdit', 'Login', 'Admin', 'AdminPriestAccess', 'AdminDayEditor', 'Nonexistent', '']) {
    assert.equal(mapRoute({ name, params: { id: 'x', nodeId: 'x' } }, opts), null, name);
  }
  assert.deepEqual(mapRoute({ name: 'Bible', params: { language: 'bel' } }, opts), { catalogId: 'bible_books' });
  assert.equal(mapRoute({ name: 'Bible', params: { language: 'xx', bookId: 'gn' } }, opts), null);
  assert.equal(mapRoute(undefined, opts), null);
  assert.equal(mapRoute({ name: Symbol('x') }, opts), null);
});

test('every mapped content id is shaped for its section; unknown ids fail the inventory', () => {
  const mapped = mapRoute({ name: 'SongView', params: { id: 'holysongs-0027665fbaf1422fd4dc' } }, opts);
  assert.deepEqual(validateContentId(mapped.section, mapped.contentId, { publicIds: inventory }), []);
  const stranger = mapRoute({ name: 'PrayerView', params: { id: 'someClosedPriestPrayer1' } }, opts);
  assert.notDeepEqual(validateContentId(stranger.section, stranger.contentId, { publicIds: inventory }), []);
});
