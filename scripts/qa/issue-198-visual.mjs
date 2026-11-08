#!/usr/bin/env node
/** Post-release visual acceptance; only reads public pages, never Firestore credentials. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = (process.env.SMOKE_BASE_URL || 'https://ibreviaryby.web.app').replace(/\/$/, '');
const directory = 'reports/liturgy/issue-198-visual-final';
const cases = [
  ['2026-10-30', 'ordinary-w30-d6', false],
  ['2027-10-29', 'ordinary-w30-d6', false],
  ['2028-11-03', 'ordinary-w30-d6', false],
  ['2026-10-31', 'ordinary-w30-d7', true],
  ['2027-10-31', 'ordinary-w31-d1', true],
];
await fs.mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const rows = [];
try {
  for (const [date, id, expectedFirst] of cases) {
    for (const [size, viewport] of [
      ['mobile', { width: 390, height: 844 }],
      ['desktop', { width: 1280, height: 800 }],
    ]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, serviceWorkers: 'block' });
      const page = await context.newPage();
      const url = base + '/day/' + date + '/ora/' + id + '/vesper?diocese=vitebsk';
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        const column = page.locator('.liturgical-hour-column');
        await column.locator('.ora-text').first().waitFor({ state: 'visible', timeout: 60000 });
        await page.waitForFunction(() => (document.querySelector('.liturgical-hour-column')?.innerText?.length || 0) > 1500,
          { timeout: 60000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(1500);
        const rubric = await page.locator('.vespers-rubric-chip').allInnerTexts();
        const actualFirst = rubric.some(x => /I Нешпары/.test(x) && !/II Нешпары/.test(x));
        assert.equal(actualFirst, expectedFirst, date + ' ' + size + ': wrong rubric ' + rubric);
        if (!expectedFirst) assert.ok(!rubric.some(x => x.includes('Усіх Святых')), 'Improper feast on Friday');
        const text = await column.innerText();
        assert.ok(text.length > 1500, date + ' ' + size + ': missing Vespers text');
        const filename = directory + '/' + date + '-' + size + '.png';
        await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
        await page.screenshot({ path: filename, fullPage: true, animations: 'disabled' });
        const bytes = (await fs.stat(filename)).size;
        // A tall rendered Vespers office produces several hundred KB of text pixels;
        // the previous race produced blank 68–134 KB screenshots despite live DOM.
        assert.ok(bytes >= 200000, date + ' ' + size + ': screenshot is visually blank or incomplete (' + bytes + ' bytes)');
        rows.push({ date, size, firstVespers: actualFirst, rubric, screenshot: filename, bytes, textChars: text.length, url });
        console.log('PASS', date, size, bytes, 'bytes');
      } finally { await context.close(); }
    }
  }
} finally { await browser.close(); }
await fs.writeFile(directory + '/results.json', JSON.stringify({ passed: rows.length, rows }, null, 2) + '\n');
assert.equal(rows.length, cases.length * 2);
console.log('FINAL VISUAL QA:', rows.length, 'screenshots with nonblank pixel content');
