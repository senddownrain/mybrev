import { resolveAdminRole } from '../src/utils/adminAccess.js';

const actions = new Set(['preview', 'save', 'verify']);
const revokedAuthCodes = new Set([
  'auth/id-token-revoked', 'auth/id-token-expired', 'auth/invalid-id-token', 'auth/user-disabled', 'auth/user-not-found',
]);

export function createCatalogAuthorization({ db, auth, HttpsError }) {
  return async function authorize(request) {
    const uid = request.auth?.uid;
    const token = request.rawRequest?.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!uid || !token || request.auth.token?.firebase?.sign_in_provider === 'anonymous') {
      throw new HttpsError('unauthenticated', 'editor-auth-required');
    }
    if (!request.app?.appId) throw new HttpsError('unauthenticated', 'app-check-required');
    if (!actions.has(request.data?.action)) throw new HttpsError('invalid-argument', 'invalid-writer-action');
    if (request.rawRequest.rawBody?.byteLength > 7_000_000) throw new HttpsError('invalid-argument', 'writer-request-too-large');

    // Rejected administrators cost one targeted metadata read. The writer
    // still authorizes again inside the same transaction as catalog mutations.
    if (!resolveAdminRole(uid, (await db.collection('admins').doc(uid).get()).data())) {
      throw new HttpsError('permission-denied', 'permission-denied');
    }
    let current;
    try {
      current = await auth.verifyIdToken(token, true);
    } catch (error) {
      if (revokedAuthCodes.has(error?.code)) throw new HttpsError('unauthenticated', 'editor-session-invalid');
      throw new HttpsError('unavailable', 'editor-session-unavailable');
    }
    if (current.uid !== uid) throw new HttpsError('unauthenticated', 'editor-session-invalid');
  };
}
