import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import moment from '../src/utils/moment-be.js';
import { CONTENT_CACHE_SCHEMA, CONTENT_REVISION } from '../src/constants/contentRevision.js';
import { contentFor, openLiturgySource, snapshotDirectory } from './liturgy/lib/snapshot-content.mjs';

// Real application route + actual Vesper.vue, with offline assembled content.
// All outbound requests are blocked; the browser cannot read production data.
const source = await openLiturgySource({ snapshotDir: snapshotDirectory(), propers: 'snapshot', templates: 'snapshot' });
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4174';
const dates = ['2026-12-19', '2026-12-20', '2026-12-21', '2026-12-23'];
const contents = new Map();
for (const date of dates) {
  for (const day of [date, moment(date).add(1, 'day').format('YYYY-MM-DD')]) contents.set(day, contentFor(source, day));
}
const output = path.resolve('outputs/advent-vespers');
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  for (const profile of [
    { name: 'desktop-light', width: 1280, height: 900, theme: 'light' },
    { name: 'mobile-dark', width: 390, height: 844, theme: 'dark' },
  ]) {
    const context = await browser.newContext({ viewport: profile, colorScheme: profile.theme, serviceWorkers: 'block' });
    await context.route('**/*', (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    await page.evaluate(async ({ entries, revision, schema, project, theme }) => {
      localStorage.setItem('themePreference', theme);
      const db = await new Promise((resolve, reject) => {
        const request = window.indexedDB.open(`mybrev-public-${project}-v${schema}`, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('entries');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('entries', 'readwrite');
        for (const [date, data] of entries) transaction.objectStore('entries').put(
          JSON.stringify({ data, complete: true, revision: `${revision}:` }),
          JSON.stringify(['content', date, 'minsk-mohilev']),
        );
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    }, { entries: [...contents], revision: CONTENT_REVISION, schema: CONTENT_CACHE_SCHEMA,
      project: process.env.VITE_FIREBASE_PROJECT_ID || 'unconfigured', theme: profile.theme });
    for (const date of dates) {
      const id = contents.get(date).dayOptions[0].day.id;
      await page.goto(`${base}/day/${date}/ora/${id}/vesper`);
      await page.locator('.psalmody-text').first().waitFor({ state: 'visible', timeout: 30000 });
      const text = await page.locator('.prayer-content-area').innerText();
      const expected = {
        '2026-12-19': [/I Нешпары/, /1 Тэс 5, 23-24/, /О корань Есэя/],
        '2026-12-20': [/II Нешпары/, /Флп 4, 4-5/, /О ключ Давіда/],
        '2026-12-21': [/1 Кар 4, 5/, /які адкупіў нас ад цемры грахоў/, /Міласэрны Ойча/],
        '2026-12-23': [/139 \(138\)/, /Клс 1, 12-20/, /О Эммануэль/],
      }[date];
      expected.forEach((pattern) => assert.match(text, pattern, `${profile.name} ${date}`));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow');
      await page.screenshot({ path: path.join(output, `${date}-${profile.name}.png`), fullPage: true });
      console.log(`${date} ${profile.name}: PASS`);
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  await browser.close();
}
