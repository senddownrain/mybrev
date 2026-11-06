/**
 * Browser smoke for admin / superadmin roles and the analytics entry.
 * Real Vue app, router, Pinia, Firebase Auth + Firestore SDKs against local emulators only:
 *   firebase emulators:exec --only auth,firestore --project demo-roles "node scripts/smoke-admin-roles-ui.mjs"
 * Optional SHOTS_DIR=<dir> writes screenshots. BENCHMARK_BROWSER_PATH overrides the Chrome binary.
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { chromium } from 'playwright-core';

const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '';
for (const host of [firestoreHost, authHost]) assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/, 'Local emulators required; live requests forbidden');
const projectId = 'demo-roles';
const shotsDir = process.env.SHOTS_DIR;
if (shotsDir) await mkdir(shotsDir, { recursive: true });
const PASSWORD = 'Local-test-password-2345';
const REPORTS_URL = 'https://reports.example.test/reports';

const users = {
  admin: { email: 'plain-admin@example.test', doc: { role: 'admin' } },
  legacy: { email: 'legacy-admin@example.test', doc: { name: 'old format, no role' } },
  super: { email: 'super-admin@example.test', doc: { role: 'superadmin' } },
  nobody: { email: 'nobody@example.test', doc: null },
};
for (const user of Object.values(users)) {
  const res = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: PASSWORD, returnSecureToken: true }),
  });
  const body = await res.json();
  assert.ok(res.ok, `Auth emulator user setup failed: ${body.error?.message}`);
  user.uid = body.localId;
  if (user.doc) {
    const fields = Object.fromEntries(Object.entries({ email: user.email, ...user.doc }).map(([k, v]) => [k, { stringValue: v }]));
    const put = await fetch(`http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/admins/${user.uid}`, {
      method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
    });
    assert.ok(put.ok, await put.text());
  }
}

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

async function startServer(port, reportsUrl) {
  if (reportsUrl) process.env.VITE_ANALYTICS_REPORTS_URL = reportsUrl; else delete process.env.VITE_ANALYTICS_REPORTS_URL;
  const server = await createServer({
    configFile: false,
    define: { 'process.env': {} },
    cacheDir: `node_modules/.vite-admin-roles-${port}`,
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { host: '127.0.0.1', port, strictPort: true },
    plugins: [vue(), vuetify({ styles: false }), {
      name: 'admin-roles-emulator-only',
      enforce: 'pre',
      transform(source, id) {
        const file = id.replaceAll('\\', '/').split('?')[0];
        if (file.endsWith('/src/plugins/firebase.js')) return firebaseModule;
        return undefined;
      },
    }],
  });
  await server.listen();
  return server;
}

const browser = await chromium.launch({
  executablePath: process.env.BENCHMARK_BROWSER_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const failures = [];
const check = async (name, fn) => { try { await fn(); console.log('PASS', name); } catch (e) { failures.push(name); console.log('FAIL', name, '-', e.message.split('\n')[0]); } };

async function session(base, who) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  await context.route(/https?:\/\//, (route) => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => console.log('  pageerror:', e.message.slice(0, 200)));
  const apiCalls = [];
  page.on('request', (r) => { if (/reports\.example\.test/.test(r.url())) apiCalls.push(r.url()); });
  await page.goto(`${base}/admin/analytics`);
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', users[who].email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  return { context, page, apiCalls };
}

async function run(label, reportsUrl, fn) {
  const port = reportsUrl ? 4781 : 4782;
  const server = await startServer(port, reportsUrl);
  try { await fn(`http://127.0.0.1:${port}`); } finally { await server.close(); }
  console.log('--', label, 'done');
}

await run('analytics URL configured', REPORTS_URL, async (base) => {
  await check('plain admin: direct /admin/analytics lands on /admin without the card', async () => {
    const { context, page, apiCalls } = await session(base, 'admin');
    await page.waitForURL(`${base}/admin`);
    await page.waitForSelector('.admin-home__card');
    assert.equal(await page.locator('.admin-home__card', { hasText: 'Аналітыка' }).count(), 0);
    assert.ok(await page.locator('.admin-home__card', { hasText: 'Стварыць спеў' }).count() > 0);
    assert.equal(await page.locator('.admin-home__card', { hasText: 'Доступ для святароў' }).count(), 0);
    assert.deepEqual(apiCalls, []);
    if (shotsDir) await page.screenshot({ path: `${shotsDir}/1-admin-no-analytics-card.png` });
    await page.goto(`${base}/admin/analytics`);
    await page.waitForURL(`${base}/admin`);
    await context.close();
  });
  await check('legacy document without role behaves as admin', async () => {
    const { context, page } = await session(base, 'legacy');
    await page.waitForURL(`${base}/admin`);
    assert.equal(await page.locator('.admin-home__card', { hasText: 'Аналітыка' }).count(), 0);
    await context.close();
  });
  await check('superadmin: card, route, F5, hardened link, no requests to the panel', async () => {
    const { context, page, apiCalls } = await session(base, 'super');
    await page.waitForURL(`${base}/admin/analytics`);
    const link = page.locator('a', { hasText: 'Адкрыць аналітыку' });
    await link.waitFor();
    assert.equal(await link.getAttribute('href'), REPORTS_URL);
    assert.equal(await link.getAttribute('target'), '_blank');
    assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
    assert.equal(await page.locator('iframe').count(), 0);
    if (shotsDir) await page.screenshot({ path: `${shotsDir}/3-superadmin-analytics-link.png` });
    await page.reload();
    await page.locator('a', { hasText: 'Адкрыць аналітыку' }).waitFor();
    assert.equal(page.url(), `${base}/admin/analytics`);
    await page.goto(`${base}/admin`);
    const card = page.locator('.admin-home__card', { hasText: 'Аналітыка' });
    await card.waitFor();
    assert.match(await card.innerText(), /Статыстыка выкарыстання малітоўніка і яго раздзелаў\./);
    assert.ok(await page.locator('.admin-home__card', { hasText: 'Доступ для святароў' }).count() > 0);
    if (shotsDir) await page.screenshot({ path: `${shotsDir}/2-superadmin-analytics-card.png` });
    assert.deepEqual(apiCalls, []);
    await context.close();
  });
  await check('non-admin account is rejected at login and never sees admin', async () => {
    const { context, page } = await session(base, 'nobody');
    await page.waitForSelector('.v-alert');
    assert.match(page.url(), /\/login/);
    assert.equal(await page.locator('.admin-home').count(), 0);
    await context.close();
  });
  await check('anonymous visitor is redirected to login without flashing admin content', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const seen = [];
    await page.exposeFunction('__seen', (t) => seen.push(t));
    await page.addInitScript(() => new globalThis.MutationObserver(() => {
      if (document.querySelector('.admin-analytics, .admin-home')) window.__seen(globalThis.location.pathname);
    }).observe(document, { childList: true, subtree: true }));
    await page.goto(`${base}/admin/analytics`);
    await page.waitForSelector('input[type="email"]');
    assert.match(page.url(), /\/login/);
    assert.deepEqual(seen, []);
    await context.close();
  });
});

await run('analytics URL not configured', '', async (base) => {
  await check('superadmin without VITE_ANALYTICS_REPORTS_URL sees the "not connected" state', async () => {
    const { context, page } = await session(base, 'super');
    await page.waitForURL(`${base}/admin/analytics`);
    await page.getByText('Панэль аналітыкі яшчэ не падключана').waitFor();
    assert.equal(await page.locator('a', { hasText: 'Адкрыць аналітыку' }).count(), 0);
    if (shotsDir) await page.screenshot({ path: `${shotsDir}/4-superadmin-not-connected.png` });
    await context.close();
  });
});

await browser.close();
process.exit(failures.length ? 1 : 0);
