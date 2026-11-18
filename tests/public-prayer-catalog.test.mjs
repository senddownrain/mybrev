import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicPrayerCatalog, validatePublicPrayerCatalog } from '../src/utils/publicPrayerCatalog.mjs';
import { parseArgs } from '../scripts/export-public-prayers-hosting.mjs';

const prayer = (id, extra = {}) => ({ id, title: id, text: 'Test prayer ' + id, tags: [], ...extra });
const category = (id, extra = {}) => ({ id, name: id, tags: [], prayerIds: [], ...extra });
const seed = () => ({
  categories: [
    category('public', { prayerIds: ['p1', 'priest', 'draft'] }),
    category('private', { priestOnly: true, tags: ['secret'] }),
    category('child', { parentId: 'private', prayerIds: ['hidden-child'] }),
  ],
  protectedCategories: [category('protected', { priestOnly: true, prayerIds: ['held-by-protected'] })],
  prayers: [
    prayer('p1', { tags: ['public'], source: 'Book', sourceId: 'source1', adminToken: 'NEVER_EXPORT' }),
    prayer('priest', { priestOnly: true }),
    prayer('tagged', { tags: ['secret'] }),
    prayer('hidden-child', { categoryId: 'child' }),
    prayer('held-by-protected'),
    prayer('draft', { status: 'draft' }),
  ],
});

test('export includes public content but never private prayers, draft, or arbitrary metadata', () => {
  const result = buildPublicPrayerCatalog(seed(), '2026-11-18T00:00:00.000Z');
  assert.deepEqual(result.prayers.map((item) => item.id), ['p1']);
  assert.deepEqual(result.categories.map((item) => item.id), ['public']);
  assert.deepEqual(result.categories[0].prayerIds, ['p1']);
  assert.equal(result.prayers[0].sourceId, 'source1');
  assert.equal(JSON.stringify(result).includes('NEVER_EXPORT'), false);
  assert.deepEqual(validatePublicPrayerCatalog(result), { prayers: result.prayers, categories: result.categories });
});

test('client rejects a contaminated Hosting file', () => {
  const result = buildPublicPrayerCatalog(seed());
  result.prayers[0].priestOnly = true;
  assert.throws(() => validatePublicPrayerCatalog(result), /Unsafe/);
});

test('publication fails closed for incomplete collections', () => {
  assert.throws(() => buildPublicPrayerCatalog({ prayers: [], categories: [] }), /empty/);
  assert.throws(() => buildPublicPrayerCatalog({ prayers: [prayer('p')], categories: null }), /collection arrays/);
  assert.throws(() => parseArgs(['--live', '--out', 'dist/test.json']), /explicit ibreviaryby/);
  assert.equal(parseArgs(['--snapshot', 'backups/local', '--out', 'backups/a.json']).snapshot, 'backups/local');
});
