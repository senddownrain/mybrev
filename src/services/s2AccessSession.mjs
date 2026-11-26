import { shallowRef } from 'vue';
import { ACCESS_SET_ID, parseAccessSetsV2Code } from '../utils/accessSetsV2Code.mjs';
import { normalizeCode } from '../utils/priestCode.mjs';
import {
  assertFirestoreQuotaAvailable, firestoreErrorCode, firestoreErrorMessage, isConnectionError,
  isFirestoreQuotaError, noteFirestoreError, resetFirestoreQuota,
} from '../utils/firestoreErrors.mjs';

export const S2_PENDING_DISABLE = 'mybrev-access-disable-pending-v4';
export const S2_LEGACY_PENDING_DISABLE = 'mybrev-priest-disable-pending-v3';
const pendingKeys = [S2_PENDING_DISABLE, S2_LEGACY_PENDING_DISABLE];
const noSets = Object.freeze([]);
const closed = { checked: true, active: false, legacyActive: false, mode: null, allowedSets: noSets, profileRevision: null, profileUnavailable: false };
const denied = error => firestoreErrorCode(error) === 'permission-denied';
const failure = code => Object.assign(new Error(code), { code });

function publicError(error, activating = false) {
  const code = firestoreErrorCode(error);
  if (activating && (denied(error) || [
    'invalid-code', 'activation-denied', 'grant-exists', 'grant-revoked', 'profile-denied',
  ].includes(code))) return new Error('Код няправільны.');
  if (isFirestoreQuotaError(error) || isConnectionError(error)) {
    return new Error(firestoreErrorMessage(error));
  }
  if (code === 'auth/too-many-requests') return new Error('Зашмат спробаў. Паспрабуйце пазней.');
  if (code === 'auth/operation-not-allowed') return new Error('Не ўдалося ўвайсці. Паведаміце адміністратару.');
  if (code === 'pending-disable') return new Error('Дачакайцеся завяршэння выключэння доступу.');
  return new Error('Не ўдалося пацвердзіць доступ. Паспрабуйце пазней.');
}

function activeV2(grant, uid) {
  return grant?.uid === uid && grant.status === 'active';
}

export function createS2AccessSession({
  getAuth, signIn, signOut, watchAuth, legacy, v2, observe, online, storage, lock, deviceInfo,
}) {
  const snapshot = shallowRef({
    ...closed, checked: false, canDisable: false, pendingDisable: false, generation: 0, revision: 0,
  });
  // Replace the complete snapshot before notifying synchronous consumers.
  const access = {};
  for (const key of Object.keys(snapshot.value)) Object.defineProperty(access, key, {
    enumerable: true, get: () => snapshot.value[key],
  });
  Object.freeze(access);

  let authPromise, currentUid, checkRequest, subscriptions, pendingInMemory;
  let verifiedS1 = false;
  let localQueue = Promise.resolve();

  function exclusive(action) {
    if (lock) return lock(action);
    const result = localQueue.then(action);
    localQueue = result.catch(() => {});
    return result;
  }

  function publish(next, force = false) {
    const previous = snapshot.value;
    const changed = force || Object.keys(next).some(key => !Object.is(previous[key], next[key]));
    if (changed) {
      const generation = previous.generation + 1;
      snapshot.value = { ...previous, ...next, generation, revision: generation };
    }
  }

  function clearPrivateSession() {
    checkRequest = null;
    publish(closed, true);
  }

  function storedPending(key) {
    try { return storage()?.getItem(key); } catch { return null; }
  }

  function pending(uid) {
    return Boolean(uid && (pendingInMemory === uid || pendingKeys.some(key => storedPending(key) === uid)));
  }

  function savePending(uid) {
    pendingInMemory = uid;
    try {
      const target = storage();
      if (!target) return false;
      target.setItem(S2_PENDING_DISABLE, uid);
      return true;
    } catch {
      return false;
    }
  }

  function removePending(uid) {
    if (pendingInMemory === uid) pendingInMemory = undefined;
    for (const key of pendingKeys) {
      if (storedPending(key) === uid) storage().removeItem(key);
    }
  }

  function disconnect() {
    subscriptions?.stop();
    subscriptions = undefined;
  }

  function setUid(uid) {
    if (uid === currentUid) return;
    currentUid = uid;
    disconnect();
    publish({ ...closed, canDisable: false, pendingDisable: pending(uid) }, true);
  }

  function restoredAuth() {
    authPromise ||= Promise.resolve().then(getAuth).then(async auth => {
      await auth.authStateReady();
      setUid(auth.currentUser?.uid);
      watchAuth(auth, () => {
        const uid = auth.currentUser?.uid;
        if (uid === currentUid) return;
        setUid(uid);
        checkRequest = null;
        check().catch(() => {});
      });
      return auth;
    }).catch(error => {
      authPromise = null;
      throw error;
    });
    return authPromise;
  }

  async function readMode() {
    try {
      const mode = await v2().readMode();
      verifiedS1 = true;
      return { mode, s1: true };
    } catch (error) {
      // Pre-S1 Rules deny this exact path. Only a separately confirmed
      // legacy grant can authorize the mirror in this compatibility case.
      if (!verifiedS1 && denied(error)) return { mode: 'legacy', s1: false };
      throw error;
    }
  }

  async function revokeV2(uid) {
    const gateway = v2();
    let grant;
    try {
      grant = await gateway.readGrant(uid);
    } catch (error) {
      // Before S1 the V2 path may be denied. A confirmed S1 server
      // always permits an owner to read this path in every mode.
      if (denied(error) && !(await readMode()).s1) return;
      throw error;
    }
    if (grant?.status !== 'active') return;
    await gateway.revokeOwn(uid);
    if ((await gateway.readGrant(uid))?.status === 'active') throw failure('revocation-unconfirmed');
  }

  async function deliverDisable(auth, uid) {
    if (!pending(uid) || auth.currentUser?.uid !== uid || !online()) return;
    assertFirestoreQuotaAvailable();
    const results = await Promise.allSettled([legacy.revoke(uid), revokeV2(uid)]);
    const failures = results.filter(result => result.status === 'rejected');
    for (const failed of failures) noteFirestoreError(failed.reason);
    if (failures.length) throw failures[0].reason;
    if (auth.currentUser?.uid === uid) await signOut(auth);
    removePending(uid);
  }

  function watch(uid, s1, profileId, expected) {
    const key = JSON.stringify([uid, s1, profileId]);
    if (subscriptions?.key === key) {
      subscriptions.expected = expected;
      return;
    }
    disconnect();
    const entry = { key, expected };
    subscriptions = entry;
    entry.stop = observe({ uid, s1, profileId }, {
      change(kind, value, fromCache) {
        if (subscriptions !== entry) return;
        if (fromCache) {
          if (snapshot.value.active) clearPrivateSession();
          return;
        }
        if (value !== entry.expected[kind]) {
          clearPrivateSession();
          check().catch(() => {});
        } else if (!snapshot.value.mode) {
          check().catch(() => {});
        }
      },
      error(kind, error) {
        if (subscriptions !== entry) return;
        noteFirestoreError(error);
        disconnect();
        clearPrivateSession();
        if (kind === 'profile' && denied(error)) check().catch(() => {});
      },
    });
  }

  async function inspect(uid) {
    assertFirestoreQuotaAvailable();
    const { mode, s1 } = await readMode();
    const legacyGrant = await legacy.read(uid);
    const grant = s1 ? await v2().readGrant(uid) : null;
    const legacyActive = legacy.isActive(legacyGrant, uid);
    const v2Active = activeV2(grant, uid);
    let entitlements = null;
    let confirmedMode = mode;
    if (mode === 'canonical' && v2Active) {
      try {
        entitlements = await v2().readEntitlements(uid);
        if (entitlements && (typeof entitlements.profileId !== 'string' || !ACCESS_SET_ID.test(entitlements.profileId)
          || !Number.isSafeInteger(entitlements.revision) || entitlements.revision < 1
          || !Array.isArray(entitlements.allowedSets)
          || entitlements.allowedSets.some(id => typeof id !== 'string' || !ACCESS_SET_ID.test(id)))) {
          throw failure('entitlements-unavailable');
        }
      } catch (error) {
        if (!denied(error)) throw error;
        // Disabled/revoked profiles deny their projection. A concurrent
        // mode change can produce the same denial, so confirm mode again.
        confirmedMode = (await readMode()).mode;
      }
    }
    const sets = confirmedMode === 'suspended' ? [] : [
      ...(legacyActive ? ['priest'] : []),
      ...(confirmedMode === 'canonical' ? entitlements?.allowedSets ?? [] : []),
    ];
    return { s1, legacyGrant, grant, legacyActive, v2Active, mode: confirmedMode, entitlements,
      allowedSets: [...new Set(sets)].sort() };
  }

  function check() {
    if (checkRequest) return checkRequest;
    const request = (async () => {
      const auth = await restoredAuth();
      const uid = auth.currentUser?.uid;
      if (uid !== currentUid) setUid(uid);
      const generation = snapshot.value.generation;
      const current = () => checkRequest === request && generation === snapshot.value.generation
        && auth.currentUser?.uid === uid;
      if (!current()) return { active: false, interrupted: true };
      if (pending(uid)) {
        publish({ ...closed, pendingDisable: true, canDisable: false });
        if (online()) await exclusive(() => deliverDisable(auth, uid));
        if (!pending(uid)) publish({ pendingDisable: false, canDisable: false });
        return { active: false };
      }
      if (!uid || !online()) {
        if (current()) publish({ ...closed, pendingDisable: false, ...(!uid && { canDisable: false }) });
        return { active: false };
      }
      let result;
      try {
        result = await inspect(uid);
        assertFirestoreQuotaAvailable();
      } catch (error) {
        if (!current()) return { active: false, interrupted: true };
        clearPrivateSession();
        throw error;
      }
      if (!current() || !online() || pending(uid)) return { active: false, interrupted: true };
      const { s1, mode, allowedSets, legacyGrant, legacyActive, grant, v2Active, entitlements } = result;
      const allowed = allowedSets.join() === snapshot.value.allowedSets.join()
        ? snapshot.value.allowedSets : Object.freeze(allowedSets);
      publish({
        checked: true, active: allowed.length > 0, allowedSets: allowed, mode,
        legacyActive: mode === 'legacy' && legacyActive,
        profileRevision: entitlements?.revision ?? null,
        canDisable: legacyActive || v2Active, pendingDisable: false,
        profileUnavailable: mode === 'canonical' && v2Active && !entitlements,
      });
      watch(uid, s1, entitlements?.profileId, {
        mode, legacy: legacyActive, grant: v2Active ? grant.codeId : null,
        profile: entitlements ? JSON.stringify([entitlements.revision, [...entitlements.allowedSets].sort()]) : null,
      });
      if (mode !== 'suspended') legacy.touch(legacyGrant, uid);
      return { active: snapshot.value.legacyActive, legacyConfirmed: mode !== 'suspended' && legacyActive,
        v2CodeId: entitlements && mode === 'canonical' ? grant.codeId : null,
        ...(legacyGrant.device && { device: legacyGrant.device }) };
    })().catch(error => {
      noteFirestoreError(error);
      if (checkRequest === request) publish(closed);
      throw publicError(error);
    }).finally(() => {
      if (checkRequest === request) checkRequest = null;
    });
    checkRequest = request;
    return request;
  }

  async function activate(code, label) {
    const parsed = parseAccessSetsV2Code(code);
    try {
      if (!parsed && !normalizeCode(code)) throw failure('invalid-code');
      resetFirestoreQuota();
      const uid = await exclusive(async () => {
        if (!online()) throw new Error('OFFLINE');
        const auth = await restoredAuth();
        if (pending(auth.currentUser?.uid)) throw failure('pending-disable');
        if (!auth.currentUser) await signIn(auth);
        const uid = auth.currentUser?.uid;
        if (!uid || pending(uid)) throw failure('pending-disable');
        assertFirestoreQuotaAvailable();
        const { mode } = await readMode();
        if (mode === 'suspended' || (parsed && mode !== 'canonical')) throw failure('activation-denied');
        if (auth.currentUser?.uid !== uid || pending(uid)) throw failure('pending-disable');
        const metadata = deviceInfo();
        if (parsed) {
          try {
            await v2().activate(uid, code, metadata);
          } catch (error) {
            if (!isConnectionError(error) && error?.code !== 'registration-unconfirmed') throw error;
            const observed = await v2().readGrant(uid).catch(() => null);
            if (!activeV2(observed, uid) || observed.codeId !== parsed.codeId) throw error;
          }
        } else {
          await legacy.activate(uid, code, label, metadata);
        }
        return uid;
      });
      // Confirm this branch even when the other branch already grants access.
      clearPrivateSession();
      let status = await check();
      // A simultaneous notification can supersede this read. Join the
      // replacement read or recheck once, with no new activation batch.
      if (status.interrupted && online() && !pending(uid)) status = await check();
      if (status.interrupted || uid !== currentUid || !online() || pending(uid) || !snapshot.value.mode) {
        throw failure('registration-unconfirmed');
      }
      if (parsed ? status.v2CodeId !== parsed.codeId : !status.legacyConfirmed) {
        throw failure('activation-denied');
      }
      return { active: snapshot.value.active, ...(status.device && { device: status.device }) };
    } catch (error) {
      noteFirestoreError(error);
      if (isConnectionError(error) || isFirestoreQuotaError(error) || error?.code === 'registration-unconfirmed') {
        clearPrivateSession();
      }
      throw publicError(error, true);
    }
  }

  async function disable() {
    resetFirestoreQuota();
    clearPrivateSession();
    const auth = await restoredAuth();
    const uid = auth.currentUser?.uid;
    if (!uid) return { pending: false };
    const persisted = savePending(uid);
    publish({ ...closed, canDisable: false, pendingDisable: true });
    disconnect();
    try {
      if (online()) await exclusive(() => deliverDisable(auth, uid));
    } catch (error) {
      noteFirestoreError(error);
    }
    const remaining = pending(uid);
    publish({ pendingDisable: remaining });
    return { pending: remaining, persisted: !remaining || persisted };
  }

  function storageChanged() {
    clearPrivateSession();
    publish({ pendingDisable: pending(currentUid) });
    return check();
  }

  async function confirmCatalog() {
    if (checkRequest || !access.checked || !access.mode) await check();
    if (!currentUid || !online() || pending(currentUid) || !access.active) return null;
    if (access.mode === 'legacy' && access.legacyActive) return { mode: 'legacy', legacyActive: true };
    if (access.mode !== 'canonical') return null;
    return { mode: 'canonical', uid: currentUid, allowedSets: access.allowedSets, gateway: v2() };
  }

  return { access, activate, check, clearPrivateSession, confirmCatalog, disable, refresh: check, storageChanged };
}
