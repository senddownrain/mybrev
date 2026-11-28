import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { buildPublicPrayerCatalog } from '../src/utils/publicPrayerCatalog.mjs';

const publicCatalog = buildPublicPrayerCatalog({
  prayers: [{ id: 'public-prayer', title: 'Synthetic public title', text: 'Synthetic public body', categoryId: 'public-category', tags: ['Малітвы'] }],
  categories: [
    { id: 'public-category', name: 'Synthetic public category' },
    { id: 'comment-root', name: 'Для чытання і разважання', order: 2 },
    {
      id: 'comment-only', parentId: 'comment-root', name: 'Прыклад раздзела', comment: {
        content: [
          '## Перад пачаткам',
          'Гэты прыклад паказвае, як выглядаюць **вылучэнні** ў каментарыі да раздзела. Тэкст можна прачытаць у зручным для сябе памеры.',
          '> Чытайце павольна і ўважліва.',
          '- Знайдзіце ціхую хвіліну.\n- Прачытайце _тэкст_ да канца.',
          ':::rubric\nМожна зрабіць кароткую паўзу.\n:::',
          '[Адкрыць прыклад малітвы](/prayer/public-prayer)',
          ...Array(24).fill('Каментарый можна працягваць чытаць, не губляючы месца ў спісе малітваў.'),
        ].join('\n\n'),
        sourceId: 'ojcha-nash-2022',
      },
    },
  ],
});
const evidence = process.env.CATEGORY_UI_EVIDENCE;
if (evidence) await mkdir(evidence, { recursive: true });
const outDir = await mkdtemp(join(tmpdir(), 'mybrev-s4-browser-'));
let server;
let browser;
let page;
let documentRequests = 0;
const errors = [];
const pendingRequests = new Set();
catalogSmoke: try {
  await build({
    configFile: false, publicDir: false, logLevel: 'warn',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    build: {
      outDir, minify: false, emptyOutDir: false,
      lib: { entry: fileURLToPath(new URL('../tests/ui/access-sets-catalog-harness.mjs', import.meta.url)),
        formats: ['es'], fileName: () => 'catalog.js', cssFileName: 'catalog' },
    },
    plugins: [vue({ template: { transformAssetUrls: false } }), vuetify({ styles: false }), {
      name: 's4-synthetic-catalog', enforce: 'pre',
      transform(source, id) {
        const file = id.replaceAll('\\', '/').split('?')[0];
        if (file.endsWith('/src/plugins/firebase.js')) return 'export const firebaseApp = null; export const db = null; export const firestoreCacheRecovery = {};';
        if (file.endsWith('/src/stores/auth.js')) return "import { reactive } from 'vue'; export const authFixture = reactive({ isAdmin: false, init: async () => {} }); export const useAuthStore = () => authFixture;";
        if (file.endsWith('/src/services/prayerStorageService.js')) return source.replace(
          /export async function readAdminPrayerContent\(\) \{[\s\S]*?\n\}/,
          'export async function readAdminPrayerContent() { return window.catalogHarness.adminContent(); }',
        );
        if (file.endsWith('/src/components/admin/accessSets/client.js')) return "export const createAccessAdminClient = () => ({list: async () => ({rows: window.catalogHarness.sets})});";
      },
    }],
  });
  const output = new Map(await Promise.all((await readdir(outDir)).map(async (name) => [`/${name}`, await readFile(join(outDir, name))])));
  output.set('/app-brand-96.png', await readFile(new URL('../public/app-brand-96.png', import.meta.url)));
  output.set('/public-prayers-v1.json', JSON.stringify(publicCatalog));
  output.set('/', '<!doctype html><html lang="be"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/catalog.css"><div id="app"></div><script type="module" src="/catalog.js"></script>');
  server = createServer((request, response) => {
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    const content = output.get(path);
    if (!content) return response.writeHead(204).end();
    const type = path.endsWith('.png') ? 'image/png' : path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css'
      : path.endsWith('.json') ? 'application/json' : 'text/html';
    response.writeHead(200, { 'Content-Type': type }).end(content);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({
    executablePath: process.env.BENCHMARK_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route(/https?:\/\//, (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    pendingRequests.add(request.url());
    if (request.resourceType() === 'document') documentRequests++;
  });
  page.on('requestfinished', (request) => pendingRequests.delete(request.url()));
  page.on('requestfailed', (request) => pendingRequests.delete(request.url()));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  const go = (to) => page.evaluate((target) => window.catalogHarness.go(target), to);
  const menu = () => page.evaluate(() => window.catalogHarness.openMenu());
  const closeMenu = () => page.evaluate(() => window.catalogHarness.closeMenu());
  const rights = (sets) => page.evaluate((allowed) => window.catalogHarness.confirm(allowed), sets);
  const counts = () => page.evaluate(() => window.catalogHarness.counts());
  const drawer = page.locator('.app-drawer');
  const category = (name) => drawer.getByRole('link', { name, exact: true });
  const drawerToggle = drawer.getByRole('button', { name: 'Малітоўныя зборнікі', exact: true });
  const favorites = drawer.getByRole('link', { name: 'Абраныя малітвы', exact: true });
  const commentToggle = page.getByRole('button', { name: 'Пра гэты раздзел', exact: true });
  const screenshot = async (name) => { if (evidence) await page.screenshot({ path: join(evidence, `${name}.png`) }); };
  const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth + 1));

  await page.goto('http://127.0.0.1:' + server.address().port + '/#/home', { waitUntil: 'commit', timeout: 60_000 });
  await page.getByText('Synthetic home').waitFor({ timeout: 120_000 });
  const commentReader = page.getByRole('dialog', { name: 'Пра гэты раздзел' });
  const commentClose = commentReader.getByRole('button', { name: 'Закрыць' });
  const atComment = () => go({ name: 'Prayers', query: { category: 'comment-only' } });
  async function checkPublicCommentReader() {
    await atComment();
    await page.getByRole('heading', { name: 'Прыклад раздзела', exact: true }).waitFor();
    assert.equal(await commentToggle.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(await page.locator('.prayer-list-item').count(), 0);
    assert.equal(await page.getByText('Малітвы не знойдзены', { exact: true }).count(), 0);
    for (const [width, theme, label, scale] of [[390, 'dark', 'mobile', 1.8], [1280, 'light', 'wide', 1]]) {
      await page.setViewportSize({ width, height: 840 });
      await page.evaluate(([name, size]) => {
        window.catalogHarness.theme(name);
        window.catalogHarness.fontSize(size);
      }, [theme, scale]);
      await page.locator(`.v-theme--${theme}`).first().waitFor();
      await noOverflow();
      const before = await counts();
      const categoryScroll = await page.evaluate(() => window.scrollY);
      await commentToggle.press('Space');
      await commentReader.waitFor();
      assert.equal(await commentClose.evaluate((button) => button === document.activeElement), true);
      const bounds = await commentReader.boundingBox();
      assert.ok(width < 600 ? bounds.width === width && bounds.height === 840 : bounds.width >= 760 && bounds.width <= 900,
        `Reader at ${width}px viewport: ${bounds.width}×${bounds.height}`);
      const prose = commentReader.locator('.category-comment__prose');
      await prose.getByRole('heading', { name: 'Перад пачаткам' }).waitFor();
      assert.equal(await prose.locator('blockquote, ul, strong, em, .prayer-rubric').count(), 5);
      assert.ok(await prose.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)) >= 16 * scale);
      await screenshot(`reader-${label}`);
      const viewport = commentReader.locator('.category-comment__viewport');
      assert.ok(await viewport.evaluate((el) => { el.scrollTop = el.scrollHeight; return el.scrollTop > 0 && el.scrollWidth <= el.clientWidth + 1; }));
      await commentReader.getByText(/Малітоўнік «Ойча наш»/).waitFor();
      await page.keyboard.press('Escape');
      await commentReader.waitFor({ state: 'hidden' });
      await commentReader.locator('.category-comment__prose').waitFor({ state: 'detached' });
      assert.equal(await commentToggle.evaluate((button) => button === document.activeElement), true);
      assert.equal(await page.evaluate(() => window.scrollY), categoryScroll);
      assert.deepEqual(await counts(), before);
    }
    await commentToggle.click();
    await commentReader.getByRole('link', { name: 'Адкрыць прыклад малітвы' }).click();
    await page.getByText('Synthetic public body', { exact: true }).waitFor();
    await page.goBack();
    await commentToggle.waitFor();
    assert.equal(await commentReader.count(), 0);
  }

  if (process.argv.includes('--comments-only')) {
    await checkPublicCommentReader();
    await rights(['marian']);
    await go({ name: 'Prayers', query: { category: 'marian-category-0' } });
    await commentToggle.click();
    const protectedBody = commentReader.getByText('Synthetic marian category commentary', { exact: true });
    await protectedBody.waitFor();
    await rights('suspended');
    await protectedBody.waitFor({ state: 'detached' });
    await commentReader.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    console.log('PASS Chromium: mobile and wide comment reader, long text, source, focus, link and access revocation.');
    break catalogSmoke;
  }
  assert.deepEqual(await counts(), { confirm: 0, list: 0, get: 0 });
  await menu();
  await drawerToggle.waitFor();
  await favorites.waitFor();
  assert.equal(await drawerToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(await drawer.locator('#drawer-collections a').count(), 0);
  await drawerToggle.focus();
  await page.keyboard.press('Space');
  await category('Synthetic public category').waitFor();
  const protectedLinks = () => drawer.getByRole('link', { name: /Для святароў|Для марыянаў|Трэці зборнік|^(marian|priest|another) category/ });
  assert.equal(await protectedLinks().count(), 0);
  assert.equal(await drawer.locator('.drawer-collection-lock, .drawer-collection--separator').count(), 0);
  assert.equal((await counts()).list, 0);

  // Activation changes the active generation while the menu is already open.
  await rights(['marian']);
  await category('Для марыянаў').waitFor();
  assert.equal(await protectedLinks().count(), 1);
  assert.equal(await category('Для марыянаў').locator('.drawer-collection-lock').count(), 1);
  assert.equal(await drawer.locator('.drawer-collection--separator').count(), 1);
  assert.equal(await category('Synthetic public category').locator('.drawer-collection-lock').count(), 0);
  for (const theme of ['light', 'dark', 'marian']) {
    await page.evaluate((name) => window.catalogHarness.theme(name), theme);
    await page.locator(`.app-drawer.v-theme--${theme}`).waitFor();
    const ink = (name) => category(name).evaluate((row) => globalThis.getComputedStyle(row).color);
    assert.notEqual(await ink('Для марыянаў'), await ink('Synthetic public category'));
  }
  const warm = await counts();
  await drawerToggle.click();
  assert.equal(await drawer.locator('#drawer-collections a').count(), 0);
  await favorites.waitFor();
  await drawerToggle.press('Enter');
  await category('Для марыянаў').waitFor();
  assert.deepEqual(await counts(), warm);
  await closeMenu();
  await menu();
  await category('Для марыянаў').waitFor();
  assert.deepEqual(await counts(), warm);
  await category('Для марыянаў').click();
  await page.getByRole('heading', { name: 'Для марыянаў' }).waitFor();
  await menu();
  await category('Для марыянаў').waitFor();
  assert.match(await category('Для марыянаў').getAttribute('class'), /v-list-item--active/);
  await closeMenu();
  const marianRows = page.locator('[id^="prayer-row-marian-prayer-"]');
  await page.waitForFunction(() => document.querySelectorAll('[id^="prayer-row-marian-prayer-"]').length === 56);
  assert.deepEqual(await marianRows.evaluateAll((rows) => rows.map((row) => row.id)),
    Array.from({ length: 56 }, (_, i) => 'prayer-row-marian-prayer-' + i));
  assert.equal(await page.locator('.subcategory-link').count(), 0);
  await commentToggle.click();
  await page.getByText('Synthetic marian category commentary', { exact: true }).waitFor();
  await commentClose.click();
  await page.getByText('marian prayer 1', { exact: true }).click();
  await page.getByText('marian synthetic prayer text 1', { exact: true }).waitFor();
  await page.locator('.prayer-text').evaluate((element) => { element.dataset.focusProbe = 'same-document'; });
  await page.evaluate(() => window.dispatchEvent(new globalThis.Event('focus')));
  assert.equal(await page.locator('.prayer-text').getAttribute('data-focus-probe'), 'same-document');
  assert.deepEqual(await counts(), warm);

  await go({ name: 'Prayers', query: { category: 'marian-category-0' } });
  await page.getByText('marian prayer 2', { exact: true }).click();
  await page.locator('.prayer-text [data-role="reader"]').waitFor();
  await page.locator('.prayer-text [data-role="all"]').waitFor();
  await page.locator('.prayer-text em').waitFor();
  await page.evaluate(() => window.catalogHarness.visibility(true));
  await page.locator('.prayer-text').waitFor({ state: 'hidden' });
  await page.evaluate(() => {
    window.catalogHarness.visibility(false);
    window.dispatchEvent(new globalThis.Event('focus'));
  });
  await page.waitForFunction(() => window.catalogHarness.resumeChecks() === 1);
  assert.equal(await page.locator('.prayer-text').count(), 0);
  await page.getByText('Загрузка малітвы...', { exact: true }).waitFor();
  await page.evaluate(() => window.catalogHarness.finishRefresh());
  await page.locator('.prayer-text [data-role="all"]').waitFor();
  assert.equal(await page.evaluate(() => window.catalogHarness.resumeChecks()), 1);
  assert.equal(documentRequests, 1);

  await go('/');
  const search = page.getByRole('searchbox', { name: 'Пошук малітваў' });
  await search.fill('Прыёмка рубрыкі');
  await page.getByText('marian prayer 2', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Ачысціць пошук' }).click();

  // The legacy path and the canonical priest set expose the same collection.
  await go('/home');
  await menu();
  await rights('legacy');
  await category('Для святароў').waitFor();
  assert.equal(await protectedLinks().count(), 1);
  await rights(['priest']);
  await category('Для святароў').waitFor();
  assert.equal(await protectedLinks().count(), 1);
  await category('Для святароў').click();
  await page.getByRole('heading', { name: 'Для святароў' }).waitFor();
  await page.getByRole('link', { name: 'priest category 7' }).waitFor();
  assert.equal(await page.locator('.subcategory-link').count(), 7);
  await menu();
  await rights(['marian', 'priest']);
  await category('Для марыянаў').waitFor();
  await category('Для святароў').waitFor();
  assert.equal(await protectedLinks().count(), 2);
  await rights(['another']);
  await category('Трэці зборнік').waitFor();
  assert.equal(await protectedLinks().count(), 1);
  assert.equal(await category('Трэці зборнік').locator('.drawer-collection-lock').count(), 1);
  await category('Трэці зборнік').click();
  await commentToggle.click();
  await page.getByText('Synthetic another category commentary', { exact: true }).waitFor();
  await rights('suspended');
  await page.getByText('Synthetic another category commentary', { exact: true }).waitFor({ state: 'detached' });
  await menu();
  await category('Трэці зборнік').waitFor({ state: 'hidden' });
  assert.equal(await protectedLinks().count(), 0);
  assert.equal(await drawer.locator('.drawer-collection-lock, .drawer-collection--separator').count(), 0);
  await closeMenu();
  await go('/home');

  await rights([]);
  await menu();
  await category('Для чытання і разважання').click();
  await page.getByRole('link', { name: 'Прыклад раздзела', exact: true }).click();
  await page.getByRole('heading', { name: 'Прыклад раздзела', exact: true }).waitFor();
  await checkPublicCommentReader();

  await go('/settings');
  const settingsToggle = page.getByRole('button', { name: 'Катэгорыі ў меню', exact: true });
  const addCategory = page.getByRole('button', { name: 'Дадаць катэгорыю', exact: true });
  assert.equal(await settingsToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(await addCategory.isVisible(), false);
  await settingsToggle.press('Space');
  await addCategory.click();
  const settingsDialog = page.getByRole('dialog');
  await settingsDialog.getByLabel('Назва катэгорыі').fill('Мой спіс');
  await settingsDialog.getByRole('button', { name: 'Малітвы', exact: true }).click();
  await settingsDialog.getByRole('button', { name: /Дадаць/ }).last().click();
  await settingsDialog.waitFor({ state: 'hidden' });
  assert.equal(await settingsToggle.getAttribute('aria-expanded'), 'true');
  await page.getByRole('button', { name: 'Рэдагаваць катэгорыю Мой спіс' }).click();
  await settingsDialog.getByLabel('Назва катэгорыі').fill('Мой новы спіс');
  await settingsDialog.getByRole('button', { name: 'Захаваць', exact: true }).click();
  await settingsDialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Прыбраць катэгорыю Мой новы спіс з меню' }).click();
  await page.getByRole('button', { name: 'Прыбраць катэгорыю Прыклад раздзела з меню' }).click();
  await page.getByRole('button', { name: 'Аднавіць катэгорыі па змаўчанні' }).click();
  await page.getByRole('button', { name: 'Прыбраць катэгорыю Прыклад раздзела з меню' }).waitFor();
  assert.equal(await settingsToggle.getAttribute('aria-expanded'), 'true');

  for (const [width, theme] of [[320, 'light'], [768, 'marian'], [1280, 'dark']]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate((theme) => window.catalogHarness.theme(theme), theme);
    await page.locator(`.v-theme--${theme}`).first().waitFor();
    await settingsToggle.click();
    await settingsToggle.scrollIntoViewIfNeeded();
    await noOverflow();
    await screenshot(`settings-${theme}-collapsed`);
    await settingsToggle.press('Enter');
    await addCategory.waitFor();
    await noOverflow();
    await screenshot(`settings-${theme}-expanded`);
    await menu();
    await drawerToggle.click();
    await favorites.waitFor();
    assert.equal(await drawer.locator('#drawer-collections a').count(), 0);
    await screenshot(`drawer-${theme}-collapsed`);
    const before = await counts();
    await drawerToggle.press('Space');
    await category('Для чытання і разважання').waitFor();
    assert.deepEqual(await counts(), before);
    assert.ok(await drawer.locator('.drawer-list').evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
    await screenshot(`drawer-${theme}-expanded`);
    await closeMenu();
  }
  await go('/home');
  await go('/settings');
  assert.equal(await settingsToggle.getAttribute('aria-expanded'), 'false');

  // An editor without any device access gets a separate, complete snapshot.
  await page.evaluate(() => window.catalogHarness.editor());
  await page.setViewportSize({ width: 1200, height: 900 });
  await go('/admin/prayers');
  await page.waitForFunction(() => document.querySelectorAll('[id^="prayer-row-"]').length === 104);
  await page.locator('[data-test="prayer-access-filter"]').click();
  await page.getByRole('option', { name: 'Айцы марыяне' }).click();
  await page.waitForFunction(() => document.querySelectorAll('[id^="prayer-row-"]').length === 56);
  await page.locator('#prayer-row-marian-prayer-1').getByRole('button', { name: 'Рэдагаваць малітву' }).click();
  await page.getByRole('heading', { name: 'Доступ', exact: true }).waitFor();
  await page.getByText('Выніковы доступ:', { exact: true }).waitFor();

  await go('/admin/categories');
  await page.getByRole('heading', { name: 'priest category 7', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Для марыянаў', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Рэдагаваць катэгорыю Для марыянаў', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.getByText('Выніковы доступ:', { exact: true }).waitFor();
  assert.ok((await form.getByText('Выніковы доступ:', { exact: true }).locator('..').innerText()).includes('Айцы марыяне'));
  const width = await form.locator('.dialog-card').evaluate((element) => element.clientWidth);
  assert.ok(width >= 900 && width <= 970, 'category editor width: ' + width);
  assert.ok(await form.getByRole('button', { name: 'Захаваць' }).isVisible());
  await form.getByRole('button', { name: 'Выбраць малітвы' }).click();
  const picker = page.getByRole('dialog').last();
  await picker.getByRole('textbox', { name: 'Пошук малітваў па назве' }).fill('marian prayer 55');
  await picker.getByLabel('marian prayer 55', { exact: true }).waitFor();
  await picker.getByRole('button', { name: 'Скасаваць', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForFunction(() => {
    const grid = document.querySelector('.category-dialog-grid');
    return grid && globalThis.getComputedStyle(grid).gridTemplateColumns.split(' ').length === 1;
  });
  await form.locator('form').getByRole('button', { name: 'Скасаваць', exact: true }).click();

  const saved = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]));
  assert.doesNotMatch(saved, /(?:marian|priest) synthetic prayer text|marian-category-/);
  assert.deepEqual(errors, []);
  console.log('PASS Chromium: drawer, focus and foreground recovery, one document navigation, reader markings, search, legacy and canonical access, guest isolation, and admin catalog.');
} catch (error) {
  console.error('Browser errors:', errors);
  console.error('Pending fixture requests:', [...pendingRequests].slice(0, 20));
  if (page) console.error('Visible fixture text:', (await page.locator('body').innerText()).slice(0, 1000));
  throw error;
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(outDir, { recursive: true, force: true });
}
