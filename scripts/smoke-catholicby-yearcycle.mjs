// Real reader/list components with local public candidates. No live Firebase.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const reportDir = path.join(root, 'reports/catholicby-yearcycle');
const plan = JSON.parse(await fs.readFile(path.join(reportDir, 'import-plan.json'), 'utf8'));
const fixture = { prayers: plan.entries.filter((e) => e.candidate && e.status !== 'skipped-reference').map((e) => e.candidate), categories: [plan.category.candidate] };
const service = `import {fixture} from '/__yearcycle-fixture.mjs';export async function getSavedPrayers(){return fixture.prayers}export async function getSavedPrayerCategories(){return fixture.categories}export const subscribePrayers=()=>()=>{};export const subscribePrayerCategories=()=>()=>{};export const addPrayer=()=>{throw Error('No writes')};export const updatePrayer=addPrayer;export const deletePrayer=addPrayer;export const createPrayerCategory=addPrayer;export const deletePrayerCategory=addPrayer;export const restoreDefaultPrayerCategories=addPrayer;export const deletePrayerTagEverywhere=addPrayer;`;
const server = await createServer({ root, configFile: false, resolve: { alias: { '@': path.join(root, 'src') } },
  optimizeDeps: { noDiscovery: true, entries: [], include: ['vue', 'pinia', 'vue-router', 'vuetify', 'vuetify/components', 'markdown-it', '@phosphor-icons/vue', 'turndown'] },
  server: { host: '127.0.0.1', port: 5187, strictPort: true },
  plugins: [vue(), vuetify({ styles: false }), {
    name: 'yearcycle-local-fixture', enforce: 'pre',
    resolveId(id) { if (id === '/__yearcycle-fixture.mjs') return '\0yearcycle-fixture'; },
    load(id) { if (id === '\0yearcycle-fixture') return `export const fixture=${JSON.stringify(fixture)};`; },
    configureServer(vite) { vite.middlewares.use((req, res, next) => {
      if (req.url.startsWith('/__yearcycle-fixture.mjs')) { res.setHeader('Content-Type', 'text/javascript'); res.end(`export const fixture=${JSON.stringify(fixture)};`); return; }
      if (req.url === '/__yearcycle') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="be"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div><script type="module" src="/tests/ui/yearcycle-harness.mjs"></script></body></html>'); return; }
      next();
    }); },
    transform(_source, id) {
      const file = id.replaceAll('\\', '/').split('?')[0];
      if (file.endsWith('/src/services/prayerService.js') || file.endsWith('/src/services/prayerCategoryService.js')) return service;
      if (file.endsWith('/src/stores/auth.js')) return `import{defineStore}from'pinia';export const useAuthStore=defineStore('auth',()=>({isAdmin:false}));`;
      if (file.endsWith('/src/services/priestAccessService.js')) return `import{reactive}from'vue';export const priestAccess=reactive({active:false,revision:0});`;
    },
  }] });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const external = [], errors = [], results = [];
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    external.push(url.hostname); return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:5187/__yearcycle', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.getByRole('button', { name: 'Набажэнствы', exact: true }).click();
  await page.locator('.prayers-page-title').filter({ hasText: 'Набажэнствы' }).waitFor();
  assert.equal(await page.locator('.prayer-list-item').count(), 36);
  const ids = ['catholicby-yearcycle-100113', 'catholicby-yearcycle-129467', 'catholicby-yearcycle-100116',
    'mybrev-devotion-office-for-dead-laudes', 'mybrev-devotion-office-for-dead-vesper',
    'mybrev-devotion-blessed-virgin-mary-laudes', 'mybrev-devotion-blessed-virgin-mary-vesper'];
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const id of ids) {
      await page.evaluate(async (id) => { await window.__yearcycleUi.router.push(`/prayer/${id}`); }, id);
      await page.locator('.prayer-text').waitFor();
      const title = fixture.prayers.find((p) => p.id === id).title;
      await page.getByRole('heading', { level: 1, name: title, exact: true }).waitFor();
      const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        height: document.querySelector('.prayer-text').getBoundingClientRect().height,
        headings: document.querySelectorAll('.prayer-text h2').length,
        source: Boolean(document.querySelector('.prayer-source')),
        text: document.querySelector('.prayer-text').textContent }));
      assert.equal(layout.overflow, false, `${width}px: ${id} overflow`);
      assert.ok(layout.height > 600);
      assert.ok(layout.headings >= 8);
      assert.equal(layout.source, true);
      assert.doesNotMatch(layout.text, /SENTINEL|from-first-week|data-alternative-title/);
      if (id === 'catholicby-yearcycle-100116') assert.equal(layout.headings, 8);
      if (id.startsWith('mybrev-')) assert.match(layout.text, /Ойча наш, каторы ёсць у небе/);
      results.push({ width, id, overflow: layout.overflow, headings: layout.headings });
      if (['catholicby-yearcycle-100113', 'catholicby-yearcycle-100116', 'mybrev-devotion-blessed-virgin-mary-laudes'].includes(id)) {
        await page.screenshot({ path: path.join(reportDir, `reader-${width}-${id}.png`), fullPage: false });
      }
    }
    await page.getByRole('button', { name: 'Павялічыць тэкст' }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
    await page.screenshot({ path: path.join(reportDir, `reader-${width}.png`), fullPage: false });
    await page.evaluate(() => document.documentElement.style.setProperty('--font-size-multiplier', '1'));
  }
  await fs.writeFile(path.join(reportDir, 'ui-checks.json'), JSON.stringify({ mode: 'local-fixtures-real-vue-components', errors, externalRequestsBlocked: external, results }, null, 2));
  assert.deepEqual(errors, []);
  assert.ok(!external.some((host) => /firebase|^(?:firestore|identitytoolkit|securetoken)\.googleapis\.com$/.test(host)), 'No live Firebase requests');
  console.log(`PASS: list/category, seven long texts at 390/1280px, source footer, enlarged text; no live Firebase.`);
  await context.close();
} finally { await browser?.close(); await server.close(); }
