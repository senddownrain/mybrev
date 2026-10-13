// Optional real-browser check: node tests/prayer-editor-browser.mjs
// Isolated harness imports no Firebase, auth, app router or production data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import path from 'node:path';
import vue from '@vitejs/plugin-vue';
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify';

const directory = 'backups/prayer-formatting';
await fs.mkdir(directory, { recursive: true });
const htmlPath = `${directory}/editor-test.html`;
await fs.writeFile(htmlPath, `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div>
<script type="module">
import {createApp, ref, h} from 'vue';
import {createVuetify} from 'vuetify';
import 'vuetify/styles';
import Editor from '/src/components/prayers/PrayerMarkdownEditor.vue';
import {EditorView} from '@codemirror/view';
const source=ref('К. Пане, пачуй нас.\\nН. І з духам тваім.');
window.source=source;
window.editor=()=>EditorView.findFromDOM(document.querySelector('.cm-editor'));
createApp({render:()=>h(Editor,{modelValue:source.value,'onUpdate:modelValue':v=>source.value=v})}).use(createVuetify()).mount('#app');
</script><style>:root {--rubric-color: #a62b38; --nav-surface: white; --nav-on-surface: #222; --nav-muted: #555; --nav-active: #eee; --nav-border: #ddd; --reader-font-family: Georgia; --reader-display-font-family: Georgia;} body{padding:24px;} </style></body></html>`);
const server = await createServer({
  configFile: false,
  cacheDir: `${directory}/vite-cache`,
  plugins: [vue({ template: { transformAssetUrls } }), vuetify({ autoImport: true })],
  resolve: { alias: { '@': path.resolve('src') } },
  server: { host: '127.0.0.1', port: 5187, strictPort: true },
  optimizeDeps: { entries: [htmlPath], include: ['vue', 'vuetify', '@codemirror/view', '@codemirror/commands'] },
});
let browser;
let page;
const errors = [];
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.PRAYER_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  page = await browser.newPage({ viewport: { width: 920, height: 760 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/*', (route) => route.request().url().startsWith('http://127.0.0.1:5187/') ? route.continue() : route.abort());
  await page.goto('http://127.0.0.1:5187/' + htmlPath, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('.cm-prayer-speaker').first().waitFor();
  assert.equal(await page.locator('.cm-prayer-speaker').count(), 2);
  const original = await page.evaluate(() => window.source.value);
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  assert.equal(await page.locator('.cm-prayer-speaker').count(), 0);
  await page.getByRole('button', { name: 'Звычайны', exact: true }).click();
  assert.equal(await page.evaluate(() => window.source.value), original);
  await page.evaluate(() => window.editor().dispatch({ selection: { anchor: 3, head: 8 } }));
  const selection = await page.evaluate(() => ({ from: window.editor().state.selection.main.from, to: window.editor().state.selection.main.to }));
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => ({ from: window.editor().state.selection.main.from, to: window.editor().state.selection.main.to })), selection);
  await page.getByRole('button', { name: 'Звычайны', exact: true }).click();
  await page.evaluate(() => window.source.value = '#Загаловак');
  await page.getByRole('button', { name: 'MD autofix' }).click();
  await page.getByText('Праверце выпраўленні Markdown', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.source.value), '#Загаловак');
  await page.getByRole('button', { name: 'Ужыць', exact: true }).click();
  await page.waitForFunction(() => window.source.value === '# Загаловак');
  await page.locator('.cm-content').focus();
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => window.source.value === '#Загаловак');
  await page.keyboard.press('Control+y');
  await page.waitForFunction(() => window.source.value === '# Загаловак');
  await page.evaluate(() => {
    window.source.value = 'Малітва';
  });
  await page.locator('.cm-content').focus();
  await page.evaluate(() => {
    const clipboard = new window.DataTransfer();
    clipboard.setData('text/html', '<p><em>Молімся.</em></p><p>К. Пане, пачуй нас.</p>');
    clipboard.setData('text/plain', 'Молімся.\nК. Пане, пачуй нас.');
    document.querySelector('.cm-content').dispatchEvent(new window.ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
  });
  await page.waitForFunction(() => window.source.value.includes('_Молімся._'));
  assert.ok(!(await page.evaluate(() => window.source.value)).includes(':::rubric'));
  const legacySource = '**К.:** Пане, пачуй нас.\n_Н.:_ Амэн.';
  await page.evaluate(source => window.source.value = source, legacySource);
  await page.waitForFunction(() => document.querySelectorAll('.cm-prayer-speaker').length === 2);
  assert.equal(await page.evaluate(() => window.source.value), legacySource);
  await page.getByRole('button', { name: 'MD autofix' }).click();
  await page.getByText('Праверце выпраўленні Markdown', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.source.value), legacySource);
  await page.getByRole('button', { name: 'Ужыць', exact: true }).click();
  await page.waitForFunction(() => window.source.value === 'К. Пане, пачуй нас.\nН. Амэн.');
  await page.locator('.cm-content').focus();
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => window.source.value === '**К.:** Пане, пачуй нас.\n_Н.:_ Амэн.');
  await page.evaluate(() => window.source.value = 'К. Пане, пачуй нас.\nН. ' + 'І з духам тваім. '.repeat(30));
  await page.locator('.cm-prayer-speaker').first().waitFor();
  await page.screenshot({ path: `${directory}/editor-light.png` });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--rubric-color', '#ff9a9f');
    document.documentElement.style.setProperty('--nav-on-surface', '#eee');
    document.documentElement.style.setProperty('--nav-surface', '#222');
    document.body.style.background = '#222';
    document.querySelector('.markdown-editor__surface').style.fontSize = '28px';
  });
  assert.equal(await page.locator('.cm-prayer-speaker').first().evaluate((el) => getComputedStyle(el).color), 'rgb(255, 154, 159)');
  await page.screenshot({ path: `${directory}/editor-dark-large.png` });
  assert.deepEqual(errors, []);
  console.log('Editor browser checks passed: modes, selection, preview, undo/redo, Word paste, theme, large font.');
} catch (error) {
  console.error(JSON.stringify({ errors, source: await page?.evaluate(() => window.source?.value).catch(() => null) }));
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
