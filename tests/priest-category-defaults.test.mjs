import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('restoring defaults preserves renamed restricted categories and their own flags', async () => {
  const source = await readFile(new URL('../src/services/prayerCategoryService.js', import.meta.url), 'utf8');
  const start = source.indexOf('export async function restoreDefaultPrayerCategories');
  const end = source.indexOf('async function commitOperations', start);
  const writes = [];
  const defaults = [{ id: 'existing', name: 'Original name' }, { id: 'missing', name: 'Missing category' }];
  const restore = new Function('DEFAULT_CATEGORIES', 'writeBatch', 'db', 'doc', 'PRAYER_CATEGORIES_COLLECTION', 'categoryPayload', 'serverTimestamp', 'retryFirestore', 'requestContentRefresh',
    `${source.slice(start, end).replace('export ', '')}\nreturn restoreDefaultPrayerCategories;`)(
    defaults, () => ({ set: (ref, data) => writes.push({ ref, data }), commit: async () => {} }), {},
    (_db, collection, id) => `${collection}/${id}`, 'prayerCategories', (category) => ({ ...category, priestOnly: false }),
    () => 'timestamp', (operation) => operation(), () => {},
  );
  assert.equal(await restore([{ id: 'existing', name: 'Renamed category', priestOnly: true, parentId: 'protected-parent' }]), 1);
  assert.deepEqual(writes.map((write) => write.ref), ['prayerCategories/missing']);
  assert.equal(writes[0].data.priestOnly, false);
});
