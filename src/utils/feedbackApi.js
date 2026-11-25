// Client for the shared feedback Worker (separate from analytics). Base URL: VITE_FEEDBACK_API_URL (public, no secret).
import { getAuth } from 'firebase/auth';
import { firebaseApp } from '../plugins/firebase';
import { getClientAppCheckToken } from '../plugins/firebaseAppCheck';

export const FEEDBACK_CATEGORIES = [
  { value: 'text_error', label: 'Памылка ў тэксце' },
  { value: 'content_suggestion', label: 'Прапанова па тэкстах' },
  { value: 'technical_bug', label: 'Тэхнічная праблема' },
  { value: 'feature_suggestion', label: 'Прапанова па праграме' },
  { value: 'other', label: 'Іншае пытанне' },
];
export const FEEDBACK_STATUSES = [
  { value: 'new', label: 'Новае' }, { value: 'in_review', label: 'У працы' },
  { value: 'resolved', label: 'Вырашана' }, { value: 'closed', label: 'Закрыта' },
];
export const MAX_FEEDBACK_LENGTH = 4000;

export function feedbackBaseUrl() {
  const raw = (import.meta.env.VITE_FEEDBACK_API_URL || '').trim().replace(/\/+$/, '');
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    return u.protocol === 'https:' || (u.protocol === 'http:' && local) ? raw : null;
  } catch { return null; }
}

export class FeedbackApiError extends Error {
  constructor(status, code) { super(code || `http_${status}`); this.status = status; this.code = code; }
}

async function adminHeaders(user) {
  const [idToken, appCheckToken] = await Promise.all([
    user.getIdToken(), getClientAppCheckToken(firebaseApp),
  ]);
  return {
    authorization: `Bearer ${idToken}`,
    ...(appCheckToken ? { 'X-Firebase-AppCheck': appCheckToken } : {}),
  };
}

async function request(path, { method = 'GET', body, headers } = {}, fetchImpl = fetch) {
  const base = feedbackBaseUrl();
  if (!base) throw new FeedbackApiError(0, 'not_configured');
  let res;
  try {
    res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new FeedbackApiError(0, 'network'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new FeedbackApiError(res.status, data.error);
  return data;
}

export const submitFeedback = (payload, fetchImpl) => request('/api/feedback', { method: 'POST', body: payload }, fetchImpl);

async function adminRequest(path, opts = {}) {
  const user = getAuth(firebaseApp).currentUser;
  if (!user) throw new FeedbackApiError(401, 'unauthorized');
  return request(path, { ...opts, headers: await adminHeaders(user) });
}
export const adminMe = () => adminRequest('/api/admin/me');
export const adminList = (params) => adminRequest(`/api/admin/feedback?${new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()}`);
export const adminGet = (id) => adminRequest(`/api/admin/feedback/${id}`);
export const adminPatch = (id, body) => adminRequest(`/api/admin/feedback/${id}`, { method: 'PATCH', body });
export const adminAddNote = (id, body) => adminRequest(`/api/admin/feedback/${id}/notes`, { method: 'POST', body });

/** Redacted export for analysis (role-scoped by the Worker). Returns the text and a file name. */
export async function adminExport(params = {}) {
  const user = getAuth(firebaseApp).currentUser;
  if (!user) throw new FeedbackApiError(401, 'unauthorized');
  const base = feedbackBaseUrl();
  if (!base) throw new FeedbackApiError(0, 'not_configured');
  let res;
  try {
    res = await fetch(`${base}/api/admin/export?${new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()}`, {
      headers: await adminHeaders(user),
    });
  } catch { throw new FeedbackApiError(0, 'network'); }
  if (!res.ok) { const data = await res.json().catch(() => ({})); throw new FeedbackApiError(res.status, data.error); }
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || `feedback.${params.format === 'csv' ? 'csv' : 'json'}`;
  return { text: await res.text(), name, type: res.headers.get('content-type') || 'text/plain' };
}
