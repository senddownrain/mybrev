import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';
import { CONTENT_REVISION, CONTENT_CACHE_SCHEMA } from '../src/constants/contentRevision.js';

// Test only local public presentation data; never query or refresh Firestore.
let day;
if (process.env.READER_SNAPSHOT || fs.existsSync('backups/firestore-snapshot/manifest.json')) {
  const snapshot = await openFirestoreSnapshot(process.env.READER_SNAPSHOT || 'backups/firestore-snapshot');
  const days = await snapshot.collection('days') || await snapshot.collection('fixedDays');
  day = days?.find((item) => item.laudesPs1 && item.laudesPs2 && item.laudesPs3 && item.vesperPs1);
} else {
  const fixture = JSON.parse(fs.readFileSync('patchs/json/ordinary-w5-d1-fixed-day.json', 'utf8'));
  day = { ...fixture, id: fixture._id };
}
assert.ok(day, 'local source contains a complete Lauds/Vespers example');
const date = '2026-01-01';
const contextData = { periodType: day._periodType || 'christmas', periodWeek: 1, dayOfWeek: 5 };
const content = {
  context: contextData,
  itemsDays: [day, { ...day, id: `${day.id}--test-variant` }],
  dayOptions: [{ key: day.id, dayId: day.id, title: day._feastName || day.id, day, templates: [{ id: day.id, day }] }],
};

content.dayOptions[0].templates = [
  { id: day.id, day, choice: 'current-day', label: 'З дня' },
  { id: `${day.id}--common`, day, choice: 'common', label: 'З агульных тэкстаў' },
];
content.dayOptions.push({ key: 'office-for-dead', source: 'office-for-dead', dayId: 'office-for-dead', title: 'Афіцый за памерлых', subtitle: 'Афіцый за памерлых', day: { id: 'office-for-dead', _kind: 'office-for-dead' } });
const projectId = process.env.VITE_FIREBASE_PROJECT_ID
  || fs.readFileSync('.env.local', 'utf8').match(/^VITE_FIREBASE_PROJECT_ID=(.+)$/m)?.[1]?.trim()
  || 'unconfigured';
const namespace = `mybrev-public-${projectId}-v${CONTENT_CACHE_SCHEMA}`;
const base = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4174').replace(/\/$/, '');
const browser = await chromium.launch({
  executablePath: process.env.BENCHMARK_BROWSER_PATH || '/usr/bin/chromium',
  headless: true,
});
const entryUrl = `/.cache/terminology-admin-${process.pid}.js`;
const entry = path.resolve(`.${entryUrl}`);
fs.mkdirSync(path.dirname(entry), { recursive: true });
fs.writeFileSync(entry, `
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { VApp } from 'vuetify/components';
import vuetify from '/src/plugins/vuetify.js';
import Editor from '/src/views/admin/YearOverrides.vue';
import '/src/styles/main.scss';
import '/node_modules/vuetify/lib/styles/main.css';
const app = createApp({ render: () => h(VApp, null, { default: () => h(Editor) }) });
app.use(createPinia()).use(vuetify).use(createRouter({ history: createMemoryHistory(), routes: [] }));
app.mount('#app');
`);
const output = path.resolve('outputs/liturgical-terminology');
fs.mkdirSync(output, { recursive: true });
try {
  const profile = { theme: 'light', scale: 1 };
  const ctx = await browser.newContext({ viewport: { width: 320, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await ctx.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await page.goto(`${base}/__reader-fixtures`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async ({ namespace, revision, content, date, theme, scale }) => {
      localStorage.setItem('themePreference', theme);
      localStorage.setItem('fontSizeMultiplier', String(scale));
      const db = await new Promise((resolve, reject) => {
        const request = window.indexedDB.open(namespace, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('entries');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const entries = [
        [['content', date, 'minsk-mohilev'], content],
        [['content', '2026-01-02', 'minsk-mohilev'], content],
        [['content', '2026-01-03', 'minsk-mohilev'], { context: content.context, dayOptions: [], itemsDays: [] }],
        [['static', 'completoriums'], Array.from({ length: 7 }, (_, index) => ({
          id: `christmas-d${index + 1}`, compAnt1: content.itemsDays[0].laudesAnt1,
          compPs1: content.itemsDays[0].laudesPs1, compAntS: content.itemsDays[0].laudesAntBen,
        }))],
        [['readings', date, '', true, 'minsk-mohilev'], { context: content.context, items: [{ id: 'reader-fixture', title: 'Чытанне', massReadings: { schema: 1, sets: ['night', 'dawn', 'day'].map((id, index) => ({ id, label: ['Імша ўначы', 'Імша на світанні', 'Імша ўдзень'][index], sections: [{ kind: 'reading', role: 'reading1', bible: 'Лк 1', text: 'Тэкст для праверкі.' }] })) }, reading1: { bible: 'Лк 1', text: Array(100).fill('Тэкст для праверкі пракруткі.').join('\n\n') } }] }],
      ];
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('entries', 'readwrite');
        for (const [key, data] of entries) transaction.objectStore('entries').put(JSON.stringify({ data, complete: true, revision: `${revision}:` }), JSON.stringify(key));
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    }, { namespace, revision: CONTENT_REVISION, content, date, theme: profile.theme, scale: profile.scale });

  for (const theme of ['light', 'dark']) for (const width of [320, 375, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(theme => localStorage.setItem('themePreference', theme), theme);
    for (const [name, url, selector] of [
      ['common-texts', `/day/${date}/ora/${day.id}`, '.template-panel'],
      ['celebration', `/readings/${date}`, '.set-choice'],
      ['day-card', `/day/${date}`, '.day-option--requiem'],
    ]) {
      await page.goto(`${base}${url}`, { waitUntil: 'domcontentloaded' });
      const element = page.locator(selector);
      await element.waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `${name}, ${theme}, ${width}`);
      const text = await element.textContent();
      assert.ok(/Тэксты Літургіі гадзінаў апрача ўласных|Магчымасці цэлебрацыі|Афіцый за памерлых/u.test(text), text);
      assert.ok(await element.evaluate(e => [...e.querySelectorAll('*')].every(n => getComputedStyle(n).textOverflow !== 'ellipsis' || n.scrollWidth <= n.clientWidth)), 'no clipped important labels');
      if (width === 320 || width === 390) await element.screenshot({ path: path.join(output, `${name}-${theme}-${width}.png`) });
    }
    await page.goto(`${base}/settings`, { waitUntil: 'domcontentloaded' });
    const group = page.getByRole('radiogroup', { name: 'Выгляд псальмодыі' });
    await group.locator('[data-mode="left-break"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await group.locator('[data-mode="left-break-indent"]').getAttribute('aria-checked'), 'true');
    await page.keyboard.press('End');
    assert.equal(await group.locator('[data-mode="alternating-stanzas"]').getAttribute('aria-checked'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await group.locator('[aria-checked="true"]').count(), 1);
    const boxes = await group.locator('[role="radio"]').evaluateAll(nodes => nodes.map(n => ({ width: n.clientWidth, height: n.clientHeight })));
    assert.ok(boxes.every(b => b.height >= 44 && Math.abs(b.width - boxes[0].width) <= 1));
    if (width === 320) await page.locator('.psalmody-settings').screenshot({ path: path.join(output, `controls-${theme}.png`) });
  }
  for (const [layout, breaks, expected] of [
    ['alignedLeft', 'inline', 'left-break'],
    ['alignedLeft', 'breakAfterMarker', 'left-break-indent'],
    ['alternatingIndent', 'inline', 'alternating-stanzas'],
    ['alternatingIndent', 'breakAfterMarker', 'alternating-stanzas'],
  ]) {
    await page.evaluate(({ layout, breaks }) => {
      localStorage.removeItem('psalmodyMode');
      localStorage.setItem('psalmVerseLayout', layout);
      localStorage.setItem('psalmMarkerBreakMode', breaks);
    }, { layout, breaks });
    await page.goto(`${base}/settings`, { waitUntil: 'domcontentloaded' });
    await page.locator(`[data-mode="${expected}"][aria-checked="true"]`).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('psalmodyMode')), expected);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator(`[data-mode="${expected}"][aria-checked="true"]`).waitFor();
  }
  // Snapshot psalmody with the floating toolbar hidden only in the capture.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const mode of ['left-break', 'left-break-indent', 'alternating-stanzas']) {
    await page.evaluate(mode => localStorage.setItem('psalmodyMode', mode), mode);
    await page.goto(`${base}/day/${date}/ora/${day.id}/laudes`, { waitUntil: 'domcontentloaded' });
    const psalm = page.locator('.psalmody-text').first();
    await psalm.waitFor({ state: 'visible' });
    await psalm.screenshot({ path: path.join(output, `${mode}.png`), style: '.floating-ora-bar, .back-to-top { visibility: hidden !important; }' });
  }
  await page.getByRole('button', { name: 'Выгляд тэксту', exact: true }).click();
  const sheet = page.locator('.text-settings-card');
  for (const width of [320, 375, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await sheet.evaluate(e => e.scrollWidth <= e.clientWidth), 'font settings sheet fits');
    for (const button of await sheet.locator('.sheet-theme-control button').all()) {
      const box = await button.boundingBox();
      const card = await sheet.boundingBox();
      assert.ok(box.x >= card.x && box.x + box.width <= card.x + card.width, 'all theme buttons are visible');
    }
    if (width === 320) await sheet.screenshot({ path: path.join(output, 'reader-settings-320.png') });
  }
  // Exercise the real Ordo editor in an isolated shell; requests stay blocked.
  await ctx.route(`${base}/__terminology-admin`, route => route.fulfill({ contentType: 'text/html', body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module" src="${entryUrl}"></script></body></html>` }));
  await page.goto(`${base}/__terminology-admin`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Новае выключэнне' }).click();
  await page.getByRole('dialog').locator('.v-select').filter({ hasText: 'Дзеянне' }).click();
  await page.getByRole('option', { name: 'Змяніць літургічную ступень', exact: true }).click();
  for (const width of [320, 375, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const dialog = page.getByRole('dialog');
    assert.equal(await dialog.locator('.v-field-label').filter({ hasText: 'Новая літургічная ступень' }).count() > 0, true);
    assert.ok(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth), 'Ordo dialog has no horizontal scroll');
    assert.ok(await dialog.locator('.v-field--active .v-field-label--floating').evaluateAll(nodes => nodes.every(n => n.scrollWidth <= n.clientWidth)), 'important field labels fit');
    assert.ok(await dialog.locator('.v-select__selection-text').evaluateAll(nodes => nodes.every(n => n.scrollWidth <= n.clientWidth)), 'selected action is not clipped');
    if (width === 320) await dialog.screenshot({ path: path.join(output, 'ordo-rank-320.png') });
  }
  assert.deepEqual(errors, []);
  console.log('Terminology: 3 real UI elements × 4 widths × 2 themes; Ordo dialog, shared radio keyboard, touch targets, 4 persisted migrations, font sheet and screenshots passed.');
} finally { await browser.close(); fs.rmSync(entry, { force: true }); }
