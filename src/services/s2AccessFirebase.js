import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { updateDoc, doc as liteDoc, serverTimestamp, writeBatch } from 'firebase/firestore/lite';
import { getPriestActivationDb, getPriestAuth, priestFirebase } from '@/plugins/priestFirebase';
import { codeProof } from '@/utils/priestCode.mjs';
import {
  assertFirestoreQuotaAvailable, firestoreErrorCode, isFirestoreQuotaBlocked, noteFirestoreError,
} from '@/utils/firestoreErrors.mjs';
import { ACCESS_V2, accessV2Error, createAccessSetsV2Gateway } from './accessSetsV2Gateway.mjs';
import { createS2AccessSession, S2_LEGACY_PENDING_DISABLE, S2_PENDING_DISABLE } from './s2AccessSession.mjs';

const legacyGrants = 'priestDeviceGrants';
const ref = (name, id, ...path) => doc(priestFirebase.db, name, id, ...path);
const legacyRef = uid => liteDoc(getPriestActivationDb(), legacyGrants, uid);
let gateway;

export function publicDevice(snapshot) {
  const data = snapshot.data();
  // The legacy administrative registry may still contain old proof-bearing rows.
  const keys = ['uid', 'status', 'deviceName', 'client', 'platform', 'label', 'activatedAt', 'lastActiveAt', 'revokedAt'];
  return { ...Object.fromEntries(keys.map(key => [key, data[key] ?? null])), id: snapshot.id };
}

function isLegacyActive(data, uid) {
  return data?.uid === uid && data.status === 'active' && !Object.hasOwn(data, 'activationProof');
}

async function readLegacy(uid) {
  const snapshot = await getDocFromServer(ref(legacyGrants, uid));
  const data = snapshot.data();
  return {
    exists: snapshot.exists(), data,
    confirmed: !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites,
    device: data ? publicDevice(snapshot) : null,
  };
}

async function activateLegacy(uid, code, label, metadata) {
  const proof = await codeProof(code);
  const existing = await readLegacy(uid);
  if (existing.data?.status === 'revoked') throw accessV2Error('grant-revoked');
  if (existing.exists) return;

  const db = getPriestActivationDb();
  const batch = writeBatch(db);
  batch.set(liteDoc(db, 'priestActivationClaims', uid), {
    uid, activationProof: proof, createdAt: serverTimestamp(),
  });
  batch.set(legacyRef(uid), {
    uid, status: 'active', ...metadata,
    label: String(label || '').trim().slice(0, 120), activatedAt: serverTimestamp(),
    lastActiveAt: serverTimestamp(), revokedAt: null,
  });
  try {
    await batch.commit();
  } catch (error) {
    if (firestoreErrorCode(error) !== 'permission-denied') throw error;
    // Another tab using the previous client can have registered this UID.
    const observed = await readLegacy(uid);
    if (!observed.confirmed || !isLegacyActive(observed.data, uid)) throw error;
  }
}

async function revokeLegacy(uid) {
  const previous = await readLegacy(uid);
  if (!previous.confirmed) throw accessV2Error('revocation-unconfirmed');
  if (previous.data?.status !== 'active') return;
  let writeError;
  try {
    await updateDoc(legacyRef(uid), { status: 'revoked', revokedAt: serverTimestamp() });
  } catch (error) {
    writeError = error;
  }
  const current = await readLegacy(uid).catch(error => { throw writeError || error; });
  if (!current.confirmed || current.data?.status !== 'revoked') {
    throw writeError || accessV2Error('revocation-unconfirmed');
  }
}

const touching = new Set();
function touchLegacy({ data, confirmed }, uid) {
  if (!confirmed || !isLegacyActive(data, uid) || touching.has(uid)
    || Date.now() - (data.lastActiveAt?.toMillis?.() || 0) < 3600000) return;
  touching.add(uid);
  updateDoc(legacyRef(uid), { lastActiveAt: serverTimestamp() })
    .catch(noteFirestoreError)
    .finally(() => touching.delete(uid));
}

function observe({ uid, s1, profileId }, observer) {
  const observeDoc = (kind, reference, project) => {
    let confirmed = false;
    return onSnapshot(reference, { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.hasPendingWrites || (snapshot.metadata.fromCache && !confirmed)) return;
      if (!snapshot.metadata.fromCache) confirmed = true;
      observer.change(kind, project(snapshot.data()), snapshot.metadata.fromCache);
    }, error => observer.error(kind, error));
  };

  const stops = [observeDoc('legacy', ref(legacyGrants, uid), data => isLegacyActive(data, uid))];
  if (s1) {
    stops.push(observeDoc('mode', ref('priestContentControl', 'accessSetsV2'), data => {
      if (!data || data.mode === 'legacy') return 'legacy';
      return data.mode === 'canonical' ? 'canonical' : 'suspended';
    }));
    stops.push(observeDoc('grant', ref(ACCESS_V2.grants, uid), data =>
      data?.uid === uid && data.status === 'active' ? data.codeId : null));
  }
  if (profileId) {
    stops.push(observeDoc('profile', ref(ACCESS_V2.profiles, profileId, 'client', 'entitlements'), data =>
      data && Array.isArray(data.allowedSets) ? JSON.stringify([data.revision, [...data.allowedSets].sort()]) : null));
  }
  return () => stops.forEach(stop => stop());
}

function deviceInfo() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Браўзер';
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  return { deviceName: `${browser} · ${platform || 'Web'}`.slice(0, 120), client: 'Web', platform: platform.slice(0, 120) };
}

export const s2Session = createS2AccessSession({
  getAuth: getPriestAuth,
  signIn: async auth => (await import('firebase/auth')).signInAnonymously(auth),
  signOut: async auth => (await import('firebase/auth')).signOut(auth),
  watchAuth: (auth, onChange) => auth.onAuthStateChanged(onChange),
  online: () => navigator.onLine !== false,
  storage: () => window.localStorage,
  lock: typeof window !== 'undefined' && navigator.locks
    ? action => navigator.locks.request('mybrev-device-access', action) : undefined,
  deviceInfo, observe,
  legacy: {
    read: readLegacy,
    isActive: ({ confirmed, data }, uid) => confirmed && isLegacyActive(data, uid),
    activate: activateLegacy, revoke: revokeLegacy, touch: touchLegacy,
  },
  v2: () => (gateway ??= createAccessSetsV2Gateway(getPriestActivationDb())),
});

let started = false;
export function startS2Access() {
  if (started) return;
  started = true;
  const refresh = () => s2Session.refresh().catch(() => {});
  window.addEventListener('online', refresh);
  window.addEventListener('offline', s2Session.clearPrivateSession);
  window.addEventListener('focus', () => {
    if (!s2Session.access.mode || s2Session.access.profileUnavailable) refresh();
  });
  window.addEventListener('storage', event => {
    if (event.key === null || event.key === S2_PENDING_DISABLE || event.key === S2_LEGACY_PENDING_DISABLE) {
      s2Session.storageChanged().catch(() => {});
    }
  });
  // A disabled profile denies even the projection listen. Recheck only that
  // case in a foreground tab so a profile can recover without a second code.
  window.setInterval(() => {
    if (!document.hidden && navigator.onLine !== false && !isFirestoreQuotaBlocked()
      && s2Session.access.profileUnavailable) s2Session.check().catch(() => {});
  }, 60000);
}

export async function loadS2Help() {
  try {
    assertFirestoreQuotaAvailable();
    return (await getDocFromServer(ref('priestAccessPublic', 'help'))).data()?.helpText || '';
  } catch (error) {
    noteFirestoreError(error);
    return '';
  }
}
