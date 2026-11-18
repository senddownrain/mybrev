/** Real app, isolated local fixtures; every non-local request is blocked.
 * SMOKE_BASE_URL=http://127.0.0.1:4174 node scripts/smoke-reading-highlights.mjs
 * Cached reading fixtures only; Firestore is never read or written.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { CONTENT_REVISION, CONTENT_CACHE_SCHEMA } from '../src/constants/contentRevision.js';
const base = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4174').replace(/\/$/, '');
const output = process.env.READING_HIGHLIGHTS_EVIDENCE_DIR || 'work/reading-highlights';
fs.mkdirSync(output, { recursive: true });
const date = '2026-02-08';
const fixture = JSON.parse(fs.readFileSync('patchs/json/ordinary-w5-d1-fixed-day.json', 'utf8'));
const day = { ...fixture, id: fixture._id };
const content = { context: { periodType: 'ordinary', periodWeek: 5, dayOfWeek: 1 }, itemsDays: [day], dayOptions: [{ key: day.id, dayId: day.id, title: day._dayName, day, templates: [{ id: day.id, day }] }] };
const prose = 'Божа, прыйдзі мне на дапамогу. Пане, паспяшы да мяне на паратунак. '.repeat(25);
const namespace = `mybrev-public-${process.env.VITE_FIREBASE_PROJECT_ID || 'unconfigured'}-v${CONTENT_CACHE_SCHEMA}`;
const browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const results = [];
try {
  for (const width of (process.env.READING_HIGHLIGHTS_WIDTHS || '1440,768,390,320').split(',').map(Number)) {
    const context = await browser.newContext({ viewport: { width, height: 850 }, isMobile: width <= 390, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (url.pathname === '/__reader_settings_setup') return route.fulfill({ contentType: 'text/html', body: '<html lang="be"><body>Local fixtures</body></html>' });
      return route.continue();
    });
    await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(15000);
    await page.goto(`${base}/__reader_settings_setup`);
    await page.evaluate(async ({ namespace, revision, content, date, prose }) => {
      localStorage.setItem('fontSizeMultiplier', '1.1');
      localStorage.setItem('fontFamily', "'Kurale', 'PT Serif', Georgia, serif");
      localStorage.setItem('favoritePrayers', '["saved-prayer"]');
      localStorage.setItem('bibleHighlights.v1', '{"existing-bible-verse":"rose"}');
      const db = await new Promise((resolve, reject) => {
        const request = window.indexedDB.open(namespace, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('entries');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      const cache = await import('/src/utils/publicContentCache.js');
      const entries = [
        [JSON.parse(cache.contentKey(date, 'minsk-mohilev')), content],
        [JSON.parse(cache.readingsKey(date, { includeAlternatives: true, diocese: 'minsk-mohilev' })), { context: content.context, items: [{ id: 'test-reading', title: 'Чытанне', reading1: { bible: 'Лк 1', text: '<p>Першы <em>важны сказ.</em> Другі сказ!</p><p>' + prose + '</p>', alternatives: [{ bible: 'Лк 3', text: '<p>Альтэрнатыўны <strong>сказ.</strong> Наступны сказ.</p>' }] }, psalm: { chorus: 'Рэфрэн', verses: ['Першы радок\nДругі радок'] }, gospel: { bible: 'Лк 2', text: prose }, sequence: { text: 'Першы радок\nДругі радок' } }, { id: 'other-reading', title: 'Іншы дакумент', _feast: true, reading1: { text: prose }, gospel: { passion: { blocks: [{ type: 'paragraph', runs: [{ role: 'J', text: 'Першы сказ. Другі сказ.' }] }] } } }]  }],
      ];
      entries[1][1].items.push({ id: 'sets-reading', _dayId: 'sets-fixture', title: 'Наборы Імшы', massReadings: { sets: [
        { id: 'day', label: 'Удзень', default: true, sections: ['A', 'B'].map(cycle => ({ kind: 'reading', role: 'reading1', cycle, text: '<p>Аднолькавы сказ.</p>' })) },
        { id: 'vigil', label: 'У вігілію', sections: [{ kind: 'reading', role: 'reading1', text: '<p>Аднолькавы сказ.</p>' }] },
      ] } });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('entries', 'readwrite');
        for (const [key, data] of entries) tx.objectStore('entries').put(JSON.stringify({ data, complete: true, revision: `${revision}:` }), JSON.stringify(key));
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      }); db.close();
    }, { namespace, revision: CONTENT_REVISION, content, date, prose });
    await page.goto(`${base}/settings`);
    await page.locator('[aria-controls="liturgical-settings-content"]').click();
    const setting = page.getByRole('checkbox', { name: 'Каляровае вылучэнне ў чытаннях', exact: true });
    const wake = page.getByRole('checkbox', { name: 'Не выключаць экран', exact: true });
    await setting.waitFor();
    assert.equal(await setting.isChecked(), false);
    assert.equal(await wake.isChecked(), true);
    await wake.uncheck();
    await page.reload();
    assert.equal(await wake.isChecked(), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('keepScreenOn')), 'false');
    const readRoute = `${base}/readings/${date}?readingId=test-reading`;
    await page.goto(readRoute);
    const card = page.locator('.parsed-reading');
    await card.waitFor();
    const original = await card.innerHTML();
    const text = await card.textContent();
    await page.locator('.section-text p').first().click();
    assert.equal(await page.locator('.reading-highlight-bar').count(), 0);
    assert.equal(await page.locator('[data-reading-sentence]').count(), 0);
    const swipe = async () => {
      await page.evaluate(() => window.scrollTo(0, 0));
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: width / 2, y: 670 }] });
      for (let y = 630; y >= 190; y -= 40) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: width / 2, y }] });
        await page.waitForTimeout(20);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(200);
      assert.ok(await page.evaluate(() => window.scrollY > 100), 'native touch swipe scrolls');
      assert.equal(await page.locator('.reading-highlight-bar').count(), 0, 'swipe never selects');
      await cdp.detach();
    };
    await swipe();
    await page.goto(`${base}/settings`);
    await setting.check();
    await page.reload();
    assert.equal(await setting.isChecked(), true);
    assert.equal(await wake.isChecked(), false);
    await page.goto(readRoute);
    await page.locator('[data-reading-sentence]').first().waitFor();
    assert.equal(await card.textContent(), text);
    await swipe();
    const first = page.locator('.section-text').first().locator('[data-reading-sentence][tabindex]').first();
    await first.click();
    const firstKey = await first.getAttribute('data-reading-sentence');
    assert.ok(await page.locator('.section-text').first().locator('.reading-sentence--selected').count() >= 2, 'inline emphasis shares a sentence');
    assert.equal(await page.locator('.section-text').first().locator('.reading-sentence--selected').allTextContents().then(parts => parts.join('').trim()), 'Першы важны сказ.');
    for (const theme of ['light', 'dark', 'marian']) {
      await page.evaluate(theme => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings').setThemePreference(theme), theme);
      for (const color of ['amber', 'rose', 'sky', 'leaf']) {
        if (!(await page.locator('.reading-highlight-bar').count())) await first.click();
        await page.locator(`.reading-highlight-bar [data-color="${color}"]`).click();
        assert.equal(await first.getAttribute('data-color'), color);
        assert.notEqual(await first.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
        assert.equal(await card.textContent(), text);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow');
      await first.click();
      assert.ok(await page.locator('.reading-highlight-bar').evaluate(el => el.getBoundingClientRect().right <= window.innerWidth));
      assert.notEqual(await page.locator('.reading-highlight-bar').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'palette inherits theme surface');
      await page.screenshot({ path: path.join(output, `${width}-${theme}.png`) });
      await page.getByRole('button', { name: 'Скасаваць выбар', exact: true }).click();
    }
    await page.evaluate(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings').readingHighlightsEnabled = false; });
    assert.equal(await card.innerHTML(), original, 'live OFF restores original HTML and removes handlers');
    await page.evaluate(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings').readingHighlightsEnabled = true; });
    await page.reload();
    assert.equal(await first.getAttribute('data-color'), 'leaf');
    await page.goto(`${base}/settings`);
    await setting.uncheck();
    await page.goto(readRoute);
    await card.waitFor();
    assert.equal(await page.locator('[data-reading-sentence]').count(), 0);
    assert.equal(await card.innerHTML(), original, 'OFF restores exact HTML');
    await page.goto(`${base}/settings`);
    await setting.check();
    await page.goto(readRoute);
    assert.equal(await first.getAttribute('data-color'), 'leaf');
    // Keyboard multi-selection, erase, and persistence.
    await first.focus();
    await page.keyboard.press('Enter');
    assert.equal(await first.getAttribute('aria-pressed'), 'true');
    await page.keyboard.press(' ');
    assert.equal(await first.getAttribute('aria-pressed'), 'false');
    await page.locator('.reading-alternative [data-reading-sentence][tabindex]').first().click();
    await page.locator('.reading-section--gospel [data-reading-sentence][tabindex]').first().click();
    await page.locator('.reading-section--psalm [data-reading-sentence][tabindex]').first().click();
    await page.locator('.reading-highlight-bar [data-color="sky"]').click();
    assert.ok(await page.locator('.reading-alternative [data-color="sky"]').count());
    assert.ok(await page.locator('.reading-section--gospel [data-color="sky"]').count());
    assert.ok(await page.locator('.reading-section--psalm [data-color="sky"]').count());
    await first.click();
    await page.getByRole('button', { name: 'Прыбраць вылучэнне', exact: true }).click();
    await page.reload();
    assert.equal(await first.getAttribute('data-color'), null);
    await page.evaluate(date => document.querySelector('#app').__vue_app__.config.globalProperties.$router.replace(`/readings/${date}?readingId=other-reading`), date);
    await page.locator('.reading-day-title').filter({ hasText: 'Іншы дакумент' }).waitFor();
    assert.equal(await page.locator('.reading-sentence[data-color]').count(), 0, 'other document is isolated');
    const passion = page.locator('.passion__run [data-reading-sentence][tabindex]').first();
    await passion.click();
    await page.locator('.reading-highlight-bar [data-color="rose"]').click();
    await page.evaluate(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings').readingHighlightsEnabled = false; });
    assert.equal(await page.locator('.passion__run').textContent(), 'Першы сказ. Другі сказ.');
    assert.equal(await page.locator('[data-reading-sentence]').count(), 0);
    await page.evaluate(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings').readingHighlightsEnabled = true; });
    assert.equal(await passion.getAttribute('data-color'), 'rose');
    assert.equal(await page.locator('.passion__run').textContent(), 'Першы сказ. Другі сказ.');
    await page.goto(readRoute);
    await card.waitFor();
    assert.ok(await page.locator('.reading-alternative [data-color="sky"]').count());
    assert.equal(await page.evaluate(() => localStorage.getItem('bibleHighlights.v1')), '{"existing-bible-verse":"rose"}');
    // Same mounted card: cycle/set changes cannot inherit identical text's colours.
    await page.evaluate(date => document.querySelector('#app').__vue_app__.config.globalProperties.$router.replace(`/readings/${date}?readingId=sets-reading&set=day&year=A`), date);
    await page.locator('.reading-day-title').filter({ hasText: 'Наборы Імшы' }).waitFor();
    const setSentence = page.locator('.section-text [data-reading-sentence][tabindex]').first();
    await setSentence.click();
    await page.locator('.reading-highlight-bar [data-color="amber"]').click();
    await page.locator('.cycle-choice__button').filter({ hasText: /B/ }).click();
    await page.waitForFunction(() => !document.querySelector('.section-text [data-reading-sentence][tabindex]')?.hasAttribute('data-color'));
    assert.equal(await setSentence.getAttribute('data-color'), null);
    await page.locator('.set-choice__button').filter({ hasText: 'У вігілію' }).click();
    await page.waitForFunction(() => !document.querySelector('.section-text [data-reading-sentence][tabindex]')?.hasAttribute('data-color'));
    assert.equal(await setSentence.getAttribute('data-color'), null);
    await page.locator('.set-choice__button').filter({ hasText: 'Удзень' }).click();
    await page.locator('.cycle-choice__button').filter({ hasText: /A/ }).click();
    await page.waitForFunction(() => document.querySelector('.section-text [data-reading-sentence][tabindex]')?.dataset.color === 'amber');
    assert.equal(await setSentence.getAttribute('data-color'), 'amber');
    assert.ok(firstKey);
    assert.deepEqual(errors, []);
    results.push(`${width}px: OFF/ON native touch scroll; 3 themes × 4 colours; exact HTML/text; alternatives/gospel/psalm/Passion; keyboard; erase; reload; documents; settings; wake false passed`);
    console.log(results.at(-1));
    await context.close();
  }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ results }, null, 2));
} finally { await browser.close(); }
