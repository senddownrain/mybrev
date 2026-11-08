/** Real app, isolated local fixtures; every non-local request is blocked.
 * SMOKE_BASE_URL=http://127.0.0.1:4174 node scripts/smoke-reader-settings.mjs
 * Bible service alone is stubbed (Firestore is never read or written).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { CONTENT_REVISION, CONTENT_CACHE_SCHEMA } from '../src/constants/contentRevision.js';
import { READER_FONT_OPTIONS } from '../src/constants/fonts.js';
import { PSALMODY_MODES } from '../src/utils/psalmodyDisplay.js';
import { PSALMODY_PREVIEW_HTML } from '../src/constants/psalmodyPreview.js';
const base = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4174').replace(/\/$/, '');
const output = process.env.READER_SETTINGS_EVIDENCE_DIR || 'outputs/reader-settings';
fs.mkdirSync(output, { recursive: true });
const date = '2026-02-08';
const fixture = JSON.parse(fs.readFileSync('patchs/json/ordinary-w5-d1-fixed-day.json', 'utf8'));
const day = { ...fixture, id: fixture._id };
const content = { context: { periodType: 'ordinary', periodWeek: 5, dayOfWeek: 1 }, itemsDays: [day], dayOptions: [{ key: day.id, dayId: day.id, title: day._dayName, day, templates: [{ id: day.id, day }] }] };
const prose = 'Божа, прыйдзі мне на дапамогу. Пане, паспяшы да мяне на паратунак. '.repeat(5);
const prayerText = `# Загаловак\n\n${prose}\n\n:::rubric\nСвятар прамаўляе:\n:::\n\nК. ${prose}\n\nПершы радок\nДругі радок\n\n- Пункт спіса\n\n[Спасылка](/bible)`;
const namespace = `mybrev-public-${process.env.VITE_FIREBASE_PROJECT_ID || 'unconfigured'}-v${CONTENT_CACHE_SCHEMA}`;
const browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const results = [];
try {
  for (const width of (process.env.READER_SETTINGS_WIDTHS || '1440,768,390,320').split(',').map(Number)) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (url.pathname === '/__reader_settings_setup') return route.fulfill({ contentType: 'text/html', body: '<html lang="be"><body>Local fixtures</body></html>' });
      if (url.pathname === '/src/services/bibleService.js') return route.fulfill({ contentType: 'application/javascript', body: `export async function fetchBibleBook() { return ${JSON.stringify({ id: 'gn', chapterCount: 50, chapters: { 1: [{ num: 1, text: prose }, { num: 2, text: 'Радок\nРадок' }] } })}; }` });
      return route.continue();
    });
    await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(15000);
    await page.goto(`${base}/__reader_settings_setup`);
    await page.evaluate(async ({ namespace, revision, content, date, prose, prayerText }) => {
      localStorage.setItem('fontSizeMultiplier', '1.1');
      localStorage.setItem('fontFamily', "'Kurale', 'PT Serif', Georgia, serif");
      localStorage.setItem('favoritePrayers', '["saved-prayer"]');
      const db = await new Promise((resolve, reject) => {
        const request = window.indexedDB.open(namespace, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('entries');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      const cache = await import('/src/utils/publicContentCache.js');
      const entries = [
        [JSON.parse(cache.contentKey(date, 'minsk-mohilev')), content],
        [JSON.parse(cache.readingsKey(date, { includeAlternatives: true, diocese: 'minsk-mohilev' })), { context: content.context, items: [{ id: 'test-reading', title: 'Чытанне', reading1: { bible: 'Лк 1', text: prose }, psalm: { chorus: 'Рэфрэн', verses: ['Першы радок\nДругі радок'] }, gospel: { bible: 'Лк 2', text: prose }, sequence: { text: 'Першы радок\nДругі радок' } }] }],
        [['prayer-content', 3], { prayers: [{ id: 'settings-prayer', title: 'Малітва', text: prayerText, textFormat: 'mybrev-markdown', verified: true, tags: [] }], categories: [] }],
      ];
      await new Promise((resolve, reject) => {
        const tx = db.transaction('entries', 'readwrite');
        for (const [key, data] of entries) tx.objectStore('entries').put(JSON.stringify({ data, complete: true, revision: `${revision}:` }), JSON.stringify(key));
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      }); db.close();
    }, { namespace, revision: CONTENT_REVISION, content, date, prose, prayerText });
    await page.goto(`${base}/settings`);
    const toggle = page.locator('.text-group-toggle');
    await toggle.waitFor();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#text-settings-content').isVisible(), false);
    assert.deepEqual(await page.evaluate(() => ['fontSizeMultiplier', 'fontFamily', 'favoritePrayers'].map(k => localStorage.getItem(k))), ['1.1', "'Kurale', 'PT Serif', Georgia, serif", '["saved-prayer"]']);
    assert.equal(await page.evaluate(() => localStorage.getItem('textAlignment')), 'start');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await page.reload();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('.font-options button').count(), 5);
    const originalPsalm = (await page.locator('.psalmody-preview').textContent()).replace(/\s/gu, '');
    for (const theme of ['light', 'dark', 'marian']) {
      await toggle.waitFor();
      await page.evaluate(theme => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings').setThemePreference(theme), theme);
      for (const font of READER_FONT_OPTIONS) for (const scale of [1, 1.8]) {
        await page.locator('.font-options button').filter({ hasText: font.title }).evaluate(button => button.click());
        await page.evaluate(scale => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings').fontSizeMultiplier = scale; }, scale);
        for (const mode of PSALMODY_MODES) {
          await page.locator(`[data-mode="${mode}"]`).evaluate(button => button.click());
          const metrics = await page.locator('.psalmody-preview .psalmody-text').evaluate(root => {
            const a = root.querySelector('[data-psalm-side="A"]'); const b = root.querySelector('[data-psalm-side="B"]');
            const continuation = root.querySelector('.psalm-continuation');
            const preview = document.querySelector('.text-preview p');
            return { font: getComputedStyle(preview).fontFamily, size: parseFloat(getComputedStyle(preview).fontSize),
              a: a.getBoundingClientRect().left, b: b.getBoundingClientRect().left, br: root.querySelectorAll('br').length,
              continuation: Boolean(continuation), indent: continuation ? parseFloat(getComputedStyle(continuation).marginInlineStart) : 0,
              overflow: document.documentElement.scrollWidth > window.innerWidth,
              clipped: [...root.querySelectorAll('p'), preview].some(p => p.scrollWidth > p.clientWidth + 1),
              groupWidth: document.querySelector('.psalmody-modes').getBoundingClientRect().width,
              headingWidth: document.querySelector('.psalmody-heading').getBoundingClientRect().width,
              targets: [...document.querySelectorAll('.psalmody-modes button')].map(n => ({ width: n.clientWidth, height: n.clientHeight })),
            };
          });
          assert.ok(!metrics.overflow && !metrics.clipped, `${width}/${theme}/${font.title}/${scale}/${mode}: overflow`);
          assert.equal(metrics.size, 16 * scale);
          assert.ok(metrics.font.includes(font.title === 'Сістэмны' ? '-apple-system' : font.title));
          assert.equal(metrics.b > metrics.a, mode === 'alternating-stanzas');
          assert.equal(metrics.continuation, mode !== 'alternating-stanzas');
          assert.equal(metrics.indent > 0, mode === 'left-break-indent');
          if (mode === 'alternating-stanzas') assert.equal(metrics.br, 0);
          assert.ok(metrics.targets.every(t => t.height >= 44 && t.width >= 44));
          if (width <= 600) assert.equal(metrics.groupWidth, metrics.headingWidth, 'mobile psalmody fills available width');
          if (width <= 600) assert.ok(Math.max(...metrics.targets.map(t => t.width)) - Math.min(...metrics.targets.map(t => t.width)) <= 1);
          assert.equal((await page.locator('.psalmody-preview').textContent()).replace(/\s/gu, ''), originalPsalm);
        }
      }
      await page.evaluate(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings'); s.fontSizeMultiplier = window.innerWidth === 320 ? 1.8 : 1; s.setFontFamily("'Literata', 'PT Serif', Georgia, serif"); });
      await page.locator('[data-mode="left-break-indent"]').click();
      await page.locator('[data-alignment="justify"]').click();
      await page.screenshot({ path: path.join(output, `${width}-${theme}-expanded.png`), fullPage: true });
      if (width === 390 && theme === 'light') for (const mode of PSALMODY_MODES) {
        await page.locator(`[data-mode="${mode}"]`).evaluate(button => button.click());
        await page.locator('.psalmody-settings').evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await page.locator('.psalmody-settings').screenshot({ path: path.join(output, `psalmody-${mode}.png`) });
      }
      await page.locator('[data-mode="left-break-indent"]').evaluate(button => button.click());
      await toggle.click();
      await page.reload();
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('.psalmody-modes [aria-checked="true"]').getAttribute('data-mode'), 'left-break-indent');
      await page.locator('.settings-page').screenshot({ path: path.join(output, `${width}-${theme}-collapsed.png`) });
      await toggle.click();
      for (const alignment of ['start', 'justify']) {
        await page.locator(`[data-alignment="${alignment}"]`).click();
        await page.reload();
        assert.equal(await page.locator(`[data-alignment="${alignment}"]`).getAttribute('aria-checked'), 'true');
        for (const [route, selector] of [
          [`/readings/${date}`, '.reading-section--reading .section-text p'],
          ['/prayer/settings-prayer', '.prayer-text > p[data-reader-prose]'],
          ['/bible/bel/gn/1', '.bible-verse[data-reader-prose]'],
          ['/compendium/question/1', '.compendium-answer p[data-reader-prose]'],
        ]) {
          await page.goto(`${base}${route}`);
          await page.locator(selector).first().waitFor();
          assert.equal(await page.locator(selector).first().evaluate(p => getComputedStyle(p).textAlign), alignment, `${route} ${alignment}`);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${route} fits`);
          const textBefore = await page.locator(selector).first().textContent();
          const opposite = alignment === 'start' ? 'justify' : 'start';
          await page.evaluate(value => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings').textAlignment = value; }, opposite);
          assert.equal(await page.locator(selector).first().evaluate(p => getComputedStyle(p).textAlign), opposite, `${route} updates without reload`);
          assert.equal(await page.locator(selector).first().textContent(), textBefore);
          await page.evaluate(value => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings').textAlignment = value; }, alignment);

          assert.equal(await page.locator('h1[data-reader-prose],h2[data-reader-prose],li[data-reader-prose],a[data-reader-prose],.prayer-rubric [data-reader-prose],.psalm-verse-text [data-reader-prose],.prayer-source [data-reader-prose],.compendium-refs[data-reader-prose]').count(), 0);
        }
        await page.goto(`${base}/day/${date}/ora/${encodeURIComponent(day.id)}/laudes?dayId=alternative`);
        await page.locator('.liturgical-hour-column .psalmody-text').first().waitFor();
        assert.equal(await page.locator('.liturgical-hour-column [data-reader-prose]').count(), 0);
        const hour = await page.locator('.liturgical-hour-column').evaluate(root => [...root.querySelectorAll('p')].map(p => ({ text: p.textContent, align: getComputedStyle(p).textAlign, html: p.innerHTML })));
        if (alignment === 'start') context.hourBaseline = hour;
        else assert.deepEqual(hour, context.hourBaseline, 'all Hours paragraphs, markup and alignment are unchanged');
        await page.goto(`${base}/settings`);
      }
      results.push(`${width}px/${theme}: 5 fonts × 2 sizes × 3 modes; persistence; Bible/Readings/Prayer/Compendium; Hours isolation passed`);
      console.log(results.at(-1));
    }
    // Keyboard selection and immediate reuse in the existing bottom sheet.
    await page.locator('[data-alignment="justify"]').focus();
    await page.keyboard.press('Home');
    assert.equal(await page.locator('[data-alignment="start"]').getAttribute('aria-checked'), 'true');
    await page.locator('[data-mode="left-break-indent"]').focus();
    await page.keyboard.press('End');
    assert.equal(await page.locator('[data-mode="alternating-stanzas"]').getAttribute('aria-checked'), 'true');
    await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').toggleSettingsSheet());
    const sheet = page.locator('.text-settings-card');
    await sheet.locator('[data-alignment="justify"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('textAlignment')), 'justify');
    assert.equal(await page.getAttribute('html', 'lang'), 'be');
    assert.deepEqual(errors, []);
    await context.close();
  }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ results, source: PSALMODY_PREVIEW_HTML, note: 'External font requests blocked; computed family, scale and Belarusian text checked with available fallback fonts.' }, null, 2));
} finally { await browser.close(); }
