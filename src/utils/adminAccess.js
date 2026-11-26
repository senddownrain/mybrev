import { ADMIN_UIDS } from '../constants/admin.js';

export const ROLE_ADMIN = 'admin';
export const ROLE_SUPERADMIN = 'superadmin';

export const NO_ACCESS = Object.freeze({ isAdmin: false, role: null, isSuperAdmin: false });

// A missing role on an existing record is the legacy format. The bootstrap
// UIDs match Firestore Rules and never imply superadmin.
export function resolveAdminRole(uid, record) {
  if (record && typeof record === 'object') {
    const role = Object.hasOwn(record, 'role') ? record.role : ROLE_ADMIN;
    if (role === ROLE_ADMIN || role === ROLE_SUPERADMIN) return role;
  }
  return ADMIN_UIDS.includes(uid) ? ROLE_ADMIN : null;
}

/**
 * Resolve admin access from the `admins/{uid}` document. The single place for role logic.
 * - No `role` field (legacy document) => admin. Unknown explicit role => no privileges from the document.
 * - Fallback ADMIN_UIDS keep admin access when the document is missing/unreadable/unknown,
 *   but are never promoted to superadmin without an explicit `role: 'superadmin'` document.
 * @param {string} uid
 * @param {{ exists: boolean, data?: object|null, failed?: boolean, fromCache?: boolean }} snapshot
 */
export function resolveAdminAccess(uid, { exists = false, data = null, failed = false, fromCache = false } = {}) {
  const role = resolveAdminRole(uid, exists && !failed && !fromCache ? data : null);
  if (!role) return { ...NO_ACCESS };
  return { isAdmin: true, role, isSuperAdmin: role === ROLE_SUPERADMIN };
}

/**
 * Router decision for a protected route. Returns `true` to proceed or a redirect target.
 * @param {object} meta merged route meta
 * @param {{ isAdmin: boolean, isSuperAdmin: boolean }} access
 * @param {string} fullPath
 */
export function adminRouteDecision(meta, access, fullPath) {
  if (!access.isAdmin) return { name: 'Login', query: { redirect: fullPath } };
  if (meta.requiresSuperAdmin && !access.isSuperAdmin) return { name: 'Admin' };
  return true;
}

/**
 * Validated analytics panel URL: https only (http for localhost), no credentials. Otherwise null.
 * @param {string|undefined} raw
 */
export function parseAnalyticsReportsUrl(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.username || url.password) return null;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost');
  if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) return url.toString();
  return null;
}
