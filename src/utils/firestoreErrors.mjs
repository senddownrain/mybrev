const grpcCodes = { 4: 'deadline-exceeded', 7: 'permission-denied', 8: 'resource-exhausted', 9: 'failed-precondition', 10: 'aborted', 14: 'unavailable', 16: 'unauthenticated' };
export function firestoreErrorCode(error) {
  const code = error?.code ?? error?.cause?.code;
  if (typeof code === 'number') return grpcCodes[code] || String(code);
  if (typeof code === 'string') return grpcCodes[code] || code.replace(/^firestore\//, '').replaceAll('_', '-').toLowerCase();
  return 'unknown';
}
export const isFirestoreQuotaError = (error) => ['resource-exhausted', 'auth/quota-exceeded'].includes(firestoreErrorCode(error));
export function isConnectionError(error) {
  const code = firestoreErrorCode(error);
  if (['unavailable', 'deadline-exceeded', 'auth/network-request-failed', 'econnreset', 'econnrefused', 'enotfound', 'etimedout'].includes(code)) return true;
  // Some browser transports expose no SDK code. Recognize only known network
  // sentinels; never turn an explicit quota/permission code into a network error.
  return code === 'unknown' && /^(?:OFFLINE|Connection failed\.?|Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?)$/i.test(error?.message || '');
}
export function firestoreErrorMessage(error) {
  const code = firestoreErrorCode(error);
  if (isFirestoreQuotaError(error)) return 'Вычарпана квота Firebase. Аўтаматычны паўтор гэтага дзеяння спынены. Паспрабуйце пазней пасля аднаўлення квоты; пры паўтарэнні паведаміце адміністратару.';
  if (code === 'permission-denied') return 'Недастаткова правоў для гэтага дзеяння. Праверце ўліковы запіс адміністратара.';
  if (code === 'unauthenticated' || code.startsWith('auth/user-token')) return 'Сесія скончылася. Увайдзіце зноў.';
  if (isConnectionError(error)) return 'Сервер часова недаступны. Праверце злучэнне і паспрабуйце пазней.';
  if (code === 'aborted') return 'Даныя змяніліся ў іншай сесіі. Паспрабуйце яшчэ раз.';
  if (code === 'unknown' && /[А-Яа-яЁёЎўІі]/u.test(error?.message || '')) return error.message;
  return 'Не ўдалося выканаць дзеянне. Паспрабуйце пазней.';
}
// Session-only circuit breaker. Never persist an error payload, code or proof.
// Only an explicit user retry/reload clears it; no timer retries the quota.
let quotaBlocked = false;
export function noteFirestoreError(error) { if (isFirestoreQuotaError(error)) quotaBlocked = true; }
export const isFirestoreQuotaBlocked = () => quotaBlocked;
export function resetFirestoreQuota() { quotaBlocked = false; }
export async function withFirestoreQuota(read) {
  assertFirestoreQuotaAvailable();
  try { return await read(); } catch (error) { noteFirestoreError(error); throw error; }
}
export function assertFirestoreQuotaAvailable() {
  if (quotaBlocked) throw Object.assign(new Error(firestoreErrorMessage({ code: 'resource-exhausted' })), { code: 'resource-exhausted' });
}
export function firestoreActionError(error, operation) {
  noteFirestoreError(error);
  return Object.assign(new Error(firestoreErrorMessage(error)), { code: firestoreErrorCode(error), operation });
}
