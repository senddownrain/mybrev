import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ADMIN_UIDS } from '../src/constants/admin.js';
import { adminRouteDecision, parseAnalyticsReportsUrl, resolveAdminAccess } from '../src/utils/adminAccess.js';

const [LEGACY] = ADMIN_UIDS;
const doc = (data) => ({ exists: true, data });

test('legacy document without role is admin and keeps priestAccess', () => {
  assert.deepEqual(resolveAdminAccess('u1', doc({ email: 'a@b' })), { isAdmin: true, role: 'admin', isSuperAdmin: false, canManagePriestAccess: false, canManageAccessSetsV2: false });
  assert.equal(resolveAdminAccess('u1', doc({ priestAccess: true })).canManagePriestAccess, true);
  assert.equal(resolveAdminAccess('u1', doc({ priestAccess: 'true' })).canManagePriestAccess, false);
});

test('role admin and superadmin are read from the document', () => {
  assert.equal(resolveAdminAccess('u1', doc({ role: 'admin' })).isSuperAdmin, false);
  const sup = resolveAdminAccess('u1', doc({ role: 'superadmin' }));
  assert.deepEqual([sup.isAdmin, sup.role, sup.isSuperAdmin], [true, 'superadmin', true]);
});

test('superadmin manages priest access without the priestAccess flag', () => {
  assert.equal(resolveAdminAccess('u1', doc({ role: 'superadmin' })).canManagePriestAccess, true);
});

test('unknown or malformed explicit role grants nothing', () => {
  for (const role of ['superAdmin', 'owner', '', null, 7, true]) {
    assert.deepEqual(resolveAdminAccess('u1', doc({ role, priestAccess: true })), { isAdmin: false, role: null, isSuperAdmin: false, canManagePriestAccess: false, canManageAccessSetsV2: false });
  }
});

test('every fallback UID with an explicit superadmin document is superadmin', () => {
  for (const uid of ADMIN_UIDS) {
    const access = resolveAdminAccess(uid, doc({ role: 'superadmin' }));
    assert.equal(access.isSuperAdmin, true);
    assert.equal(access.canManagePriestAccess, true);
  }
});

test('fallback UID without document, on read error or with unknown role is only the former admin', () => {
  const expected = { isAdmin: true, role: 'admin', isSuperAdmin: false, canManagePriestAccess: true, canManageAccessSetsV2: false };
  for (const uid of ADMIN_UIDS) {
    assert.deepEqual(resolveAdminAccess(uid, { exists: false }), expected);
    assert.deepEqual(resolveAdminAccess(uid, { failed: true }), expected);
    assert.deepEqual(resolveAdminAccess(uid, { exists: true, data: { role: 'superadmin' }, failed: true }), expected);
    assert.deepEqual(resolveAdminAccess(uid, doc({ role: 'bogus' })), expected);
  }
});

test('regular uid has no rights without a document or on read error', () => {
  const none = { isAdmin: false, role: null, isSuperAdmin: false, canManagePriestAccess: false, canManageAccessSetsV2: false };
  assert.deepEqual(resolveAdminAccess('u1', { exists: false }), none);
  assert.deepEqual(resolveAdminAccess('u1', { failed: true }), none);
  assert.deepEqual(resolveAdminAccess('u1', { exists: true, data: { role: 'superadmin' }, failed: true }), none);
});

test('fallback UIDs are unchanged and not hardcoded as superadmin', () => {
  assert.deepEqual(ADMIN_UIDS, ['64MeSP56IWVotVFG7bu8YKeLis12', '7mszX2IiXHgjWxj0ZE5vEqdkmoD2']);
  assert.ok(!resolveAdminAccess(LEGACY, { exists: false }).isSuperAdmin);
});

test('route decisions: anonymous, admin, superadmin, priest-only', () => {
  const anon = resolveAdminAccess('x', { exists: false });
  const admin = resolveAdminAccess('u1', doc({ role: 'admin' }));
  const sup = resolveAdminAccess('u1', doc({ role: 'superadmin' }));
  const priest = resolveAdminAccess('u1', doc({ priestAccess: true }));
  assert.deepEqual(adminRouteDecision({ requiresSuperAdmin: true }, anon, '/admin/analytics'), { name: 'Login', query: { redirect: '/admin/analytics' } });
  assert.deepEqual(adminRouteDecision({ requiresSuperAdmin: true }, admin, '/admin/analytics'), { name: 'Admin' });
  assert.deepEqual(adminRouteDecision({ requiresSuperAdmin: true }, priest, '/admin/analytics'), { name: 'Admin' });
  assert.equal(adminRouteDecision({ requiresSuperAdmin: true }, sup, '/admin/analytics'), true);
  assert.equal(adminRouteDecision({}, admin, '/admin'), true);
  assert.deepEqual(adminRouteDecision({ requiresPriestAdmin: true }, admin, '/admin/priest-access'), { name: 'Admin' });
  assert.equal(adminRouteDecision({ requiresPriestAdmin: true }, sup, '/admin/priest-access'), true);
});

test('V2 role is server-confirmed, independent of legacy, and required by the route', () => {
  const meta = { requiresAccessSetsV2: true };
  const path = '/admin/access-sets';
  for (const data of [{ role: 'superadmin' }, { role: 'admin', accessSetsV2: true }, { accessSetsV2: true }]) {
    assert.equal(adminRouteDecision(meta, resolveAdminAccess('manager', doc(data)), path), true);
    assert.equal(resolveAdminAccess('manager', { ...doc(data), fromCache: true }).canManageAccessSetsV2, false);
  }
  const manager = resolveAdminAccess('manager', doc({ role: 'admin', accessSetsV2: true }));
  assert.equal(manager.canManagePriestAccess, false);
  for (const data of [{ role: 'admin' }, { priestAccess: true }, { accessSetsV2: 'true' }]) {
    assert.deepEqual(adminRouteDecision(meta, resolveAdminAccess('editor', doc(data)), path), { name: 'Admin' });
  }
  assert.deepEqual(adminRouteDecision(meta, resolveAdminAccess('visitor'), path), { name: 'Login', query: { redirect: path } });
  assert.equal(resolveAdminAccess('visitor', doc({ role: 'bad', accessSetsV2: true })).canManageAccessSetsV2, false);
  assert.equal(resolveAdminAccess(LEGACY, doc({ role: 'bad', accessSetsV2: true })).canManageAccessSetsV2, true);
  assert.equal(resolveAdminAccess(LEGACY, { ...doc({ accessSetsV2: true }), failed: true }).canManageAccessSetsV2, false);
});

test('analytics URL: https or localhost only, no credentials, empty when unset', () => {
  assert.equal(parseAnalyticsReportsUrl(undefined), null);
  assert.equal(parseAnalyticsReportsUrl('  '), null);
  assert.equal(parseAnalyticsReportsUrl('not a url'), null);
  assert.equal(parseAnalyticsReportsUrl('http://example.com/reports'), null);
  assert.equal(parseAnalyticsReportsUrl('javascript:alert(1)'), null);
  assert.equal(parseAnalyticsReportsUrl('https://user:pw@example.com/reports'), null);
  assert.equal(parseAnalyticsReportsUrl('https://r.example.workers.dev/reports'), 'https://r.example.workers.dev/reports');
  assert.equal(parseAnalyticsReportsUrl('http://localhost:8788/reports'), 'http://localhost:8788/reports');
});

test('wiring: analytics route is superadmin-only, card is superadmin-only, link is hardened', () => {
  const router = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8');
  assert.match(router, /name: 'AdminAnalytics'[\s\S]{0,160}requiresSuperAdmin: true/);
  const admin = readFileSync(new URL('../src/views/Admin.vue', import.meta.url), 'utf8');
  assert.match(admin, /name: 'AdminAnalytics' \}, superAdmin: true/);
  assert.match(admin, /item\.superAdmin \|\| auth\.isSuperAdmin/);
  const page = readFileSync(new URL('../src/views/admin/Analytics.vue', import.meta.url), 'utf8');
  assert.match(page, /rel="noopener noreferrer"/);
  assert.doesNotMatch(page, /iframe|fetch\(|TOKEN/i);
});


test('songbook is available to admins only in navigation and on both direct routes', () => {
  const router = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8');
  const drawer = readFileSync(new URL('../src/layouts/default/NavigationDrawer.vue', import.meta.url), 'utf8');
  assert.match(router, /name: 'Songs'.*meta: \{ requiresAuth: true \}/);
  assert.match(router, /name: 'SongView'.*meta: \{ requiresAuth: true \}/);
  assert.match(drawer, /v-if="auth\.isAdmin"[^>]+title="Спеўнік"/);
  assert.match(drawer, /auth\.init\(\)/);
});
