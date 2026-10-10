/** Real Vue components, isolated test auth/stores and local service; no live reads. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createPriestService } from '../functions/lib/priest-service.mjs';
import { createPriestHandler } from '../functions/lib/priest-http.mjs';
import { memoryPriestDb } from '../tests/helpers/priest-db.mjs';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';

const db = memoryPriestDb();
const service = createPriestService(db);
const initial = await service.replaceCode({ generate: true }, 'test-admin');
const granted = await service.activate({ code: initial.code, installationId: randomUUID(), client: 'Flutter', deviceName: 'Samsung Galaxy S23', label: 'а. Яўгеній' }, 'test');
const fakeModules = {
  '/src/stores/auth.js': `import { defineStore } from 'pinia'; export const useAuthStore = defineStore('auth', () => ({ isAdmin: true, canManagePriestAccess: true, loading: false, init: async () => {} }));`,
  '/src/stores/prayers.js': `import { defineStore } from 'pinia'; import { ref } from 'vue'; import { prayers } from '/tests/ui/priest-fixtures.mjs'; export const usePrayersStore = defineStore('prayers', () => ({ prayers, allTags: ref(['public','closed']), isLoading: ref(false), error: ref(null), init() {}, getTitle: p => p.title, getText: p => p.text, async addPrayer(p) { return {id: 'copy'}; }, async updatePrayer(id, p) { prayers.value = prayers.value.map(x => x.id === id ? {...x,...p} : x); } }));`,
  '/src/stores/prayerCategories.js': `import { defineStore } from 'pinia'; import { ref } from 'vue'; import { categories } from '/tests/ui/priest-fixtures.mjs'; export const usePrayerCategoriesStore = defineStore('prayerCategories', () => ({ categories, isLoading: ref(false), error: ref(null), init() {}, cleanup() {}, async addCategory(c) { categories.value.push({...c,id:'created'}); }, async removeCategory(id) { categories.value=categories.value.filter(c=>c.id!==id); } }));`,
  '/src/services/prayerCategoryService.js': `export { updateCategory as updatePrayerCategory } from '/tests/ui/priest-fixtures.mjs';`,
};
const server = await createServer({
  configFile: false,
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  optimizeDeps: { noDiscovery: true, entries: [], include: ['vue', 'pinia', 'vue-router', 'vuetify', 'vuetify/components', 'markdown-it'] },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  plugins: [vue(), vuetify({ styles: false }), { name: 'priest-ui-test-only', enforce: 'pre', configureServer(server) { server.middlewares.use(localMiddleware); }, transform(source, id) {
    const file = id.replaceAll('\\', '/').split('?')[0];
    const key = Object.keys(fakeModules).find((k) => file.endsWith(k));
    if (key) return fakeModules[key];
    if (file.endsWith('/src/services/priestAccessService.js')) return source.replace(/if \(admin\) \{[\s\S]*?\n {2}\}/, `if (admin) headers.Authorization = 'Bearer test-admin';`);
  } }],
});
const handler = createPriestHandler(service, { origins: ['http://127.0.0.1:5173'], verifyAdmin: async (token) => { assert.equal(token, 'test-admin'); return 'test-admin'; }, insecureCookie: true });
async function localMiddleware(req, res, next) {
  if (req.url.startsWith('/__priest_ui')) {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Priest UI local test</title></head><body><div id="app"></div><script type="module" src="/tests/ui/priest-harness.mjs"></script></body></html>');
    return;
  }
  if (!req.url.startsWith('/api/priest/')) return next();
  const url = new URL(req.url, 'http://localhost');
  req.path = url.pathname;
  req.query = Object.fromEntries(url.searchParams);
  req.get = (key) => req.headers[key.toLowerCase()];
  req.is = () => req.headers['content-type']?.startsWith('application/json');
  req.ip = 'test-ui';
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  req.body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
  res.set = (k, v) => { res.setHeader(k, v); return res; };
  res.status = (n) => { res.statusCode = n; return res; };
  res.json = (value) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
  res.send = (value) => res.end(value);
  await handler(req, res);
}
await server.listen();
console.log('Local isolated UI server ready.');
const browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.route(/https?:\/\/(?!127\.0\.0\.1:5173)/, (route) => route.abort());
const page = await context.newPage();
page.setDefaultTimeout(90000);
const failures = [];
const pendingRequests = new Set();
page.on('request', (request) => pendingRequests.add(new URL(request.url()).pathname));
page.on('requestfinished', (request) => pendingRequests.delete(new URL(request.url()).pathname));
page.on('pageerror', (e) => { failures.push(e.message); console.log(`UI runtime error: ${e.stack}`); });
page.on('console', (message) => { if (message.type() === 'error') console.log(`UI console: ${message.text().slice(0, 600)}`); });
page.on('response', (response) => { if (response.status() >= 400) console.log(`UI HTTP ${response.status()}: ${new URL(response.url()).pathname}`); });
page.on('requestfailed', (request) => console.log(`UI request failed: ${new URL(request.url()).pathname} ${request.failure()?.errorText}`));
await mkdir('reports/priest-access', { recursive: true });
try {
  await page.goto('http://127.0.0.1:5173/__priest_ui', { waitUntil: 'commit', timeout: 120000 });
  await page.getByRole('heading', { name: 'Доступ для святароў', exact: true }).waitFor();
  await page.getByText('Samsung Galaxy S23', { exact: true }).waitFor();
  console.log('Admin rendered; checking controls and screenshots.');
  await page.screenshot({ path: 'reports/priest-access/admin-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Згенераваць новы код' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Новы код будзе выкарыстоўвацца', { exact: false }).waitFor();
  await dialog.getByRole('button', { name: 'Змяніць код', exact: true }).click();
  await page.locator('.new-code').waitFor();
  assert.equal((await service.listDevices()).devices[0].status, 'active');
  const currentCode = await page.locator('.new-code').innerText();
  await page.getByRole('button', { name: 'Схаваць', exact: true }).click();
  await page.getByLabel('Подпіс', { exact: true }).fill('а. Андрэй');
  await page.getByRole('button', { name: 'Захаваць подпіс', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('button.v-btn--loading'));
  assert.equal((await service.listDevices()).devices[0].label, 'а. Андрэй');
  await page.getByRole('button', { name: 'Адклікаць доступ', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Адклікаць', exact: true }).click();
  await page.getByText('Статус: Адкліканы', { exact: true }).waitFor();
  await page.locator('.v-overlay__scrim:visible').waitFor({ state: 'hidden' });
  assert.equal(db.rows.get(`priestDeviceGrants/${granted.device.id}`).status, 'revoked');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'reports/priest-access/admin-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'admin fits mobile viewport');
  await page.evaluate(() => window.__priestUi.router.push('/categories'));
  await page.getByRole('heading', { name: 'Катэгорыі і тэгі', exact: true }).waitFor();
  assert.equal(await page.locator('.category-item .mdi-key').count(), 2);
  await page.getByLabel('Рэдагаваць катэгорыю Публічная катэгорыя').click();
  await page.getByRole('dialog').getByLabel('Толькі для святароў', { exact: true }).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Захаваць', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.category-item .mdi-key').count(), 3);
  await page.screenshot({ path: 'reports/priest-access/categories-mobile.png', fullPage: true });
  await page.evaluate(() => window.__priestUi.router.push('/prayer/edit/public'));
  await page.getByRole('heading', { name: 'Рэдагаванне малітвы', exact: true }).waitFor();
  await page.getByLabel('Толькі для святароў', { exact: true }).check();
  await page.getByRole('button', { name: 'Захаваць змены', exact: true }).click();
  await page.getByRole('heading', { name: 'Доступ для святароў', exact: true }).waitFor();
  await page.getByLabel('Код актывацыі', { exact: true }).fill(currentCode);
  await page.getByLabel('Назва прылады / імя', { exact: true }).fill('Тэставая вэб-прылада');
  await page.getByRole('button', { name: 'Адкрыць доступ', exact: true }).click();
  await page.getByText('Доступ актываваны', { exact: false }).waitFor();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Доступ актываваны', { exact: false }).waitFor();
  await page.screenshot({ path: 'reports/priest-access/settings-active.png', fullPage: true });
  assert.ok((await context.cookies()).find((c) => c.name === '__session').httpOnly);
  await page.getByRole('button', { name: 'Выключыць доступ', exact: true }).click();
  await page.getByRole('button', { name: 'Адкрыць доступ', exact: true }).waitFor();
  assert.equal((await context.cookies()).filter((c) => c.name === '__session').length, 0);
  assert.deepEqual(failures, []);
  console.log('Priest UI passed: desktop/mobile admin, code confirmation, rotation preserves grant, labels, revoke, inherited keys, category/prayer switches, activation/reload/disable, HttpOnly cookie. Synthetic local fixtures only.');
} catch (error) {
  console.log('Pending local asset paths:', [...pendingRequests]);
  console.log('Visible headings at failure:', await page.locator('h1,h2').allTextContents());
  await page.screenshot({ path: 'reports/priest-access/ui-failure.png', timeout: 10000 }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
