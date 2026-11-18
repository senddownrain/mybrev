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
const projectId = process.env.VITE_FIREBASE_PROJECT_ID
  || fs.readFileSync('.env.local', 'utf8').match(/^VITE_FIREBASE_PROJECT_ID=(.+)$/m)?.[1]?.trim()
  || 'unconfigured';
const namespace = `mybrev-public-${projectId}-v${CONTENT_CACHE_SCHEMA}`;
const base = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4174').replace(/\/$/, '');
const browser = await chromium.launch({
  executablePath: process.env.BENCHMARK_BROWSER_PATH || '/usr/bin/chromium',
  headless: true,
});
const output = path.resolve('outputs/liturgy-reader');
fs.mkdirSync(output, { recursive: true });
try {
  for (const profile of [
    { name: 'mobile-light', width: 390, height: 844, theme: 'light', scale: 1 },
    { name: 'narrow-dark-large', width: 320, height: 740, theme: 'dark', scale: 1.8 },
    { name: 'tablet-light', width: 768, height: 1024, theme: 'light', scale: 1 },
    { name: 'desktop-dark', width: 1280, height: 900, theme: 'dark', scale: 1 },
  ]) {
    const ctx = await browser.newContext({ viewport: profile, colorScheme: profile.theme, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await ctx.route('**/*', (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
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
        [['readings', date, '', true, 'minsk-mohilev'], { context: content.context, items: [{ id: 'reader-fixture', title: 'Чытанне', reading1: { bible: 'Лк 1', text: Array(100).fill('Тэкст для праверкі пракруткі.').join('\n\n') } }] }],
      ];
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('entries', 'readwrite');
        for (const [key, data] of entries) transaction.objectStore('entries').put(JSON.stringify({ data, complete: true, revision: `${revision}:` }), JSON.stringify(key));
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    }, { namespace, revision: CONTENT_REVISION, content, date, theme: profile.theme, scale: profile.scale });
    await page.goto(`${base}/settings`, { waitUntil: 'domcontentloaded' });
    await page.locator('[aria-controls="liturgical-settings-content"]').click();
    assert.equal(await page.locator('[data-mode="left-break"]').getAttribute('aria-checked'), 'true');
    assert.equal(await page.getByLabel('Не выключаць экран', { exact: true }).isChecked(), true);
    assert.equal(await page.locator('.psalmody-settings select').count(), 0, 'psalmody uses radio buttons');
    await page.screenshot({ path: path.join(output, `${profile.name}-settings.png`), fullPage: true });
    const url = `${base}/day/${date}/ora/${encodeURIComponent(day.id)}/laudes?dayId=alternative`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const texts = page.locator('.psalmody-text');
    await texts.first().waitFor({ state: 'visible' });
    assert.equal(await texts.count(), 4, 'three psalms and Benedictus');
    assert.equal(await page.locator('.ora-location').count(), 0, 'no duplicate title at the top');
    assert.equal(await page.locator('.ora-section-menu').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Выгляд тэксту', exact: true }).count(), 0, 'no extra reader settings button');
    assert.equal(await page.locator('.text-scale-control button').count(), 2, 'font toolbar has only minus/plus');
    assert.equal(await page.locator('.text-settings-card').count(), 0, 'no local text settings panel');
    const originalScale = await page.evaluate(() => Number(localStorage.getItem('fontSizeMultiplier')));
    const scaleAction = page.getByRole('button', { name: originalScale < 1.8 ? 'Павялічыць тэкст' : 'Паменшыць тэкст', exact: true });
    await scaleAction.click();
    assert.notEqual(await page.evaluate(() => Number(localStorage.getItem('fontSizeMultiplier'))), originalScale);
    await page.getByRole('button', { name: originalScale < 1.8 ? 'Паменшыць тэкст' : 'Павялічыць тэкст', exact: true }).click();
    const firstA = page.locator('[data-psalm-side="A"]').first();
    const firstB = page.locator('[data-psalm-side="B"]').first();
    await firstA.click();
    assert.equal(await page.locator('.psalmody-text[data-dimmed-side="A"]').count(), 4);
    assert.equal(await firstA.evaluate((p) => getComputedStyle(p).opacity), '0.68', 'selected side is dimmed');
    await firstB.click();
    assert.equal(await page.locator('.psalmody-text[data-dimmed-side="B"]').count(), 4);
    await firstB.click();
    assert.equal(await page.locator('.psalmody-text[data-dimmed-side]').count(), 0);
    await firstA.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.psalmody-text[data-dimmed-side="A"]').count(), 4);
    await page.keyboard.press('Space');
    assert.equal(await page.locator('.psalmody-text[data-dimmed-side]').count(), 0, 'keyboard focus survives toggling');
    await firstA.click();
    assert.equal(await page.locator('.ora-ant [data-psalm-side], [data-liturgical-subheading][data-psalm-side]').count(), 0);

    const originalText = await texts.first().textContent();
    for (const mode of ['left-break', 'left-break-indent', 'alternating-stanzas']) {
      await page.goto(`${base}/settings`, { waitUntil: 'domcontentloaded' });
      const group = page.getByRole('radiogroup', { name: 'Выгляд псальмодыі' });
      await group.locator(`[data-mode="${mode}"]`).click();
      assert.equal(await group.locator('[role="radio"][aria-checked="true"]').count(), 1);
      assert.equal(await page.evaluate(() => localStorage.getItem('psalmodyMode')), mode);
      for (const hour of ['laudes', 'vesper', 'lectionis', 'completorium']) {
        await page.goto(`${base}/day/${date}/ora/${day.id}/${hour}?dayId=alternative`, { waitUntil: 'domcontentloaded' });
        await texts.first().waitFor({ state: 'visible' });
        const source = await texts.allTextContents();
        const other = await page.locator('.ora-ant, .ora-text:not(.ora-psalm)').allTextContents();
        for (const width of [320, 375, 390, 768]) for (const scale of [1, 1.5, 1.8]) {
          await page.setViewportSize({ width, height: 844 });
          await page.evaluate(async scale => {
            const { useSettingsStore } = await import('/src/stores/settings.js');
            useSettingsStore(document.querySelector('#app').__vue_app__.config.globalProperties.$pinia).fontSizeMultiplier = scale;
          }, scale);
          const metrics = await texts.first().evaluate(element => {
            const a = element.querySelector('[data-psalm-side="A"]');
            const b = element.querySelector('[data-psalm-side="B"]');
            const continuation = element.querySelector('.psalm-continuation');
            return { aLeft: a.getBoundingClientRect().left, bLeft: b.getBoundingClientRect().left,
              hasContinuation: Boolean(continuation), indent: continuation ? parseFloat(getComputedStyle(continuation).marginInlineStart) : 0,
              br: element.querySelectorAll('[data-psalm-side] br').length,
              overflow: document.documentElement.scrollWidth > window.innerWidth };
          });
          assert.equal(metrics.overflow, false, `${hour} ${mode} ${width} ${scale}: overflow`);
          assert.equal(metrics.hasContinuation, mode !== 'alternating-stanzas');
          if (mode === 'alternating-stanzas') assert.equal(metrics.br, 0);
          assert.equal(metrics.bLeft > metrics.aLeft, mode === 'alternating-stanzas');
          assert.equal(metrics.indent > 0, mode === 'left-break-indent');
          assert.deepEqual(await texts.allTextContents(), source, 'all words and signs survive');
          assert.deepEqual(await page.locator('.ora-ant, .ora-text:not(.ora-psalm)').allTextContents(), other);
        }
      }
      await page.goto(`${base}/settings`, { waitUntil: 'domcontentloaded' });
      assert.equal(await page.locator(`[data-mode="${mode}"]`).getAttribute('aria-checked'), 'true', 'global setting shares the mode');
      await page.reload({ waitUntil: 'domcontentloaded' });
      assert.equal(await page.locator(`[data-mode="${mode}"]`).getAttribute('aria-checked'), 'true', 'mode persists after reload');
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await texts.first().waitFor({ state: 'visible' });
    }
    assert.equal(await texts.first().textContent(), originalText);
    assert.ok(await page.evaluate(async () => {
      const { decoratePsalmody } = await import('/src/utils/psalmodyDisplay.js');
      const input = '<p data-psalm-strophe><strong>1 Першы <span class="psalm-marker">†</span> другі <span class="psalm-marker">*</span> трэці</strong><br>2 чацвёрты</p><p data-psalm-strophe data-liturgical-subheading>Рубрыка *</p><p data-psalm-strophe>Ант. Рэфрэн *</p>';
      return ['left-break', 'left-break-indent', 'alternating-stanzas'].every(mode => {
        const root = document.createElement('div'); root.innerHTML = input;
        const original = root.textContent.replace(/\s/gu, '');
        decoratePsalmody(root, { mode });
        return root.textContent.replace(/\s/gu, '') === original
          && root.querySelectorAll('.psalm-continuation').length === (mode === 'alternating-stanzas' ? 0 : 2)
          && root.querySelectorAll('br').length === (mode === 'alternating-stanzas' ? 0 : 1)
          && root.querySelectorAll('[data-psalm-side]').length === 1
          && root.querySelectorAll('strong .psalm-marker').length > 0;
      });
    }), 'nested markup, multiple verses, both cadence signs and excluded rubrics survive');
    await page.setViewportSize(profile);
    await firstA.click();
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.locator('.ora-location').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Уверх', exact: true }).waitFor({ state: 'visible' });
    const capsule = await page.locator('.ora-location').boundingBox();
    const scaleBox = await page.locator('.text-scale-control').boundingBox();
    assert.ok(capsule.height >= 44, 'hour selector has a sufficient touch target');
    assert.ok(capsule.y + capsule.height <= 64, 'capsule stays in the toolbar, clear of reader text');
    assert.ok(capsule.x + capsule.width < scaleBox.x, 'size buttons remain visible beside the capsule');
    await page.locator('.ora-location').click();
    await page.locator('.ora-hour-menu').getByText('Нешпары', { exact: true }).first().click();
    await page.waitForURL('**/vesper?dayId=alternative');
    await texts.first().waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => window.scrollY), 0);
    assert.equal(await page.locator('.psalmody-text[data-dimmed-side]').count(), 0);
    const next = page.locator('.next-hour__link');
    assert.match(await next.getAttribute('href'), new RegExp(`/day/${date}/ora/${day.id}/completorium\\?dayId=alternative`));
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.getByRole('button', { name: 'Уверх', exact: true }).click();
    await page.waitForFunction(() => window.scrollY === 0);
    await page.locator('.ora-location').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Уверх', exact: true }).waitFor({ state: 'hidden' });
    await next.click();
    await page.waitForURL('**/completorium?dayId=alternative');
    await texts.first().waitFor({ state: 'visible' });
    await firstA.click();
    assert.equal(await page.locator('.psalmody-text[data-dimmed-side="A"]').count(), 2, 'Nunc shares the psalmody side');
    assert.equal(await page.locator('.next-hour__link').count(), 0, 'final hour stays on this date');
    await page.evaluate(async ({ date, id }) => {
      const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router;
      await router.push({ name: 'laudes', params: { day: date, id }, query: { dayId: 'alternative' } });
    }, { date, id: day.id });
    await page.waitForURL(`**/day/${date}/ora/${day.id}/laudes?dayId=alternative`);
    await page.waitForFunction(() => document.querySelectorAll('.psalmody-text').length === 4);
    await texts.first().waitFor({ state: 'visible' });
    await firstA.click();
    await page.evaluate(async ({ date, id }) => {
      const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router;
      await router.push({ name: 'laudes', params: { day: date, id }, query: { dayId: 'alternative' } });
    }, { date: '2026-01-02', id: day.id });
    await page.waitForURL(`**/day/2026-01-02/ora/${day.id}/laudes?dayId=alternative`);
    await page.waitForFunction(() => document.querySelectorAll('.psalmody-text').length === 4 && !document.querySelector('.psalmody-text[data-dimmed-side]'));
    await texts.first().waitFor({ state: 'visible' });
    assert.equal(await page.locator('.psalmody-text[data-dimmed-side]').count(), 0, 'date change resets the side');
    await firstA.click();
    await page.evaluate(async ({ date, id }) => {
      const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router;
      await router.push({ name: 'laudes', params: { day: date, id }, query: { dayId: 'alternative' } });
    }, { date: '2026-01-02', id: `${day.id}--test-variant` });
    await page.waitForURL(`**/day/2026-01-02/ora/${day.id}--test-variant/laudes?dayId=alternative`);
    await page.waitForFunction(() => document.querySelectorAll('.psalmody-text').length === 4 && !document.querySelector('.psalmody-text[data-dimmed-side]'));
    await texts.first().waitFor({ state: 'visible' });
    assert.equal(await page.locator('.psalmody-text[data-dimmed-side]').count(), 0, 'liturgical variant change resets the side');
    await page.goto(`${base}/readings/${date}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.readings-content').waitFor({ state: 'visible' });
    await page.evaluate(() => window.scrollTo(0, 900));
    const up = page.getByRole('button', { name: 'Уверх', exact: true });
    await up.waitFor({ state: 'visible' });
    const upBox = await up.boundingBox();
    const navBox = await page.locator('.pill-nav-row').boundingBox();
    assert.ok(upBox.y + upBox.height < navBox.y, 'back-to-top clears Readings bottom navigation');
    await up.click();
    await page.waitForFunction(() => window.scrollY === 0);
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log(`${profile.name}: psalmody combinations, dimming, persisted settings, hour routes, back-to-top passed`);
    await ctx.close();
  }
  // Use the real browser API here, rather than a mock sentinel.
  const nativeContext = await browser.newContext({ serviceWorkers: 'block' });
  await nativeContext.route('**/*', (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await nativeContext.addInitScript(() => {
    window.__nativeWakeLocks = [];
    if (!navigator.wakeLock) return;
    const request = navigator.wakeLock.request.bind(navigator.wakeLock);
    Object.defineProperty(navigator.wakeLock, 'request', { value: async (type) => {
      const lock = await request(type);
      window.__nativeWakeLocks.push(lock);
      return lock;
    } });
  });
  const nativePage = await nativeContext.newPage();
  await nativePage.goto(`${base}/settings`, { waitUntil: 'domcontentloaded' });
  await nativePage.locator('.settings-hero').click();
  await nativePage.waitForFunction(() => window.__nativeWakeLocks.some((lock) => !lock.released));
  await nativePage.getByLabel('Не выключаць экран', { exact: true }).setChecked(false);
  await nativePage.waitForFunction(() => window.__nativeWakeLocks.every((lock) => lock.released));
  assert.equal(await nativePage.evaluate(() => localStorage.getItem('keepScreenOn')), 'false');
  await nativePage.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await nativePage.getByLabel('Не выключаць экран', { exact: true }).isChecked(), false, 'explicit off setting survives reload');
  assert.equal(await nativePage.evaluate(() => window.__nativeWakeLocks.length), 0);
  await nativePage.getByLabel('Не выключаць экран', { exact: true }).setChecked(true);
  await nativePage.waitForFunction(() => window.__nativeWakeLocks.some((lock) => !lock.released));
  console.log('Native Chrome screen wake lock: default on, acquired, released by switch, explicit off persisted, reacquired when enabled.');
  await nativeContext.close();
} finally { await browser.close(); }
