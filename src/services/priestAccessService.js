import { reactive } from 'vue';
import { collection, doc, getDocFromServer, getDocsFromServer, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, startAfter, updateDoc } from 'firebase/firestore';
import { doc as activationDoc, serverTimestamp as activationTimestamp, writeBatch as activationBatch } from 'firebase/firestore/lite';
import { getPriestAuth, getPriestActivationDb, getPriestEditorDb, priestFirebase } from '@/plugins/priestFirebase';
import { codeProof, generateCode, validNewCode } from '@/utils/priestCode.mjs';

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
  return new Error(error.code === 'permission-denied' && activation ? 'Код няправільны або ўжо заменены.'
    : error.code === 'auth/operation-not-allowed' ? 'Ананімная аўтарызацыя выключана. Паведаміце адміністратару.'
      : error.code === 'auth/too-many-requests' ? 'Зашмат спробаў. Паспрабуйце пазней.'
        : error.message === 'INVALID_CODE' ? 'Увядзіце код: 24–64 сімвалы без прабелаў паміж групамі.'
          : 'Не ўдалося выканаць дзеянне. Праверце злучэнне і правы доступу.');
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
    if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) changed(!localStorage.getItem(pendingKey) && activeGrant(snapshot, uid));
  }, () => changed(false));
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
    const current = await getDocFromServer(reference);
    if (current.data()?.status === 'active') await updateDoc(reference, { status: 'revoked', revokedAt: serverTimestamp() });
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
    const snapshot = await getDocFromServer(reference);
    const active = activeGrant(snapshot, uid);
    changed(active); watchGrant(uid);
    // One activity write per hour; no grant expiry or code rotation.
    if (active && Date.now() - (snapshot.data().lastActiveAt?.toMillis?.() || 0) >= 3600000) {
      updateDoc(reference, { lastActiveAt: serverTimestamp() }).catch(() => {});
    }
    return { active, ...(snapshot.exists() ? { device: publicDevice(snapshot) } : {}) };
  })().catch((error) => { changed(false); throw accessError(error); }).finally(() => { statusRequest = null; });
  return statusRequest;
}
export async function activatePriestAccess(code, label) {
  try {
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
    const existing = await getDocFromServer(reference);
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
  try { await deliverDisable(auth); } catch { /* Retry before reads on reconnection. */ }
}
export async function loadPriestHelp() {
  try { priestAccess.helpText = (await getDocFromServer(doc(priestFirebase.db, 'priestAccessPublic', 'help'))).data()?.helpText || ''; }
  catch { /* No invented contact. */ }
}
const metadata = (data = {}) => ({ codeCreated: Boolean(data.activeCodeProof), changedAt: data.changedAt || null, helpText: data.helpText || '' });
export async function getPriestSettings() {
  const db = await getPriestEditorDb();
  return metadata((await getDocFromServer(doc(db, 'priestAccess', 'settings'))).data());
}
export async function replacePriestCode(input) {
  const code = input.generate ? generateCode() : input.code;
  if (!validNewCode(code)) throw new Error('Патрэбна 24–64 сімвалы з бяспечнага алфавіта, не менш за 10 розных, літары і лічбы. Выпадковы код бяспечней.');
  const proof = await codeProof(code);
  const db = await getPriestEditorDb();
  const reference = doc(db, 'priestAccess', 'settings');
  await runTransaction(db, async (transaction) => {
    const previous = (await transaction.get(reference)).data();
    transaction.set(reference, { activeCodeProof: proof, changedAt: serverTimestamp(), helpText: previous?.helpText || '' });
  });
  const current = (await getDocFromServer(reference)).data();
  if (current.activeCodeProof !== proof) throw new Error('Код ужо зменены ў іншай сесіі. Абнавіце старонку.');
  return { code, ...metadata(current) };
}
export async function savePriestHelp(helpText) {
  const db = await getPriestEditorDb();
  const reference = doc(db, 'priestAccess', 'settings');
  const text = String(helpText || '').trim().slice(0, 1000);
  await runTransaction(db, async (transaction) => {
    const previous = (await transaction.get(reference)).data();
    if (previous?.activeCodeProof) transaction.update(reference, { helpText: text });
    else transaction.set(reference, { activeCodeProof: '', changedAt: null, helpText: text });
    // Public projection contains only the administrator's contact/instruction.
    transaction.set(doc(db, 'priestAccessPublic', 'help'), { helpText: text });
  });
  return getPriestSettings();
}
export async function listPriestDevices(after = '') {
  const db = await getPriestEditorDb();
  const snapshot = await getDocsFromServer(query(collection(db, 'priestDeviceGrants'), orderBy('__name__'), ...(after ? [startAfter(after)] : []), limit(100)));
  return { devices: snapshot.docs.map(publicDevice), next: snapshot.size === 100 ? snapshot.docs.at(-1).id : null };
}
export async function updatePriestDevice(id, input) {
  const db = await getPriestEditorDb();
  await updateDoc(doc(db, 'priestDeviceGrants', id), input.revoke ? { status: 'revoked', revokedAt: serverTimestamp() } : { label: String(input.label || '').trim().slice(0, 120) });
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => checkPriestAccess().catch(() => {}));
  window.addEventListener('offline', () => changed(false));
  window.addEventListener('focus', () => checkPriestAccess().catch(() => {}));
  window.addEventListener('storage', (event) => { if (event.key === pendingKey) checkPriestAccess().catch(() => {}); });
}
