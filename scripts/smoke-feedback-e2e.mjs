/**
 * LOCAL end-to-end for the shared feedback system: real workerd (wrangler dev --local, local D1) + Firebase Auth/Firestore
 * emulators (real firestore.rules) + the real Vue app in Chrome. Nothing leaves this machine.
 *   firebase emulators:exec --only auth,firestore --project demo-feedback "node scripts/smoke-feedback-e2e.mjs"
 * Optional SHOTS_DIR=<dir> for screenshots. BENCHMARK_BROWSER_PATH overrides the Chrome binary.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { chromium } from 'playwright-core';

const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '';
for (const host of [firestoreHost, authHost]) assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/, 'Local emulators required');
const projectId = 'demo-feedback';
const WRANGLER = 'wrangler@4.153.0';
const workerDir = fileURLToPath(new URL('../workers/feedback', import.meta.url));
const shotsDir = process.env.SHOTS_DIR;
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
const PASSWORD = 'Local-test-password-2345';
const WEB_PORT = 4783; const API_PORT = 8791;
const API = `http://127.0.0.1:${API_PORT}`; const WEB = `http://127.0.0.1:${WEB_PORT}`;

// --- Worker on workerd + local D1
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'feedback-d1-'));
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' };
const mig = spawnSync('npx', ['--yes', WRANGLER, 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', persist], { cwd: workerDir, env, encoding: 'utf8' });
assert.equal(mig.status, 0, mig.stderr);
const logFile = path.join(persist, 'worker.log');
const out = fs.openSync(logFile, 'w');
const dev = spawn('npx', ['--yes', WRANGLER, 'dev', '--local', '--port', String(API_PORT), '--ip', '127.0.0.1', '--persist-to', persist,
  '--var', `FIREBASE_PROJECT_ID:${projectId}`, '--var', 'ALLOW_EMULATOR_TOKENS:true', '--var', `FIRESTORE_BASE_URL:http://${firestoreHost}`,
  '--var', `ALLOWED_ORIGINS:${WEB}`, '--var', 'FEEDBACK_ENABLED:true', '--var', 'RATE_PER_MINUTE:100', '--var', 'RATE_SALT:local-e2e-salt'],
{ cwd: workerDir, env, stdio: ['ignore', out, out], detached: true });
const stopWorker = () => { try { process.kill(-dev.pid, 'SIGTERM'); } catch { /* already gone */ } };
process.on('exit', stopWorker);
let up = false;
for (let i = 0; i < 300 && !up; i += 1) { try { await fetch(`${API}/`); up = true; } catch { await new Promise((r) => setTimeout(r, 200)); } }
assert.ok(up, 'wrangler dev did not start');

// --- Accounts in the Auth emulator + roles in Firestore emulator (same shape as production admins/{uid})
const users = { admin: { email: 'fb-admin@example.test', role: 'admin' }, super: { email: 'fb-super@example.test', role: 'superadmin' }, nobody: { email: 'fb-nobody@example.test' } };
for (const u of Object.values(users)) {
  const res = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: u.email, password: PASSWORD, returnSecureToken: true }) });
  const b = await res.json(); assert.ok(res.ok, b.error?.message);
  u.uid = b.localId; u.idToken = b.idToken;
  if (u.role) {
    const put = await fetch(`http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/admins/${u.uid}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ fields: { email: { stringValue: u.email }, role: { stringValue: u.role } } }) });
    assert.ok(put.ok, await put.text());
  }
}
const api = (p, o = {}, who) => fetch(`${API}${p}`, { ...o, headers: { ...(o.body ? { 'content-type': 'application/json' } : {}), ...(who ? { authorization: `Bearer ${users[who].idToken}` } : {}), ...o.headers } });

// --- Vue app (emulator-only firebase module, feedback URL pointed to the local Worker)
const [fsHostName, fsPort] = firestoreHost.split(':');
const firebaseModule = `import { initializeApp } from 'firebase/app';
import { initializeFirestore, memoryLocalCache, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
export const firebaseApp = initializeApp({ projectId: '${projectId}', apiKey: 'demo-key', authDomain: '${projectId}.firebaseapp.com' });
export const firestoreCacheRecovery = { usesMemoryCache: () => true };
export const db = initializeFirestore(firebaseApp, { localCache: memoryLocalCache() });
connectFirestoreEmulator(db, '${fsHostName}', ${fsPort});
connectAuthEmulator(getAuth(firebaseApp), 'http://${authHost}', { disableWarnings: true });
`;
process.env.VITE_FEEDBACK_API_URL = API;
const server = await createServer({
  configFile: false, define: { 'process.env': {} }, cacheDir: 'node_modules/.vite-feedback-e2e',
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: WEB_PORT, strictPort: true },
  plugins: [vue(), vuetify({ styles: false }), { name: 'emulator-only', enforce: 'pre', transform(src, id) { return id.replaceAll('\\', '/').split('?')[0].endsWith('/src/plugins/firebase.js') ? firebaseModule : undefined; } }],
});
await server.listen();

const browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const failures = [];
const check = async (name, fn) => { try { await fn(); console.log('PASS', name); } catch (e) { failures.push(name); console.log('FAIL', name, '-', e.message.split('\n')[0]); } };
const shot = (page, name) => (shotsDir ? page.screenshot({ path: `${shotsDir}/${name}.png` }) : null);
async function newPage(viewport) {
  const context = await browser.newContext({ viewport });
  await context.route(/https?:\/\//, (route) => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => console.log('  pageerror:', e.message.slice(0, 200)));
  return { context, page };
}
async function send(page, label, text, email) {
  await page.getByRole('radio', { name: label }).click();
  await page.fill('[data-test="feedback-body"]', text);
  if (email) await page.fill('[data-test="feedback-email"]', email);
  await page.click('[data-test="feedback-submit"]');
  await page.locator('[data-test="feedback-success"]').waitFor();
  return (await page.locator('[data-test="feedback-id"]').innerText()).trim();
}
const ids = {};

await check('Web (390px): Settings link, safe context shown/removable, three messages accepted with ticket numbers', async () => {
  const { context, page } = await newPage({ width: 390, height: 844 });
  await page.goto(`${WEB}/settings`);
  await page.click('[data-test="settings-feedback"]');
  await page.waitForURL(/\/feedback/);
  await page.goto(`${WEB}/feedback?ctx_kind=prayer&ctx_id=ojcha-nash&ctx_title=${encodeURIComponent('Ойча наш')}&token=SECRET`);
  await page.locator('[data-test="feedback-context"]').waitFor();
  assert.match(await page.locator('[data-test="feedback-context"]').innerText(), /Ойча наш/);
  await shot(page, '1-web-form-390');
  ids.text = await send(page, 'Памылка ў тэксце', 'ТЭСТ WEB ТЭКСТ <script>alert(1)</script>');
  await page.goto(`${WEB}/feedback?ctx_kind=prayer&ctx_id=ojcha-nash`);
  await page.click('[data-test="feedback-context-remove"]');
  assert.equal(await page.locator('[data-test="feedback-context"]').count(), 0);
  ids.content = await send(page, 'Прапанова па тэкстах', 'ТЭСТ WEB ПРАПАНОВА');
  await page.goto(`${WEB}/feedback`);
  ids.tech = await send(page, 'Тэхнічная праблема', 'ТЭСТ WEB ТЭХНІКА', 'reader@example.test');
  await shot(page, '2-web-success-390');
  await context.close();
});

await check('Web: error keeps the text, no auto-retry, manual retry creates exactly one item', async () => {
  const { context, page } = await newPage({ width: 390, height: 844 });
  await page.goto(`${WEB}/feedback`);
  let hits = 0;
  await page.route(`${API}/api/feedback`, (r) => { hits += 1; return r.abort(); });
  await page.getByRole('radio', { name: 'Іншае пытанне' }).click();
  await page.fill('[data-test="feedback-body"]', 'ТЭСТ OFFLINE');
  await page.click('[data-test="feedback-submit"]');
  await page.locator('[data-test="feedback-error"]').waitFor();
  await page.waitForTimeout(1500);
  assert.equal(hits, 1, 'no automatic retries');
  assert.equal(await page.inputValue('[data-test="feedback-body"]'), 'ТЭСТ OFFLINE');
  await shot(page, '3-web-error-390');
  await page.unroute(`${API}/api/feedback`);
  await page.click('[data-test="feedback-submit"]');
  await page.locator('[data-test="feedback-success"]').waitFor();
  await context.close();
});

await check('API: anonymous cannot list/read; forged and foreign tokens are 401; non-staff 403', async () => {
  assert.equal((await api('/api/admin/feedback')).status, 401);
  assert.equal((await api('/api/feedback')).status, 405);
  assert.equal((await api('/api/admin/me', { headers: { authorization: 'Bearer aaa.bbb.ccc' } })).status, 401);
  assert.equal((await api('/api/admin/feedback', {}, 'nobody')).status, 403);
  const bad = await fetch(`${API}/api/feedback`, { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(bad.status, 403);
});

let techId; let contentIds;
await check('API (real Firestore rules): admin sees only content items, no email; superadmin sees all', async () => {
  const adminList = await (await api('/api/admin/feedback', {}, 'admin')).json();
  assert.equal(adminList.items.length, 2);
  assert.ok(adminList.items.every((i) => ['text_error', 'content_suggestion'].includes(i.category)));
  const superList = await (await api('/api/admin/feedback', {}, 'super')).json();
  assert.ok(superList.items.length >= 4);
  techId = superList.items.find((i) => i.category === 'technical_bug').id;
  contentIds = adminList.items.map((i) => i.id);
  assert.equal((await api(`/api/admin/feedback/${techId}`, {}, 'admin')).status, 404);
  const full = await (await api(`/api/admin/feedback/${contentIds[0]}`, {}, 'admin')).text();
  assert.ok(!full.includes('reader@example.test') && !full.includes('contactEmail'));
  assert.ok(ids.text && ids.content && ids.tech);
});

async function login(who, target, viewport = { width: 1100, height: 800 }) {
  const { context, page } = await newPage(viewport);
  await page.goto(`${WEB}${target}`);
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', users[who].email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  return { context, page };
}

await check('Admin UI (plain admin): card, only 2 content items, no email/category filter, XSS shown as text', async () => {
  const { context, page } = await login('admin', '/admin/feedback');
  await page.locator('[data-test="fb-list"]').waitFor();
  assert.equal(await page.locator('[data-test="fb-list"] .fb-card').count(), 2);
  assert.equal(await page.locator('[data-test="fb-filter-category"]').count(), 0);
  await page.locator('[data-test="fb-list"] .fb-card', { hasText: 'ТЭСТ WEB ТЭКСТ' }).click();
  await page.locator('[data-test="fb-detail"]').waitFor();
  assert.match(await page.locator('[data-test="fb-body"]').innerText(), /<script>alert\(1\)<\/script>/);
  assert.equal(await page.locator('[data-test="fb-email"]').count(), 0);
  assert.equal(await page.locator('[data-test="fb-category-select"]').count(), 0);
  assert.equal(await page.locator('[data-test="fb-detail"] script').count(), 0);
  await shot(page, '4-admin-inbox');
  await page.goto(`${WEB}/admin`);
  await page.locator('.admin-home__card', { hasText: 'Звароты па тэкстах' }).waitFor();
  assert.equal(await page.locator('.admin-home__card', { hasText: 'Усе звароты' }).count(), 0);
  await context.close();
});

await check('Superadmin UI: all items, email visible, reclassify technical->text and back updates admin ACL at once', async () => {
  const { context, page } = await login('super', '/admin/feedback');
  await page.locator('[data-test="fb-list"]').waitFor();
  assert.ok(await page.locator('[data-test="fb-list"] .fb-card').count() >= 4);
  await page.locator('[data-test="fb-list"] .fb-card', { hasText: 'ТЭСТ WEB ТЭХНІКА' }).click();
  await page.locator('[data-test="fb-email"]').waitFor();
  assert.match(await page.locator('[data-test="fb-email"]').innerText(), /reader@example\.test/);
  await shot(page, '5-superadmin-detail');
  const pick = async (label) => { await page.locator('[data-test="fb-category-select"]').click(); await page.getByRole('option', { name: label }).click(); await page.waitForTimeout(800); };
  await pick('Памылка ў тэксце');
  assert.equal((await api(`/api/admin/feedback/${techId}`, {}, 'admin')).status, 200);
  await pick('Тэхнічная праблема');
  assert.equal((await api(`/api/admin/feedback/${techId}`, {}, 'admin')).status, 404);
  await context.close();
});

await check('Role revoked in Firestore => same still-valid token loses access with no re-login', async () => {
  const del = await fetch(`http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/admins/${users.admin.uid}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  assert.ok(del.ok);
  assert.equal((await api('/api/admin/feedback', {}, 'admin')).status, 403);
});

await browser.close(); await server.close(); stopWorker();
const leaked = fs.readFileSync(logFile, 'utf8');
if (leaked.includes('ТЭСТ WEB') || leaked.includes('reader@example.test')) { failures.push('worker log leaks message text/email'); console.log('FAIL worker log leaks message text/email'); } else console.log('PASS worker log holds no message text or e-mail');
process.exit(failures.length ? 1 : 0);
