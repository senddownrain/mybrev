import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
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
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    build: {
      outDir, minify: false, emptyOutDir: false,
      lib: { entry: fileURLToPath(new URL('../tests/ui/access-sets-catalog-harness.mjs', import.meta.url)),
        formats: ['es'], fileName: () => 'catalog.js', cssFileName: 'catalog' },
    },
    plugins: [vue({ template: { transformAssetUrls: false } }), vuetify({ styles: false }), {
      name: 's4-synthetic-catalog', enforce: 'pre',
      transform(source, id) {
        const file = id.replaceAll('\\', '/').split('?')[0];
        if (file.endsWith('/src/plugins/firebase.js')) return 'export const firebaseApp = null; export const db = null;';
        if (file.endsWith('/src/stores/auth.js')) return "import { reactive } from 'vue'; export const authFixture = reactive({ isAdmin: false, init: async () => {} }); export const useAuthStore = () => authFixture;";
        if (file.endsWith('/src/services/prayerStorageService.js')) return source.replace(
          /export async function readAdminPrayerContent\(\) \{[\s\S]*?\n\}/,
          'export async function readAdminPrayerContent() { return window.catalogHarness.adminContent(); }',
        );
        if (file.endsWith('/src/components/admin/accessSets/client.js')) return "export const createAccessAdminClient = () => ({list: async () => ({rows: window.catalogHarness.sets})});";
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
  const menu = () => page.evaluate(() => window.catalogHarness.openMenu());
  const closeMenu = () => page.evaluate(() => window.catalogHarness.closeMenu());
  const rights = (sets) => page.evaluate((allowed) => window.catalogHarness.confirm(allowed), sets);
  const counts = () => page.evaluate(() => window.catalogHarness.counts());
  const drawer = page.locator('.app-drawer');
  const category = (name) => drawer.getByRole('link', { name, exact: true });

  await page.goto('http://127.0.0.1:' + server.address().port + '/#/home', { waitUntil: 'commit', timeout: 60_000 });
  await page.getByText('Synthetic home').waitFor({ timeout: 120_000 });
  assert.deepEqual(await counts(), { confirm: 0, list: 0, get: 0 });
  await menu();
  await category('Synthetic public category').waitFor();
  assert.equal(await drawer.getByRole('link', { name: /^(marian|priest|another) category/ }).count(), 0);
  assert.equal((await counts()).list, 0);

  // Activation changes the active generation while the menu is already open.
  await rights(['marian']);
  await category('marian category 10').waitFor();
  assert.equal(await drawer.getByRole('link', { name: /^marian category/ }).count(), 11);
  assert.equal(await drawer.getByRole('link', { name: /^(priest|another) category/ }).count(), 0);
  const warm = await counts();
  await closeMenu();
  await menu();
  await category('marian category 1').waitFor();
  assert.deepEqual(await counts(), warm);
  await category('marian category 1').click();
  await page.getByRole('heading', { name: 'marian category 1' }).waitFor();
  await page.getByText('marian prayer 1', { exact: true }).click();
  await page.getByText('marian synthetic prayer text 1', { exact: true }).waitFor();
  await go('/');
  await page.waitForFunction(() => document.querySelectorAll('[id^="prayer-row-marian-prayer-"]').length === 56);

  // A prior priest grant projects the same priest set without another code.
  await go('/home');
  await menu();
  await rights(['priest']);
  await category('priest category 7').waitFor();
  assert.equal(await drawer.getByRole('link', { name: /^priest category/ }).count(), 8);
  assert.equal(await drawer.getByRole('link', { name: /^marian category/ }).count(), 0);
  await rights(['marian', 'priest']);
  await category('marian category 10').waitFor();
  await category('priest category 7').waitFor();
  assert.equal(await drawer.getByRole('link', { name: /^another category/ }).count(), 0);
  await rights([]);
  await category('priest category 0').waitFor({ state: 'hidden' });
  assert.equal(await drawer.getByRole('link', { name: /^marian category/ }).count(), 0);
  await closeMenu();

  // An editor without any device access gets a separate, complete snapshot.
  await page.evaluate(() => window.catalogHarness.editor());
  await page.setViewportSize({ width: 1200, height: 900 });
  await go('/admin/prayers');
  await page.waitForFunction(() => document.querySelectorAll('[id^="prayer-row-"]').length === 104);
  await page.locator('[data-test="prayer-access-filter"]').click();
  await page.getByRole('option', { name: 'Айцы марыяне' }).click();
  await page.waitForFunction(() => document.querySelectorAll('[id^="prayer-row-"]').length === 56);
  await page.locator('#prayer-row-marian-prayer-1').getByRole('button', { name: 'Рэдагаваць малітву' }).click();
  await page.getByRole('heading', { name: 'Доступ', exact: true }).waitFor();
  await page.getByText('Выніковы доступ:', { exact: true }).waitFor();

  await go('/admin/categories');
  await page.getByRole('heading', { name: 'priest category 7', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'marian category 10', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Рэдагаваць катэгорыю marian category 1' }).click();
  const form = page.getByRole('dialog');
  await form.getByText('Выніковы доступ:', { exact: true }).waitFor();
  assert.ok((await form.getByText('Выніковы доступ:', { exact: true }).locator('..').innerText()).includes('Айцы марыяне'));
  const { width } = await form.locator('.dialog-card').boundingBox();
  assert.ok(width >= 900 && width <= 970);
  assert.ok(await form.getByRole('button', { name: 'Захаваць' }).isVisible());
  await form.getByRole('button', { name: 'Выбраць малітвы' }).click();
  const picker = page.getByRole('dialog').last();
  await picker.getByRole('textbox', { name: 'Пошук малітваў па назве' }).fill('marian prayer 55');
  await picker.getByLabel('marian prayer 55', { exact: true }).waitFor();
  await picker.getByRole('button', { name: 'Скасаваць', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForFunction(() => {
    const grid = document.querySelector('.category-dialog-grid');
    return grid && globalThis.getComputedStyle(grid).gridTemplateColumns.split(' ').length === 1;
  });
  await form.getByRole('button', { name: 'Скасаваць', exact: true }).click();

  const saved = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]));
  assert.doesNotMatch(saved, /(?:marian|priest) synthetic prayer text|marian-category-/);
  assert.deepEqual(errors, []);
  console.log('PASS Chromium: drawer identity changes and cache reuse, navigation to prayers, combined and revoked access, independent admin catalog, filter, prayer editor, category layout and picker.');
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
