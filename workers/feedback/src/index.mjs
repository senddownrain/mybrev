/* global Response, atob, btoa */
/* global TextEncoder */
import { firestoreRoleProvider } from './roles.mjs';
import { verifyFirebaseIdToken } from './firebase-auth.mjs';
import { projectItem, projectListRow, visibleCategories } from './acl.mjs';
import { CATEGORIES, MAX_BODY_BYTES, STATUSES, PLATFORMS, validateNote, validateSubmission } from './validate.mjs';

const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra },
});
const err = (status, code, extra) => json({ error: code }, status, extra);
const origins = (env) => String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function ipBucket(request, env, minute) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`${env.RATE_SALT || 'unsalted-dev'}:${minute.slice(0, 10)}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip)));
  return `ip:${[...sig.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('')}:${minute}`; // raw IP never stored
}
async function bump(db, bucket, expiresAt) {
  const row = await db.prepare('INSERT INTO rate_limit (bucket, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1 RETURNING count').bind(bucket, expiresAt).first();
  return row.count;
}

async function authenticate(request, env, deps) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return { res: err(401, 'unauthorized') };
  const idToken = header.slice(7).trim();
  const v = await verifyFirebaseIdToken(idToken, env, deps);
  if (!v.ok) return { res: err(401, 'unauthorized') };
  const provider = deps.roleProvider || firestoreRoleProvider;
  const r = await provider({ uid: v.uid, idToken, env, fetchImpl: deps.fetchImpl || fetch });
  if (!r.ok) return { res: err(503, 'role_check_unavailable') }; // fail closed
  if (!r.role) return { res: err(403, 'forbidden') };
  return { uid: v.uid, role: r.role };
}

/** WHERE fragment that enforces the role's category scope. */
function scope(role, where, args) {
  const cats = visibleCategories(role);
  if (cats) { where.push(`category IN (${cats.map(() => '?').join(',')})`); args.push(...cats); }
}

async function submit(request, env, deps) {
  const db = env.DB;
  if (env.FEEDBACK_ENABLED !== 'true') return err(503, 'disabled', { 'retry-after': '3600' });
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) return err(413, 'too_large');
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return err(413, 'too_large');

  const now = deps.now ? deps.now() : Date.now();
  const minute = new Date(now).toISOString().slice(0, 16);
  const day = minute.slice(0, 10);
  const perMinute = Number(env.RATE_PER_MINUTE || 5);
  const dailyBudget = Number(env.DAILY_BUDGET || 500);
  if (await bump(db, await ipBucket(request, env, minute), now + 3600000) > perMinute) return err(429, 'rate_limited', { 'retry-after': '60' });
  if (await bump(db, `day:${day}`, now + 172800000) > dailyBudget) return err(503, 'daily_budget', { 'retry-after': '3600' });

  let raw;
  try { raw = JSON.parse(text); } catch { return err(400, 'invalid_json'); }
  const v = validateSubmission(raw);
  if (!v.ok) return err(400, 'invalid', { 'x-invalid-field': v.error });
  const f = v.value;
  const dedup = f.requestId ? await sha256Hex(`rid:${f.requestId}`) : null;
  const id = crypto.randomUUID();
  const res = await db.prepare(`INSERT OR IGNORE INTO feedback (id, created_at, updated_at, source_app, platform, app_version, category, body, context_json, status, contact_email, dedup_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`)
    .bind(id, now, now, f.sourceApp, f.platform, f.appVersion, f.category, f.body, f.context ? JSON.stringify(f.context) : null, f.email, dedup).run();
  if (res.meta.changes === 0 && dedup) {
    const existing = await db.prepare('SELECT id FROM feedback WHERE dedup_key = ?').bind(dedup).first();
    if (existing) return json({ id: existing.id, duplicate: true }, 201);
  }
  return json({ id }, 201);
}

function decodeCursor(c) {
  if (!c) return null;
  try { const [t, id] = atob(c.replace(/-/g, '+').replace(/_/g, '/')).split('|'); return Number.isInteger(+t) && id ? { t: +t, id } : false; } catch { return false; }
}
const encodeCursor = (row) => btoa(`${row.created_at}|${row.id}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function list(url, auth, db) {
  const q = url.searchParams;
  const where = []; const args = [];
  scope(auth.role, where, args); // enforced FIRST, regardless of the category in the URL
  const status = q.get('status'); const category = q.get('category'); const platform = q.get('platform');
  if (status) { if (!STATUSES.includes(status)) return err(400, 'invalid'); where.push('status = ?'); args.push(status); }
  if (category) { if (!CATEGORIES.includes(category)) return err(400, 'invalid'); where.push('category = ?'); args.push(category); }
  if (platform) { if (!PLATFORMS.includes(platform)) return err(400, 'invalid'); where.push('platform = ?'); args.push(platform); }
  const text = (q.get('q') || '').trim().slice(0, 100);
  if (text) { where.push("body LIKE ? ESCAPE '\\'"); args.push(`%${text.replace(/[\\%_]/g, '\\$&')}%`); }
  const cursor = decodeCursor(q.get('cursor'));
  if (cursor === false) return err(400, 'invalid');
  if (cursor) { where.push('(created_at < ? OR (created_at = ? AND id < ?))'); args.push(cursor.t, cursor.t, cursor.id); }
  const limit = Math.min(Math.max(parseInt(q.get('limit') || '25', 10) || 25, 1), 50);
  const sql = `SELECT * FROM feedback ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC, id DESC LIMIT ?`;
  const { results } = await db.prepare(sql).bind(...args, limit + 1).all();
  const page = results.slice(0, limit);
  const sw = []; const sa = [];
  scope(auth.role, sw, sa);
  const counted = await db.prepare(`SELECT COUNT(*) AS n FROM feedback WHERE status = 'new'${sw.length ? ` AND ${sw.join(' AND ')}` : ''}`).bind(...sa).first();
  return json({ items: page.map((r) => projectListRow(r, auth.role)), nextCursor: results.length > limit ? encodeCursor(page[page.length - 1]) : null, newCount: counted.n });
}

async function loadScoped(db, id, role) {
  const where = ['id = ?']; const args = [id];
  scope(role, where, args);
  return db.prepare(`SELECT * FROM feedback WHERE ${where.join(' AND ')}`).bind(...args).first(); // out-of-scope = same as not found
}

async function detail(id, auth, db) {
  const row = await loadScoped(db, id, auth.role);
  if (!row) return err(404, 'not_found');
  const notes = (await db.prepare('SELECT * FROM feedback_notes WHERE feedback_id = ? ORDER BY created_at').bind(id).all()).results;
  const events = (await db.prepare('SELECT * FROM feedback_events WHERE feedback_id = ? ORDER BY created_at').bind(id).all()).results;
  return json({ item: projectItem(row, auth.role, { notes, events }) });
}

async function patch(request, id, auth, db, now) {
  let body; try { body = await request.json(); } catch { return err(400, 'invalid_json'); }
  if (!body || typeof body !== 'object' || !Number.isInteger(body.version)) return err(400, 'invalid');
  const hasStatus = body.status !== undefined; const hasCategory = body.category !== undefined;
  if (!hasStatus && !hasCategory) return err(400, 'invalid');
  if (hasStatus && !STATUSES.includes(body.status)) return err(400, 'invalid');
  if (hasCategory && !CATEGORIES.includes(body.category)) return err(400, 'invalid');
  if (hasCategory && auth.role !== 'superadmin') return err(403, 'forbidden');
  const row = await loadScoped(db, id, auth.role);
  if (!row) return err(404, 'not_found');
  if (row.version !== body.version) return err(409, 'version_conflict');
  const status = hasStatus ? body.status : row.status;
  const category = hasCategory ? body.category : row.category;
  const where = ['id = ?', 'version = ?']; const args = [id, body.version];
  scope(auth.role, where, args); // re-checked atomically inside the UPDATE
  const stmts = [db.prepare(`UPDATE feedback SET status = ?, category = ?, closed_at = ?, updated_at = ?, version = version + 1 WHERE ${where.join(' AND ')}`)
    .bind(status, category, status === 'closed' ? (row.closed_at ?? now) : null, now, ...args)];
  const ev = (kind, from, to) => db.prepare(`INSERT INTO feedback_events (id, feedback_id, actor_uid, kind, from_value, to_value, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM feedback WHERE id = ? AND version = ?)`)
    .bind(crypto.randomUUID(), id, auth.uid, kind, from, to, now, id, body.version + 1);
  if (status !== row.status) stmts.push(ev('status', row.status, status));
  if (category !== row.category) stmts.push(ev('category', row.category, category));
  const out = await db.batch(stmts);
  if (out[0].meta.changes === 0) return err(409, 'version_conflict');
  return detail(id, auth, db);
}

async function addNote(request, id, auth, db, now) {
  let raw; try { raw = await request.json(); } catch { return err(400, 'invalid_json'); }
  const v = validateNote(raw);
  if (!v.ok) return err(400, 'invalid');
  if (v.value.scope === 'superadmin_private' && auth.role !== 'superadmin') return err(403, 'forbidden');
  const row = await loadScoped(db, id, auth.role);
  if (!row) return err(404, 'not_found');
  const noteId = crypto.randomUUID();
  await db.batch([
    db.prepare('INSERT INTO feedback_notes (id, feedback_id, author_uid, scope, body, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(noteId, id, auth.uid, v.value.scope, v.value.body, now),
    db.prepare("INSERT INTO feedback_events (id, feedback_id, actor_uid, kind, from_value, to_value, created_at) VALUES (?, ?, ?, 'note', NULL, ?, ?)").bind(crypto.randomUUID(), id, auth.uid, v.value.scope, now),
  ]);
  return json({ id: noteId }, 201);
}

export async function handle(request, env, deps = {}) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const allowed = origins(env);
  const corsOk = !origin || allowed.includes(origin);
  const cors = origin && corsOk ? { 'access-control-allow-origin': origin, vary: 'Origin' } : { vary: 'Origin' };
  const wrap = (res) => { for (const [k, v] of Object.entries(cors)) res.headers.set(k, v); return res; };

  if (request.method === 'OPTIONS') {
    if (!origin || !corsOk) return new Response(null, { status: 403 });
    return wrap(new Response(null, { status: 204, headers: { 'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS', 'access-control-allow-headers': 'authorization, content-type', 'access-control-max-age': '600' } }));
  }
  if (origin && !corsOk) return err(403, 'origin_not_allowed');
  const path = url.pathname.replace(/\/+$/, '');
  const now = deps.now ? deps.now() : Date.now();
  try {
    if (path === '/api/feedback') return request.method === 'POST' ? wrap(await submit(request, env, deps)) : wrap(err(405, 'method_not_allowed', { allow: 'POST' }));
    if (!path.startsWith('/api/admin/')) return wrap(err(404, 'not_found'));
    const auth = await authenticate(request, env, deps);
    if (auth.res) return wrap(auth.res);
    if (path === '/api/admin/me' && request.method === 'GET') return wrap(json({ role: auth.role, categories: visibleCategories(auth.role) ?? CATEGORIES, canSeeContacts: auth.role === 'superadmin' }));
    if (path === '/api/admin/feedback' && request.method === 'GET') return wrap(await list(url, auth, env.DB));
    const m = /^\/api\/admin\/feedback\/([0-9a-f-]{36})(\/notes)?$/.exec(path);
    if (m) {
      if (!m[2] && request.method === 'GET') return wrap(await detail(m[1], auth, env.DB));
      if (!m[2] && request.method === 'PATCH') return wrap(await patch(request, m[1], auth, env.DB, now));
      if (m[2] && request.method === 'POST') return wrap(await addNote(request, m[1], auth, env.DB, now));
    }
    return wrap(err(404, 'not_found'));
  } catch {
    return wrap(err(503, 'unavailable')); // D1 failure: fail closed, no details
  }
}

export async function purge(env, now = Date.now()) {
  const days = Number(env.RETENTION_DAYS || 180);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM feedback WHERE closed_at IS NOT NULL AND closed_at < ?').bind(now - days * 86400000),
    env.DB.prepare('DELETE FROM rate_limit WHERE expires_at < ?').bind(now),
  ]);
}

export default {
  fetch: (request, env) => handle(request, env),
  scheduled: (_event, env, ctx) => ctx.waitUntil(purge(env)),
};
