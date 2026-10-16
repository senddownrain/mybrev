import { reactive } from 'vue';
import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { doc as activationDoc, serverTimestamp as activationTimestamp, writeBatch as activationBatch, updateDoc as activationUpdate, runTransaction, getDoc as activationGet, getDocs as activationGetMany, collection as activationCollection, query as activationQuery, orderBy as activationOrderBy, startAfter as activationStartAfter, limit as activationLimit } from 'firebase/firestore/lite';
import { getPriestAuth, getPriestActivationDb, getPriestEditorWriteDb, priestFirebase } from '@/plugins/priestFirebase';
import { codeProof, generateCode, validNewCode } from '@/utils/priestCode.mjs';
import { assertFirestoreQuotaAvailable, firestoreActionError, firestoreErrorCode, firestoreErrorMessage, isFirestoreQuotaBlocked, noteFirestoreError, resetFirestoreQuota } from '@/utils/firestoreErrors.mjs';
import { quotaSafeTransaction } from '@/utils/retry';

export const priestAccess = reactive({ active: false, checked: false, helpText: '', revision: 0 });
const pendingKey = 'mybrev-priest-disable-pending-v3'; // UID only, never code/proof/token.
let grantListener, watchedUid, statusRequest;
function changed(active) {
  if (active !== priestAccess.active || !priestAccess.checked) priestAccess.revision++;
  priestAccess.active = active;
  priestAccess.checked = true;
}
function activeGrant(snapshot, uid) {
  const data = snapshot.data();
  return !snapshot.metadata.hasPendingWrites && data?.uid === uid && data?.status === 'active'
    && !Object.hasOwn(data, 'activationProof');
}
function accessError(error, activation = false) {
  const mapped = firestoreActionError(error, activation ? 'device-activation' : 'device-status');
  mapped.message = firestoreErrorCode(error) === 'permission-denied' && activation ? 'Код няправільны або ўжо заменены.'
    : error.code === 'auth/operation-not-allowed' ? 'Ананімная аўтарызацыя выключана. Паведаміце адміністратару.'
      : error.code === 'auth/too-many-requests' ? 'Зашмат спробаў. Паспрабуйце пазней.'
        : error.message === 'INVALID_CODE' ? 'Увядзіце код: 24–64 сімвалы без прабелаў паміж групамі.'
          : mapped.message;
  return mapped;
}
async function guardedRead(read, operation) {
  try { assertFirestoreQuotaAvailable(); return await read(); }
  catch (error) { throw firestoreActionError(error, operation); }
}
export function publicDevice(snapshot) {
  const data = snapshot.data();
  // Explicit metadata projection also excludes any legacy proof during rollout.
  return Object.fromEntries(['uid', 'status', 'deviceName', 'client', 'platform', 'label', 'activatedAt', 'lastActiveAt', 'revokedAt'].map((key) => [key, data[key] ?? null]).concat([['id', snapshot.id]]));
}
function watchGrant(uid) {
  if (watchedUid === uid) return;
  grantListener?.(); watchedUid = uid;
  grantListener = onSnapshot(doc(priestFirebase.db, 'priestDeviceGrants', uid), { includeMetadataChanges: true }, (snapshot) => {
    if (isFirestoreQuotaBlocked()) { changed(false); return; }
    if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) changed(!localStorage.getItem(pendingKey) && activeGrant(snapshot, uid));
  }, (error) => {
    noteFirestoreError(error);
    grantListener?.(); grantListener = null; watchedUid = null;
    changed(false);
  });
}
async function restoredAuth() {
  const auth = await getPriestAuth();
  await auth.authStateReady();
  return auth;
}
async function deliverDisable(auth) {
  const pendingUid = localStorage.getItem(pendingKey);
  if (!pendingUid) return;
  if (auth.currentUser?.uid === pendingUid) {
    const reference = doc(priestFirebase.db, 'priestDeviceGrants', pendingUid);
    const current = await guardedRead(() => getDocFromServer(reference), 'device-disable-status');
    if (current.data()?.status === 'active') await activationUpdate(activationDoc(getPriestActivationDb(), 'priestDeviceGrants', pendingUid), { status: 'revoked', revokedAt: activationTimestamp() });
    const { signOut } = await import('firebase/auth');
    grantListener?.(); grantListener = null; watchedUid = null;
    await signOut(auth); // Only the independent device Auth.
  }
  localStorage.removeItem(pendingKey);
}
export async function checkPriestAccess() {
  if (statusRequest) return statusRequest;
  statusRequest = (async () => {
    if (navigator.onLine === false) { changed(false); return { active: false }; }
    const auth = await restoredAuth();
    await deliverDisable(auth);
    if (!auth.currentUser) { changed(false); return { active: false }; }
    const uid = auth.currentUser.uid;
    const reference = doc(priestFirebase.db, 'priestDeviceGrants', uid);
    const snapshot = await guardedRead(() => getDocFromServer(reference), 'device-status');
    const active = activeGrant(snapshot, uid);
    changed(active); watchGrant(uid);
    // One activity write per hour; no grant expiry or code rotation.
    if (active && Date.now() - (snapshot.data().lastActiveAt?.toMillis?.() || 0) >= 3600000) {
      activationUpdate(activationDoc(getPriestActivationDb(), 'priestDeviceGrants', uid), { lastActiveAt: activationTimestamp() }).catch(noteFirestoreError);
    }
    return { active, ...(snapshot.exists() ? { device: publicDevice(snapshot) } : {}) };
  })().catch((error) => { changed(false); throw accessError(error); }).finally(() => { statusRequest = null; });
  return statusRequest;
}
export async function activatePriestAccess(code, label) {
  try {
    resetFirestoreQuota(); // Explicit user action, never an automatic retry.
    if (navigator.onLine === false) throw new Error('OFFLINE');
    const proof = await codeProof(code);
    const auth = await restoredAuth();
    await deliverDisable(auth);
    if (!auth.currentUser) {
      const { signInAnonymously } = await import('firebase/auth');
      await signInAnonymously(auth);
    }
    const uid = auth.currentUser.uid;
    const reference = doc(priestFirebase.db, 'priestDeviceGrants', uid);
    const existing = await guardedRead(() => getDocFromServer(reference), 'device-activation-status');
    if (existing.data()?.status === 'revoked') throw new Error('REVOKED');
    if (!existing.exists()) {
      const activationDb = getPriestActivationDb();
      const batch = activationBatch(activationDb);
      batch.set(activationDoc(activationDb, 'priestActivationClaims', uid), {
        uid, activationProof: proof, createdAt: activationTimestamp(),
      });
      batch.set(activationDoc(activationDb, 'priestDeviceGrants', uid), {
        uid, status: 'active', deviceName: browserName(), client: 'Web',
        platform: (navigator.userAgentData?.platform || navigator.platform || '').slice(0, 120),
        label: String(label || '').trim().slice(0, 120), activatedAt: activationTimestamp(),
        lastActiveAt: activationTimestamp(), revokedAt: null,
      });
      await batch.commit(); // Rules require both NEW documents via getAfter().
    }
    const status = await checkPriestAccess();
    if (!status.active) throw new Error('ACCESS_NOT_CONFIRMED');
    return status;
  } catch (error) {
    noteFirestoreError(error);
    if (error.code === 'permission-denied') {
      const status = await checkPriestAccess().catch(() => ({ active: false }));
      if (status.active) return status; // Another tab registered the same UID.
    }
    changed(false);
    if (error.message === 'REVOKED') throw new Error('Доступ адкліканы. Звяжыцеся з адміністратарам.', { cause: error });
    throw accessError(error, true);
  }
}
function browserName() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Браўзер';
  return `${browser} · ${navigator.userAgentData?.platform || navigator.platform || 'Web'}`.slice(0, 120);
}
export async function disablePriestAccess() {
  changed(false);
  const auth = await restoredAuth();
  if (auth.currentUser) localStorage.setItem(pendingKey, auth.currentUser.uid);
  try { await deliverDisable(auth); } catch (error) { noteFirestoreError(error); /* Network retry on reconnection; quota requires an explicit retry/reload. */ }
}
export async function loadPriestHelp() {
  try { priestAccess.helpText = (await guardedRead(() => getDocFromServer(doc(priestFirebase.db, 'priestAccessPublic', 'help')), 'help-read')).data()?.helpText || ''; }
  catch (error) { noteFirestoreError(error); /* No invented contact. */ }
}
const metadata = (data = {}) => ({ codeCreated: Boolean(data.activeCodeProof), changedAt: data.changedAt || null, helpText: data.helpText || '' });
export async function getPriestSettings() {
  const db = await getPriestEditorWriteDb();
  return metadata((await guardedRead(() => activationGet(activationDoc(db, 'priestAccess', 'settings')), 'settings-read')).data());
}
export async function replacePriestCode(input) {
  const code = input.generate ? generateCode() : input.code;
  if (!validNewCode(code)) throw new Error('Патрэбна 24–64 сімвалы з бяспечнага алфавіта, не менш за 10 розных, літары і лічбы. Выпадковы код бяспечней.');
  const proof = await codeProof(code);
  resetFirestoreQuota();
  const db = await getPriestEditorWriteDb();
  const reference = activationDoc(db, 'priestAccess', 'settings');
  let acknowledged;
  try { acknowledged = await quotaSafeTransaction(runTransaction, db, async (transaction) => {
    const previous = (await transaction.get(reference)).data();
    transaction.set(reference, { activeCodeProof: proof, changedAt: activationTimestamp(), helpText: previous?.helpText || '' });
    return { codeCreated: true, changedAt: null, changedAtPending: true, helpText: previous?.helpText || '' };
  }); } catch (error) { throw firestoreActionError(error, 'code-transaction'); }
  let current;
  try {
    // Lite resolves one REST read rather than starting a full-SDK Listen stream,
    // whose internal resource-exhausted backoff could postpone this one-time view.
    current = (await guardedRead(() => activationGet(reference), 'code-verification')).data();
  } catch (error) {
    // The server acknowledged this write. A failed optional read MUST NOT
    // discard the only plaintext copy or invite an automatic second rotation.
    noteFirestoreError(error);
    return { code, ...acknowledged, verification: 'unavailable', warningCode: firestoreErrorCode(error),
      warning: `Код захаваны серверам. Скапіруйце яго зараз. Не стварайце яшчэ адзін код праз памылку праверкі. ${firestoreErrorMessage(error)}` };
  }
  if (!current) return { code, ...acknowledged, verification: 'unavailable', warning: 'Код захаваны серверам, але праверыць яго стан не атрымалася. Скапіруйце код зараз.' };
  if (current.activeCodeProof !== proof) throw new Error('Код ужо зменены ў іншай сесіі. Абнавіце старонку.');
  return { code, ...metadata(current), verification: 'verified' };
}
export async function savePriestHelp(helpText) {
  resetFirestoreQuota();
  const db = await getPriestEditorWriteDb();
  const reference = activationDoc(db, 'priestAccess', 'settings');
  const text = String(helpText || '').trim().slice(0, 1000);
  try { return await quotaSafeTransaction(runTransaction, db, async (transaction) => {
    const previous = (await transaction.get(reference)).data();
    if (previous?.activeCodeProof) transaction.update(reference, { helpText: text });
    else transaction.set(reference, { activeCodeProof: '', changedAt: null, helpText: text });
    // Public projection contains only the administrator's contact/instruction.
    transaction.set(activationDoc(db, 'priestAccessPublic', 'help'), { helpText: text });
    return { ...metadata(previous), helpText: text };
  }); } catch (error) { throw firestoreActionError(error, 'help-transaction'); }
}
export const PRIEST_DEVICE_PAGE_SIZE = 25;
export async function listPriestDevices(after = '') {
  const db = await getPriestEditorWriteDb();
  const snapshot = await guardedRead(() => activationGetMany(activationQuery(activationCollection(db, 'priestDeviceGrants'), activationOrderBy('__name__'), ...(after ? [activationStartAfter(after)] : []), activationLimit(PRIEST_DEVICE_PAGE_SIZE))), 'device-list');
  return { devices: snapshot.docs.map(publicDevice), next: snapshot.size === PRIEST_DEVICE_PAGE_SIZE ? snapshot.docs.at(-1).id : null };
}
export async function updatePriestDevice(id, input) {
  resetFirestoreQuota();
  const db = await getPriestEditorWriteDb();
  try { await activationUpdate(activationDoc(db, 'priestDeviceGrants', id), input.revoke ? { status: 'revoked', revokedAt: activationTimestamp() } : { label: String(input.label || '').trim().slice(0, 120) }); }
  catch (error) { throw firestoreActionError(error, 'device-update'); }
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (!isFirestoreQuotaBlocked()) checkPriestAccess().catch(() => {}); });
  window.addEventListener('offline', () => changed(false));
  window.addEventListener('focus', () => { if (!isFirestoreQuotaBlocked()) checkPriestAccess().catch(() => {}); });
  window.addEventListener('storage', (event) => { if (event.key === pendingKey) { changed(false); if (!isFirestoreQuotaBlocked()) checkPriestAccess().catch(() => {}); } });
}
