import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirestoreCacheRecovery, isFirestoreCacheError } from '../src/utils/firestoreCacheRecovery.js';
import { retryFirestore } from '../src/utils/retry.js';

const cacheError = Object.assign(new Error("Initialization of query failed: IndexedDB transaction 'Allocate target' failed: AbortError"), { code: 'unavailable' });

function fixture() {
  const records = new Map();
  let reloads = 0;
  const options = {
    storage: () => ({ getItem: key => records.get(key), setItem: (key, value) => records.set(key, value) }),
    reload: () => { reloads++; },
    projectId: 'test',
    isOnline: () => true,
  };
  return { options, reloads: () => reloads };
}

test('wrapped IndexedDB errors trigger one reload and memory cache on the next boot', () => {
  const f = fixture();
  const recovery = createFirestoreCacheRecovery(f.options);
  assert.equal(recovery.usesMemoryCache(), false);
  assert.equal(recovery.recover(cacheError), true);
  assert.equal(recovery.recover(cacheError), false);
  const nextBoot = createFirestoreCacheRecovery(f.options);
  assert.equal(nextBoot.usesMemoryCache(), true);
  assert.equal(nextBoot.recover(cacheError), false);
  assert.equal(f.reloads(), 1);
  assert.equal(createFirestoreCacheRecovery({ ...f.options, projectId: 'other' }).usesMemoryCache(), false);
});

test('network and permission failures do not switch cache mode', () => {
  const f = fixture();
  const recovery = createFirestoreCacheRecovery(f.options);
  for (const code of ['unavailable', 'permission-denied', 'aborted']) {
    assert.equal(recovery.recover(Object.assign(new Error('Request failed'), { code })), false);
  }
  assert.equal(recovery.usesMemoryCache(), false);
  assert.equal(f.reloads(), 0);
  assert.equal(isFirestoreCacheError({ name: 'IndexedDbTransactionError' }), true);
});

test('offline and blocked session storage cannot cause a reload loop', () => {
  const f = fixture();
  for (const overrides of [
    { isOnline: () => false },
    { storage: () => { throw new Error('Storage blocked'); } },
    { storage: () => undefined },
    { storage: () => ({ getItem: () => null, setItem: () => {} }) },
  ]) {
    assert.equal(createFirestoreCacheRecovery({ ...f.options, ...overrides }).recover(cacheError), false);
  }
  assert.equal(f.reloads(), 0);
});

test('Firestore retries skip broken persistence but still retry network failures', async () => {
  let attempts = 0;
  await assert.rejects(retryFirestore(() => { attempts++; throw cacheError; }, { timeout: 0, delay: 0 }), error => error === cacheError);
  assert.equal(attempts, 1);
  attempts = 0;
  const result = await retryFirestore(() => {
    if (++attempts === 1) throw Object.assign(new Error('Network unavailable'), { code: 'unavailable' });
    return 'ok';
  }, { timeout: 0, delay: 0 });
  assert.equal(result, 'ok');
  assert.equal(attempts, 2);
});
