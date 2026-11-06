/** Strict whitelist validation of the PUBLIC payload. Everything not listed is dropped; the server assigns id/time/status/visibility. */
export const CATEGORIES = ['text_error', 'content_suggestion', 'technical_bug', 'feature_suggestion', 'other'];
export const CONTENT_CATEGORIES = ['text_error', 'content_suggestion'];
export const STATUSES = ['new', 'in_review', 'resolved', 'closed'];
export const PLATFORMS = ['web', 'android', 'ios'];
export const SOURCE_APPS = ['mybrev_web', 'ibreviary_flutter'];
export const MAX_BODY = 4000;
export const MAX_NOTE = 2000;
export const MAX_BODY_BYTES = 16 * 1024;

const CTX_KINDS = ['prayer', 'song', 'reading', 'hour', 'day', 'bible', 'compendium', 'other'];
const HOURS = ['invitatory', 'office_of_readings', 'lauds', 'daytime', 'vespers', 'compline', 'mass', 'other'];
const SAFE_ID = /^[\p{L}\p{N}_\-.:]{1,128}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const VERSION = /^[0-9A-Za-z.+_-]{1,32}$/;
const EMAIL = /^[^\s@<>"',;()]{1,64}@[^\s@<>"',;()]{1,189}\.[^\s@<>"',;()]{2,24}$/;
const LANG = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;
const DIOCESE = /^[a-z_]{2,24}$/;
// eslint-disable-next-line no-control-regex
const clean = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').normalize('NFC');

/** Path only: no query, no hash, no origin. */
function safePath(value) {
  if (typeof value !== 'string') return null;
  const path = value.split(/[?#]/)[0];
  return /^\/[\w\-./%]{0,198}$/.test(path) && !path.includes('..') ? path : null;
}

export function normalizeContext(raw) {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'context' };
  const out = {};
  if (raw.kind !== undefined) { if (!CTX_KINDS.includes(raw.kind)) return { ok: false, error: 'context.kind' }; out.kind = raw.kind; }
  if (raw.id !== undefined) { if (typeof raw.id !== 'string' || !SAFE_ID.test(raw.id)) return { ok: false, error: 'context.id' }; out.id = raw.id; }
  if (raw.date !== undefined) { if (typeof raw.date !== 'string' || !DATE.test(raw.date) || Number.isNaN(Date.parse(raw.date))) return { ok: false, error: 'context.date' }; out.date = raw.date; }
  if (raw.hour !== undefined) { if (!HOURS.includes(raw.hour)) return { ok: false, error: 'context.hour' }; out.hour = raw.hour; }
  if (raw.diocese !== undefined) { if (typeof raw.diocese !== 'string' || !DIOCESE.test(raw.diocese)) return { ok: false, error: 'context.diocese' }; out.diocese = raw.diocese; }
  if (raw.lang !== undefined) { if (typeof raw.lang !== 'string' || !LANG.test(raw.lang)) return { ok: false, error: 'context.lang' }; out.lang = raw.lang; }
  if (raw.title !== undefined) { if (typeof raw.title !== 'string' || raw.title.length > 120) return { ok: false, error: 'context.title' }; out.title = clean(raw.title).trim(); }
  if (raw.path !== undefined) { const p = safePath(raw.path); if (p === null) return { ok: false, error: 'context.path' }; out.path = p; }
  return { ok: true, value: Object.keys(out).length ? out : null };
}

/** @returns {{ ok: true, value: object } | { ok: false, error: string }} */
export function validateSubmission(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'body' };
  if (!CATEGORIES.includes(raw.category)) return { ok: false, error: 'category' };
  if (!PLATFORMS.includes(raw.platform)) return { ok: false, error: 'platform' };
  const sourceApp = raw.sourceApp ?? (raw.platform === 'web' ? 'mybrev_web' : 'ibreviary_flutter');
  if (!SOURCE_APPS.includes(sourceApp)) return { ok: false, error: 'sourceApp' };
  if (typeof raw.appVersion !== 'string' || !VERSION.test(raw.appVersion)) return { ok: false, error: 'appVersion' };
  if (typeof raw.body !== 'string') return { ok: false, error: 'message' };
  const body = clean(raw.body).trim();
  if (body.length < 3) return { ok: false, error: 'message' };
  if (body.length > MAX_BODY) return { ok: false, error: 'message_too_long' };
  let email = null;
  if (raw.email !== undefined && raw.email !== null && raw.email !== '') {
    if (typeof raw.email !== 'string') return { ok: false, error: 'email' };
    email = raw.email.trim().toLowerCase();
    if (email.length > 254 || !EMAIL.test(email)) return { ok: false, error: 'email' };
  }
  const ctx = normalizeContext(raw.context);
  if (!ctx.ok) return ctx;
  let requestId = null;
  if (raw.requestId !== undefined && raw.requestId !== null) {
    if (typeof raw.requestId !== 'string' || !/^[0-9a-fA-F-]{16,64}$/.test(raw.requestId)) return { ok: false, error: 'requestId' };
    requestId = raw.requestId.toLowerCase();
  }
  return { ok: true, value: { category: raw.category, platform: raw.platform, sourceApp, appVersion: raw.appVersion, body, email, context: ctx.value, requestId } };
}

export function validateNote(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'body' };
  const scope = raw.scope === undefined ? 'shared' : raw.scope;
  if (!['shared', 'superadmin_private'].includes(scope)) return { ok: false, error: 'scope' };
  if (typeof raw.body !== 'string') return { ok: false, error: 'note' };
  const body = clean(raw.body).trim();
  if (!body || body.length > MAX_NOTE) return { ok: false, error: 'note' };
  return { ok: true, value: { body, scope } };
}
