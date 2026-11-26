import {
  collection, doc, documentId, getDoc, getDocs, limit, orderBy, query, serverTimestamp,
  setLogLevel, startAfter, updateDoc, writeBatch,
} from 'firebase/firestore/lite';
import {
  ACCESS_SET_ID, accessSetsV2CodeProof, parseAccessSetsV2Code,
} from '../utils/accessSetsV2Code.mjs';
import { ACCESS_V2 } from '../utils/accessSetsV2Paths.mjs';

export { ACCESS_V2 };

export const accessV2Grant = (db, uid) => doc(db, ACCESS_V2.grants, uid);
export const accessV2ProfileProjection = (db, profileId) =>
  doc(db, ACCESS_V2.profiles, profileId, 'client', 'entitlements');
export const accessV2CodeProjection = (db, codeId) =>
  doc(db, ACCESS_V2.codes, codeId, 'client', 'profile');

export function accessV2Error(code) {
  return Object.assign(new Error(code), { code });
}

export function accessV2StatusError(error) {
  switch (error?.code) {
    case 'permission-denied': return 'access-denied';
    case 'unauthenticated': return 'authentication-required';
    case 'resource-exhausted': return 'quota-exhausted';
    case 'unavailable':
    case 'deadline-exceeded': return 'server-unavailable';
    default: return 'access-failed';
  }
}

function validateKind(kind) {
  if (kind !== 'prayers' && kind !== 'categories') throw accessV2Error('invalid-content-kind');
}

function registrationResult(grant, codeId) {
  if (grant.status !== 'active') throw accessV2Error('grant-revoked');
  if (grant.codeId !== codeId) throw accessV2Error('grant-exists');
  return { codeId };
}

// Pass the Lite Firestore instance of the existing named device app. All
// reads are from the server and no proof or protected content is persisted.
export function createAccessSetsV2Gateway(db) {
  // Firestore Lite otherwise logs failed write payloads at its default level.
  setLogLevel('silent');

  async function readGrant(uid) {
    return (await getDoc(accessV2Grant(db, uid))).data() ?? null;
  }

  async function readMode() {
    const snapshot = await getDoc(doc(db, 'priestContentControl', 'accessSetsV2'));
    if (!snapshot.exists()) return 'legacy';
    const mode = snapshot.data().mode;
    return mode === 'legacy' || mode === 'canonical' ? mode : 'suspended';
  }

  async function readEntitlements(uid) {
    const grant = await readGrant(uid);
    if (!grant || grant.uid !== uid || grant.status !== 'active') return null;
    const code = (await getDoc(accessV2CodeProjection(db, grant.codeId))).data();
    if (!code || !ACCESS_SET_ID.test(code.profileId)) throw accessV2Error('entitlements-unavailable');
    const entitlements = (await getDoc(accessV2ProfileProjection(db, code.profileId))).data();
    if (!entitlements) throw accessV2Error('entitlements-unavailable');
    return { profileId: code.profileId, allowedSets: entitlements.allowedSets, revision: entitlements.revision };
  }

  async function activate(uid, code, { deviceName, client, platform }) {
    const parsed = parseAccessSetsV2Code(code);
    if (!parsed) throw accessV2Error('invalid-code');
    const { codeId } = parsed;
    const previous = await readGrant(uid);
    if (previous) return registrationResult(previous, codeId);

    const batch = writeBatch(db);
    batch.set(doc(db, ACCESS_V2.claims, uid), {
      uid, codeId, activationProof: await accessSetsV2CodeProof(parsed.canonical), createdAt: serverTimestamp(),
    });
    batch.set(accessV2Grant(db, uid), {
      uid, codeId, status: 'active', deviceName, client, platform, label: '',
      activatedAt: serverTimestamp(), lastActiveAt: serverTimestamp(), revokedAt: null,
    });
    try {
      await batch.commit();
    } catch (error) {
      // An uncertain response can hide a committed batch. Never replay a
      // persisted claim or treat an unconfirmed commit as registration.
      const confirmed = await readGrant(uid).catch(() => null);
      if (confirmed) return registrationResult(confirmed, codeId);
      throw error?.code === 'permission-denied' ? accessV2Error('activation-denied') : error;
    }
    const confirmed = await readGrant(uid);
    if (!confirmed) throw accessV2Error('registration-unconfirmed');
    return registrationResult(confirmed, codeId);
  }

  async function listIds(kind, setId, { pageSize = 50, after } = {}) {
    validateKind(kind);
    if (!ACCESS_SET_ID.test(setId)) throw accessV2Error('invalid-set');
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw accessV2Error('invalid-page-size');
    }
    const constraints = [orderBy(documentId()), limit(pageSize)];
    if (after !== undefined) constraints.push(startAfter(after));
    const page = await getDocs(query(collection(db, ACCESS_V2.sets, setId, kind), ...constraints));
    return {
      ids: page.docs.map(item => item.id),
      cursor: page.docs.length === pageSize ? page.docs.at(-1).id : null,
    };
  }

  async function readContent(kind, id) {
    validateKind(kind);
    if (typeof id !== 'string' || !id || id.includes('/')) throw accessV2Error('invalid-content-id');
    const snapshot = await getDoc(doc(db, ACCESS_V2[kind], id));
    return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null;
  }

  return {
    readGrant, readMode, readEntitlements, activate, listIds, readContent,
    revokeOwn: uid => revokeAccessV2Grant(db, uid),
  };
}

export async function revokeAccessV2Grant(db, uid) {
  const target = accessV2Grant(db, uid);
  if ((await getDoc(target)).data()?.status !== 'active') return;

  try {
    await updateDoc(target, { status: 'revoked', revokedAt: serverTimestamp() });
  } catch (error) {
    const observed = await getDoc(target).catch(() => null);
    if (observed?.data()?.status !== 'revoked') throw error;
  }
}
