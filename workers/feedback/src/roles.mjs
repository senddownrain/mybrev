import { resolveAdminAccess } from '../../../src/utils/adminAccess.js';

/**
 * Role provider. Single source of truth = Firestore `admins/{uid}` (same document the web app reads; same resolver as the web).
 * No secret is needed: the Worker forwards the caller's own VERIFIED ID token to Firestore REST, and firestore.rules
 * (`match /admins/{uid} { allow read: if own(uid) }`) only let a user read their own record. A role is re-read on EVERY admin request.
 * Fail closed: any error other than "document not found" => { ok:false } (503), never a default role.
 * @returns {Promise<{ ok: true, role: 'admin'|'superadmin'|null } | { ok: false }>}
 */
export async function firestoreRoleProvider({ uid, idToken, appCheckToken, env, fetchImpl = fetch }) {
  const base = env.FIRESTORE_BASE_URL && env.FIREBASE_PROJECT_ID.startsWith('demo-')
    ? env.FIRESTORE_BASE_URL
    : 'https://firestore.googleapis.com';
  const url = `${base}/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/admins/${encodeURIComponent(uid)}`;
  try {
    const headers = { authorization: `Bearer ${idToken}` };
    if (appCheckToken) headers['X-Firebase-AppCheck'] = appCheckToken;
    const res = await fetchImpl(url, { headers, redirect: 'error' });
    if (res.status === 404) return { ok: true, role: resolveAdminAccess(uid, { exists: false }).role };
    if (!res.ok) return { ok: false };
    const doc = await res.json();
    const f = doc.fields || {};
    const data = {};
    if (f.role) data.role = f.role.stringValue ?? '__invalid__';
    if (f.priestAccess) data.priestAccess = f.priestAccess.booleanValue === true;
    return { ok: true, role: resolveAdminAccess(uid, { exists: true, data }).role };
  } catch {
    return { ok: false };
  }
}
