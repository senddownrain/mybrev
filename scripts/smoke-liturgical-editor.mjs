/** Real DayEditor + Quill with a local document transport. No Firebase connection.
 * Optional EDITOR_SNAPSHOT_DIR supplies the four targeted read-only diagnostic files.
 * BENCHMARK_BROWSER_PATH=/usr/bin/chromium node scripts/smoke-liturgical-editor.mjs
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { chromium } from 'playwright-core';
const id = '28-10-sv-simon-jude-apostles';
const wrong = '<p>Молімся:</p><p><em>Пачуй нас</em></p><p>дай усім, хторупліва сее слова</p>';
const seed = {
  [`days/${id}`]: { id, _date: '28.10', vesperInter: wrong.replace('хторупліва', 'хто рупліва') },
  [`liturgicalProperTexts/${id}`]: { id, _schema: 2, _date: '28.10', _rank: 'festum', _celebrationId: 'sv-simon-jude-apostles', _templates: ['apostles'], _defaultTemplate: 'apostles' },
  'liturgicalTemplates/apostles': { id: 'apostles', vesperInter: wrong },
  'days/ordinary-w30-d4': { id: 'ordinary-w30-d4', _periodType: 'ordinary', _periodWeekNumber: '30', _dayOfWeek: '4' },
};
if (process.env.EDITOR_SNAPSHOT_DIR) {
  for (const path of Object.keys(seed)) seed[path] = JSON.parse(await readFile(`${process.env.EDITOR_SNAPSHOT_DIR}/${path.replace('/', '__')}.json`, 'utf8'));
}
const transport = `
const initial = ${JSON.stringify(seed)};
const key = 'editor-smoke-documents';
export const documents = () => JSON.parse(localStorage.getItem(key) || JSON.stringify(initial));
export const db = {};
export const collection = (_db, name) => name;
export const doc = (_db, name, id) => id ? name + '/' + id : _db + '/new-local';
const snapshot = (path) => ({ id: path.split('/')[1], exists: () => Boolean(documents()[path]), data: () => documents()[path] });
export const getDoc = async (path) => snapshot(path);
export const getDocFromServer = async (path) => { window.__reads.push(path); return snapshot(path); };
export const getDocs = async () => ({ docs: [] });
export const deleteField = () => '__delete__';
export function writeBatch() {
 const operations = [];
 return { update: (path, data) => operations.push({path, data}), set: (path, data) => operations.push({path, data}),
 async commit() {
  const docs = documents();
  for (const {path, data} of operations) { docs[path] ||= {}; for (const [key, value] of Object.entries(data)) { if (value === '__delete__') delete docs[path][key]; else docs[path][key] = value; } }
  localStorage.setItem(key, JSON.stringify(docs)); window.__writes.push(...operations);
 } };
}
export const getLiturgicalTemplates = async () => new Map([['apostles', documents()['liturgicalTemplates/apostles']]]);
export const getCompletoriumById = async () => null;
export const useLiturgicalDay = () => ({ computeLiturgicalContextForDate: async () => ({periodType:'ordinary',periodWeek:30,dayOfWeek:4}) });
`;
const entry = `
import { createApp, h } from 'vue';
import { createRouter, createWebHistory, RouterView } from 'vue-router';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import 'vuetify/styles';
import DayEditor from '/src/views/admin/DayEditor.vue';
import AlternativeText from '/src/components/oraparts/AlternativeText.vue';
import { useNotifier } from '/src/composables/useNotifier.js';
import { documents } from '/__transport.js';
import { resolveRuntimeDay, legacyContextOf } from '/src/utils/ordo/runtime.js';
import { buildOrdoDayOptions, findResolvedDayById, contentDayMap } from '/src/utils/ordoDayOptions.js';
window.__reads = []; window.__writes = [];
function publicDay() {
 const docs=documents(), resolved=resolveRuntimeDay('2026-10-28',{diocese:'minsk-mohilev'}), context=legacyContextOf(resolved);
 const period=docs['days/ordinary-w30-d4'];
 const daysResult={periodDays:[period],periodFallback:period,fixedDateDays:[docs['days/${id}']],properDays:[docs['liturgicalProperTexts/${id}']],dynamicDaysByFeast:new Map()};
 const templates=new Map([['apostles',docs['liturgicalTemplates/apostles']]]);
 const {dayOptions}=buildOrdoDayOptions({resolved,daysResult,context,date:'2026-10-28',diocese:'minsk-mohilev',templates});
 return findResolvedDayById({dayOptions,itemsDays:[...contentDayMap([docs['days/${id}'],period],dayOptions).values()]},'${id}');
}
const Public = {setup(){const day=publicDay(); return () => h(AlternativeText,{text:day.vesperInter,kind:'intercession'});}};
const router=createRouter({history:createWebHistory(),routes:[{path:'/edit/:id',name:'AdminDayEditor',component:DayEditor},{path:'/public',component:Public}]});
const Root={setup(){const {snackbar}=useNotifier(); return () => h(components.VApp,null,{default:()=>[h(RouterView),h('output',snackbar.value.text)]});}};
createApp(Root).use(router).use(createVuetify({components,directives})).mount('#app');
`;
const server = await createServer({
  configFile: false, cacheDir: 'node_modules/.vite-editor-smoke',
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 4189, strictPort: true },
  plugins: [vue(), vuetify({ styles: false }), {
    name: 'local-editor-transport', enforce: 'pre',
    resolveId(source) {
      if (source === 'firebase/firestore' || source === '/__transport.js') return '\0editor-transport';
      if (source === '/__entry.js') return '\0editor-entry';
    },
    load(id) {
      if (id === '\0editor-transport') return transport;
      if (id === '\0editor-entry') return entry;
    },
    transform(source, id) {
      const path = id.split('?')[0];
      if (['/src/plugins/firebase.js', '/src/services/staticLiturgicalService.js', '/src/composables/useLiturgicalDay.js'].some((suffix) => path.endsWith(suffix))) return `export * from '/__transport.js';`;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url.startsWith('/edit/') || req.url === '/public') { res.setHeader('Content-Type', 'text/html'); res.end('<div id="app"></div><script type="module" src="/__entry.js"></script>'); return; }
        next();
      });
    },
  }],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  await context.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error('Browser:', error.message));
  page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') console.error('Browser console:', message.text()); });
  const editUrl = `http://127.0.0.1:4189/edit/${id}?date=2026-10-28`;
  await page.goto(editUrl);
  console.log('Opened local editor');
  await page.getByText('Дакумент захавання:', { exact: false }).waitFor();
  console.log('Loaded source document');
  assert.match(await page.locator('.day-editor').innerText(), /liturgicalProperTexts/);
  await page.getByText('Нешпары', { exact: true }).click();
  console.log('Expanded Vespers');
  const card = page.locator('.v-card').filter({ has: page.getByText('Просьбы', { exact: true }) });
  await card.getByRole('button', { name: 'Рэдагаваць', exact: true }).click();
  console.log('Opened Quill');
  const editor = card.locator('.ql-editor');
  await editor.waitFor();
  assert.match(await editor.innerText(), /хторупліва/);
  await editor.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const index = node.textContent.indexOf('хторупліва');
      if (index < 0) continue;
      const range = document.createRange(); range.setStart(node, index + 3); range.collapse(true);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); element.focus(); return;
    }
    throw new Error('Missing reproduction text');
  });
  await page.keyboard.insertText(' ');
  // Keyboard activation also works with long imported HTML extending below the card.
  await card.getByRole('button', { name: 'Захаваць поле', exact: true }).focus();
  await page.keyboard.press('Enter');
  console.log('Saved field locally');
  assert.deepEqual(await page.evaluate(() => window.__writes), [], 'Save field remains local');
  await page.getByRole('button', { name: 'Захаваць усё', exact: true }).click();
  await page.locator('output').filter({ hasText: 'Усе змененыя' }).waitFor();
  console.log('Confirmed batch and readback');
  const operations = await page.evaluate(() => window.__writes);
  assert.equal(operations.length, 1);
  assert.equal(operations[0].path, `liturgicalProperTexts/${id}`);
  assert.deepEqual(Object.keys(operations[0].data), ['vesperInter']);
  assert.match(operations[0].data.vesperInter, /хто рупліва/);
  assert.ok((await page.evaluate(() => window.__reads)).filter((path) => path === `liturgicalProperTexts/${id}`).length >= 2);
  await page.reload();
  await page.getByText('Дакумент захавання:', { exact: false }).waitFor();
  await page.getByText('Нешпары', { exact: true }).click();
  assert.match(await card.innerText(), /хто рупліва/);
  await page.goto('http://127.0.0.1:4189/public');
  await page.locator('.intercessions').waitFor();
  assert.match(await page.locator('.intercessions').innerText(), /хто рупліва/);
  const state = await context.storageState();
  const fresh = await browser.newContext({ storageState: state });
  const freshPage = await fresh.newPage();
  await freshPage.goto('http://127.0.0.1:4189/public');
  await freshPage.locator('.intercessions').waitFor();
  assert.match(await freshPage.locator('.intercessions').innerText(), /хто рупліва/);
  console.log('PASS real Quill -> local field -> batch payload -> readback -> reopened editor -> assembled public HTML -> new browser context; production writes: 0');
} finally { await browser?.close(); await server.close(); }
