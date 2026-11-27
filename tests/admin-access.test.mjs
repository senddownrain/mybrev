import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ADMIN_UIDS } from '../src/constants/admin.js';
import { adminRouteDecision, parseAnalyticsReportsUrl, resolveAdminAccess } from '../src/utils/adminAccess.js';

const doc = (data) => ({ exists: true, data });

test('server-confirmed plain admin and legacy roles share prayerbook access', () => {
  const expected = { isAdmin: true, role: 'admin', isSuperAdmin: false };
  for (const record of [{ role: 'admin' }, {}, { accessSetsV2: true }, { role: 'admin', priestAccess: false }]) {
    const access = resolveAdminAccess('editor', doc(record));
    assert.deepEqual(access, expected);
    assert.equal(adminRouteDecision({}, access, '/admin/access-sets'), true);
    assert.equal(adminRouteDecision({}, access, '/admin/priest-access'), true);
    assert.deepEqual(adminRouteDecision({ requiresSuperAdmin: true }, access, '/admin/analytics'), { name: 'Admin' });
  }
  const superadmin = resolveAdminAccess('editor', doc({ role: 'superadmin' }));
  assert.equal(adminRouteDecision({ requiresSuperAdmin: true }, superadmin, '/admin/analytics'), true);
});

test('malformed roles and unconfirmed roles do not grant privileges', () => {
  const none = { isAdmin: false, role: null, isSuperAdmin: false };
  for (const role of ['superAdmin', 'owner', '', null, 7, true]) {
    assert.deepEqual(resolveAdminAccess('visitor', doc({ role, priestAccess: true, accessSetsV2: true })), none);
  }
  for (const snapshot of [{ exists: false }, { ...doc({ role: 'superadmin' }), failed: true }, { ...doc({ role: 'superadmin' }), fromCache: true }]) {
    assert.deepEqual(resolveAdminAccess('visitor', snapshot), none);
  }
  assert.deepEqual(adminRouteDecision({}, none, '/admin/access-sets'), { name: 'Login', query: { redirect: '/admin/access-sets' } });
});

test('bootstrap UIDs match Rules and need a confirmed record for superadmin', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const legacyUids = rules.match(/function legacyAdmin\(\) \{\s*return request\.auth\.uid in \[([^\]]+)\]/)[1];
  assert.deepEqual([...legacyUids.matchAll(/'([^']+)'/g)].map((entry) => entry[1]), ADMIN_UIDS);
  const admin = { isAdmin: true, role: 'admin', isSuperAdmin: false };
  for (const uid of ADMIN_UIDS) {
    assert.deepEqual(resolveAdminAccess(uid), admin);
    assert.deepEqual(resolveAdminAccess(uid, doc({ role: 'bogus' })), admin);
    assert.deepEqual(resolveAdminAccess(uid, { ...doc({ role: 'superadmin' }), fromCache: true }), admin);
    assert.equal(resolveAdminAccess(uid, doc({ role: 'superadmin' })).isSuperAdmin, true);
  }
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
