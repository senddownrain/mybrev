import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { setImmediate } from 'node:timers';
import { watch } from 'vue';
import {
  createS2AccessSession, S2_LEGACY_PENDING_DISABLE, S2_PENDING_DISABLE,
} from '../src/services/s2AccessSession.mjs';
import {
  noteFirestoreError, onFirestoreQuotaBlocked, resetFirestoreQuota,
} from '../src/utils/firestoreErrors.mjs';

const vectors = JSON.parse(await readFile(new URL('./fixtures/access-sets-v2-code-vectors.json', import.meta.url)));
const [marian, priest] = vectors.valid;
const legacyCode = 'A2B3-C4D5-E6F7-G8H9-J2K3-L4M5';
const uid = 'fixture-device';
const grant = { uid, status: 'active' };
const error = code => Object.assign(new Error('SDK payload must never be shown'), { code });
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture({ user = { uid }, values = new Map() } = {}) {
  resetFirestoreQuota();
  const auth = { currentUser: user, authStateReady: async () => {} };
  const counts = { signIn: 0, signOut: 0, legacy: 0, v2: 0 };
  const client = { online: true, mode: 'canonical', counts, auth, values };
  let authChange;
  const storage = {
    getItem: key => values.get(key),
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const session = createS2AccessSession({
    getAuth: () => auth, online: () => client.online, storage: () => storage,
    watchAuth: (_auth, fn) => { authChange = fn; },
    observe: (key, observer) => {
      client.observer = observer;
      client.observed = key;
      return () => { if (client.observer === observer) client.observer = null; };
    },
    signIn: async () => { counts.signIn++; auth.currentUser = { uid }; authChange(); },
    signOut: async () => { counts.signOut++; auth.currentUser = null; authChange(); },
    deviceInfo: () => ({ client: 'Web' }),
    legacy: {
      read: async () => ({ data: client.legacy }),
      isActive: ({ data }, expectedUid) => data?.uid === expectedUid && data.status === 'active',
      activate: async (activeUid, code) => {
        counts.legacy++;
        assert.equal(activeUid, uid);
        if (code !== legacyCode || client.legacy?.status === 'revoked') throw error('permission-denied');
        client.legacy = grant;
      },
      touch: () => {},
      revoke: async () => {
        if (client.legacy?.status === 'active') client.legacy = { ...grant, status: 'revoked' };
      },
    },
    v2: () => ({
      readMode: async () => { if (client.modeError) throw client.modeError; return client.mode; },
      readGrant: async () => { if (client.grantError) throw client.grantError; return client.v2; },
      readEntitlements: async () => {
        if (client.blockEntitlements) return client.blockEntitlements;
        if (client.profileError) throw client.profileError;
        return client.entitlements;
      },
      activate: async (activeUid, code) => {
        counts.v2++;
        assert.equal(activeUid, uid);
        if (client.v2?.status === 'revoked') throw error('grant-revoked');
        const vector = [marian, priest].find(item => item.input === code);
        if (!vector) throw error('activation-denied');
        client.v2 = { ...grant, codeId: vector.codeId };
        client.entitlements = {
          profileId: 'fixture', allowedSets: [vector === marian ? 'marian' : 'priest'], revision: 1,
        };
        if (client.commitError) throw client.commitError;
      },
      revokeOwn: async () => {
        if (client.revokeError) throw client.revokeError;
        if (client.v2?.status === 'active') client.v2 = { ...client.v2, status: 'revoked' };
      },
    }),
  });
  return Object.assign(client, session);
}

test('public startup never creates a device account and preserves empty read-only entitlements', async () => {
  const c = fixture({ user: null });
  await c.check();
  assert.equal(c.counts.signIn, 0);
  assert.equal(c.access.checked, true);
  assert.deepEqual(c.access.allowedSets, []);
  assert.throws(() => c.access.allowedSets.push('priest'), TypeError);
  assert.throws(() => { c.access.active = true; }, TypeError);
});

test('existing legacy UID survives missing S1 Rules and a canonical transition without another code', async () => {
  const c = fixture();
  c.legacy = grant;
  c.modeError = error('permission-denied');
  assert.equal((await c.check()).active, true);
  assert.deepEqual(c.access.allowedSets, ['priest']);
  c.modeError = null;
  await c.refresh();
  assert.equal(c.access.legacyActive, false);
  assert.deepEqual(c.access.allowedSets, ['priest']);
  c.modeError = error('permission-denied');
  await assert.rejects(c.check());
  assert.equal(c.access.active, false);
  assert.equal(c.counts.signIn, 0);
});

test('legacy and V2 formats dispatch exclusively with a shared rejection message', async () => {
  const c = fixture({ user: null });
  c.mode = 'legacy';
  await c.activate(legacyCode);
  assert.deepEqual(c.access.allowedSets, ['priest']);
  const rejected = await c.activate(marian.input).catch(value => value.message);
  assert.equal(rejected, await c.activate(vectors.invalid[0]).catch(value => value.message));
  assert.match(rejected, /Код няправільны/);
  assert.equal(c.counts.legacy, 1);
  assert.equal(c.counts.v2, 0);
  assert.equal(c.counts.signIn, 1);
});

test('V2-only grants never open the legacy mirror, including priest-only', async () => {
  for (const [vector, set] of [[marian, 'marian'], [priest, 'priest']]) {
    const c = fixture({ user: null });
    await c.activate(vector.input);
    assert.deepEqual(c.access.allowedSets, [set]);
    assert.equal(c.access.legacyActive, false);
    assert.equal(c.counts.legacy, 0);
    assert.equal(c.counts.signIn, 1);
    assert.equal(c.auth.currentUser.uid, uid);
    c.mode = 'legacy';
    await c.refresh();
    assert.equal(c.access.active, false);
    assert.equal(c.access.canDisable, true);
  }
});

test('union and per-branch revocation apply to the same UID and advance generation', async () => {
  const c = fixture();
  await c.activate(legacyCode);
  await c.activate(marian.input);
  assert.deepEqual(c.access.allowedSets, ['marian', 'priest']);
  assert.equal(c.counts.signIn, 0);
  const generation = c.access.generation;
  c.legacy = { ...grant, status: 'revoked' };
  c.observer.change('legacy', false, false);
  assert.equal(c.access.active, false);
  await c.check();
  assert.deepEqual(c.access.allowedSets, ['marian']);
  assert.ok(c.access.generation > generation);

  const other = fixture();
  other.legacy = grant;
  await other.activate(marian.input);
  other.v2 = { ...other.v2, status: 'revoked' };
  other.observer.change('grant', null, false);
  await other.check();
  assert.deepEqual(other.access.allowedSets, ['priest']);
  await assert.rejects(other.activate(marian.input), /Код няправільны/);
});

test('profile revision, rotation, loss of projection and suspension invalidate private results', async () => {
  const c = fixture();
  c.legacy = grant;
  await c.activate(marian.input);
  const seen = [];
  const stop = watch(() => c.access.generation, value => seen.push([value, [...c.access.allowedSets]]), { flush: 'sync' });
  c.entitlements = { ...c.entitlements, revision: 2, allowedSets: ['priest'] };
  c.observer.change('profile', '[2,["priest"]]', false);
  await c.check();
  assert.deepEqual(c.access.allowedSets, ['priest']);
  assert.equal(c.access.profileRevision, 2);
  await c.check(); // Code rotation changes no document you depend on.
  assert.equal(c.access.profileRevision, 2);
  c.profileError = error('permission-denied');
  c.observer.error('profile', c.profileError);
  await c.check();
  assert.deepEqual(c.access.allowedSets, ['priest']);
  assert.equal(c.access.profileRevision, null);
  assert.equal(c.access.profileUnavailable, true);
  c.mode = 'suspended';
  c.observer.change('mode', 'suspended', false);
  await c.check();
  assert.deepEqual(c.access.allowedSets, []);
  assert.ok(seen.some(([, sets]) => sets.length === 0));
  stop();
});

test('offline, quota and server errors close access and discard earlier in-flight reads', async () => {
  const c = fixture();
  await c.activate(marian.input);
  let resolve;
  c.blockEntitlements = new Promise(complete => { resolve = complete; });
  const stale = c.check();
  await flush();
  c.online = false;
  c.clearPrivateSession();
  assert.deepEqual(c.access.allowedSets, []);
  resolve(c.entitlements);
  await stale;
  assert.equal(c.access.active, false);
  c.online = true;
  c.blockEntitlements = null;
  await c.refresh();
  assert.equal(c.access.active, true);
  c.profileError = error('unavailable');
  await assert.rejects(c.check(), /злучэнне/);
  assert.equal(c.access.active, false);
  c.profileError = null;
  await c.check();
  const stop = onFirestoreQuotaBlocked(c.clearPrivateSession);
  noteFirestoreError(error('resource-exhausted'));
  assert.equal(c.access.active, false);
  await assert.rejects(c.check(), /Вычарпана квота/);
  resetFirestoreQuota();
  await c.refresh();
  assert.equal(c.access.active, true);
  stop();
});

test('pending disable clears immediately, persists UID only, and resumes without signing out early', async () => {
  const c = fixture();
  c.legacy = grant;
  await c.activate(marian.input);
  c.online = false;
  const disabling = c.disable();
  assert.equal(c.access.active, false);
  assert.deepEqual(await disabling, { pending: true, persisted: true });
  assert.deepEqual([...c.values], [[S2_PENDING_DISABLE, uid]]);
  assert.equal(c.counts.signOut, 0);

  const restart = fixture({ values: c.values });
  restart.legacy = c.legacy;
  restart.v2 = c.v2;
  restart.revokeError = error('unavailable');
  await assert.rejects(restart.check(), /злучэнне/);
  assert.equal(restart.legacy.status, 'revoked');
  assert.equal(restart.v2.status, 'active');
  assert.equal(restart.access.active, false);
  assert.equal(restart.counts.signOut, 0);

  restart.revokeError = null;
  await restart.refresh();
  assert.equal(restart.v2.status, 'revoked');
  assert.equal(restart.auth.currentUser, null);
  assert.equal(restart.counts.signOut, 1);
  assert.equal(c.values.size, 0);
});

test('old pending marker resumes on the original UID with pre-S1 Rules', async () => {
  const c = fixture({ values: new Map([[S2_LEGACY_PENDING_DISABLE, uid]]) });
  c.modeError = error('permission-denied');
  c.grantError = error('permission-denied');
  c.legacy = grant;
  await c.check();
  assert.equal(c.legacy.status, 'revoked');
  assert.equal(c.counts.signOut, 1);
  assert.equal(c.values.size, 0);
  assert.equal(c.access.active, false);
});

test('ambiguous V2 commit recovers from own grant only and never sends a second claim', async () => {
  const c = fixture();
  c.commitError = error('unavailable');
  await c.activate(marian.input);
  assert.deepEqual(c.access.allowedSets, ['marian']);
  assert.equal(c.counts.v2, 1);
  assert.equal(c.values.size, 0);
});
