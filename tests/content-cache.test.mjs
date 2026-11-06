import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { createContentCache, createReadSession } from '../src/utils/contentCache.js';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

test('reference Office and readings caches cannot populate canonical day keys', async () => {
  const server = await createServer({ configFile: false, cacheDir: 'node_modules/.cache/cache-test-vite', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [] }, root: fileURLToPath(new URL('../', import.meta.url)) });
  try {
    const { contentKey, readingsKey, publicContentCache, calendarContentVersion } = await server.ssrLoadModule('/src/utils/publicContentCache.js');
    const date = '2026-12-06', diocese = 'minsk-mohilev';
    assert.deepEqual(JSON.parse(contentKey(date, diocese)), ['content', date, diocese, calendarContentVersion()]);
    assert.deepEqual(JSON.parse(readingsKey(date, { diocese })), ['readings', date, '', false, diocese, calendarContentVersion()]);
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
    const definitions = await server.ssrLoadModule('/src/utils/ordo/definitions.js');
    const before = contentKey(date, diocese);
    await publicContentCache.read(before, async () => ({ data: { title: 'old identity' }, complete: true }));
    definitions.setCalendarDefinitions({ ...definitions.getBundledCalendarDefinitions(), revision: 5 });
    assert.notEqual(contentKey(date, diocese), before);
    assert.equal(publicContentCache.peek(contentKey(date, diocese)), undefined);
    definitions.setCalendarDefinitions(null);
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

test('TTL refreshes corrected liturgical content on the next online visit, not on every navigation', async () => {
  const f = fixture();
  let time = 1_000_000;
  let online = true;
  let reads = 0;
  const create = () => createContentCache({
    storage: f.storage,
    getRevision: () => '1',
    isOnline: () => online,
    maxAgeMs: 15 * 60 * 1000,
    now: () => time,
  });
  const cache = create();
  assert.equal((await cache.read('day', async () => {
    reads++;
    return complete('хторупліва');
  })).data, 'хторупліва');
  time += 14 * 60 * 1000;
  assert.equal((await create().read('day', () => assert.fail('cache should still be fresh'))).data, 'хторупліва');
  time += 2 * 60 * 1000;
  assert.equal((await create().read('day', async () => {
    reads++;
    return complete('хто рупліва');
  })).data, 'хто рупліва');
  assert.equal(f.records.get('day').data, 'хто рупліва');
  assert.equal(reads, 2);
  assert.equal((await create().read('day', () => assert.fail('repeat navigation should be cached'))).data, 'хто рупліва');
  online = false;
  time += 60 * 60 * 1000;
  const offline = await create().read('day', () => assert.fail('offline must not fetch'));
  assert.equal(offline.data, 'хто рупліва');
  assert.equal(offline.complete, false);
});

test('legacy cache without timestamp refreshes online and survives offline or failed updates', async () => {
  const f = fixture();
  f.records.set('day', { complete: true, revision: '1', data: 'offline text' });
  let online = false;
  const create = () => createContentCache({
    storage: f.storage,
    getRevision: () => '1',
    isOnline: () => online,
    maxAgeMs: 30_000,
    now: () => 120_000,
  });
  assert.equal((await create().read('day', () => assert.fail('offline fetch'))).data, 'offline text');
  online = true;
  const failed = await create().read('day', async () => { throw new Error('no network'); });
  assert.equal(failed.data, 'offline text');
  assert.equal(failed.complete, false);
  assert.equal((await create().read('day', async () => complete('corrected'))).data, 'corrected');
  assert.equal(f.records.get('day').fetchedAt, 120_000);
});
