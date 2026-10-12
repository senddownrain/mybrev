import assert from 'node:assert/strict';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { MASS_ORDER_PRAYER_ID } from '../src/utils/massRitual.js';

// Run against Vite: actual components/routes, synthetic content and in-memory
// editor writes. Only local requests and the app's Google Fonts are allowed.
const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const output = 'reports/mobile-ui';
await mkdir(output, { recursive: true });
// Discover all tested lazy-route dependencies before mounting Vue. Otherwise
// a cold Vite optimizer can replace Vue Router's injection symbols mid-test.
const modules = new Set([
  '/src/views/Settings.vue', '/src/views/Ordo.vue', '/src/components/OrasList.vue',
  '/src/components/readings/ReadingsView.vue', '/src/components/oras/Laudes.vue',
  '/src/components/oras/Vesper.vue', '/src/views/admin/ParsedReadingEditor.vue',
  '/src/components/prayers/PrayerView.vue',
]);
for (const path of modules) {
  const response = await fetch(new URL(path, baseUrl));
  assert.ok(response.ok, `Vite can transform ${path}`);
  const source = await response.text();
  for (const match of source.matchAll(/(?:from|import)\s*["'](\/src\/[^"']+\.(?:vue|js)(?:\?[^"']*)?)["']/g)) {
    modules.add(match[1]);
  }
}
const browser = await chromium.launch({
  executablePath: process.env.BENCHMARK_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--disable-features=LocalNetworkAccessChecks'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
const page = await context.newPage();
page.setDefaultTimeout(15_000);
page.setDefaultNavigationTimeout(15_000);
const errors = [];
page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message); });
page.on('console', (message) => { if (message.type() === 'error') { errors.push(message.text()); console.error(message.text()); } });
const paragraph = 'Гэта тэставы тэкст для праверкі пераносаў, маштабавання і пракруткі на вузкім экране.';
const sections = (index) => [
  { kind: 'reading', role: 'reading1', bible: 'Іс 9, 1–6', title: 'Чытанне кнігі прарока Ісаі', text: Array(8).fill(paragraph).join('\n\n'), conclusion: 'Гэта слова Божае.', alternatives: [{ bible: 'Іс 9, 1–3', title: 'Кароткае чытанне', text: paragraph }] },
  { kind: 'gospel', role: 'gospel', bible: 'Лк 2, 1–14', title: 'Чытанне святога Евангелля паводле Лукі', text: `${paragraph}\n\nВарыянт ${index + 1}.`, conclusion: 'Гэта слова Пана.' },
  { kind: 'sequence', text: paragraph },
];
const structured = { id: 'ui-sets', title: 'Нараджэнне Пана — праверка інтэрфейсу', _date: '25.12', massReadings: { schema: 1, sets: ['Св. Імша ўначы', 'Св. Імша на світанні', 'Св. Імша ўдзень'].map((label, index) => ({ id: `set-${index}`, label, default: index === 0, sections: sections(index) })) } };
const legacy = { id: 'ui-legacy', title: structured.title, _periodType: 'ordinary', _periodWeekNumber: 1, _dayOfWeek: 1, year: '1', reading1: { bible: 'Іс 9, 1–6', title: 'Чытанне кнігі прарока Ісаі', text: `<p>${paragraph}</p>`, alternatives: [] }, gospel: { bible: 'Лк 2, 1–14', title: 'Чытанне святога Евангелля паводле Лукі', text: `<p>${paragraph}</p>` } };
legacy.reading1.comment = 'Сэнсавы загаловак';
legacy.psalm = { bible: 'Пс 95', chorus: 'Спявайце Пану новую песню.', verses: [paragraph] };
legacy.alleluia = { verse: paragraph };
const day = { id: 'ui-day', _periodType: 'ordinary', _periodWeekNumber: 1, _dayOfWeek: 1 };
for (const prefix of ['laudes', 'vesper']) {
  for (const suffix of ['Hymn', 'Ps1', 'Ps2', 'Ps3', 'R', 'Inter', 'Pr']) day[prefix + suffix] = Array(8).fill(`<p>${paragraph}</p>`).join('');
  for (const suffix of ['Ant1', 'Ant2', 'Ant3', 'AntBen', 'AntMag']) day[prefix + suffix] = paragraph;
}
const embedded = structuredClone(legacy);
embedded.reading1.text = `${paragraph}\n\nГэта слова Божае.`;
embedded.gospel.text = `${paragraph}\n\nГэта слова Пана.`;
const fixture = { structured, legacy, embedded, day, massId: MASS_ORDER_PRAYER_ID };
await writeFile(`${output}/fixture-firestore.tmp`, `
const fixtures = ${JSON.stringify(fixture)};
export const doc = (_db, collection, id) => ({ collection, id });
export const collection = (_db, name) => name;
export const getDoc = async (ref) => ({ exists: () => ref.id !== 'new', data: () => structuredClone(ref.id === 'ui-sets' ? fixtures.structured : fixtures.legacy) });
export const getDocs = async () => ({ docs: [] });
export const query = (...args) => args;
export const where = (...args) => args;
export const serverTimestamp = () => null;
export const setDoc = async (ref, data) => { window.savedEditor = { ref, data: structuredClone(data) }; };
`);
await rename(`${output}/fixture-firestore.tmp`, `${output}/fixture-firestore.js`);
await writeFile(`${output}/harness.tmp`, `
import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { RouterView } from 'vue-router';
import vuetify from '/src/plugins/vuetify.js';
import router from '/src/router/index.js';
import { useAuthStore } from '/src/stores/auth.js';
import { useLiturgicalStore } from '/src/stores/liturgical.js';
import { usePrayersStore } from '/src/stores/prayers.js';
import { usePrayerCategoriesStore } from '/src/stores/prayerCategories.js';
import { useSettingsStore } from '/src/stores/settings.js';
import '/src/styles/main.scss';
const fixtures = ${JSON.stringify(fixture)};
const content = { context: { periodType: 'ordinary', periodWeek: 1, dayOfWeek: 1 }, itemsDays: [fixtures.day], dayOptions: [{ key: 'ui-day', source: 'period', title: 'Літургічны дзень', dayId: 'ui-day', day: fixtures.day, hasLiturgicalDay: true, templates: [{ id: 'ui-day', label: 'Літургічны дзень', day: fixtures.day }] }] };
const readings = { items: [fixtures.structured], context: { cycle: '1', sundayCycle: 'A', periodType: 'christmas' } };
const app = createApp({ setup() {
  const auth = useAuthStore(); auth.init = async () => {}; auth.isAdmin = false;
  const prayers = usePrayersStore();
  prayers.init = () => {};
  Object.defineProperty(prayers, 'prayers', { configurable: true, value: ref([{ id: fixtures.massId, title: 'Святая Імша', textFormat: 'markdown', text: '# Уступныя абрады\\n\\nТэставы тэкст Імшы.' }]) });
  usePrayerCategoriesStore().init = () => {};
  const liturgical = useLiturgicalStore();
  liturgical.getCachedContent = () => content;
  liturgical.fetchContentByDate = async () => content;
  liturgical.primeContent = async () => {};
  const readingResult = () => window.ui?.embedded ? { ...readings, items: [fixtures.embedded] } : readings;
  liturgical.getCachedReadings = readingResult;
  liturgical.fetchReadingsByDate = async () => readingResult();
  liturgical.primeReadings = async () => {};
  window.ui = { router, auth, settings: useSettingsStore() };
  return () => h(RouterView);
} });
app.use(createPinia()).use(vuetify).use(router);
await router.replace('/settings');
app.mount('#app');
window.uiReady = true;
`);
await rename(`${output}/harness.tmp`, `${output}/harness.js`);
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== new URL(baseUrl).origin) {
    if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.continue();
    return route.abort();
  }
  if (url.pathname === '/__mobile-ui') return route.fulfill({ contentType: 'text/html', body: '<html lang="be"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Cormorant+SC:wght@500;600;700&family=Literata:ital,opsz,wght@0,7..72,300..800;1,7..72,300..800&family=Source+Sans+3:ital,wght@0,400..800;1,400..800&display=swap" rel="stylesheet" media="print" onload="this.media=\'all\'"></head><body><div id="app"></div><script type="module" src="/reports/mobile-ui/harness.js"></script></body></html>' });
  // Keep Vite's CSS injection, without HMR reloading an in-progress test.
  if (url.pathname === '/@vite/client') return route.fulfill({ contentType: 'text/javascript', body: `
    import '/@vite/env';
    const styles = new Map();
    export function updateStyle(id, content) { let style = styles.get(id); if (!style) { style = document.createElement('style'); document.head.append(style); styles.set(id, style); } style.textContent = content; }
    export function removeStyle(id) { styles.get(id)?.remove(); styles.delete(id); }
    export const createHotContext = () => ({ data: {}, accept() {}, acceptExports() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {} });
    export const injectQuery = (url) => url;
  ` });
  if (url.pathname === '/src/views/admin/ParsedReadingEditor.vue' && !url.searchParams.has('type')) {
    const response = await route.fetch();
    const body = (await response.text()).replace(/from "[^"\n]*firebase_firestore[^"\n]*"/, 'from "/reports/mobile-ui/fixture-firestore.js"');
    assert.ok(body.includes('fixture-firestore'), 'editor uses in-memory storage');
    return route.fulfill({ response, body });
  }
  if (url.pathname === '/src/services/ordoCalendarService.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const loadPublishedOrdoNotes = async () => null; export const refreshCalendarDefinitions = async () => {};' });
  if (url.pathname === '/src/services/priestAccessService.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const priestAccess = { active: false, checked: true, helpText: "", revision: 0 }; export const checkPriestAccess = async () => ({ active: false }); export const loadPriestHelp = async () => ""; export const activatePriestAccess = async () => {}; export const disablePriestAccess = async () => {};' });
  return route.continue();
});

async function navigate(path) {
  await page.evaluate((path) => window.ui.router.push(path), path);
  await page.waitForTimeout(200);
}
async function checkLayout(label) {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll('.v-main *, .v-app-bar *')].filter((el) => {
      const box = el.getBoundingClientRect();
      return box.width && box.height && getComputedStyle(el).visibility !== 'hidden' && (box.right > width + 1 || box.left < -1);
    }).filter((el) => !el.closest('.v-input__details, .v-field-label, .v-field__outline, .ql-tooltip')).map((el) => `${el.tagName}.${el.className}`).slice(0, 8);
  });
  assert.deepEqual(overflow, [], `${label}: elements stay inside the viewport`);
}
async function checkDock(selector) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const positions = await page.evaluate((selector) => ({ content: document.querySelector(selector).getBoundingClientRect().bottom, dock: document.querySelector('.pill-nav-outer').getBoundingClientRect().top }), selector);
  assert.ok(positions.content <= positions.dock, `last content clears the dock: ${JSON.stringify(positions)}`);
}
async function checkFloatingBar(selector) {
  const surfaces = await page.locator(`${selector}, ${selector} .v-toolbar__content`).evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, image: style.backgroundImage, shadow: style.boxShadow, blur: style.backdropFilter, border: style.borderTopWidth };
  }));
  assert.equal(surfaces.length, 2);
  for (const surface of surfaces) {
    assert.deepEqual(surface, { background: 'rgba(0, 0, 0, 0)', image: 'none', shadow: 'none', blur: 'none', border: '0px' }, 'toolbar containers remain transparent');
  }
}
async function checkOraElements(label) {
  await checkFloatingBar('.floating-ora-bar');
  const boxes = await page.locator('.ora-circle-btn, .ora-liturgy-link, .ora-location, .floating-ora-bar .text-scale-control').evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, width: box.width, height: box.height, background: getComputedStyle(element).backgroundColor };
  }));
  for (let index = 0; index < boxes.length; index++) {
    assert.ok(boxes[index].width >= 44 && boxes[index].height >= 44, `${label}: controls keep touch targets`);
    assert.notEqual(boxes[index].background, 'rgba(0, 0, 0, 0)', `${label}: glass belongs to individual controls`);
    if (index) assert.ok(boxes[index].left >= boxes[index - 1].right + 1, `${label}: independent controls do not collide`);
  }
  await checkLayout(label);
}
async function checkOrdoNav(label) {
  await checkFloatingBar('.floating-app-bar');
  const group = page.locator('.floating-app-bar .readings-nav-group');
  await group.waitFor();
  assert.equal(await group.getByLabel('Адкрыць меню', { exact: true }).count(), 1);
  assert.equal(await group.getByRole('link', { name: 'Літургія', exact: true }).count(), 1);
  assert.equal(await page.locator('.ordo-page .liturgy-nav-link').count(), 0, 'Ordo content has no duplicate capsule');
  const dimensions = await group.evaluate((element) => { const box = element.getBoundingClientRect(); return [box.x, box.y, box.width, box.height]; });
  const reference = await page.evaluate(() => window.readingsNavDimensions);
  assert.deepEqual(dimensions, reference, `${label}: shared navigation retains the Readings proportions`);
  await group.getByLabel('Адкрыць меню', { exact: true }).click();
  await page.locator('.app-drawer:not([inert])').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.app-drawer[inert]').waitFor();
}
try {
  await page.goto(`${baseUrl}/__mobile-ui`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => window.uiReady, null, { timeout: 30_000 });
  await page.locator('[data-test="settings-dioceses"]').waitFor();
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 5000))]));
  for (const width of [320, 360, 390, 412, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ['light', 'dark', 'system']) {
      await page.emulateMedia({ colorScheme: theme === 'light' ? 'light' : 'dark' });
      await page.evaluate((theme) => window.ui.settings.setThemePreference(theme), theme);
      await navigate('/settings');
      await checkLayout(`${width}/${theme}/settings`);
      const boxes = await page.locator('[data-test="settings-dioceses"]').getByRole('checkbox').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));
      assert.equal(boxes[0].y, boxes[1].y);
      assert.equal(boxes[2].y, boxes[3].y);
      assert.ok(boxes[2].y > boxes[0].y);
      assert.ok(boxes.every((box) => Math.abs(box.width - boxes[0].width) < 1 && Math.abs(box.height - boxes[0].height) < 1));
      for (const scale of [0.7, 1, 1.8]) {
        await page.evaluate((scale) => { window.ui.settings.fontSizeMultiplier = scale; }, scale);
        await navigate('/readings/2026-12-25');
        await page.locator('.parsed-reading').waitFor();
        await checkLayout(`${width}/${theme}/${scale}/readings`);
        await checkDock('.parsed-reading');
        const sizes = await page.locator('.reading-acclamation, .section-text').evaluateAll((els) => els.map((el) => getComputedStyle(el).fontSize));
        assert.ok(sizes.every((size) => size === sizes[0]), 'body and both conclusions share a reactive size');
        const buttons = await page.locator('.set-choice__button').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { top: r.top, width: r.width, scroll: el.scrollWidth, client: el.clientWidth }; }));
        if (width <= 430) assert.ok(buttons[0].top < buttons[1].top && buttons[1].top < buttons[2].top);
        assert.ok(buttons.every((button) => button.scroll <= button.client + 1));
      }
      await page.evaluate(() => { window.ui.settings.fontSizeMultiplier = 1; });
      await page.evaluate(() => {
        const box = document.querySelector('.readings-nav-group').getBoundingClientRect();
        window.readingsNavDimensions = [box.x, box.y, box.width, box.height];
      });
      await navigate('/ordo');
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await checkLayout(`${width}/${theme}/ordo`);
      await checkOrdoNav(`${width}/${theme}/ordo/top`);
      await checkDock('.month-list');
      await checkOrdoNav(`${width}/${theme}/ordo/scrolled`);
      await navigate('/ordo/2026-12-25');
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await checkLayout(`${width}/${theme}/ordo-day`);
      await checkOrdoNav(`${width}/${theme}/ordo-day/top`);
      const hoursLink = page.locator('[data-test="ordo-hours-shortcut"]');
      assert.equal(await hoursLink.getAttribute('href'), '/day/2026-12-25');
      await page.evaluate(() => window.scrollTo(0, 900));
      await checkOrdoNav(`${width}/${theme}/ordo-day/scrolled`);
      await hoursLink.click();
      await page.waitForURL('**/day/2026-12-25');
      await navigate('/day/2026-12-25');
      await checkLayout(`${width}/${theme}/home`);
      await page.getByLabel('Літургічны каляндар гэтага дня').click();
      await page.waitForURL('**/ordo/2026-12-25');
      assert.ok(page.url().includes('/ordo/2026-12-25'));
      await navigate('/day/2026-12-25/ora/ui-day');
      await page.locator('.oras-hero-block').waitFor();
      await checkOraElements(`${width}/${theme}/ora/top`);
      await page.evaluate(() => window.scrollTo(0, 900));
      await checkOraElements(`${width}/${theme}/ora/scrolled`);
      await navigate('/day/2026-12-25/ora/ui-day/laudes');
      await page.locator('[data-hour-heading]').waitFor();
      await checkOraElements(`${width}/${theme}/hour/top`);
      assert.equal(await page.locator('.ora-location').count(), 0, 'the visible hour heading is not covered by a duplicate capsule');
      await page.evaluate(() => window.scrollTo(0, 900));
      await page.locator('.ora-location').waitFor();
      await checkOraElements(`${width}/${theme}/hour/scrolled`);
      await page.evaluate(() => { window.ui.auth.isAdmin = true; });
      await checkOraElements(`${width}/${theme}/hour/admin`);
      await page.evaluate(() => { window.ui.auth.isAdmin = false; });
      await page.locator('.ora-location').click();
      await page.locator('.ora-hour-menu').waitFor();
      await page.getByRole('link', { name: 'Нешпары', exact: true }).click();
      await page.waitForURL('**/vesper');
      assert.ok(page.url().includes('/vesper'));
      await page.evaluate(() => { window.ui.auth.isAdmin = true; });
      for (const id of ['ui-legacy', 'ui-sets']) {
        await navigate('/settings');
        await navigate(`/admin/reading-editor/${id}`);
        await page.locator('.reading-editor').waitFor();
        await page.locator(id === 'ui-sets' ? '.sets-editor' : '.reading-editor__panels').waitFor();
        await checkLayout(`${width}/${theme}/editor/${id}`);
      }
      await page.evaluate(() => { window.ui.auth.isAdmin = false; });
    }
    console.log(`Passed ${width}px: three themes, three text sizes, navigation and both editors.`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => window.ui.settings.setThemePreference(theme), theme);
    for (const [path, name] of [['/ordo', 'ordo'], ['/ordo/2026-12-25', 'ordo-day'], ['/day/2026-12-25/ora/ui-day', 'ora'], ['/day/2026-12-25/ora/ui-day/laudes', 'hour']]) {
      await navigate(path);
      await page.waitForTimeout(250);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${output}/navigation-${name}-${theme}-top.png` });
      await page.evaluate(() => window.scrollTo(0, 900));
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${output}/navigation-${name}-${theme}-scrolled.png` });
    }
  }
  await page.evaluate(async () => {
    const { setOrdoDioceseFilter } = await import('/src/utils/ordoMonthFilter.js');
    setOrdoDioceseFilter(['pinsk']);
  });
  await navigate('/ordo/2026-12-25');
  assert.equal(await page.locator('[data-test="ordo-hours-shortcut"]').getAttribute('href'), '/day/2026-12-25?diocese=pinsk');
  await page.locator('[data-test="ordo-hours-shortcut"]').click();
  await page.waitForURL('**/day/2026-12-25?diocese=pinsk');
  await navigate('/ordo');
  assert.equal(await page.locator('[data-test="ordo-hours-shortcut"]').getAttribute('href'), '/?diocese=pinsk');
  await page.evaluate(async () => {
    const { setOrdoDioceseFilter } = await import('/src/utils/ordoMonthFilter.js');
    setOrdoDioceseFilter(['minsk-mohilev']);
  });
  await navigate('/settings');
  await page.getByRole('checkbox', { name: /Гродзенская/ }).click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ordoDioceses')).includes('grodno')), true);
  await navigate('/readings/2026-12-25');
  await page.getByRole('button', { name: 'Св. Імша на світанні', exact: true }).click();
  await page.waitForURL('**/*set=set-1');
  assert.ok(page.url().includes('set=set-1'));
  const before = await page.locator('.reading-acclamation').first().evaluate((el) => getComputedStyle(el).fontSize);
  await page.getByLabel('Павялічыць тэкст', { exact: true }).click();
  const after = await page.locator('.reading-acclamation').first().evaluate((el) => getComputedStyle(el).fontSize);
  assert.ok(parseFloat(after) > parseFloat(before));
  await page.getByLabel('Паменшыць тэкст', { exact: true }).click();
  assert.equal(await page.locator('.reading-acclamation').first().evaluate((el) => getComputedStyle(el).fontSize), before);
  await page.evaluate(() => document.documentElement.style.setProperty('--app-safe-bottom', '24px'));
  await checkDock('.parsed-reading');
  await page.evaluate(() => document.documentElement.style.removeProperty('--app-safe-bottom'));
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => window.ui.settings.setThemePreference(theme), theme);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${output}/readings-${theme}.png` });
    await navigate('/settings');
    await page.screenshot({ path: `${output}/settings-${theme}.png` });
    await navigate('/readings/2026-12-25');
  }
  await page.evaluate(() => { window.ui.embedded = true; });
  await navigate('/readings/2026-12-26');
  for (const scale of [0.7, 1, 1.8]) {
    await page.evaluate((scale) => { window.ui.settings.fontSizeMultiplier = scale; }, scale);
    const sizes = await page.locator('.reading-acclamation, .section-text').evaluateAll((els) => els.map((el) => getComputedStyle(el).fontSize));
    assert.equal(await page.locator('.reading-acclamation').count(), 2, 'both embedded conclusions render once');
    assert.ok(sizes.every((size) => size === sizes[0]), 'embedded conclusions scale once');
  }
  await page.evaluate(() => { window.ui.embedded = false; window.ui.settings.fontSizeMultiplier = 1; });
  await navigate(`/prayer/${MASS_ORDER_PRAYER_ID}`);
  await page.getByRole('heading', { name: 'Святая Імша', exact: true }).waitFor();
  assert.equal(await page.getByText('Малітва не знойдзена', { exact: true }).count(), 0);
  await navigate('/day/2026-12-25/ora/ui-day/laudes');
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.locator('.ora-location').waitFor();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${output}/hour.png` });
  await page.evaluate(() => { window.ui.auth.isAdmin = true; });
  await navigate('/admin/reading-editor/ui-legacy');
  await page.getByRole('button', { name: 'Дадаць альтэрнатыўнае чытанне', exact: true }).click();
  await checkLayout('legacy editor with alternative');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${output}/editor.png` });
  await page.locator('.reading-editor__card').filter({ hasText: 'Секвенцыя' }).screenshot({ path: `${output}/editor-sequence.png` });
  await page.getByLabel('Назва дня або святкавання', { exact: true }).fill('Тэставы загаловак пасля рэдагавання');
  await page.getByRole('button', { name: 'Захаваць', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.savedEditor));
  assert.equal(await page.evaluate(() => window.savedEditor.data.title), 'Тэставы загаловак пасля рэдагавання');
  assert.equal(await page.evaluate(() => window.savedEditor.ref.id), 'ui-legacy');
  assert.equal(await page.evaluate(() => window.savedEditor.data.reading1.text), legacy.reading1.text);
  await navigate('/admin/reading-editor/ui-sets');
  await page.locator('.sets-editor').waitFor();
  await page.getByRole('button', { name: 'Захаваць', exact: true }).click();
  await page.waitForFunction(() => window.savedEditor?.ref.id === 'ui-sets');
  assert.deepEqual(await page.evaluate(() => window.savedEditor.data.massReadings.sets.map((set) => set.id)), structured.massReadings.sets.map((set) => set.id));
  assert.deepEqual(errors, [], 'no browser console errors');
  console.log('Mobile UI smoke passed. Screenshots: reports/mobile-ui. Firebase reads/writes were mocked; no live data accessed.');
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  console.error(`Failed on ${page.url()}`);
  throw error;
} finally {
  await context.close();
  await browser.close();
}
