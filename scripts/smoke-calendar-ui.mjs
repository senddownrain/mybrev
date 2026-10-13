import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = `${root}/reports/calendar-ui`;
await mkdir(output, { recursive: true });
const server = await createServer({ configFile: false, root,
  plugins: [vue(), vuetify({ autoImport: true })],
  resolve: { alias: { '@': `${root}/src` } },
  optimizeDeps: { entries: ['tests/ui/calendar-harness.mjs'] },
  server: { host: '127.0.0.1', port: 5198, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.BENCHMARK_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const context = await browser.newContext({ colorScheme: 'light' });
const page = await context.newPage();
page.setDefaultTimeout(30_000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
// Entire test is local: calendar options come from the bundled engine.
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.origin !== 'http://127.0.0.1:5198') return route.abort();
  if (url.pathname === '/__calendar') return route.fulfill({ contentType: 'text/html', body: '<html lang="be"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module" src="/tests/ui/calendar-harness.mjs"></script></html>' });
  return route.continue();
});
try {
  await page.goto('http://127.0.0.1:5198/__calendar', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => window.calendarUi, null, { timeout: 60_000 });
  const dialog = page.locator('.liturgical-date-dialog.v-overlay--active');
  const select = async (selector, title) => {
    await dialog.locator(selector).click();
    await page.locator('.date-picker-select-menu').getByRole('option', { name: title, exact: true }).click();
  };
  const check = async () => {
    const result = await dialog.evaluate(el => {
      const rect = selector => el.querySelector(selector).getBoundingClientRect();
      const selectors = ['.month-nav-btn:first-child', '.month-select', '.year-select', '.month-nav-btn:last-child'];
      const boxes = selectors.map(rect);
      const title = rect('.date-dialog-title'), footer = rect('.date-dialog-actions');
      const capsule = getComputedStyle(el.querySelector('.calendar-period'));
      const content = el.querySelector('.date-dialog-content');
      return {
        oneRow: boxes.every(b => Math.abs((b.top + b.bottom) / 2 - (boxes[0].top + boxes[0].bottom) / 2) <= 2),
        separate: boxes.slice(1).every((b, i) => b.left >= boxes[i].right - 1),
        fullText: [...el.querySelectorAll('.v-select__selection-text')].every(n => n.scrollWidth <= n.clientWidth + 1),
        capsule: capsule.display === 'grid' && parseFloat(capsule.borderRadius) >= 20,
        divider: getComputedStyle(el.querySelector('.year-select'), '::before').width === '1px',
        visible: title.top >= 0 && footer.bottom <= window.innerHeight && el.contains(document.elementFromPoint(title.left + 20, title.top + 20)),
        overflow: content.scrollWidth > content.clientWidth + 1,
      };
    });
    assert.deepEqual(result, { oneRow: true, separate: true, fullText: true, capsule: true, divider: true, visible: true, overflow: false });
  };
  for (const [width, height] of [[320,568], [360,740], [390,844], [430,932]]) {
    await page.setViewportSize({ width, height });
    for (const mode of ['day', 'readings', 'ordo']) {
      await page.evaluate(mode => window.calendarUi.router.push(`/${mode}/2026-10-04`), mode);
      await page.locator('.pill-nav-outer [aria-label="Каляндар"]').click();
      await dialog.waitFor();
      await page.waitForTimeout(300);
      if (mode === 'day') {
        for (const month of ['студзень','люты','сакавік','красавік','май','чэрвень','ліпень','жнівень','верасень','кастрычнік','лістапад','снежань']) {
          await select('.month-select', month);
          await check();
        }
      }
      await select('.month-select', 'кастрычнік');
      await select('.year-select', '2027');
      await select('.year-select', '2026');
      await check();
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => { window.calendarUi.theme.global.name.value = theme; }, theme);
        await page.waitForTimeout(80);
        await check();
        await page.screenshot({ path: `${output}/${mode}-${width}-${theme}.png` });
      }
      await page.evaluate(() => { window.calendarUi.theme.global.name.value = 'light'; });
      await dialog.getByLabel('Наступны месяц', { exact: true }).click();
      assert.equal(await dialog.locator('.month-select .v-select__selection-text').innerText(), 'лістапад');
      await dialog.getByLabel('Папярэдні месяц', { exact: true }).click();
      await select('.month-select', 'снежань');
      await dialog.locator('.day-btn').filter({ hasText: /^4$/ }).click();
      if (mode !== 'ordo') {
        assert.ok(await dialog.locator('.day-option').count() > 1);
        await dialog.locator('.day-options').evaluate(el => { for (let i = 0; i < 20; i++) el.append(el.querySelector('.day-option').cloneNode(true)); });
        const footer = await dialog.locator('.date-dialog-actions').boundingBox();
        await dialog.locator('.date-dialog-content').evaluate(el => { el.scrollTop = el.scrollHeight; });
        const last = await dialog.locator('.day-option').last().boundingBox();
        assert.ok(last.y + last.height <= footer.y + 1);
        assert.deepEqual(await dialog.locator('.date-dialog-actions').boundingBox(), footer);
      }
      await check();
      await dialog.getByRole('button', { name: 'Выбраць', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.ok(page.url().includes('2026-12-04'));
    }
    console.log(`Passed ${width}x${height}: Hours, Readings, Ordo; all month names, year/date selection, scrolling and footer.`);
  }
  assert.deepEqual(errors, []);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
