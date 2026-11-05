import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';
import calendar from '../src/data/documents/proper-calendar.json' with { type: 'json' };
import decrees from '../src/data/documents/liturgy-hours-decrees.json' with { type: 'json' };

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';
const output = process.env.SOURCE_EVIDENCE_DIR || 'reports/source-review/documents';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const normalize = text => text.replace(/\s+/gu, ' ').trim();
const results = [];
try {
  for (const theme of (process.env.SMOKE_THEMES || 'light,dark').split(',')) {
    for (const width of (process.env.SMOKE_WIDTHS || '320,390,768,1440').split(',').map(Number)) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, serviceWorkers: 'block' });
      await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseUrl).origin ? route.continue() : route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const overflow = async label => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label}: ${width}/${theme} overflow`);
      await page.goto(`${baseUrl}/about`);
      await page.getByRole('link', { name: 'Крыніцы і аўтарскія правы' }).click();
      await page.getByRole('heading', { name: 'Крыніцы і аўтарскія правы', level: 1 }).waitFor();
      assert.equal(await page.locator('.source-rights__entry').count(), 6);
      assert.equal(await page.getByRole('link', { name: 'Дэкрэты Літургіі гадзінаў', exact: true }).count(), 1);
      assert.equal(await page.locator('#liturgy-hours-2012-2020 a').count(), 0);
      assert.equal(normalize(await page.locator('#bible-nt-kkbb-2017').innerText()), '«Новы Запавет» (Мінск, 2017) © Канферэнцыя Каталіцкіх Біскупаў Беларусі, 2017');
      assert.doesNotMatch(await page.locator('.sources-page').innerText(), /пераклад ККББ|Copyright/);
      assert.match(await page.locator('#bible-charniauski-2017').innerText(), /^Стары Запавет — пераклад кс. Уладзіслава Чарняўскага MIC/);
      assert.doesNotMatch(await page.locator('.sources-page').innerText(), /pending|requires_verification|Стан праверкі|парсер|Чацвёрты дэкрэт|лічбавае выкарыстанне/);
      await overflow('Sources');
      await page.screenshot({ path: `${output}/sources-${width}-${theme}.png`, fullPage: true });
      if (process.env.SMOKE_SOURCES_ONLY === '1') {
        results.push({ width, theme, sources: 6, status: 'PASS' });
        console.log(`${width}/${theme}: final source bibliography, scope labels, typography, links, no overflow: PASS`);
        await context.close();
        continue;
      }
      await page.getByRole('link', { name: 'Дэкрэты Літургіі гадзінаў', exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.locator('.decree').last().waitFor();
      assert.equal(await page.locator('.decree').count(), 4);
      for (const doc of decrees.documents) {
        const rendered = await page.locator(`#${doc.id}`).innerText();
        assert.equal(normalize(rendered.replace(`Том ${doc.roman}`, '')), normalize(doc.fullText));
      }
      await page.getByRole('link', { name: 'Том IV', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#volume-4').getBoundingClientRect().top < window.innerHeight);
      await overflow('Decrees');
      await page.screenshot({ path: `${output}/decrees-${width}-${theme}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Назад', exact: true }).click();
      await page.locator('.sources-page').waitFor();
      await page.getByRole('link', { name: calendar.title, exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.locator('.calendar-page').last().waitFor();
      assert.equal(await page.locator('.calendar-month').count(), 12);
      assert.equal(await page.locator('p.calendar-intro').count(), 1);
      const intro = calendar.pages[0].rows.filter(row => row.kind === 'intro').map(row => row.runs.map(run => run.text).join('')).join(' ');
      assert.equal(await page.locator('p.calendar-intro').textContent(), intro);
      assert.equal(await page.locator('.calendar-row[data-date]').count(), 365);
      assert.equal(await page.locator('.calendar-page').count(), 13);
      assert.equal(await page.getByRole('heading', { name: calendar.title, exact: true }).innerText(), calendar.title);
      assert.equal(await page.getByRole('link', { name: 'Арыгінал PDF' }).getAttribute('href'), '/documents/proper-calendar.pdf');
      for (const original of calendar.pages) {
        const expected = original.rows.map(row => row.kind === 'month' ? row.text : `${row.date ? `${row.date}.` : ''}${(row.runs || []).map(r => r.text).join('')}${(row.rank || []).map(r => r.text).join('')}`).join('');
        const actual = await page.locator(`[data-page="${original.number}"]`).textContent();
        assert.equal(actual.replace(/\s+/gu, ''), expected.replace(/\s+/gu, ''), `PDF sheet ${original.number}: every visible character and reading order`);
      }
      const styles = await page.evaluate(() => {
        const get = selector => { const e = document.querySelector(selector); const s = getComputedStyle(e); return { color: s.color, italic: s.fontStyle, size: s.fontSize, weight: s.fontWeight }; };
        return { month: get('.calendar-month'), red: get('.doc-tone--red'), italic: get('.doc-italic'), small: get('.doc-small'), rank: get('.calendar-rank .doc-tone--red'), text: get('.calendar-text') };
      });
      assert.equal(styles.italic.italic, 'italic');
      assert.notEqual(styles.month.color, styles.text.color);
      assert.notEqual(styles.rank.color, styles.text.color);
      assert.ok(parseFloat(styles.small.size) < parseFloat(styles.text.size));
      await overflow('Calendar');
      await page.screenshot({ path: `${output}/calendar-${width}-${theme}.png`, fullPage: true });
      if (width === 1440 && theme === 'light') {
        for (let number = 1; number <= 13; number++) await page.locator(`[data-page="${number}"]`).screenshot({ path: `${output}/html-sheet-${String(number).padStart(2, '0')}.png` });
      }
      for (const month of calendar.months) {
        await page.getByRole('link', { name: month.title, exact: true }).click();
        await page.waitForFunction(id => document.getElementById(id).getBoundingClientRect().top < window.innerHeight, month.id);
      }
      await page.getByRole('button', { name: 'Назад', exact: true }).click();
      await page.locator('.sources-page').waitFor();
      // Direct URLs in a fresh page must use the safe Sources fallback.
      for (const path of ['/documents/proper-calendar#month-7', '/documents/liturgy-hours-decrees#volume-4']) {
        const isolated = await context.newPage();
        await isolated.goto(`${baseUrl}${path}`);
        await isolated.locator('.document-page').waitFor();
        await isolated.getByRole('button', { name: 'Назад', exact: true }).click();
        await isolated.locator('.sources-page').waitFor();
        await isolated.close();
      }
      assert.deepEqual(errors, []);
      results.push({ width, theme, pages: 13, dates: 365, decrees: 4, status: 'PASS' });
      console.log(`${width}/${theme}: four complete decrees, all 13 PDF sheets, 365 dates, styles, anchors, safe back, no overflow: PASS`);
      await context.close();
    }
  }
} finally { await browser.close(); }
await fs.writeFile(`${output}/${process.env.SMOKE_SOURCES_ONLY === '1' ? 'sources-results' : 'results'}.json`, JSON.stringify(results, null, 2) + '\n');
