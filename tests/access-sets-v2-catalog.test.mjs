import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { Timestamp, GeoPoint, FieldValue } from 'firebase-admin/firestore';
import { assembleCanonicalCatalog, evaluateAccessSets, validCatalogId } from '../src/utils/accessSetsV2Policy.mjs';
import { createAccessSetsCatalogSession } from '../src/services/accessSetsCatalogSession.mjs';
import { catalogContentHash, digestCatalogValue } from '../scripts/lib/access-sets-v2-content-values.mjs';
import {
  assertCatalogParity, catalogDigest, planCanonicalCatalog, planCatalogRestore, summarizeCatalogPlan,
} from '../scripts/lib/access-sets-v2-storage-plan.mjs';

const sets = new Map(['priest', 'marian'].map((id) => [id, { status: 'active' }]));
const publicCategory = { name: 'Synthetic public folder', prayerIds: ['public'] };
const publicPrayer = { title: 'Synthetic public prayer', text: 'Public synthetic text' };
const oldPrayer = { title: 'Synthetic priest prayer', text: '*Rubric*\n\nText', priestOnly: true, effectivePriestOnly: true,
  source: 'Synthetic historical source', sourceBook: 'Synthetic source book',
  createdAt: new Timestamp(10, 123_456_000), location: new GeoPoint(53.9, 27.55), bytes: Buffer.from([0, 255]) };
const canonical = (payload, allowed, own = allowed) => ({
  ...payload, accessSchemaVersion: 2, accessSets: own, effectiveAccessSets: allowed, contentHash: catalogContentHash(payload),
});
const makeSnapshot = () => ({
  version: 12, sets,
  documents: new Map([
    ['prayers/public', publicPrayer], ['prayerCategories/public', publicCategory],
    ['priestProtectedPrayers/old', oldPrayer], ['protectedPrayers/old', canonical(oldPrayer, ['priest'], [])],
    ['accessSetsV2/priest/prayers/old', {}],
  ]),
});
const edit = (kind, id, patch, action = 'create') => ({ kind, id, action, patch });
function afterPlan(snapshot, plan) {
  const documents = new Map(snapshot.documents);
  for (const operation of plan.operations) {
    if (operation.after === null) documents.delete(operation.path);
    else documents.set(operation.path, operation.after);
  }
  return { ...snapshot, version: snapshot.version + 1, documents };
}

test('own OR, ancestor and every membership AND, public is neutral', () => {
  const categories = [
    { id: 'public', prayerIds: ['all'], tags: ['outer'] },
    { id: 'outer', accessSets: ['priest', 'marian'], tags: ['outer'] },
    { id: 'inner', parentId: 'outer', accessSets: ['marian'], prayerIds: ['inherited', 'legacy-list'], tags: ['inner'] },
  ];
  const prayers = [
    { id: 'public' },
    { id: 'all', tags: ['outer'] },
    { id: 'inherited', tags: ['outer', 'inner'], categoryId: 'outer', accessSets: ['priest', 'marian'] },
    { id: 'legacy-list', tags: ['outer'], categoryIds: ['public', 'inner'] },
  ];
  const actual = evaluateAccessSets({ categories, prayers }, new Set(sets.keys()));
  assert.deepEqual([...actual.categories.values()], [null, ['marian', 'priest'], ['marian']]);
  assert.deepEqual([...actual.prayers.values()], [null, ['marian', 'priest'], ['marian'], ['marian']]);
});

test('invalid ancestry, crossing constraints, dangling membership and inactive IDs fail closed', () => {
  const a = { id: 'a', accessSets: ['priest'], tags: ['shared'] };
  const b = { id: 'b', accessSets: ['marian'], prayerIds: ['p'] };
  const p = { id: 'p', tags: ['shared'] };
  for (const [categories, prayers, allowed, code] of [
    [[a, b], [p], ['priest', 'marian'], 'incompatible-access-sets'],
    [[{ ...a, parentId: 'b' }, { ...b, parentId: 'a', accessSets: ['priest'] }], [p], ['priest', 'marian'], 'invalid-category-ancestry'],
    [[{ ...a, parentId: 'missing' }], [p], ['priest'], 'unknown-parent-category'],
    [[a], [{ ...p, categoryIds: ['missing'] }], ['priest'], 'unknown-prayer-category'],
    [[b], [], ['marian'], 'unknown-prayer-membership'],
    [[a], [p], ['marian'], 'inactive-or-unknown-access-set'],
    [[{ ...a, priestOnly: true, accessSets: ['marian'] }], [p], ['marian'], 'conflicting-legacy-visibility'],
  ]) {
    assert.throws(() => evaluateAccessSets({ categories, prayers }, new Set(allowed)), { code });
  }
  for (const id of [null, '', '.', '..', 'x/y', '__name__', 'я'.repeat(751), '\uD800']) assert.equal(validCatalogId(id), false);
  assert.equal(validCatalogId('Малітва.1'), true);
});

test('deterministic dry-run verifies copied priest payload and produces one canonical document per object', () => {
  const snapshot = makeSnapshot();
  const edits = [
    edit('categories', 'private', { name: 'Synthetic closed folder', accessSets: ['marian'] }),
    edit('prayers', 'marian', { ...publicPrayer, categoryId: 'private' }),
    edit('prayers', 'mixed', { ...publicPrayer, accessSets: ['priest', 'marian'] }),
    edit('prayers', 'old', { text: '*Synthetic rubric*\n\nNew verse' }, 'update'),
    edit('categories', 'public', { prayerIds: ['public', 'mixed'] }, 'update'),
  ];
  const plan = planCanonicalCatalog(snapshot, edits);
  const reversed = { ...snapshot, documents: new Map([...snapshot.documents].reverse()) };
  assert.equal(planCanonicalCatalog(reversed, edits).planDigest, plan.planDigest);
  assert.deepEqual(summarizeCatalogPlan(plan), {
    version: 12, planDigest: plan.planDigest, afterDigest: plan.afterDigest, writes: 9, creates: 7, deletes: 0, parity: 'verified',
  });
  assert.equal(snapshot.documents.get('priestProtectedPrayers/old'), oldPrayer);
  const next = afterPlan(snapshot, plan);
  assertCatalogParity(next);
  assert.equal(next.documents.has('priestProtectedPrayers/marian'), false);
  assert.equal(next.documents.has('priestProtectedPrayers/mixed'), false);
  assert.deepEqual(next.documents.get('accessSetsV2/marian/prayers/mixed'), {});
  assert.deepEqual(next.documents.get('accessSetsV2/priest/prayers/mixed'), {});
  assert.deepEqual(next.documents.get('protectedPrayers/mixed').categoryIds, ['public']);
  assert.deepEqual(next.documents.get('prayerCategories/public').prayerIds, ['public']);
  const mirror = next.documents.get('priestProtectedPrayers/old');
  assert.equal(mirror.createdAt, oldPrayer.createdAt);
  assert.equal(mirror.location, oldPrayer.location);
  assert.equal(mirror.bytes, oldPrayer.bytes);
  assert.equal(mirror.source, oldPrayer.source);
  assert.equal(mirror.sourceBook, oldPrayer.sourceBook);
  assert.equal(catalogContentHash(mirror), next.documents.get('protectedPrayers/old').contentHash);
  const restored = afterPlan(next, planCatalogRestore(next, plan));
  assert.equal(catalogDigest(restored.documents), catalogDigest(snapshot.documents));
  assert.throws(() => planCatalogRestore({ ...next, version: next.version + 1 }, plan), { code: 'content-snapshot-drift' });
});

test('a missing/extra index, missing copy or changed mirror blocks a write', () => {
  for (const [mutate, code] of [
    [(docs) => docs.delete('accessSetsV2/priest/prayers/old'), 'missing-content-index'],
    [(docs) => docs.set('accessSetsV2/marian/prayers/old', {}), 'orphan-content-index'],
    [(docs) => { docs.delete('protectedPrayers/old'); docs.delete('accessSetsV2/priest/prayers/old'); }, 'missing-canonical-copy'],
    [(docs) => docs.set('priestProtectedPrayers/old', { ...oldPrayer, text: 'out-of-band' }), 'legacy-mirror-drift'],
    [(docs) => docs.set('prayers/leak', { ...publicPrayer, accessSets: [] }), 'protected-public-document'],
  ]) {
    const snapshot = makeSnapshot();
    mutate(snapshot.documents);
    assert.throws(() => planCanonicalCatalog(snapshot, [edit('prayers', 'new', publicPrayer)]), { code });
  }
});

test('preflight rejects oversized atomic plans and non-Firestore values', () => {
  assert.throws(() => planCanonicalCatalog(makeSnapshot(), [
    edit('prayers', 'large', { ...publicPrayer, text: 'x'.repeat(901_000) }),
  ]), { code: 'content-document-too-large' });
  assert.throws(() => planCanonicalCatalog(makeSnapshot(), Array.from({ length: 134 }, (_, i) =>
    edit('prayers', `bulk-${i}`, { ...publicPrayer, accessSets: ['priest'] })
  )), { code: 'content-transaction-too-large' });
  for (const value of [undefined, [undefined], [['nested']], FieldValue.serverTimestamp(), new Timestamp(10, 1)]) {
    assert.throws(() => digestCatalogValue({ value }), { code: 'unsupported-firestore-value' });
  }
  assert.notEqual(digestCatalogValue({ value: NaN }), digestCatalogValue({ value: null }));
  assert.notEqual(digestCatalogValue({ value: 2n ** 60n }), digestCatalogValue({ value: 2 ** 60 }));
  assert.notEqual(digestCatalogValue({ value: new Timestamp(10, 1000) }), digestCatalogValue({ value: { seconds: 10, nanoseconds: 1000 } }));
});

const data = { prayers: [{ ...publicPrayer, id: 'public' }], categories: [{ ...publicCategory, id: 'public' }] };
test('legacy deep links use a targeted read and reuse it without listing the mirror', async () => {
  let lists = 0;
  let gets = 0;
  const session = createAccessSetsCatalogSession({
    confirm: async () => ({
      mode: 'legacy', legacyActive: true,
      async readLegacyPrayer(id) { gets++; return { ...oldPrayer, id }; },
      async readLegacy() { lists++; return { prayers: [{ ...oldPrayer, id: 'old' }], categories: [] }; },
    }),
  });
  assert.equal((await session.readPrayer('old', data)).effectivePriestOnly, true);
  assert.equal((await session.readPrayer('old', data)).id, 'old');
  assert.deepEqual({ lists, gets }, { lists: 0, gets: 1 });
  session.invalidate();
  assert.ok((await session.catalog()).content.prayers.length);
  assert.equal((await session.readPrayer('old', data)).id, 'old');
  assert.deepEqual({ lists, gets }, { lists: 1, gets: 1 });
});

const protectedRow = (id, access, extra) => ({ ...canonical({ ...publicPrayer, ...extra }, access), id });

test('paged S1 reads deduplicate each kind, omit unknown bindings, and share one memory cache', async () => {
  const docs = new Map([
    ['prayers/one', protectedRow('one', ['marian'], { categoryId: 'inner' })],
    ['prayers/two', protectedRow('two', ['marian', 'priest'])],
    ['prayers/three', protectedRow('three', ['priest'])],
    ['prayers/orphan', protectedRow('orphan', ['marian'], { categoryId: 'missing' })],
    ['categories/inner', protectedRow('inner', ['marian'], { parentId: 'public', name: 'Private synthetic name' })],
    ['categories/two', protectedRow('two', ['marian'], { name: 'Unique type and ID' })],
  ]);
  const index = {
    'prayers/marian': ['foreign', 'one', 'orphan', 'three', 'two'],
    'prayers/priest': ['three', 'two'],
    'categories/marian': ['inner', 'two'],
    'categories/priest': [],
  };
  let indexReads = 0;
  let lists = 0;
  let inflight = 0;
  let peak = 0;
  const gets = new Map();
  const gateway = {
    async listIds(kind, setId, { pageSize, after }) {
      lists++;
      const all = index[`${kind}/${setId}`];
      const start = after ? all.indexOf(after) + 1 : 0;
      const ids = all.slice(start, start + pageSize);
      indexReads += Math.max(1, ids.length);
      return { ids, cursor: ids.length === pageSize ? ids.at(-1) : null };
    },
    async readContent(kind, id) {
      const key = `${kind}/${id}`;
      gets.set(key, (gets.get(key) || 0) + 1);
      inflight++;
      peak = Math.max(peak, inflight);
      await setImmediate();
      inflight--;
      if (id === 'foreign') throw Object.assign(new Error('synthetic denial'), { code: 'permission-denied' });
      return docs.get(key) ?? null;
    },
  };
  let confirmations = 0;
  const session = createAccessSetsCatalogSession({ pageSize: 2, confirm: async () => {
    confirmations++;
    return { mode: 'canonical', uid: 'synthetic', allowedSets: ['priest', 'marian'], gateway };
  } });
  const [first, second] = await Promise.all([session.catalog(), session.catalog()]);
  assert.equal(first.content, second.content);
  const assembled = assembleCanonicalCatalog(data, first.content);
  assert.deepEqual(assembled.prayers.map((row) => row.id).sort(), ['one', 'public', 'three', 'two']);
  assert.deepEqual(assembled.categories.map((row) => row.id).sort(), ['inner', 'public', 'two']);
  assert.equal((await session.readPrayer('one', data)).id, 'one');
  assert.equal(await session.readPrayer('orphan', data), null);
  assert.equal(confirmations, 1);
  assert.equal(lists, 8);
  assert.equal(indexReads, 12);
  assert.equal(gets.size, 8);
  assert.ok([...gets.values()].every((count) => count === 1));
  assert.ok(peak <= 4);
});

test('quota stops queued reads; revoke, disconnect and late direct response cannot refill memory', async () => {
  let online = true;
  let allowed = ['marian'];
  let lists = 0;
  let invalidated = 0;
  let resolveRead;
  let start;
  const started = new Promise((resolve) => { start = resolve; });
  const session = createAccessSetsCatalogSession({
    canRead: () => online, onInvalidated: () => { invalidated++; },
    confirm: async () => ({ mode: 'canonical', uid: 'synthetic', allowedSets: allowed, gateway: {
      async listIds() {
        lists++;
        throw Object.assign(new Error('Quota'), { code: 'resource-exhausted' });
      },
      readContent() {
        start();
        return new Promise((resolve) => { resolveRead = resolve; });
      },
    } }),
  });
  const pending = session.readPrayer('closed', data);
  await started;
  online = false;
  session.invalidate();
  resolveRead(protectedRow('closed', ['marian']));
  assert.equal(await pending, null);
  assert.equal(await session.catalog(), null);
  assert.equal(lists, 0);
  online = true;
  session.invalidate();
  assert.equal(await session.catalog(), null);
  assert.equal(await session.catalog(), null);
  assert.equal(lists, 1);
  allowed = [];
  session.invalidate();
  assert.equal(await session.catalog(), null);
  assert.equal(invalidated, 4);
});
