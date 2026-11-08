/** Real Vue/Quill/public service/cache/reader, local persistence double only.
 * No production writes. Run: node scripts/smoke-day-editor-persistence.mjs
 * BENCHMARK_BROWSER_PATH can override /usr/bin/chromium.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { chromium } from 'playwright-core';
import { fixture, properPath, legacyPath } from '../tests/helpers/day-editor-fixture.mjs';

const documents = structuredClone(fixture.documents);
const commits = [];
let failCommit = false;
let failReadback = false;
const errors = [];
let lastPage;
const root = fileURLToPath(new URL('..', import.meta.url));
const html = '<html><body><div id="app"></div><script type="module" src="/__editor_test_main.js"></script></body></html>';
const main = `
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import { createVuetify } from 'vuetify';
import { VApp, VMain } from 'vuetify/components';
import 'vuetify/styles';
import DayEditor from '/src/views/admin/DayEditor.vue';
import Vesper from '/src/components/oras/Vesper.vue';
import { useNotifier } from '/src/composables/useNotifier.js';
const router = createRouter({ history: createWebHistory(), routes: [
 { path: '/admin/day/:id', name: 'AdminDayEditor', component: DayEditor },
 { path: '/day/:day/ora/:id/vesper', component: Vesper },
] });
window.testRouter = router;
const app = createApp({ setup() { return useNotifier(); }, template: '<v-app><v-main><router-view /></v-main><div data-test="notification" :data-color="snackbar.color">{{ snackbar.text }}</div></v-app>' });
app.use(createPinia()).use(router).use(createVuetify({ components: { VApp, VMain } })).mount('#app');
`;
const server = await createServer({
  root, configFile: false, cacheDir: 'node_modules/.vite-day-editor-test', define: { 'process.env': {} },
  optimizeDeps: { entries: [], noDiscovery: true, include: ['vue', 'vue-router', 'pinia', 'vuetify', 'vuetify/components', '@vueup/vue-quill', 'node-html-parser', 'moment', '@sentry/vue', 'date-fns', 'date-fns/locale', 'markdown-it', 'turndown'] },
  resolve: { dedupe: ['vue', 'pinia'], alias: { '@': `${root}/src`, 'firebase/firestore': `${root}/tests/helpers/day-editor-firestore-double.mjs`, vue: 'vue/dist/vue.esm-bundler.js' } },
  server: { host: '127.0.0.1', port: 0 },
  plugins: [vue(), vuetify({ styles: false }), {
    name: 'local-editor-persistence-test', enforce: 'pre',
    resolveId(id) { if (id === '/__editor_test_main.js') return '\0editor-test-main'; },
    load(id) { if (id === '\0editor-test-main') return main; },
    transform(_source, id) {
      if (id.split('?')[0].endsWith('/src/plugins/firebase.js')) return 'export const db = {}; export const firestoreCacheRecovery = { recover: () => {} };';
    },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/admin/day/') || req.url?.startsWith('/day/')) { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
        if (req.url !== '/__editor_test_db') return next();
        let raw = ''; for await (const part of req) raw += part;
        const body = JSON.parse(raw);
        let result = null;
        res.setHeader('Content-Type', 'application/json');
        if (body.op === 'get') {
          result = documents[body.path] || null;
          if (failReadback && commits.length && body.path === properPath) result = { ...result, vesperInter: 'mismatching server readback' };
        } else if (body.op === 'query') {
          result = Object.entries(documents).filter(([path, data]) => path.startsWith(`${body.path}/`)
            && (body.filters || []).every((f) => f.op === '==' && data[f.field] === f.value));
        } else if (body.op === 'commit') {
          if (failCommit) { res.statusCode = 500; res.end(JSON.stringify({ error: 'local commit rejected' })); return; }
          commits.push(body.writes);
          for (const write of body.writes) {
            const data = { ...documents[write.path] };
            for (const [field, value] of Object.entries(write.payload)) {
              if (value?.__delete) delete data[field]; else data[field] = value;
            }
            documents[write.path] = data;
          }
          result = { ok: true };
        }
        res.end(JSON.stringify(result));
      });
    },
  }],
});
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const adminUrl = `${base}/admin/day/${fixture.dayId}?date=${fixture.date}`;
const publicUrl = `${base}/day/${fixture.date}/ora/${fixture.dayId}/vesper`;
async function session() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route(/https?:\/\//, (route) => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const page = await context.newPage();
  lastPage = page;
  page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGE ERROR', e.stack); });
  page.on('console', (message) => { if (message.type() === 'error') console.log('BROWSER ERROR', message.text()); });
  page.setDefaultTimeout(20000);
  return { context, page };
}
async function navigate(page, path) { await page.evaluate((path) => window.testRouter.push(path), path); }
async function intercessionsCard(page) {
  await page.getByRole('button', { name: 'Нешпары', exact: true }).click();
  const card = page.locator('.v-card').filter({ has: page.locator('.v-toolbar-title', { hasText: 'Просьбы' }) });
  await card.waitFor();
  return card;
}
try {
  const { context, page } = await session();
  await page.goto(publicUrl);
  await page.waitForFunction(() => document.querySelector('.intercessions')?.textContent.includes('хторупліва'));
  console.log('PASS production-shaped fixture reproduces public typo before edits (fresh browser)');
  await navigate(page, `/admin/day/${fixture.dayId}?date=${fixture.date}`);
  await page.getByText(properPath, { exact: true }).waitFor();
  const card = await intercessionsCard(page);
  assert.match(await card.innerText(), /liturgicalTemplates\/apostles/);
  assert.match(await card.innerText(), /хторупліва/);
  await card.getByRole('button', { name: 'Рэдагаваць', exact: true }).click();
  await card.locator('.ql-editor').waitFor();
  await card.locator('.ql-editor').evaluate((el) => {
    const quill = el.parentElement.__quill;
    const at = quill.getText().indexOf('хторупліва');
    if (at < 0) throw new Error('Quill did not load inherited text');
    quill.insertText(at + 3, ' ', 'user');
  });
  await card.getByRole('button', { name: 'Захаваць поле' }).press('Enter');
  assert.match(await card.innerText(), /хто рупліва/);
  assert.equal(documents[properPath].vesperInter, undefined, 'Save field only stages the form');
  await page.getByRole('button', { name: 'Захаваць усё' }).click();
  await page.locator('[data-test="notification"][data-color="success"]').waitFor();
  assert.equal(commits.length, 1);
  assert.equal(commits[0].length, 1);
  assert.equal(commits[0][0].path, properPath);
  assert.deepEqual(Object.keys(commits[0][0].payload), ['vesperInter']);
  const saved = documents[properPath].vesperInter;
  assert.match(saved, /хто рупліва/);
  assert.deepEqual(documents[legacyPath], fixture.documents[legacyPath]);
  console.log('PASS Quill → save field → form → save all → exact Proper field payload → confirmed readback');
  await navigate(page, `/day/${fixture.date}/ora/${fixture.dayId}/vesper`);
  await page.waitForFunction(() => document.querySelector('.intercessions')?.textContent.includes('хто рупліва'));
  console.log('PASS public Vesper refreshes an existing stale cached day after save');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.intercessions')?.textContent.includes('хто рупліва'));
  await page.goto(adminUrl);
  const reopened = await intercessionsCard(page);
  assert.match(await reopened.innerText(), /хто рупліва/);
  console.log('PASS browser reload and editor reopen retain the saved space');
  const fresh = await session();
  await fresh.page.goto(publicUrl);
  await fresh.page.waitForFunction(() => document.querySelector('.intercessions')?.textContent.includes('хто рупліва'));
  await fresh.context.close();
  console.log('PASS new browser session displays saved value');
  await reopened.getByRole('button', { name: 'Рэдагаваць', exact: true }).click();
  await reopened.locator('.ql-editor').fill('Тэст памылкі захавання');
  await reopened.getByRole('button', { name: 'Захаваць поле' }).press('Enter');
  failCommit = true;
  await page.getByRole('button', { name: 'Захаваць усё' }).click();
  await page.locator('[data-test="notification"][data-color="error"]').waitFor();
  assert.equal(documents[properPath].vesperInter, saved);
  assert.equal(commits.length, 1);
  console.log('PASS rejected commit shows error and preserves persisted text');
  failCommit = false; failReadback = true;
  await page.getByRole('button', { name: 'Захаваць усё' }).click();
  await page.waitForFunction(() => document.querySelector('[data-test="notification"]')?.textContent.includes('Не пацверджана'));
  console.log('PASS mismatching server readback prevents success confirmation');
  assert.deepEqual(errors, []);
  await context.close();
} catch (error) {
  console.log('FAIL DOM', (await lastPage?.locator('body').innerText().catch(() => 'unavailable'))?.slice(-6000));
  throw error;
} finally {
  await browser.close();
  await server.close();
}
