import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { fixtures } from '../tests/fixtures/devotional-office/reader.mjs';

const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4174';
const stage = process.env.READER_CAPTURE_STAGE || 'after';
const output = path.resolve(`outputs/devotional-office/${stage}`);
mkdirSync(output, { recursive: true });
const entry = path.resolve('.cache/devotional-reader-entry.js');
mkdirSync(path.dirname(entry), { recursive: true });
const baselineRef = process.env.READER_BASELINE_REF;
const baselineReader = path.resolve('.cache/devotional-reader-baseline.vue');
const baselineUtils = path.resolve('.cache/devotional-reader-baseline.js');
if (baselineRef) {
  const source = file => execFileSync('git', ['show', `${baselineRef}:${file}`], { encoding: 'utf8' });
  writeFileSync(baselineUtils, source('src/utils/devotionalOffice.js').replace("'./prayerMarkdown.js'", "'/src/utils/prayerMarkdown.js'"));
  writeFileSync(baselineReader, source('src/components/prayers/DevotionalOfficeReader.vue').replace("'@/utils/devotionalOffice'", "'/.cache/devotional-reader-baseline.js'"));
}
const readerPath = baselineRef ? '/.cache/devotional-reader-baseline.vue' : '/src/components/prayers/DevotionalOfficeReader.vue';
const browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
writeFileSync(entry, `
      import { createApp, h, reactive } from 'vue';
      import { createPinia } from 'pinia';
      import { createRouter, createMemoryHistory } from 'vue-router';
      import vuetify from '/src/plugins/vuetify.js';
      import Reader from '${readerPath}';
      import { useSettingsStore } from '/src/stores/settings.js';
      import '/src/styles/main.scss';
      import '/node_modules/vuetify/lib/styles/main.css';
      localStorage.setItem('themePreference', 'dark');
      const props = reactive(${JSON.stringify({ ...fixtures[0], prayerId: fixtures[0].id, format: 'mybrev-markdown' })});
      const app = createApp({ setup() { return () => h('main', { class: 'prayer-content-area', style: 'max-width:600px;margin:auto;padding:12px 0' }, [h(Reader, props)]); } });
      document.body.classList.add('v-theme--dark');
      app.use(createPinia()).use(vuetify).use(createRouter({ history: createMemoryHistory(), routes: [] }));
      await app.config.globalProperties.$router.push('/');
      await app.config.globalProperties.$router.isReady();
      app.mount('#app');
      window.readerTest = { props, settings: useSettingsStore() };
    `);
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (url.pathname === '/__devotional_reader_test') return route.fulfill({ contentType: 'text/html', body: '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div><script type="module" src="/.cache/devotional-reader-entry.js"></script></body></html>' });
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.stack); });
  await page.goto(`${base}/__devotional_reader_test`);
  await page.waitForFunction(() => window.readerTest);
  for (const fixture of fixtures) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(fixture => {
      Object.assign(window.readerTest.props, fixture, { prayerId: fixture.id });
      window.readerTest.settings.psalmVerseLayout = 'alternatingIndent';
      window.readerTest.settings.psalmMarkerBreakMode = 'inline';
    }, fixture);
    if (fixture.id.includes('office-for-dead')) await page.getByRole('button', { name: 'За аднаго памерлага', exact: true }).click();
    await page.screenshot({ path: path.join(output, `${fixture.id}.png`), fullPage: true });
    if (process.argv.includes('--capture-only')) continue;
    assert.equal(await page.locator('h2.ora-title').filter({ hasText: /^Гімн$/ }).count(), fixture.profile === 'gadzinki' ? 8 : 1);
    if (fixture.profile !== 'gadzinki') {
      assert.equal(await page.locator('h2.ora-title').filter({ hasText: /^Кароткае чытанне$/ }).count(), 1);
      assert.equal(await page.locator('h2.ora-title').filter({ hasText: /^Кароткі рэспансорый$/ }).count(), 1);
      assert.equal(await page.locator('.devotional-office__reading-reference').textContent(), '1 Тэс 4, 14');
      assert.equal(await page.locator('.devotional-office__responsory [data-office-speaker]').count(), 4);
      const labels = await page.locator('.devotional-office__responsory [data-office-speaker]').evaluateAll(nodes => nodes.map(n => ({ y: n.getBoundingClientRect().y, color: getComputedStyle(n).color, lineHeight: parseFloat(getComputedStyle(n).lineHeight) })));
      assert.ok(labels.every((n, i) => !i || Math.abs(n.y - labels[i - 1].y - n.lineHeight) < 2), 'one line per reply without blank gaps');
      assert.ok(labels.every(n => n.color === 'rgb(239, 145, 136)'), 'shared dark rubric accent');
      const canticle = page.locator('.ora').filter({ has: page.locator('.devotional-office__canticle-caption') });
      assert.equal(await canticle.locator('.psalmody-text').count(), 1);
      assert.equal(await canticle.locator('[data-psalm-side]').count(), 2, 'canticle strophes alternate');
      const readingSize = await page.locator('.devotional-office__reading-reference + .devotional-office__text').evaluate(n => getComputedStyle(n).fontSize);
      assert.equal(readingSize, await canticle.locator('.psalmody-text').evaluate(n => getComputedStyle(n).fontSize), 'reading uses the ordinary reader size');
      const original = await canticle.locator('.psalmody-text').textContent();
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        for (const layout of ['alignedLeft', 'alternatingIndent']) for (const mode of ['inline', 'breakAfterMarker']) {
          await page.evaluate(({ layout, mode }) => { window.readerTest.settings.psalmVerseLayout = layout; window.readerTest.settings.psalmMarkerBreakMode = mode; }, { layout, mode });
          await page.waitForFunction(({ layout, mode }) => {
            const psalm = document.querySelector('.devotional-office__canticle-caption')?.closest('.ora').querySelector('.psalmody-text');
            return psalm?.dataset.verseLayout === layout && psalm?.dataset.markerBreakMode === mode;
          }, { layout, mode });
          assert.equal(await canticle.locator('.psalmody-text').getAttribute('data-verse-layout'), layout);
          assert.equal(await canticle.locator('.psalmody-text').textContent(), original);
          assert.equal(await canticle.locator('.psalm-continuation').count() > 0, mode === 'breakAfterMarker');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow');
        }
      }
    }
    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => { window.readerTest.settings.fontSizeMultiplier = 2; });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '200% text has no horizontal overflow');
    await page.screenshot({ path: path.join(output, `${fixture.id}-320-large.png`), fullPage: true });
    await page.evaluate(() => { window.readerTest.settings.fontSizeMultiplier = 1; });
    console.log(`${fixture.id}: mobile dark reader passed`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); for (const file of [entry, baselineReader, baselineUtils]) rmSync(file, { force: true }); }
