import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const documents = {};
for (const [collection, id, path] of [
  ['liturgicalProperTexts', '06-12-sv-nicholas', 'patchs/db-feasts/06-12-sv-nicholas.json'],
  ['liturgicalTemplates', 'pastors', 'patchs/db-templates/pastors.json'],
]) {
  const source = JSON.parse(await readFile(`${root}/${path}`, 'utf8'));
  documents[`${collection}/${id}`] = { ...source, id };
}
for (const cycle of ['A', 'B', 'C']) documents[`readings/advent-w4-d1--${cycle}`] = {
  id: `advent-w4-d1--${cycle}`, title: 'IV нядзеля Адвэнту', year: cycle,
  _periodType: 'advent', _periodWeekNumber: 4, _dayOfWeek: 1, gospel: { bible: 'Лк 1', text: `Чытанне цыкла ${cycle}` },
};
const server = await createServer({ configFile: false, root, cacheDir: `${root}/.cache/vite-catalog-ui`,
  plugins: [
    { name: 'catalog-offline-fixtures', resolveId(id) { if (id === 'virtual:catalog-fixtures') return '\0catalog-fixtures'; },
      load(id) { if (id === '\0catalog-fixtures') return `export const documents = ${JSON.stringify(documents)};`; } },
    vue(), vuetify({ autoImport: true }),
  ],
  resolve: { alias: [
    { find: '@/services/catalogPreviewService', replacement: `${root}/tests/ui/catalog-preview-service.mjs` },
    { find: '@', replacement: `${root}/src` },
  ] },
  optimizeDeps: { entries: ['tests/ui/catalog-harness.mjs'] },
  server: { host: '127.0.0.1', port: 5197, strictPort: true, hmr: false,
    watch: { ignored: ['**/reports/**', '**/dist/**', '**/.cache/**'] } },
});
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.BENCHMARK_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 320, height: 760 } });
const page = await context.newPage();
page.setDefaultTimeout(30_000);
const errors = [], external = [];
page.on('pageerror', (error) => errors.push(error.message));
await context.route('**/*', (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== 'http://127.0.0.1:5197') { external.push(url.host); return route.abort(); }
  if (url.pathname === '/__catalog') return route.fulfill({ contentType: 'text/html', body: '<html lang="be"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module" src="/tests/ui/catalog-harness.mjs"></script></html>' });
  return route.continue();
});
const go = async (query) => page.evaluate((query) => window.catalogUi.router.push({ name: 'LiturgicalPicker', query }), query);
const noOverflow = async () => {
  // Vue starts a window transition after the navigation promise resolves.
  // Wait for its real geometry, not just a class sampled before it is added.
  await page.evaluate(() => new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))));
  await page.waitForFunction(() => !document.querySelector('.picker-window [class*="enter-active"], .picker-window [class*="leave-active"]')
    && [...document.querySelectorAll('.picker-page button, .picker-page input, .picker-page select, .picker-page p')]
      .filter((el) => el.getClientRects().length).every((el) => { const rect = el.getBoundingClientRect(); return rect.left >= -1 && rect.right <= window.innerWidth + 1; }), null, { timeout: 5000 }).catch(() => {});
  const clipped = await page.locator('.picker-page').evaluate((root) => [...root.querySelectorAll('button, input, select, h1, h2, h3, p, summary, .calendar-controls')]
    .filter((el) => el.getClientRects().length).filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.right > window.innerWidth + 1 || rect.left < -1;
    }).map((el) => ({ element: el.tagName + ':' + el.textContent.slice(0, 40), left: el.getBoundingClientRect().left, width: el.getBoundingClientRect().width,
      ancestors: [...function* () { for (let parent = el.parentElement; parent && parent !== root; parent = parent.parentElement) yield `${parent.className}: ${parent.getBoundingClientRect().width}`; }()] })));
  if (clipped.length) await page.screenshot({ path: `${root}/reports/catalog-ui/layout-failure.png`, fullPage: true });
  assert.deepEqual(clipped, [], 'controls and text fit even inside an overflow-hidden app shell');
};
try {
  await page.goto('http://127.0.0.1:5197/__catalog', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => window.catalogUi, null, { timeout: 60_000 }).catch((error) => { console.error('Bootstrap errors:', errors); throw error; });
  assert.equal(await page.getByLabel('Каляндарны год', { exact: true }).count(), 0, 'no global year filter');
  await page.getByRole('searchbox', { name: 'Пошук свята' }).fill('06.12');
  await page.getByRole('heading', { name: 'Св. Мікалая, біскупа', exact: true }).waitFor();
  const row = page.locator('.feast-row').filter({ has: page.getByRole('heading', { name: 'Св. Мікалая, біскупа', exact: true }) });
  assert.equal(await row.locator('.vestment-dot').evaluate((el) => getComputedStyle(el).backgroundColor), 'rgb(243, 236, 217)');
  await row.click();
  await page.getByRole('button', { name: 'Праглядзець тэксты', exact: true }).click();
  await page.getByText('Наяўныя ўласныя і агульныя тэксты. Гэта асобныя крыніцы.', { exact: true }).waitFor();
  assert.ok((await page.locator('.source-preview').innerText()).includes('біскупа Мікалая'));
  assert.ok(await page.locator('.source-document').count() >= 2);
  assert.equal(await page.locator('.source-preview input[type=number]').count(), 0);
  await noOverflow();
  await page.getByRole('button', { name: 'Адкрыць у календары', exact: true }).click();
  await page.getByLabel('Каляндарны год', { exact: true }).fill('2026');
  await page.getByText('У гэтым годзе не адзначаецца', { exact: true }).waitFor();
  assert.ok(await page.getByRole('button', { name: 'Перайсці да літургіі гадзінаў', exact: true }).isDisabled());
  await page.getByLabel('Каляндарны год', { exact: true }).fill('2027');
  await page.getByText('Дазволены варыянт', { exact: true }).waitFor();
  await page.getByLabel('Дыяцэзія', { exact: true }).selectOption('pinsk');
  await page.getByRole('button', { name: 'Перайсці да літургіі гадзінаў', exact: true }).click();
  await page.waitForURL(/day\/2027-12-06/);
  assert.equal(await page.evaluate(() => window.catalogUi.router.currentRoute.value.query.option), 'sv-nicholas');
  assert.equal(await page.evaluate(() => window.catalogUi.router.currentRoute.value.query.diocese), 'pinsk');
  await page.goBack();
  await page.getByText('Дазволены варыянт', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Назад да пошуку', exact: true }).click();
  assert.equal(await page.getByRole('searchbox', { name: 'Пошук свята' }).inputValue(), '06.12');

  await go({ tab: 'feasts', entry: 'sv-nicholas', panel: 'calendar', year: '2027', mode: 'readings' });
  await page.getByRole('button', { name: 'Перайсці да чытанняў', exact: true }).click();
  await page.waitForURL(/readings\/2027-12-06/);
  assert.equal(await page.evaluate(() => window.catalogUi.router.currentRoute.value.query.option), 'sv-nicholas');
  await page.goBack();
  assert.equal(await page.evaluate(() => window.catalogUi.router.currentRoute.value.query.mode), 'readings');
  await page.getByRole('button', { name: 'Сёння', exact: true }).click();
  await page.waitForFunction(() => window.catalogUi.router.currentRoute.value.name === 'Readings');
  await page.goBack();
  assert.equal(await page.evaluate(() => window.catalogUi.router.currentRoute.value.query.mode), 'readings');

  await go({ tab: 'period', entry: 'period:advent-w4-d7', panel: 'calendar', year: '2026' });
  await page.getByText('Гэтай літургічнай пазіцыі няма ў выбраным годзе.', { exact: true }).waitFor();
  assert.ok(await page.getByRole('button', { name: 'Перайсці да літургіі гадзінаў', exact: true }).isDisabled());
  await page.getByRole('button', { name: 'Праглядзець тэксты', exact: true }).click();
  await page.getByText('Тэксты для гэтай пазіцыі не знойдзены. Даступнасць у календары правяраецца асобна.', { exact: true }).waitFor();
  await go({ tab: 'period', entry: 'period:advent-w4-d1', panel: 'preview', mode: 'readings' });
  await page.getByText('Чытанне цыкла C', { exact: true }).waitFor();
  for (const cycle of ['A', 'B', 'C']) assert.ok(await page.getByText(`Чытанне цыкла ${cycle}`, { exact: true }).isVisible());

  await mkdir(`${root}/reports/catalog-ui`, { recursive: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => { window.catalogUi.theme.global.name.value = theme; document.documentElement.style.fontSize = '24px'; }, theme);
    await go({ tab: 'feasts', entry: 'sv-nicholas', panel: 'calendar', year: '2026' });
    await page.getByText('У гэтым годзе не адзначаецца', { exact: true }).waitFor();
    await noOverflow();
    await page.screenshot({ path: `${root}/reports/catalog-ui/nicholas-320-${theme}.png`, fullPage: true });
    await go({ tab: 'feasts', q: 'Мікалая' });
    await page.getByRole('heading', { name: 'Св. Мікалая, біскупа', exact: true }).waitFor();
    await noOverflow();
    await page.screenshot({ path: `${root}/reports/catalog-ui/feasts-320-${theme}.png`, fullPage: true });
    await go({ tab: 'period', period: 'advent', position: '4 тыдзень' });
    await page.getByRole('button', { name: /Адвэнт · 4 тыдзень · Субота/ }).waitFor();
    await noOverflow();
    await go({ tab: 'feasts', entry: 'sv-nicholas', panel: 'preview' });
    await page.getByText('Наяўныя ўласныя і агульныя тэксты. Гэта асобныя крыніцы.', { exact: true }).waitFor();
    await noOverflow();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, [], 'no external requests / no Firestore reads');
  console.log('Catalog UI passed: real source preview, Nicholas 2026/2027, Hours/Readings routing + back + diocese, absent period, A/B/C, 320px/150% text/light/dark; zero external requests.');
} finally {
  await browser.close();
  await server.close();
}
