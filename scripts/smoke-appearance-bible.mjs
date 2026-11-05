/** Supplementary Bible presentation check with a LOCAL public seed.
 * Only the data service is substituted; the real view, layouts and themes run.
 * No Firebase reads/writes. No seed content is copied into production assets.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { APP_STATUS_BAR_COLORS } from '../src/constants/appearance.js';

const seed = JSON.parse(zlib.gunzipSync(fs.readFileSync('scripts/bible/bible_seed_bel_mixed.json.gz')));
const sourceBook = seed.books.find((book) => book.id === 'mt');
const book = { ...sourceBook, chapterCount: sourceBook.chapters.length, chapters: Object.fromEntries(sourceBook.chapters.map((verses, index) => [String(index + 1), verses])) };
const output = process.env.APPEARANCE_EVIDENCE_DIR || 'outputs/appearance-bible';
fs.mkdirSync(output, { recursive: true });
const server = await createServer({
  cacheDir: 'node_modules/.vite-appearance-bible',
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 4186, strictPort: true },
  plugins: [{
    name: 'appearance-local-bible-fixture', enforce: 'pre',
    transform(_source, id) {
      if (id.split('?')[0].endsWith('/src/services/bibleService.js')) {
        return `export async function fetchBibleBook() { return ${JSON.stringify(book)}; }`;
      }
    },
  }],
});
await server.listen();
const base = 'http://127.0.0.1:4186';
const browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || '/usr/bin/chromium', headless: true });
const results = [];
try {
  for (const width of [390, 1440]) for (const theme of ['marian', 'light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('**/*', (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await context.addInitScript((theme) => {
      Object.defineProperty(navigator, 'onLine', { get: () => false });
      localStorage.setItem('themePreference', theme);
    }, theme);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/bible/bel/mt/1`);
    await page.locator('.bible-verse').first().waitFor();
    assert.ok(await page.locator('.bible-verse').count() >= 20);
    assert.equal(await page.locator('.bible-verse > span').first().textContent(), book.chapters['1'][0].text);
    assert.equal(await page.getAttribute('html', 'data-appearance'), theme);
    assert.equal(await page.getAttribute('meta[name="theme-color"]', 'content'), APP_STATUS_BAR_COLORS[theme]);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: `${output}/${width}-${theme}-bible.png`, animations: 'disabled' });
    await page.locator('.bible-verse').first().click();
    await page.getByRole('complementary', { name: 'Колер вылучэння' }).waitFor();
    const highlights = await page.locator('.bible-color-button:not(.bible-color-button--clear)').evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
    assert.deepEqual(highlights, ['rgb(226, 174, 52)', 'rgb(211, 112, 116)', 'rgb(79, 159, 193)', 'rgb(89, 164, 107)']);
    await page.getByRole('button', { name: 'Скасаваць выбар', exact: true }).click();
    await page.locator('.bible-bottom-nav__current').click();
    await page.locator('.bible-picker').waitFor();
    await page.screenshot({ path: `${output}/${width}-${theme}-bible-picker.png`, animations: 'disabled' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(errors, []);
    results.push(`${width}px ${theme}: Bible chapter, original highlight colours, teleported book picker, no overflow/errors`);
    console.log(`PASS ${results.at(-1)}`);
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
  fs.writeFileSync(`${output}/results.json`, JSON.stringify({ fixture: 'local public Bible seed; remote requests blocked; data service substituted in Vite only', results }, null, 2));
}
