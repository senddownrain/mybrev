import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { createContentCache, createReadSession } from '../src/utils/contentCache.js';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

test('reference Office and readings caches cannot populate canonical day keys', async () => {
  const server = await createServer({ configFile: false, cacheDir: 'node_modules/.cache/cache-test-vite', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [] }, root: fileURLToPath(new URL('../', import.meta.url)) });
  try {
    const { contentKey, readingsKey, publicContentCache } = await server.ssrLoadModule('/src/utils/publicContentCache.js');
    const date = '2026-12-06', diocese = 'minsk-mohilev';
    assert.deepEqual(JSON.parse(contentKey(date, diocese)), ['content', date, diocese]);
    assert.deepEqual(JSON.parse(readingsKey(date, { diocese })), ['readings', date, '', false, diocese]);
    const office = contentKey(date, diocese, 'sv-nicholas');
    const readings = readingsKey(date, { diocese, referenceOptionId: 'sv-nicholas' });
    const period = contentKey(date, diocese, '', true);
    await publicContentCache.read(office, async () => ({ data: { title: 'Nicholas' }, complete: true }));
    await publicContentCache.read(readings, async () => ({ data: { title: 'Nicholas readings' }, complete: true }));
    await publicContentCache.read(period, async () => ({ data: { title: 'Period' }, complete: true }));
    assert.equal(publicContentCache.peek(contentKey(date, diocese)), undefined);
    assert.equal(publicContentCache.peek(readingsKey(date, { diocese })), undefined);
    assert.notEqual(office, contentKey(date, 'grodno', 'sv-nicholas'));
    assert.notEqual(office, contentKey(date, diocese, 'sv-patryk'));
    assert.notEqual(period, office);
    assert.notEqual(readingsKey(date, { diocese, periodOnly: true }), readingsKey(date, { diocese }));
  } finally {
    await server.close();
  }
});

function fixture() {
  const records = new Map();
  let revision = '1';
  let online = true;
  const storage = {
    get: async (key) => structuredClone(records.get(key)),
    set: async (key, value) => records.set(key, structuredClone(value)),
    keys: async () => [...records.keys()],
  };
  const create = () => createContentCache({ storage, getRevision: () => revision, isOnline: () => online });
  return { records, storage, create, revision: (value) => { revision = value; }, online: (value) => { online = value; } };
}
const complete = (data) => ({ data, complete: true });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

test('a new app instance restores a complete day with zero network reads, regardless of age', async () => {
  const f = fixture();
  let reads = 0;
  const loader = async () => { reads++; return complete({ items: ['day', 'readings'] }); };
  await f.create().read('today', loader);
  const app = f.create();
  await app.prime(['today']);
  assert.deepEqual(app.peek('today'), { items: ['day', 'readings'] });
  for (let index = 0; index < 10; index++) await app.read('today', loader);
  assert.equal(reads, 1);
  f.online(false);
  await f.create().read('today', loader);
  assert.equal(reads, 1);
});

test('access-sensitive public data revalidates online even at the same revision and remains offline', async () => {
  const f = fixture();
  const cache = f.create();
  await cache.read('prayers', async () => complete(['public-before']));
  const result = await cache.read('prayers', async () => complete(['public-now']), { fresh: true, revalidate: true });
  assert.deepEqual(result.data, ['public-now']);
  f.online(false);
  const offline = await f.create().read('prayers', () => assert.fail('no offline requests'), { fresh: true, revalidate: true });
  assert.deepEqual(offline.data, ['public-now']);
});

test('concurrent screen and warmup share one request and persist confirmed empty queries', async () => {
  const f = fixture();
  const cache = f.create();
  const pending = deferred();
  let reads = 0;
  const loader = () => { reads++; return pending.promise; };
  const calls = Array.from({ length: 8 }, () => cache.read('no-readings', loader));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reads, 1);
  pending.resolve(complete([]));
  await Promise.all(calls);
  assert.deepEqual((await f.create().read('no-readings', loader)).data, []);
  assert.equal(reads, 1);
});

test('revision change returns old content immediately and refreshes in background', async () => {
  const f = fixture();
  await f.create().read('day', async () => complete('old'));
  f.revision('2');
  const pending = deferred();
  const cache = f.create();
  const stale = await cache.read('day', () => pending.promise);
  assert.equal(stale.data, 'old');
  assert.equal(stale.complete, false);
  assert.equal(f.records.get('day').data, 'old');
  pending.resolve(complete('new'));
  assert.equal((await cache.read('day', () => pending.promise, { fresh: true })).data, 'new');
  assert.equal((await f.create().read('day', () => assert.fail('unnecessary network'))).data, 'new');
});

test('offline revision change never starts a refresh and preserves old content', async () => {
  const f = fixture();
  await f.create().read('day', async () => complete('old'));
  f.revision('2'); f.online(false);
  const result = await f.create().read('day', () => assert.fail('offline network'), { fresh: true });
  assert.equal(result.data, 'old');
  assert.equal(result.complete, false);
});

test('failed or incomplete refresh never replaces a complete offline day', async () => {
  const f = fixture();
  await f.create().read('day', async () => complete(['one', 'two']));
  f.revision('2');
  for (const loader of [
    async () => ({ data: ['one'], complete: false }),
    async () => { throw new Error('network failed'); },
  ]) {
    const result = await f.create().read('day', loader, { fresh: true });
    assert.deepEqual(result.data, ['one', 'two']);
    assert.equal(result.complete, false);
    assert.equal(f.records.get('day').revision, '1');
  }
});

test('partial cold cache is not persisted and can be completed when online', async () => {
  const f = fixture();
  const cache = f.create();
  await cache.read('day', async () => ({ data: [], complete: false }));
  assert.equal(f.records.has('day'), false);
  await cache.read('day', async () => complete(['complete']), { fresh: true });
  assert.deepEqual(f.records.get('day').data, ['complete']);
});

test('a request begun before invalidation cannot overwrite the new revision', async () => {
  const f = fixture(); const cache = f.create(); const pending = deferred();
  const old = cache.read('day', () => pending.promise);
  await new Promise((resolve) => setImmediate(resolve));
  f.revision('2');
  await cache.read('day', async () => complete('new'), { fresh: true });
  pending.resolve(complete('old'));
  await old;
  assert.equal(cache.peek('day'), 'new');
  assert.equal(f.records.get('day').data, 'new');
});

test('storage corruption, unavailable IndexedDB and quota errors do not prevent rendering', async () => {
  for (const stored of [null, {}, { data: 'bad', complete: false, revision: '1' }]) {
    const f = fixture(); f.records.set('day', stored);
    assert.equal((await f.create().read('day', async () => complete('valid'))).data, 'valid');
  }
  const broken = async () => { throw new Error('quota or unavailable'); };
  const cache = createContentCache({ storage: { get: broken, set: broken, keys: broken }, getRevision: () => '1', isOnline: () => true });
  assert.equal((await cache.read('day', async () => complete('valid'))).data, 'valid');
  assert.equal((await cache.read('day', () => assert.fail('duplicate'))).data, 'valid');
  assert.deepEqual(await cache.keys(), ['day']);
});

test('date, linked-day and alternatives keys are isolated', async () => {
  const f = fixture(); const cache = f.create();
  const keys = ['["content","2026-08-31"]', '["content","2026-09-01"]', '["readings","2026-08-31","",true]', '["readings","2026-08-31","feast",true]'];
  for (const key of keys) await cache.read(key, async () => complete(key));
  const restarted = f.create();
  for (const key of keys) assert.equal((await restarted.read(key, () => assert.fail('network'))).data, key);
});

test('completeness requires every dependency to be server-confirmed without pending writes', () => {
  const session = createReadSession();
  session.observe({ metadata: { fromCache: false, hasPendingWrites: false }, empty: true });
  assert.equal(session.complete, true);
  session.observe({ metadata: { fromCache: true, hasPendingWrites: false } });
  session.observe({ metadata: { fromCache: false, hasPendingWrites: false } });
  assert.equal(session.complete, false);
  const pending = createReadSession();
  pending.observe({ metadata: { fromCache: false, hasPendingWrites: true } });
  assert.equal(pending.complete, false);
  const missingMetadata = createReadSession();
  missingMetadata.observe({});
  assert.equal(missingMetadata.complete, false);
});

test('updated Hours cache revision never exposes old assembled page as a fresh immediate hit', async () => {
  const f = fixture();
  const previousApp = f.create();
  await previousApp.read('2026-06-13', async () => complete({ laudesHymn: '', vesperHymn: 'old II Vespers' }));
  assert.equal(previousApp.peekFresh('2026-06-13').laudesHymn, '');
  f.revision('pr184');
  const updatedApp = f.create();
  await updatedApp.prime(['2026-06-13']);
  assert.equal(updatedApp.peekFresh('2026-06-13'), undefined);
  assert.equal(updatedApp.peek('2026-06-13').vesperHymn, 'old II Vespers', 'offline copy retained');
  const fresh = await updatedApp.read('2026-06-13', async () => complete({
    laudesHymn: 'Marian proper', vesperHymn: 'Sunday I Vespers',
  }), { fresh: true });
  assert.deepEqual(fresh.data, { laudesHymn: 'Marian proper', vesperHymn: 'Sunday I Vespers' });
  assert.equal(updatedApp.peekFresh('2026-06-13').laudesHymn, 'Marian proper');
  assert.equal(f.records.get('2026-06-13').revision, 'pr184');
});

test('offline stale Hours remain readable after revision bump without a network request', async () => {
  const f = fixture();
  const old = f.create();
  await old.read('2026-06-13', async () => complete({ offlineText: 'previous saved text' }));
  f.revision('pr184'); f.online(false);
  const freshApp = f.create();
  await freshApp.prime(['2026-06-13']);
  assert.equal(freshApp.peekFresh('2026-06-13'), undefined);
  const saved = await freshApp.read('2026-06-13', () => assert.fail('offline should not fetch'), { fresh: true });
  assert.equal(saved.data.offlineText, 'previous saved text');
  assert.equal(saved.complete, false);
});
