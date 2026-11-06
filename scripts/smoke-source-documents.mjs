import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';
import calendar from '../src/data/documents/proper-calendar.json' with { type: 'json' };
import decrees from '../src/data/documents/liturgy-hours-decrees.json' with { type: 'json' };
import introduction from '../src/data/documents/liturgy-hours-introduction.json' with { type: 'json' };
import apostolic from '../src/data/documents/apostolic-see-decrees.json' with { type: 'json' };

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';
const output = process.env.SOURCE_EVIDENCE_DIR || 'reports/source-review/documents';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const normalize = text => text.replace(/\s+/gu, ' ').trim();
const results = [];
try {
  for (const theme of (process.env.SMOKE_THEMES || 'light,dark,marian').split(',')) {
    for (const width of (process.env.SMOKE_WIDTHS || '320,390,1440').split(',').map(Number)) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 600, hasTouch: width < 600, colorScheme: theme === 'dark' ? 'dark' : 'light', ignoreHTTPSErrors: process.env.SMOKE_LOCAL_HTTPS === '1', serviceWorkers: 'block' });
      await context.addInitScript(value => localStorage.setItem('themePreference', value), theme);
      await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseUrl).origin ? route.continue() : route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const overflow = async label => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label}: ${width}/${theme} overflow`);
      await page.goto(`${baseUrl}/about`);
      await page.getByRole('link', { name: 'Крыніцы і аўтарскія правы' }).click();
      await page.getByRole('heading', { name: 'Крыніцы і аўтарскія правы', level: 1 }).waitFor();
      await page.locator(`.v-theme--${theme}`).first().waitFor();
      assert.equal(await page.locator('.source-rights__entry').count(), 6);
      assert.equal(await page.getByRole('link', { name: 'Дэкрэты Літургіі гадзінаў', exact: true }).count(), 1);
      assert.equal(await page.locator('#liturgy-hours-2012-2020 a').count(), 0);
      assert.equal(normalize(await page.locator('#bible-nt-kkbb-2017').innerText()), '«Новы Запавет» (Мінск, 2017) © Канферэнцыя Каталіцкіх Біскупаў Беларусі, 2017');
      assert.equal(normalize(await page.locator('#liturgy-hours-2012-2020').innerText()), '«Літургія гадзінаў» (Мінск, 2012–2020) © Канферэнцыя Каталіцкіх Біскупаў Беларусі');
      assert.equal(normalize(await page.locator('#compendium-kkbb-2010').innerText()), 'Катэхізіс Каталіцкага Касцёла. Кампендый (Мінск, 2010) © Канферэнцыя Каталіцкіх Біскупаў Беларусі, 2010');
      assert.doesNotMatch(await page.locator('.sources-page').innerText(), /Libreria|Vaticana|2005.*LEV/);
      assert.equal(await page.locator('.sources-documents a').count(), 3);
      const documentPaths = await page.locator('.sources-documents a').evaluateAll(links => links.map(link => link.getAttribute('href')));
      assert.deepEqual(documentPaths, ['/documents/liturgy-hours-decrees', '/documents/liturgy-hours-introduction', '/documents/proper-calendar']);
      assert.equal(new Set(documentPaths).size, 3);
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
      assert.equal(await page.locator('.apostolic-decree').count(), 2);
      for (const document of apostolic.documents) assert.match(await page.locator(`#${document.id}`).innerText(), new RegExp(document.protocol));
      assert.doesNotMatch(await page.locator('.decrees-page').innerText(), /Том V|Том VI/);
      const proseStyles = await page.locator('.decree__paragraph').first().evaluate(element => {
        const style = getComputedStyle(element);
        return { align: style.textAlign, last: style.textAlignLast, hyphens: style.hyphens, lang: element.closest('[lang]').lang };
      });
      assert.deepEqual(proseStyles, { align: 'justify', last: 'left', hyphens: 'auto', lang: 'be' });
      for (const selector of ['.decree h2', '.decree h3', '.decree__issuer', '.decree__number', '.decree__date', '.decree__signature', '.document-index']) {
        assert.notEqual(await page.locator(selector).first().evaluate(element => getComputedStyle(element).textAlign), 'justify');
      }
      await page.getByRole('link', { name: apostolic.title, exact: true }).click();
      await page.waitForFunction(() => document.getElementById('apostolic-see').getBoundingClientRect().top < window.innerHeight);
      await page.getByRole('link', { name: 'Том IV', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#volume-4').getBoundingClientRect().top < window.innerHeight);
      await overflow('Decrees');
      await page.screenshot({ path: `${output}/decrees-${width}-${theme}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Назад', exact: true }).click();
      await page.locator('.sources-page').waitFor();
      await page.getByRole('link', { name: introduction.title, exact: true }).click();
      await page.getByRole('heading', { name: introduction.title, level: 1 }).waitFor();
      assert.equal(await page.locator('.introduction-section').count(), 3);
      assert.equal(await page.getByRole('link', { name: 'Чытаць поўны тэкст на lh.catholic.by' }).getAttribute('href'), introduction.fullTextUrl);
      for (const section of introduction.sections) {
        await page.locator('.introduction-index').getByRole('link', { name: section.title, exact: true }).click();
        await page.waitForURL(url => url.hash === `#${section.id}`);
        await page.waitForFunction(id => document.getElementById(id).getBoundingClientRect().top < window.innerHeight, section.id);
        assert.ok(page.url().endsWith(`#${section.id}`));
      }
      assert.equal(await page.locator('.introduction-section .document-prose').first().evaluate(element => getComputedStyle(element).textAlign), 'justify');
      await overflow('Introduction');
      await page.screenshot({ path: `${output}/introduction-${width}-${theme}.png`, fullPage: true });
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
      assert.equal(await page.locator('.calendar-intro').evaluate(element => getComputedStyle(element).textAlign), 'justify');
      assert.equal(await page.locator('.calendar-rank').first().evaluate(element => getComputedStyle(element).textAlign), 'start');
      const rankGeometry = await page.locator('.calendar-row:has(.calendar-rank)').evaluateAll(rows => rows.every(row => {
        const text = row.querySelector('.calendar-text').getBoundingClientRect();
        const rank = row.querySelector('.calendar-rank').getBoundingClientRect();
        return rank.left >= text.right && Math.abs(rank.top - text.top) < 1;
      }));
      assert.ok(rankGeometry, `${width}/${theme}: ranks stay in their own column`);
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
      for (const path of ['/documents/proper-calendar#month-7', '/documents/liturgy-hours-decrees#volume-4', '/documents/liturgy-hours-introduction#full-text']) {
        const isolated = await context.newPage();
        const response = await isolated.goto(`${baseUrl}${path}`);
        assert.equal(response.status(), 200);
        await isolated.locator('.document-page').waitFor();
        assert.equal(await isolated.locator('.document-page').getAttribute('lang'), 'be');
        await isolated.getByRole('button', { name: 'Назад', exact: true }).click();
        await isolated.locator('.sources-page').waitFor();
        await isolated.close();
      }
      assert.deepEqual(errors, []);
      results.push({ width, theme, protocol: new URL(baseUrl).protocol, pages: 13, dates: 365, decrees: 4, apostolicReferences: 2, introduction: 'official_link', status: 'PASS' });
      console.log(`${width}/${theme}: four complete decrees, two Roman references, introduction links, 13 PDF sheets, 365 dates, columns, anchors, safe back, no overflow: PASS`);
      await context.close();
    }
  }
} finally { await browser.close(); }
await fs.writeFile(`${output}/${process.env.SMOKE_SOURCES_ONLY === '1' ? 'sources-results' : 'results'}.json`, JSON.stringify(results, null, 2) + '\n');
