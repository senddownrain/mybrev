import { ADMIN_UIDS } from '../constants/admin.js';

export const ROLE_ADMIN = 'admin';
export const ROLE_SUPERADMIN = 'superadmin';

export const NO_ACCESS = Object.freeze({ isAdmin: false, role: null, isSuperAdmin: false, canManagePriestAccess: false });

/**
 * Resolve admin access from the `admins/{uid}` document. The single place for role logic.
 * - No `role` field (legacy document) => admin. Unknown explicit role => no privileges from the document.
 * - Fallback ADMIN_UIDS keep admin access when the document is missing/unreadable/unknown,
 *   but are never promoted to superadmin without an explicit `role: 'superadmin'` document.
 * @param {string} uid
 * @param {{ exists: boolean, data?: object|null, failed?: boolean }} snapshot
 */
export function resolveAdminAccess(uid, { exists = false, data = null, failed = false } = {}) {
  const legacy = ADMIN_UIDS.includes(uid);
  let role = null;
  let priestAccess = false;
  if (exists && !failed) {
    const fields = data || {};
    const declared = fields.role === undefined ? ROLE_ADMIN : fields.role;
    if (declared === ROLE_ADMIN || declared === ROLE_SUPERADMIN) {
      role = declared;
      priestAccess = fields.priestAccess === true;
    }
  }
  if (!role && legacy) return { isAdmin: true, role: ROLE_ADMIN, isSuperAdmin: false, canManagePriestAccess: true };
  if (!role) return { ...NO_ACCESS };
  const isSuperAdmin = role === ROLE_SUPERADMIN;
  return { isAdmin: true, role, isSuperAdmin, canManagePriestAccess: legacy || isSuperAdmin || priestAccess };
}

/**
 * Router decision for a protected route. Returns `true` to proceed or a redirect target.
 * @param {object} meta merged route meta
 * @param {{ isAdmin: boolean, isSuperAdmin: boolean, canManagePriestAccess: boolean }} access
 * @param {string} fullPath
 */
export function adminRouteDecision(meta, access, fullPath) {
  if (!access.isAdmin) return { name: 'Login', query: { redirect: fullPath } };
  if (meta.requiresSuperAdmin && !access.isSuperAdmin) return { name: 'Admin' };
  if (meta.requiresPriestAdmin && !access.canManagePriestAccess) return { name: 'Admin' };
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
