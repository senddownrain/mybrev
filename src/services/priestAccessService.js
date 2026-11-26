import { ref } from 'vue';
import { doc as activationDoc, serverTimestamp as activationTimestamp, updateDoc as activationUpdate, runTransaction, getDoc as activationGet, getDocs as activationGetMany, collection as activationCollection, query as activationQuery, orderBy as activationOrderBy, startAfter as activationStartAfter, limit as activationLimit } from 'firebase/firestore/lite';
import { getPriestEditorWriteDb } from '@/plugins/priestFirebase';
import { codeProof, generateCode, validNewCode } from '@/utils/priestCode.mjs';
import { assertFirestoreQuotaAvailable, firestoreActionError, firestoreErrorCode, firestoreErrorMessage, noteFirestoreError, onFirestoreQuotaBlocked, resetFirestoreQuota } from '@/utils/firestoreErrors.mjs';
import { quotaSafeTransaction } from '@/utils/retry';
import { loadS2Help, publicDevice, s2Session, startS2Access } from './s2AccessFirebase';

export { publicDevice };
export const accessSetsSession = s2Session.access;
export const clearPrivateSession = s2Session.clearPrivateSession;
export const activatePriestAccess = s2Session.activate;
export const disablePriestAccess = s2Session.disable;
export async function checkPriestAccess() {
  const { active, device } = await s2Session.check();
  return { active, ...(device && { device }) };
}
export function startPriestAccess() {
  startS2Access();
  return checkPriestAccess();
}
onFirestoreQuotaBlocked(clearPrivateSession);

const helpText = ref('');
export const priestAccess = Object.freeze({
  get active() { return accessSetsSession.legacyActive; },
  get checked() { return accessSetsSession.checked; },
  get revision() { return accessSetsSession.revision; },
  get helpText() { return helpText.value; },
});
export async function loadPriestHelp() { helpText.value = await loadS2Help(); }

async function guardedRead(read, operation) {
  try { assertFirestoreQuotaAvailable(); return await read(); }
  catch (error) { throw firestoreActionError(error, operation); }
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
