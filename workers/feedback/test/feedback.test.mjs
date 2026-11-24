/* global Request */
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, purge } from '../src/index.mjs';
import { validateSubmission } from '../src/validate.mjs';
import { makeEnv, makeToken, forgedKey } from './helpers.mjs';

const SUPER = 'uSuper'; const ADMIN = 'uAdmin'; const NOBODY = 'uNobody';
const setup = (extra) => makeEnv({ [SUPER]: 'superadmin', [ADMIN]: 'admin' }, extra);
const good = (o = {}) => ({ category: 'text_error', platform: 'web', appVersion: '4.5.2', body: 'Памылка ў тэксце', ...o });
const call = (ctx, method, path, { body, token, headers = {} } = {}) => handle(new Request(`https://w.test${path}`, {
  method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
  body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
}), ctx.env, ctx.deps);
const submit = async (ctx, o) => (await call(ctx, 'POST', '/api/feedback', { body: good(o) })).json();
const as = (uid) => makeToken(uid);

async function seed(ctx) {
  const ids = {};
  for (const c of ['text_error', 'content_suggestion', 'technical_bug', 'feature_suggestion', 'other']) {
    ids[c] = (await submit(ctx, { category: c, body: `msg ${c}`, email: 'person@example.com', context: { kind: 'prayer', id: 'p1', path: '/prayers/p1?token=x#h' } })).id;
  }
  return ids;
}

test('public validation: allowlists, size, email, context, extra fields dropped', async () => {
  const ctx = setup();
  assert.equal((await call(ctx, 'POST', '/api/feedback', { body: good() })).status, 201);
  for (const bad of [{ category: 'admin' }, { platform: 'windows' }, { body: '' }, { body: 'x'.repeat(4001) }, { email: 'nope' }, { appVersion: '<script>' },
    { context: { kind: 'evil' } }, { context: { path: 'https://evil.example/x' } }, { context: { id: '<img onerror=1>' } }, { requestId: 'zz' }]) {
    assert.equal((await call(ctx, 'POST', '/api/feedback', { body: good(bad) })).status, 400, JSON.stringify(bad));
  }
  assert.equal((await call(ctx, 'POST', '/api/feedback', { body: '{bad' })).status, 400);
  assert.equal((await call(ctx, 'POST', '/api/feedback', { body: JSON.stringify(good({ body: 'x'.repeat(20000) })) })).status, 413);
  const r = await (await call(ctx, 'POST', '/api/feedback', { body: good({ status: 'closed', visibility: 'public', id: 'forced', context: { kind: 'prayer', id: 'a', path: '/p/a?token=secret#x', evil: 1 } }) })).json();
  const row = ctx.env.DB.raw.prepare('SELECT * FROM feedback WHERE id = ?').get(r.id);
  assert.equal(row.status, 'new'); assert.notEqual(row.id, 'forced');
  assert.deepEqual(JSON.parse(row.context_json), { kind: 'prayer', id: 'a', path: '/p/a' });
  assert.equal(validateSubmission(good({ body: 'a\u0000bc  ' })).value.body, 'abc');
});

test('public API cannot read, list, search or modify', async () => {
  const ctx = setup(); const ids = await seed(ctx);
  for (const [m, p] of [['GET', '/api/feedback'], ['GET', `/api/feedback/${ids.other}`], ['GET', '/api/admin/feedback'], ['GET', `/api/admin/feedback/${ids.other}`], ['PATCH', `/api/admin/feedback/${ids.other}`], ['GET', '/api/admin/me']]) {
    const s = (await call(ctx, m, p, { body: m === 'PATCH' ? {} : undefined })).status;
    assert.ok([401, 404, 405].includes(s), `${m} ${p} -> ${s}`);
  }
});

test('JWT: forged, expired, wrong aud/iss, alg none, wrong key, missing kid => 401; non-staff => 403', async () => {
  const ctx = setup();
  const now = Math.floor(Date.now() / 1000);
  const tokens = {
    forged: makeToken(SUPER, { signWith: forgedKey }),
    expired: makeToken(SUPER, { claims: { exp: now - 10 } }),
    wrongAud: makeToken(SUPER, { claims: { aud: 'other-project' } }),
    wrongIss: makeToken(SUPER, { claims: { iss: 'https://securetoken.google.com/other' } }),
    future: makeToken(SUPER, { claims: { iat: now + 3600 } }),
    noSub: makeToken(SUPER, { claims: { sub: '' } }),
    none: makeToken(SUPER, { alg: 'none' }),
    unknownKid: makeToken(SUPER, { kid: 'zzz' }),
    garbage: 'a.b.c',
  };
  for (const [name, t] of Object.entries(tokens)) assert.equal((await call(ctx, 'GET', '/api/admin/me', { token: t })).status, 401, name);
  assert.equal((await call(ctx, 'GET', '/api/admin/me', { headers: { 'x-role': 'superadmin' } })).status, 401);
  assert.equal((await call(ctx, 'GET', '/api/admin/me', { token: as(NOBODY) })).status, 403);
  assert.equal(ctx.calls.length, 1, 'no role lookup happens for invalid tokens');
  const me = await (await call(ctx, 'GET', '/api/admin/me', { token: as(SUPER) })).json();
  assert.equal(me.role, 'superadmin');
});

test('alg none is refused unless emulator mode on a demo- project', async () => {
  const t = makeToken(SUPER, { alg: 'none' });
  assert.equal((await call(setup({ ALLOW_EMULATOR_TOKENS: 'true' }), 'GET', '/api/admin/me', { token: t })).status, 401); // project is not demo-
});

test('role provider fail-closed; unknown role => 403; legacy doc => admin', async () => {
  const ctx = makeEnv({ a: 'ERROR', b: 'weird', c: 'legacy' });
  assert.equal((await call(ctx, 'GET', '/api/admin/me', { token: as('a') })).status, 503);
  assert.equal((await call(ctx, 'GET', '/api/admin/me', { token: as('b') })).status, 403);
  assert.equal((await call(ctx, 'GET', '/api/admin/me', { token: as('c') })).status, 200);
  assert.match(ctx.calls.at(-1).auth, /^Bearer [\w-]+\.[\w-]+\.[\w-]*$/); // caller's own verified token, no service key
});

test('admin requests forward App Check alongside the verified ID token and remain compatible without it', async () => {
  const ctx = setup();
  const headers = { origin: 'https://app.example', 'X-Firebase-AppCheck': 'test-app-check' };
  const preflight = await call(ctx, 'OPTIONS', '/api/admin/me', {
    headers: { origin: headers.origin, 'access-control-request-headers': 'authorization, x-firebase-appcheck' },
  });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /\bx-firebase-appcheck\b/);

  assert.equal((await call(ctx, 'GET', '/api/admin/me', { headers })).status, 401);
  assert.equal(ctx.calls.length, 0);
  const token = as(ADMIN);
  assert.equal((await call(ctx, 'GET', '/api/admin/me', { headers, token })).status, 200);
  assert.equal(ctx.calls.at(-1).auth, `Bearer ${token}`);
  assert.equal(ctx.calls.at(-1).appCheck, 'test-app-check');
  assert.equal(ctx.calls.at(-1).redirect, 'manual');
  assert.equal((await call(ctx, 'GET', '/api/admin/me', { token })).status, 200);
  assert.equal(ctx.calls.at(-1).appCheck, undefined);
});

test('admin role lookup rejects a Firestore redirect', async () => {
  const ctx = makeEnv({ [ADMIN]: 'REDIRECT' });
  const res = await call(ctx, 'GET', '/api/admin/me', {
    token: as(ADMIN),
    headers: { 'X-Firebase-AppCheck': 'test-app-check' },
  });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'role_check_unavailable' });
  assert.equal(ctx.calls.length, 1);
  assert.equal(ctx.calls[0].redirect, 'manual');
});

test('admin sees only content categories: list, count, search, pagination, detail, URL override', async () => {
  const ctx = setup(); const ids = await seed(ctx);
  const t = as(ADMIN);
  const list = await (await call(ctx, 'GET', '/api/admin/feedback?category=technical_bug', { token: t })).json();
  assert.equal(list.items.length, 0);
  const all = await (await call(ctx, 'GET', '/api/admin/feedback', { token: t })).json();
  assert.deepEqual(all.items.map((i) => i.category).sort(), ['content_suggestion', 'text_error']);
  assert.equal(all.newCount, 2);
  const s = await (await call(ctx, 'GET', '/api/admin/feedback?q=technical', { token: t })).json();
  assert.equal(s.items.length, 0);
  const s2 = await (await call(ctx, 'GET', '/api/admin/feedback?q=person@example.com', { token: t })).json();
  assert.equal(s2.items.length, 0);
  const p1 = await (await call(ctx, 'GET', '/api/admin/feedback?limit=1', { token: t })).json();
  assert.ok(p1.nextCursor);
  const p2 = await (await call(ctx, 'GET', `/api/admin/feedback?limit=1&cursor=${p1.nextCursor}`, { token: t })).json();
  assert.notEqual(p1.items[0].id, p2.items[0].id); assert.equal(p2.nextCursor, null);
  assert.equal((await call(ctx, 'GET', '/api/admin/feedback?cursor=%%%', { token: t })).status, 400);
  for (const c of ['technical_bug', 'feature_suggestion', 'other']) {
    assert.equal((await call(ctx, 'GET', `/api/admin/feedback/${ids[c]}`, { token: t })).status, 404);
    assert.equal((await call(ctx, 'PATCH', `/api/admin/feedback/${ids[c]}`, { token: t, body: { version: 1, status: 'closed' } })).status, 404);
    assert.equal((await call(ctx, 'POST', `/api/admin/feedback/${ids[c]}/notes`, { token: t, body: { body: 'x' } })).status, 404);
  }
  const d = await (await call(ctx, 'GET', `/api/admin/feedback/${ids.text_error}`, { token: t })).text();
  assert.ok(!d.includes('person@example.com') && !d.includes('contactEmail') && !d.includes('appVersion'));
  assert.ok(!JSON.stringify(all).includes('person@example.com'));
});

test('admin: only status; no category change, no private notes, shared notes visible; superadmin sees everything', async () => {
  const ctx = setup(); const ids = await seed(ctx); const id = ids.text_error;
  const a = as(ADMIN); const s = as(SUPER);
  assert.equal((await call(ctx, 'PATCH', `/api/admin/feedback/${id}`, { token: a, body: { version: 1, category: 'other' } })).status, 403);
  const ok = await call(ctx, 'PATCH', `/api/admin/feedback/${id}`, { token: a, body: { version: 1, status: 'in_review' } });
  assert.equal(ok.status, 200); assert.equal((await ok.json()).item.status, 'in_review');
  assert.equal((await call(ctx, 'PATCH', `/api/admin/feedback/${id}`, { token: a, body: { version: 1, status: 'closed' } })).status, 409);
  assert.equal((await call(ctx, 'PATCH', `/api/admin/feedback/${id}`, { token: a, body: { version: 2, status: 'bogus' } })).status, 400);
  assert.equal((await call(ctx, 'POST', `/api/admin/feedback/${id}/notes`, { token: a, body: { body: 'secret', scope: 'superadmin_private' } })).status, 403);
  assert.equal((await call(ctx, 'POST', `/api/admin/feedback/${id}/notes`, { token: a, body: { body: '<b>shared</b>' } })).status, 201);
  assert.equal((await call(ctx, 'POST', `/api/admin/feedback/${id}/notes`, { token: s, body: { body: 'PRIV', scope: 'superadmin_private' } })).status, 201);
  const ad = JSON.stringify(await (await call(ctx, 'GET', `/api/admin/feedback/${id}`, { token: a })).json());
  assert.ok(ad.includes('<b>shared</b>') && !ad.includes('PRIV') && !ad.includes('authorUid') && !ad.includes('actorUid'));
  const sd = (await (await call(ctx, 'GET', `/api/admin/feedback/${id}`, { token: s })).json()).item;
  assert.equal(sd.contactEmail, 'person@example.com'); assert.equal(sd.notes.length, 2); assert.equal(sd.events[0].actorUid, ADMIN);
  const sl = await (await call(ctx, 'GET', '/api/admin/feedback', { token: s })).json();
  assert.equal(sl.items.length, 5); assert.equal(sl.newCount, 4);
  const evText = JSON.stringify(ctx.env.DB.raw.prepare('SELECT * FROM feedback_events').all());
  assert.ok(!evText.includes('person@example.com') && !evText.includes('<b>'));
});

test('reclassification changes ACL immediately in both directions; role change takes effect without re-login', async () => {
  const ctx = setup(); const ids = await seed(ctx); const id = ids.technical_bug;
  const a = as(ADMIN); const s = as(SUPER);
  assert.equal((await call(ctx, 'GET', `/api/admin/feedback/${id}`, { token: a })).status, 404);
  assert.equal((await call(ctx, 'PATCH', `/api/admin/feedback/${id}`, { token: s, body: { version: 1, category: 'text_error' } })).status, 200);
  assert.equal((await call(ctx, 'GET', `/api/admin/feedback/${id}`, { token: a })).status, 200);
  assert.equal((await (await call(ctx, 'GET', '/api/admin/feedback', { token: a })).json()).items.length, 3);
  assert.equal((await call(ctx, 'PATCH', `/api/admin/feedback/${id}`, { token: s, body: { version: 2, category: 'other' } })).status, 200);
  assert.equal((await call(ctx, 'GET', `/api/admin/feedback/${id}`, { token: a })).status, 404);
  const cat = ctx.env.DB.raw.prepare("SELECT from_value, to_value FROM feedback_events WHERE kind = 'category' ORDER BY created_at").all();
  assert.equal(cat.length, 2);
  ctx.roles[ADMIN] = undefined; // role revoked in Firestore; same token, no re-login
  assert.equal((await call(ctx, 'GET', '/api/admin/feedback', { token: a })).status, 403);
  ctx.roles[ADMIN] = 'superadmin';
  assert.equal((await (await call(ctx, 'GET', '/api/admin/feedback', { token: a })).json()).items.length, 5);
});

test('concurrent updates: exactly one wins; admin cannot race a reclassification', async () => {
  const ctx = setup(); const ids = await seed(ctx); const id = ids.text_error;
  const rs = await Promise.all([call(ctx, 'PATCH', `/api/admin/feedback/${id}`, { token: as(ADMIN), body: { version: 1, status: 'in_review' } }),
    call(ctx, 'PATCH', `/api/admin/feedback/${id}`, { token: as(SUPER), body: { version: 1, status: 'resolved' } })]);
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
  assert.equal(ctx.env.DB.raw.prepare("SELECT COUNT(*) n FROM feedback_events WHERE kind='status'").get().n, 1);
});

test('duplicate submission with same requestId => one row', async () => {
  const ctx = setup(); const rid = '123e4567-e89b-12d3-a456-426614174000';
  const a = await submit(ctx, { requestId: rid }); const b = await submit(ctx, { requestId: rid });
  assert.equal(a.id, b.id); assert.equal(ctx.env.DB.raw.prepare('SELECT COUNT(*) n FROM feedback').get().n, 1);
});

test('SQL injection and XSS payloads are stored inert and returned as JSON data', async () => {
  const ctx = setup();
  const evil = "'); DROP TABLE feedback;-- <script>alert(1)</script>";
  const { id } = await submit(ctx, { body: evil });
  const d = await call(ctx, 'GET', `/api/admin/feedback/${id}`, { token: as(SUPER) });
  assert.equal((await d.json()).item.body, evil);
  assert.match(d.headers.get('content-type'), /application\/json/); assert.equal(d.headers.get('x-content-type-options'), 'nosniff');
  const q = await call(ctx, 'GET', `/api/admin/feedback?q=${encodeURIComponent("' OR 1=1 --")}`, { token: as(SUPER) });
  assert.equal((await q.json()).items.length, 0);
  assert.equal((await call(ctx, 'GET', `/api/admin/feedback/${encodeURIComponent("x' OR '1'='1")}`, { token: as(SUPER) })).status, 404);
  assert.equal(ctx.env.DB.raw.prepare('SELECT COUNT(*) n FROM feedback').get().n, 1);
});

test('CORS: allowed origin reflected, others refused; native (no Origin) works', async () => {
  const ctx = setup();
  const ok = await call(ctx, 'POST', '/api/feedback', { body: good(), headers: { origin: 'https://app.example' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://app.example');
  const bad = await call(ctx, 'POST', '/api/feedback', { body: good(), headers: { origin: 'https://evil.example' } });
  assert.equal(bad.status, 403); assert.equal(bad.headers.get('access-control-allow-origin'), null);
  assert.equal((await call(ctx, 'OPTIONS', '/api/feedback', { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call(ctx, 'OPTIONS', '/api/feedback', { headers: { origin: 'https://app.example' } })).status, 204);
  assert.equal((await call(ctx, 'GET', '/api/admin/feedback', { token: as(SUPER), headers: { origin: 'https://evil.example' } })).status, 403);
});

test('production Web origins work even if origin config is stale; unknown origins remain forbidden', async () => {
  const ctx = setup({ ALLOWED_ORIGINS: 'https://old-staging.example' });
  for (const origin of ['https://malitounik.by', 'https://www.malitounik.by']) {
    const r = await call(ctx, 'POST', '/api/feedback', { body: good(), headers: { origin } });
    assert.equal(r.status, 201);
    assert.equal(r.headers.get('access-control-allow-origin'), origin);
    const options = await call(ctx, 'OPTIONS', '/api/feedback', { headers: { origin } });
    assert.equal(options.status, 204);
  }
  const spoofed = await call(ctx, 'POST', '/api/feedback', { body: good(), headers: { origin: 'https://malitounik.by.evil.test' } });
  assert.equal(spoofed.status, 403);
  // Native Flutter has no browser Origin header. Never block it for a CORS reason.
  const native = await call(ctx, 'POST', '/api/feedback', { body: good() });
  assert.equal(native.status, 201);
});

test('edge burst limit rejects before any D1 access and does not replace D1 quotas', async () => {
  const ctx = setup();
  let calls = 0;
  const keys = [];
  ctx.env.FEEDBACK_EDGE_LIMITER = {
    limit: async ({ key }) => { calls++; keys.push(key); return { success: calls === 1 }; },
  };
  const first = await call(ctx, 'POST', '/api/feedback', {
    body: good(), headers: { 'cf-connecting-ip': '198.51.100.45' },
  });
  assert.equal(first.status, 201);
  const second = await call(ctx, 'POST', '/api/feedback', {
    body: good(), headers: { 'cf-connecting-ip': '198.51.100.45' },
  });
  assert.equal(second.status, 429);
  assert.equal(second.headers.get('retry-after'), '10');
  assert.deepEqual(keys, ['198.51.100.45', '198.51.100.45']);
  assert.equal(ctx.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM feedback').get().n, 1);
  assert.equal(ctx.env.DB.raw.prepare('SELECT SUM(count) AS n FROM rate_limit').get().n, 2);
});

test('limits: per-minute 429, daily budget 503, kill switch 503, raw IP never stored', async () => {
  const ctx = setup({ RATE_PER_MINUTE: '2' });
  const post = () => call(ctx, 'POST', '/api/feedback', { body: good(), headers: { 'cf-connecting-ip': '203.0.113.9' } });
  assert.equal((await post()).status, 201); assert.equal((await post()).status, 201);
  const third = await post(); assert.equal(third.status, 429); assert.ok(third.headers.get('retry-after'));
  assert.ok(!JSON.stringify(ctx.env.DB.raw.prepare('SELECT * FROM rate_limit').all()).includes('203.0.113.9'));
  const budget = setup({ DAILY_BUDGET: '1' });
  assert.equal((await call(budget, 'POST', '/api/feedback', { body: good() })).status, 201);
  assert.equal((await call(budget, 'POST', '/api/feedback', { body: good() })).status, 503);
  assert.equal((await call(setup({ FEEDBACK_ENABLED: 'false' }), 'POST', '/api/feedback', { body: good() })).status, 503);
});

test('fail closed on D1 error, no detail leaked', async () => {
  const ctx = setup(); const ids = await seed(ctx);
  ctx.env.DB.raw.exec('DROP TABLE feedback_notes');
  const r = await call(ctx, 'GET', `/api/admin/feedback/${ids.text_error}`, { token: as(SUPER) });
  assert.equal(r.status, 503); assert.deepEqual(await r.json(), { error: 'unavailable' });
});

test('retention purge removes closed items older than 180 days and expired rate rows', async () => {
  const ctx = setup(); const ids = await seed(ctx);
  await call(ctx, 'PATCH', `/api/admin/feedback/${ids.other}`, { token: as(SUPER), body: { version: 1, status: 'closed' } });
  await purge(ctx.env, Date.now() + 181 * 86400000);
  assert.equal(ctx.env.DB.raw.prepare('SELECT COUNT(*) n FROM feedback').get().n, 4);
  assert.equal(ctx.env.DB.raw.prepare('SELECT COUNT(*) n FROM feedback_events').get().n, 0);
});

test('same requestId with another message is refused (409), an identical retry stays idempotent', async () => {
  const ctx = setup();
  const requestId = '11111111-2222-3333-4444-555555555555';
  const first = await (await call(ctx, 'POST', '/api/feedback', { body: good({ requestId, body: 'first text' }) })).json();
  const same = await call(ctx, 'POST', '/api/feedback', { body: good({ requestId, body: 'first text' }) });
  assert.equal(same.status, 201); assert.equal((await same.json()).id, first.id);
  const changed = await call(ctx, 'POST', '/api/feedback', { body: good({ requestId, body: 'edited text' }) });
  assert.equal(changed.status, 409); assert.equal((await changed.json()).error, 'request_id_reused');
  assert.equal(ctx.env.DB.raw.prepare('SELECT COUNT(*) n FROM feedback').get().n, 1);
});

test('export: role scope, no personal data, redaction, CSV safety, validation, auth', async () => {
  const ctx = setup();
  await seed(ctx);
  await submit(ctx, { category: 'text_error', body: '=HYPERLINK("x") mail me a.b@mail.by or +375 29 123-45-67 see https://x.example/y?t=1', email: 'secret@person.by', context: { kind: 'prayer', id: 'p9', title: '=cmd', path: '/prayer/p9' } });
  assert.equal((await call(ctx, 'GET', '/api/admin/export')).status, 401);
  const nobody = makeEnv({ [NOBODY]: 'unknown' });
  assert.equal((await call(nobody, 'GET', '/api/admin/export', { token: as(NOBODY) })).status, 403);

  const adminJson = await (await call(ctx, 'GET', '/api/admin/export', { token: as(ADMIN) })).json();
  assert.equal(adminJson.role, 'admin');
  assert.ok(adminJson.items.length >= 3 && adminJson.items.every((r) => ['text_error', 'content_suggestion'].includes(r.category)));
  const superJson = await (await call(ctx, 'GET', '/api/admin/export?category=technical_bug', { token: as(SUPER) })).json();
  assert.equal(superJson.items.length, 1);
  const adminOverride = await (await call(ctx, 'GET', '/api/admin/export?category=technical_bug', { token: as(ADMIN) })).json();
  assert.equal(adminOverride.items.length, 0); // scope is enforced before the URL filter

  const dump = JSON.stringify([adminJson, superJson]);
  assert.ok(!/secret@person\.by|person@example\.com|a\.b@mail\.by|375 29|123-45-67|x\.example/.test(dump), 'no e-mail, phone or link leaks');
  assert.ok(!('contactEmail' in adminJson.items[0]) && !('email' in adminJson.items[0]));
  const msg = adminJson.items.find((r) => r.context_id === 'p9').message;
  assert.match(msg, /\[email\]/); assert.match(msg, /\[phone\]/); assert.match(msg, /\[link\]/);
  assert.ok(!('app_version' in adminJson.items[0]) && 'app_version' in superJson.items[0]);

  const csv = await call(ctx, 'GET', '/api/admin/export?format=csv', { token: as(SUPER) });
  assert.equal(csv.status, 200); assert.match(csv.headers.get('content-type'), /text\/csv/); assert.match(csv.headers.get('content-disposition'), /attachment/);
  const text = await csv.text();
  assert.ok(!/(^|,)=cmd/.test(text) && text.includes("'=cmd"), 'formula cells are neutralised');
  assert.ok(text.endsWith('\r\n') && text.split('\r\n')[0].startsWith('id,date,category'));

  for (const bad of ['format=xml', 'status=nope', 'category=x', 'platform=pc', 'from=2026-13-40', 'to=yesterday']) {
    assert.equal((await call(ctx, 'GET', `/api/admin/export?${bad}`, { token: as(SUPER) })).status, 400, bad);
  }
  assert.equal((await call(ctx, 'GET', '/api/admin/export?from=2999-01-01', { token: as(SUPER) }).then((r) => r.json())).items.length, 0);
});
