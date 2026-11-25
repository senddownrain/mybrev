import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { buildPublicPrayerCatalog } from '../src/utils/publicPrayerCatalog.mjs';

const publicCatalog = buildPublicPrayerCatalog({
  prayers: [{ id: 'public-prayer', title: 'Synthetic public title', text: 'Synthetic public body', categoryId: 'public-category' }],
  categories: [{ id: 'public-category', name: 'Synthetic public category' }],
});
const outDir = await mkdtemp(join(tmpdir(), 'mybrev-s4-browser-'));
let server;
let browser;
let page;
const errors = [];
const pendingRequests = new Set();
try {
  await build({
    configFile: false, publicDir: false, logLevel: 'warn',
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    build: {
      outDir, minify: false,
      lib: { entry: fileURLToPath(new URL('../tests/ui/access-sets-catalog-harness.mjs', import.meta.url)),
        formats: ['es'], fileName: () => 'catalog.js', cssFileName: 'catalog' },
    },
    plugins: [vue(), vuetify({ styles: false }), {
      name: 's4-synthetic-catalog', enforce: 'pre',
      transform(source, id) {
        const file = id.replaceAll('\\', '/').split('?')[0];
        if (file.endsWith('/src/plugins/firebase.js')) return 'export const firebaseApp = null; export const db = null;';
        if (file.endsWith('/src/stores/auth.js')) return 'export const useAuthStore = () => ({ isAdmin: false });';
      },
    }],
  });
  const output = new Map(await Promise.all((await readdir(outDir)).map(async (name) => [`/${name}`, await readFile(join(outDir, name))])));
  output.set('/public-prayers-v1.json', JSON.stringify(publicCatalog));
  output.set('/', '<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/catalog.css"><div id="app"></div><script type="module" src="/catalog.js"></script>');
  server = createServer((request, response) => {
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    const content = output.get(path);
    if (!content) return response.writeHead(204).end();
    const type = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css'
      : path.endsWith('.json') ? 'application/json' : 'text/html';
    response.writeHead(200, { 'Content-Type': type }).end(content);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({
    executablePath: process.env.BENCHMARK_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route(/https?:\/\//, (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => pendingRequests.add(request.url()));
  page.on('requestfinished', (request) => pendingRequests.delete(request.url()));
  page.on('requestfailed', (request) => pendingRequests.delete(request.url()));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  const go = (to) => page.evaluate((target) => window.catalogHarness.go(target), to);
  const privateTitle = page.getByText('Synthetic private title', { exact: true });
  const publicTitle = page.getByText('Synthetic public title', { exact: true });
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'commit', timeout: 60_000 });
  await privateTitle.waitFor({ timeout: 120_000 });
  await publicTitle.waitFor();
  const search = page.getByRole('searchbox');
  await search.fill('Synthetic private body');
  await publicTitle.waitFor({ state: 'hidden' });
  await privateTitle.waitFor();
  await page.locator('#prayer-row-private-prayer').getByRole('button', { name: 'Дадаць у абраныя' }).click();
  await search.fill('');

  await go('/?category=public-category');
  await page.getByRole('link', { name: 'Synthetic private category' }).click();
  await page.getByRole('heading', { name: 'Synthetic private category' }).waitFor();
  assert.equal((await page.title()).includes('Synthetic private category'), false);
  await privateTitle.waitFor();
  await go('/favorites');
  await privateTitle.waitFor();

  await go('/prayers/direct-only');
  await page.getByText('Synthetic direct body', { exact: true }).waitFor();
  assert.equal((await page.locator('[data-test="prayer-report-error"]').getAttribute('href')).includes('ctx_'), false);
  await mkdir('reports/access-sets-v2-s4', { recursive: true });
  await page.screenshot({ path: 'reports/access-sets-v2-s4/reader-mobile.png' });

  const saved = await page.evaluate(async () => {
    const entries = [JSON.stringify(localStorage), JSON.stringify(sessionStorage)];
    for (const { name } of await indexedDB.databases()) {
      const open = indexedDB.open(name);
      const database = await new Promise((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = reject; });
      for (const store of database.objectStoreNames) {
        const request = database.transaction(store).objectStore(store).getAll();
        const rows = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = reject; });
        entries.push(JSON.stringify(rows));
      }
      database.close();
    }
    return entries.join('\n');
  });
  assert.match(saved, /Synthetic public body/);
  assert.doesNotMatch(saved, /Synthetic (private|direct)|private-prayer|private-category|direct-only/);

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByText('Synthetic direct body', { exact: true }).waitFor({ state: 'hidden' });
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByText('Synthetic direct body', { exact: true }).waitFor();
  await page.evaluate(() => window.catalogHarness.revoke());
  await page.getByText('Synthetic direct body', { exact: true }).waitFor({ state: 'hidden' });
  await go('/favorites');
  await page.getByRole('heading', { name: 'Няма абраных малітваў' }).waitFor();
  await go('/');
  await publicTitle.waitFor();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await publicTitle.waitFor();
  assert.equal(await privateTitle.count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS S4 Chromium: search, category tree, session favorites, direct reader, background, revoke, public offline, and storage scan.');
} catch (error) {
  console.error('Browser errors:', errors);
  console.error('Pending fixture requests:', [...pendingRequests].slice(0, 20));
  if (page) console.error('Visible fixture text:', (await page.locator('body').innerText()).slice(0, 1000));
  throw error;
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(outDir, { recursive: true, force: true });
}
