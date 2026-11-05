import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { SOURCES } from '../src/constants/sources.js';

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const output = 'docs/sources/evidence';
await fs.mkdir(output, { recursive: true });
const noOverflow = async (page, width) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}: horizontal overflow`);
try {
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    // Never read or write live Firestore or other remote services in this check.
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseUrl).origin ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(`${baseUrl}/about`);
    const sourcesLink = page.getByRole('link', { name: 'Крыніцы і аўтарскія правы' });
    await sourcesLink.waitFor();
    assert.equal(await sourcesLink.count(), 1);
    assert.equal(await page.locator('.source-rights').count(), 0);
    assert.equal(await page.getByText('Распрацоўшчык @davin_dev', { exact: true }).count(), 1);
    assert.equal(await page.locator('.about-emblem').getAttribute('src'), '/maria-menu-logo.svg');
    await noOverflow(page, width);
    await page.screenshot({ path: `${output}/about-${width}.png`, fullPage: true });
    await sourcesLink.click();
    await page.getByRole('heading', { name: 'Крыніцы і аўтарскія правы', level: 1 }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/sources');
    const contentBounds = await page.locator('.sources-page main').boundingBox();
    assert.ok(contentBounds.x >= 16 && contentBounds.x + contentBounds.width <= width - 16, `${width}: readable side margins`);
    assert.deepEqual(await page.locator('.source-rights h2').allTextContents(), ['Святое Пісанне', 'Чытанні', 'Літургія гадзінаў', 'Кампендый ККК']);
    assert.deepEqual(await page.locator('.source-rights__entry').evaluateAll(elements => elements.map(element => element.id)), [
      'bible-nt-kkbb-2017', 'bible-charniauski-2017', 'bible-ru-synodal', 'lectionary-kkbb-2002-2005', 'liturgy-hours-2012-2020', 'compendium-kkbb-2010',
    ]);
    const text = await page.locator('.source-rights').textContent();
    for (const source of SOURCES) {
      for (const notice of source.copyrightNotices) assert.ok(text.includes(notice), notice);
      for (const pending of source.verification.pending) assert.ok(!text.includes(pending));
    }
    for (const edition of ['«Новы Запавет» (Мінск, 2017)', '«Лекцыянарый» (Мінск, 2002–2005)', '«Катэхізіс Каталіцкага Касцёла. Кампендый» (Мінск, 2010)']) assert.ok(text.includes(edition));
    assert.doesNotMatch(text, /verification|requires_verification|pending|Патрабуе праверкі|Стан праверкі|Лічбавыя крыніцы|імпарт|парсер|лічбавае выкарыстанне|Чацвёрты|чацвёрты/);
    assert.equal(await page.locator('.source-rights details').count(), 0);
    assert.equal(await page.getByRole('link', { name: 'Дэкрэты аб выкарыстанні тэкстаў', exact: true }).getAttribute('href'), '/documents/liturgy-hours-decrees');
    await noOverflow(page, width);
    await page.screenshot({ path: `${output}/sources-${width}.png`, fullPage: true });
    await page.getByRole('link', { name: 'Пра праграму', exact: true }).click();
    await sourcesLink.waitFor();
    await page.goto(`${baseUrl}/sources#compendium-kkbb-2010`);
    await page.locator('#compendium-kkbb-2010').waitFor();
    await page.waitForFunction(() => document.querySelector('#compendium-kkbb-2010').getBoundingClientRect().top < window.innerHeight);
    await page.reload();
    await page.getByRole('heading', { name: 'Крыніцы і аўтарскія правы', level: 1 }).waitFor();
    assert.equal(await page.locator('.source-rights details').count(), 0);
    for (const [language, book, expected] of [
      ['bel', 'gn', 'Стары Запавет · пераклад кс. Уладзіслава Чарняўскага MIC'],
      ['bel', 'mt', 'Новы Запавет · пераклад ККББ, 2017'],
      ['ru', 'mt', 'Синодальный перевод'],
    ]) {
      await page.goto(`${baseUrl}/bible/${language}/${book}/1`);
      await page.locator('.bible-heading__translation').waitFor();
      assert.equal(await page.locator('.bible-heading__translation').innerText(), expected);
      assert.equal(await page.locator('.bible-page footer, .bible-page .prayer-source').count(), 0);
    }
    console.log(`${width}px: compact About, grouped Sources, bibliography, technical details hidden, decree page link, back/deep links, no overflow, unchanged Bible translations: PASS (remote requests blocked)`);
    await context.close();
  }
} finally {
  await browser.close();
}
