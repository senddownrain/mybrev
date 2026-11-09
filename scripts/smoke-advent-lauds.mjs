import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from 'playwright-core';
import { CONTENT_CACHE_SCHEMA, CONTENT_REVISION } from '../src/constants/contentRevision.js';
import { contentFor } from './liturgy/lib/snapshot-content.mjs';
import { plain } from './liturgy/lib/lh-catholic-by.mjs';
import { fixedDocsFor, templatesFixture } from '../tests/helpers/ordo-days-fixture.mjs';
import { getCalendarDefinitions, getDefinitionsEpoch } from '../src/utils/ordo/definitions.js';

// Local: actual Laudes.vue + curated offline source. Public: fresh browser,
// real public data, no seeded cache or intercepted Firestore responses.
const publicRun = process.argv.includes('--public');
const base = process.env.SMOKE_BASE_URL || (publicRun ? 'https://ibreviaryby.web.app' : 'http://127.0.0.1:4174');
const fixture = JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../tests/fixtures/advent-vespers-days.json.gz', import.meta.url))));
const source = {
  days: fixture.days, daysById: new Map(fixture.days.map((d) => [d.id, d])),
  readings: [], properDocs: fixedDocsFor('25.12', { migrated: true }), templates: templatesFixture(),
};
const dates = ['2025-12-21', '2026-12-20', '2027-12-19', '2028-12-24', '2029-12-23', '2030-12-22', '2031-12-21', '2032-12-19'];
const dioceses = ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'];
const expected = new Map(dioceses.flatMap((diocese) => dates.map((date) => [`${date}:${diocese}`, contentFor(source, date, { diocese })])));
const output = path.resolve(`outputs/advent-lauds/${publicRun ? 'public' : 'local'}`);
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox'], ...(publicRun && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
});
const results = [];
let activePage;
try {
  for (const profile of [
    { name: 'desktop-light', width: 1280, height: 900, theme: 'light' },
    { name: 'mobile-dark', width: 390, height: 844, theme: 'dark' },
  ]) {
    const context = await browser.newContext({ viewport: profile, colorScheme: profile.theme, serviceWorkers: 'block' });
    if (!publicRun) await context.route('**/*', (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage();
    activePage = page;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    await page.evaluate(async ({ entries, revision, schema, project, theme, calendarVersion }) => {
      localStorage.setItem('themePreference', theme);
      if (!entries) return;
      const db = await new Promise((resolve, reject) => {
        const request = window.indexedDB.open(`mybrev-public-${project}-v${schema}`, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('entries');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('entries', 'readwrite');
        for (const [key, data] of entries) {
          const [date, diocese] = key.split(':');
          tx.objectStore('entries').put(JSON.stringify({ data, complete: true, revision: `${revision}:`, fetchedAt: Date.now() }), JSON.stringify(['content', date, diocese, calendarVersion]));
        }
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, { entries: publicRun ? null : [...expected], revision: CONTENT_REVISION, schema: CONTENT_CACHE_SCHEMA,
      project: process.env.VITE_FIREBASE_PROJECT_ID || 'unconfigured', theme: profile.theme,
      calendarVersion: `calendar:${getCalendarDefinitions().revision}:${getDefinitionsEpoch()}` });
    for (const diocese of dioceses) {
      for (const date of dates) {
        const content = expected.get(`${date}:${diocese}`);
        const day = content.dayOptions[0].day;
        const url = `${base}/day/${date}/ora/${day.id}/laudes?diocese=${diocese}`;
        await page.goto(url);
        const canticle = page.locator('.ora').filter({ has: page.locator('.ora-title', { hasText: 'ПЕСНЯ З ЕВАНГЕЛЛЯ' }) });
        const antiphons = canticle.locator('.ora-ant');
        await antiphons.first().waitFor({ state: 'visible', timeout: 45000 });
        // HTML <br>/paragraph boundaries have different textContent spacing;
        // compare all actual characters, while the stored model below checks HTML provenance.
        const expectedCharacters = plain(day.laudesAntBen).replace(/\s/g, '');
        await page.waitForFunction((text) => [...document.querySelectorAll('.ora')]
          .find((el) => el.querySelector('.ora-title')?.textContent.trim() === 'ПЕСНЯ З ЕВАНГЕЛЛЯ')
          ?.querySelector('.ora-ant')?.textContent.replace(/\s/g, '') === text, expectedCharacters, { timeout: 45000 });
        assert.equal(await antiphons.count(), 2, 'antiphon surrounds the canticle');
        for (const text of await antiphons.allTextContents()) assert.equal(text.replace(/\s/g, ''), expectedCharacters);
        assert.equal(await canticle.locator('[role="tab"]').count(), 0, 'only the selected cycle is rendered');
        if (date === '2028-12-24') {
          const text = await page.locator('.prayer-content-area').innerText();
          for (const pattern of [/Іс 11, 1-3а/, /Заўтра.*будзе знішчана беззаконне зямлі/s, /Ты, Бэтлеем/, /Пане, наш Езу, прыйдзі хутчэй/]) assert.match(text, pattern);
          assert.doesNotMatch(text, /КАРОТКАЕ ЧЫТАННЕ Рым 13/);
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow');
        // Inspect the persisted assembled model that the public service fetched.
        const stored = await page.evaluate(async ({ date, diocese }) => {
          for (const { name } of await window.indexedDB.databases()) {
            if (!name.startsWith('mybrev-public-')) continue;
            const db = await new Promise((resolve) => { const r = window.indexedDB.open(name); r.onsuccess = () => resolve(r.result); });
            const raw = await new Promise((resolve, reject) => {
              const r = db.transaction('entries').objectStore('entries').openCursor();
              r.onsuccess = () => {
                const cursor = r.result;
                if (!cursor) return resolve(null);
                const key = JSON.parse(cursor.key);
                if (key[0] === 'content' && key[1] === date && key[2] === diocese) return resolve(cursor.value);
                cursor.continue();
              };
              r.onerror = () => reject(r.error);
            });
            db.close();
            if (raw) return JSON.parse(raw);
          }
          return null;
        }, { date, diocese });
        assert.ok(stored?.complete, 'complete assembled content persisted');
        const actual = stored.data.dayOptions[0].day;
        assert.equal(stored.data.ordo.readingCycle.sunday, content.resolved.readingCycle.sunday);
        assert.deepEqual(actual._fieldSources.laudesAntBen, day._fieldSources.laudesAntBen);
        assert.equal(plain(actual.laudesAntBen), plain(day.laudesAntBen));
        const row = { date, diocese, profile: profile.name, url, status: 'PASS',
          cycle: stored.data.ordo.readingCycle.sunday, source: actual._fieldSources.laudesAntBen, text: plain(actual.laudesAntBen) };
        results.push(row);
        if (diocese === 'minsk-mohilev') await page.screenshot({ path: path.join(output, `${date}-${profile.name}.png`), fullPage: true });
        console.log(`${date} ${diocese} ${profile.name}: PASS (${row.cycle}, ${row.source.document})`);
      }
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
} catch (error) {
  console.error('Browser failure:', activePage?.url(), (await activePage?.locator('body').innerText())?.slice(0, 600));
  await activePage?.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
  throw error;
} finally {
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ base, publicRun, checkedAt: new Date().toISOString(), results }, null, 2) + '\n');
  await browser.close();
}
