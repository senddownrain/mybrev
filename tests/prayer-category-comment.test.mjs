import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import { writeBundle } from '../scripts/content/build-app-bundle.mjs';
import { decodeCollection, documentHash, publicAppCollections } from '../scripts/content/lib/app-content.mjs';
import { exportCatalog } from '../scripts/export-public-prayers-hosting.mjs';
import { normalizePrayerCategoryComment } from '../src/utils/prayerCategoryComment.mjs';
import { buildPrayerCategoryMenu } from '../src/utils/prayerCategoryMenu.js';
import { PRAYER_TEXT_FORMAT, renderPrayerMarkdown } from '../src/utils/prayerMarkdown.js';
import { permittedPrayerContent } from '../src/utils/priestPolicy.mjs';
import { buildPublicPrayerCatalog, validatePublicPrayerCatalog } from '../src/utils/publicPrayerCatalog.mjs';

const category = (id, fields = {}) => ({ id, name: id, tags: [], prayerIds: [], ...fields });
const comment = { title: 'Прыклад', content: '**Тэкст**', sourceId: 'ojcha-nash-2022' };
const categories = [
  category('root'),
  category('leaf', { parentId: 'root', comment }),
  category('legacy', { comment: null }),
  category('blank', { comment: { title: 'Загаловак', content: '  \n' } }),
  category('unpublished', { status: 'draft', comment }),
  category('closed', { priestOnly: true, comment }),
  category('closed-child', { parentId: 'closed', comment }),
];
const prayers = [{ id: 'standalone', title: 'Прыклад', text: 'Тэставы тэкст', tags: [] }];

test('category comment normalizes optional metadata and preserves Markdown', () => {
  for (const input of [undefined, null, {}, { content: null }, { content: '' }, { content: '  \n' }, { content: [] }]) {
    assert.equal(normalizePrayerCategoryComment(input), null);
  }
  assert.deepEqual(normalizePrayerCategoryComment({ title: '  ', content: 'Першы  \r\nДругі', sourceId: ' test-id ' }), {
    content: 'Першы  \nДругі', sourceId: 'test-id',
  });
  const html = renderPrayerMarkdown('## Загаловак\n\n> *Цытата*\n\n- **Пункт**\n\n:::rubric\nРубрыка\n:::\n\n<b>Увод</b>', PRAYER_TEXT_FORMAT, { normalizeLegacy: false });
  for (const expected of ['<h2>', '<blockquote>', '<em>', '<ul>', '<strong>', '<aside class="prayer-rubric">', '&lt;b&gt;']) {
    assert.ok(html.includes(expected), expected);
  }
});

test('zero-entry comments keep permitted categories and ancestors visible', () => {
  const content = permittedPrayerContent(prayers, categories);
  assert.deepEqual(content.prayers.map(({ id }) => id), ['standalone']);
  assert.deepEqual(content.categories.map(({ id }) => id), ['root', 'leaf']);
  assert.deepEqual(buildPrayerCategoryMenu(categories, [], [], prayers).map(({ id }) => id), ['root', 'leaf']);
  assert.deepEqual(buildPrayerCategoryMenu(content.categories, [], ['root'], prayers).map(({ id }) => id), ['leaf']);
  assert.deepEqual(permittedPrayerContent(prayers, categories, true).categories.map(({ id }) => id), ['root', 'leaf', 'closed', 'closed-child']);
});

test('Hosting output round-trips comments while preserving the category shape of v1', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mybrev-category-hosting-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const out = path.join(dir, 'public-prayers-v1.json');
  await exportCatalog({ collections: { prayers, categories }, out });
  const catalog = JSON.parse(await fs.readFile(out, 'utf8'));
  assert.equal(catalog.schemaVersion, 1);
  assert.deepEqual(catalog.categoryComments, { leaf: comment });
  assert.ok(catalog.categories.every((item) => !Object.hasOwn(item, 'comment')));
  assert.deepEqual(validatePublicPrayerCatalog(catalog).categories.find(({ id }) => id === 'leaf').comment, comment);

  const v1 = buildPublicPrayerCatalog({ prayers, categories: [category('leaf')] });
  assert.ok(!Object.hasOwn(v1, 'categoryComments'));
  assert.deepEqual(validatePublicPrayerCatalog(v1).categories, v1.categories);
  for (const categoryComments of [null, { closed: comment }, { leaf: { ...comment, privateNote: 'synthetic' } }, { leaf: { content: null } }]) {
    assert.throws(() => validatePublicPrayerCatalog({ ...catalog, categoryComments }), /public category comment/);
  }
});

test('schema 1 app bundle retains the document hash and discards protected categories', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mybrev-category-bundle-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const collection = 'prayerCategories';
  const version = 12345;
  const collections = new Map([[collection, categories.filter(({ id }) => id !== 'unpublished')]]);
  const manifest = writeBundle(collections, new Map([[collection, version]]), version, dir, { log: () => {} });
  assert.equal(manifest.schemaVersion, 1);
  const parsed = JSON.parse(zlib.gunzipSync(await fs.readFile(path.join(dir, `${collection}.json.gz`))));
  const docs = decodeCollection(parsed);
  assert.deepEqual(Object.keys(docs).sort(), ['blank', 'leaf', 'legacy', 'root']);
  const { leaf } = docs;
  assert.deepEqual(leaf.comment, comment);
  assert.equal(parsed.hashes.leaf, documentHash(leaf));
  assert.notEqual(documentHash(leaf), documentHash(category('leaf', { parentId: 'root' })));
  assert.ok(!publicAppCollections(new Map([[collection, categories]])).get(collection).some(({ id }) => id === 'unpublished'));
  const unexpected = category('unexpected', { comment: { ...comment, editorNote: 'synthetic' } });
  assert.throws(() => publicAppCollections(new Map([[collection, [unexpected]]])), /Invalid category comment fields/);
});
