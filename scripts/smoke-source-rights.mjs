import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const output = 'docs/sources/evidence';
await fs.mkdir(output, { recursive: true });
try {
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    // This smoke check must never read or write live Firestore or other remote services.
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseUrl).origin ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(`${baseUrl}/about`);
    await page.getByRole('heading', { name: 'Крыніцы і аўтарскія правы' }).waitFor();
    assert.equal(await page.locator('.source-rights__entry').count(), 6);
    await page.locator('.source-rights summary').evaluateAll(elements => elements.forEach(element => { element.parentElement.open = true; }));
    assert.equal(await page.locator('.source-rights').getByText('© Канферэнцыя Каталіцкіх Біскупаў Беларусі, 2017', { exact: true }).count(), 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}: horizontal overflow`);
    const links = await page.locator('.source-rights a').evaluateAll(elements => elements.map(element => ({ href: element.href, rel: element.rel })));
    assert.ok(links.every(link => link.href.startsWith('https:') && link.rel.includes('noopener')));
    await page.locator('.source-rights summary').first().focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.source-rights details').first().getAttribute('open'), null);
    await page.keyboard.press('Enter');
    if (width !== 320) await page.screenshot({ path: `${output}/about-${width}.png`, fullPage: true });
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
    console.log(`${width}px: six entries, expanded verification/decrees, keyboard toggle, links, no overflow, three Bible translations: PASS (remote requests blocked)`);
    await context.close();
  }
} finally {
  await browser.close();
}
