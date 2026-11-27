import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { exportCatalog, readLocalCatalog } from '../scripts/export-public-prayers-hosting.mjs';
import { APP_CONTENT_COLLECTIONS } from '../scripts/content/lib/app-content.mjs';
import { readCollections, writeBundle } from '../scripts/content/build-app-bundle.mjs';
import { readCanonicalCatalogSnapshot } from '../scripts/lib/access-sets-v2-snapshot.mjs';
import { assertCatalogParity } from '../scripts/lib/access-sets-v2-storage-plan.mjs';

const privateTokens = ['S4-FIXTURE-CLOSED-TITLE', 'S4-FIXTURE-CLOSED-BODY', 'S4-FIXTURE-CLOSED-PREVIEW',
  'S4-FIXTURE-CLOSED-NAME', 's4-fixture-private-id', 's4-fixture-private-category', 'S4-FIXTURE-CLOSED-COMMENT'];
const id = privateTokens[4];
const categoryId = privateTokens[5];
const protectedPrayer = { id, title: privateTokens[0], text: privateTokens[1], preview: privateTokens[2], tags: ['s4-private-tag'] };
const protectedCategory = { id: categoryId, name: privateTokens[3], tags: ['s4-private-tag'], comment: { content: privateTokens[6] } };

async function snapshot(root, collections) {
  const manifest = { schemaVersion: 1, exportedAt: '2026-11-25T08:00:00.000Z', collections: {} };
  for (const [name, rows] of Object.entries(collections)) {
    const file = 'collection-' + Object.keys(manifest.collections).length + '.json';
    await writeFile(join(root, file), JSON.stringify({
      schemaVersion: 1, collectionPath: name, documents: rows.map(({ id, ...data }) => ({ id, data })),
    }));
    manifest.collections[name] = { file, documentCount: rows.length };
  }
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
}
function noPrivateBytes(buffer, path) {
  for (const token of privateTokens) assert.equal(buffer.includes(token), false, `Private fixture found in ${path}`);
}

test('public Hosting, app bundle and manifest exclude contaminated V2 rows and inherited/private twins', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'mybrev-s4-public-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const collections = Object.fromEntries(APP_CONTENT_COLLECTIONS.map((name) => [name, []]));
  collections.prayers = [
    { id: 's4-public', title: 'S4-PUBLIC-FIXTURE', text: 'Public fixture' },
    protectedPrayer, // deliberately stale and unflagged public twin
    { ...protectedPrayer, id: 'incorrect-flags', tags: [], accessSets: ['marian'] },
    { ...protectedPrayer, id: 'inherited', tags: ['s4-private-tag'] },
  ];
  collections.prayerCategories = [
    { id: 'public-folder', name: 'Synthetic public folder', prayerIds: ['s4-public', id] },
    { ...protectedCategory, id: 'incorrect-category-flags', accessSchemaVersion: 2 },
  ];
  collections.priestProtectedCategories = [];
  collections.priestProtectedPrayers = [];
  collections.protectedCategories = [protectedCategory];
  collections.protectedPrayers = [protectedPrayer];
  collections.priestContentControl = [{ id: 'accessSetsV2', mode: 'canonical' }];
  await snapshot(root, collections);
  const out = process.env.S4_DIST_SCAN === '1' ? resolve('dist') : join(root, 'hosting');
  if (process.env.S4_DIST_SCAN === '1') await readFile(join(out, 'sw.js'));
  const hostingPath = join(out, 'public-prayers-v1.json');
  await exportCatalog({ collections: await readLocalCatalog(root), out: hostingPath });
  const hosting = await readFile(hostingPath);
  assert.ok(hosting.includes('S4-PUBLIC-FIXTURE'));
  noPrivateBytes(hosting, hostingPath);
  assert.deepEqual(JSON.parse(hosting).categories[0].prayerIds, ['s4-public']);

  const { collections: all, versions, contentVersion } = await readCollections([root]);
  const bundle = join(root, 'bundle');
  writeBundle(all, versions, contentVersion, bundle, { log: () => {} });
  for (const name of ['prayers', 'prayerCategories']) {
    noPrivateBytes(gunzipSync(await readFile(join(bundle, name + '.json.gz'))), name);
  }
  const manifestScript = fileURLToPath(new URL('../scripts/content/publish-manifest.mjs', import.meta.url));
  const dryRun = spawnSync(process.execPath, [manifestScript, '--snapshot', root], { cwd: root, encoding: 'utf8' });
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /validation: OK/);
  assert.match(dryRun.stdout, /Dry-run/);
  const manifest = await readFile(join(root, 'reports', 'content', 'manifest-diff.json'));
  assert.ok(manifest.includes('s4-public'));
  noPrivateBytes(manifest, 'manifest-diff.json');

  if (process.env.S4_DIST_SCAN === '1') {
    const files = (await readdir(out, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile());
    try {
      for (const entry of files) {
        const path = join(entry.parentPath, entry.name);
        const bytes = await readFile(path);
        noPrivateBytes(entry.name, path);
        noPrivateBytes(entry.name.endsWith('.gz') ? gunzipSync(bytes) : bytes, path);
      }
      const sw = await readFile(join(out, 'sw.js'), 'utf8');
      assert.ok(sw.includes('firestore\\.googleapis'));
      t.diagnostic(`Scanned ${files.length} actual dist files, including generated Hosting JSON and service worker`);
    } finally {
      await rm(hostingPath);
    }
  }
  delete collections.protectedPrayers;
  await snapshot(root, collections);
  await assert.rejects(readLocalCatalog(root), /Canonical snapshot/);
  await assert.rejects(readCollections([root]), /Canonical prayer bundle snapshot/);
});

test('snapshot parity runs offline and requires explicit coverage of empty collections', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'mybrev-s4-snapshot-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const collections = {
    prayers: [{ id: 'public', title: 'Synthetic', text: 'Synthetic' }], prayerCategories: [],
    priestProtectedPrayers: [], priestProtectedCategories: [], protectedPrayers: [], protectedCategories: [],
    priestContentControl: [{ id: 'state', version: 1, lockUid: '' }],
    accessSetsV2: [{ id: 'priest', status: 'active' }],
    'accessSetsV2/priest/prayers': [], 'accessSetsV2/priest/categories': [],
  };
  const offline = { reference: () => assert.fail('unexpected reference') };
  await snapshot(root, collections);
  const source = await readCanonicalCatalogSnapshot(root, offline);
  assert.equal(source.version, 1);
  assert.equal(assertCatalogParity(source).content.prayers.length, 1);
  delete collections['accessSetsV2/priest/prayers'];
  await snapshot(root, collections);
  await assert.rejects(readCanonicalCatalogSnapshot(root, offline), { code: 'incomplete-catalog-snapshot' });
});
