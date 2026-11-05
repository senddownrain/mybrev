/** Real app appearance regression checks, with public fixtures in local IndexedDB.
 * No live Firestore reads/writes. Run against dev or production preview:
 * SMOKE_BASE_URL=http://127.0.0.1:4174 node scripts/smoke-appearance.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { APP_THEME_COLORS, APP_STATUS_BAR_COLORS, THEME_OPTIONS } from '../src/constants/appearance.js';
import { CONTENT_REVISION, CONTENT_CACHE_SCHEMA } from '../src/constants/contentRevision.js';
import { SONGS_CACHE_VERSION } from '../src/constants/songTags.js';

const base = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4174').replace(/\/$/, '');
const output = process.env.APPEARANCE_EVIDENCE_DIR || 'outputs/appearance';
fs.mkdirSync(output, { recursive: true });
const date = '2026-02-08';
const fixture = JSON.parse(fs.readFileSync('patchs/json/ordinary-w5-d1-fixed-day.json', 'utf8'));
const day = { ...fixture, id: fixture._id };
const content = {
  context: { periodType: 'ordinary', periodWeek: 5, dayOfWeek: 1 },
  itemsDays: [day],
  dayOptions: [{ key: day.id, dayId: day.id, title: day._dayName, day, templates: [{ id: day.id, day }] }],
};
const namespace = `mybrev-public-${process.env.VITE_FIREBASE_PROJECT_ID || 'unconfigured'}-v${CONTENT_CACHE_SCHEMA}`;
const browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || '/usr/bin/chromium', headless: true });
const results = [];
let failure = null;
const record = (name) => { results.push(name); console.log(`PASS ${name}`); };

async function open(width, preference = 'light', legacy = null) {
  const context = await browser.newContext({ viewport: { width, height: width >= 768 ? 1000 : 900 }, colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (url.pathname === '/__appearance-fixtures') return route.fulfill({ contentType: 'text/html', body: '<html><body>Local fixture setup</body></html>' });
    return route.continue();
  });
  await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }));
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(`${date}T12:00:00Z`));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/__appearance-fixtures`);
  await page.evaluate(async ({ namespace, revision, content, date, preference, legacy, songsVersion }) => {
    if (preference) localStorage.setItem('themePreference', preference);
    if (legacy) localStorage.setItem('theme', legacy);
    localStorage.setItem('fontSizeMultiplier', '1.1');
    localStorage.setItem('favoriteSongs', '["saved-song"]');
    const request = window.indexedDB.open(namespace, 1);
    const db = await new Promise((resolve, reject) => {
      request.onupgradeneeded = () => request.result.createObjectStore('entries');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const entries = [
      [['content', date, 'minsk-mohilev'], content],
      [['content', '2026-02-09', 'minsk-mohilev'], content],
      [['readings', date, '', true, 'minsk-mohilev'], { context: content.context, items: [{ id: 'appearance-reading', title: 'Чытанне', reading1: { bible: 'Лк 1, 46–55', text: 'Велічае душа мая Пана, і ўзрадаваўся дух мой у Богу, маім Збаўцу.\n\nБо ўзглянуў Бог на пакору сваёй слугі.' } }] }],
      [['prayer-content', 3], { prayers: [{ id: 'appearance-prayer', title: 'Малітва', text: 'Ойча наш, каторы ёсць у небе, свяціся імя Тваё.', tags: ['тэст'], verified: true }], categories: [] }],
      [['songs', songsVersion], [{ id: 'appearance-song', title: 'Велічае душа мая Пана', text: 'Велічае душа мая Пана', tags: [] }]],
    ];
    await new Promise((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite');
      for (const [key, data] of entries) tx.objectStore('entries').put(JSON.stringify({ data, complete: true, revision: `${revision}:` }), JSON.stringify(key));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { namespace, revision: CONTENT_REVISION, content, date, preference, legacy, songsVersion: SONGS_CACHE_VERSION });
  return { context, page, errors };
}
async function appearance(page, theme) {
  await page.waitForFunction((theme) => document.querySelector('.v-application')?.classList.contains(`v-theme--${theme}`), theme);
  assert.equal(await page.getAttribute('html', 'data-appearance'), theme);
  assert.equal(await page.getAttribute('meta[name="theme-color"]', 'content'), APP_STATUS_BAR_COLORS[theme]);
  const canvas = await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor);
  const channels = APP_THEME_COLORS[theme].background.slice(1).match(/../g).map((c) => parseInt(c, 16));
  assert.equal(canvas, `rgb(${channels.join(', ')})`);
}
async function fits(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal page overflow');
}
async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled', fullPage: !name.endsWith('-reading') });
}

try {
  // Actual Pinia/Vuetify lifecycle: selection, storage, restoration and OS events.
  for (const width of (process.env.APPEARANCE_WIDTHS || '320,390,1440').split(',').map(Number)) {
    const { context, page, errors } = await open(width);
    await page.goto(`${base}/settings`);
    for (const { value, label } of THEME_OPTIONS) {
      await page.getByRole('radio', { name: label, exact: true }).click();
      await appearance(page, value === 'system' ? 'light' : value);
      assert.equal(await page.evaluate(() => localStorage.getItem('themePreference')), value);
      await page.emulateMedia({ colorScheme: 'dark' });
      await appearance(page, value === 'system' ? 'dark' : value);
      await page.reload();
      await appearance(page, value === 'system' ? 'dark' : value);
      assert.equal(await page.getByRole('radio', { name: label, exact: true }).getAttribute('aria-checked'), 'true');
      await page.emulateMedia({ colorScheme: 'light' });
      await appearance(page, value === 'system' ? 'light' : value);
      await fits(page);
      const cells = await page.getByRole('radiogroup', { name: 'Тэма праграмы', exact: true }).getByRole('radio').evaluateAll((els) => els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, right: r.right, overflow: el.scrollWidth - el.clientWidth };
      }));
      assert.equal(cells.length, 4);
      assert.ok(cells.every((c) => c.x >= 0 && c.right <= width && c.overflow <= 1));
    }
    assert.equal(await page.evaluate(() => localStorage.getItem('fontSizeMultiplier')), '1.1');
    assert.equal(await page.evaluate(() => localStorage.getItem('favoriteSongs')), '["saved-song"]');
    if (width === 390) {
      await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings').setThemePreference('unknown'));
      await appearance(page, 'marian');
      await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings').setTheme(true));
      await appearance(page, 'dark');
      await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings').toggleTheme());
      await appearance(page, 'light');
      record('invalid preference ignored; legacy setTheme/toggleTheme APIs still work');
    }
    record(`${width}px: four choices, reload, system changes, canvas/status bar, other preferences, no clipping`);

    for (const theme of ['marian', 'light', 'dark']) {
      await page.getByRole('radio', { name: THEME_OPTIONS.find((o) => o.value === theme).label, exact: true }).click();
      await appearance(page, theme);
      await capture(page, `${width}-${theme}-settings`);
      await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').toggleSettingsSheet());
      const sheet = page.locator('.text-settings-card');
      await sheet.waitFor();
      for (const { value, label } of THEME_OPTIONS) {
        await sheet.getByRole('button', { name: `${label} тэма`, exact: true }).click();
        await appearance(page, value === 'system' ? 'light' : value);
        await fits(page);
        if (width <= 600) {
          const title = await sheet.locator('.sheet-theme-row .v-list-item__content').boundingBox();
          const choices = await sheet.locator('.sheet-theme-row .v-list-item__append').boundingBox();
          assert.ok(title.y + title.height <= choices.y + 1, 'sheet theme title does not overlap the choices');
        }
        assert.ok(await sheet.locator('.sheet-theme-row .v-btn').evaluateAll((buttons) => buttons.every((el) => {
          const r = el.getBoundingClientRect();
          return r.x >= 0 && r.right <= window.innerWidth && el.scrollWidth <= el.clientWidth + 1;
        })));
      }
      await sheet.getByRole('button', { name: `${THEME_OPTIONS.find((o) => o.value === theme).label} тэма`, exact: true }).click();
      await appearance(page, theme);
      await capture(page, `${width}-${theme}-text-settings`);
      await sheet.getByRole('button', { name: 'Закрыць налады', exact: true }).click();
      await page.getByRole('button', { name: 'Дадаць катэгорыю', exact: true }).click();
      const dialog = page.locator('.category-dialog-card');
      await dialog.waitFor();
      assert.ok(await dialog.evaluate((el) => el.classList.contains(`v-theme--${document.documentElement.dataset.appearance}`)));
      assert.equal(await dialog.evaluate((el) => getComputedStyle(el).getPropertyValue('--chrome-accent').trim()), `rgb(${APP_THEME_COLORS[theme].primary.slice(1).match(/../g).map((c) => parseInt(c, 16)).join(',')})`);
      await fits(page);
      await capture(page, `${width}-${theme}-dialog`);
      await page.keyboard.press('Escape');
      // Exercise a real local settings action and its success notification.
      await page.evaluate(() => {
        const settings = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings');
        settings.addCategory({ name: 'Праверка тэмы', tags: ['тэст'] });
      });
      await page.getByRole('button', { name: 'Прыбраць катэгорыю Праверка тэмы з меню', exact: true }).click();
      const notification = page.locator('.v-snackbar__wrapper');
      await notification.waitFor();
      assert.ok(await notification.evaluate((el) => getComputedStyle(el).getPropertyValue('--chrome-accent').trim()));
      await capture(page, `${width}-${theme}-notification`);
      await page.getByRole('button', { name: 'Закрыць', exact: true }).click();
      await page.goto(base);
      await page.locator('.day-options-list .day-option').first().waitFor();
      await appearance(page, theme);
      await fits(page);
      await capture(page, `${width}-${theme}-home`);
      await page.getByRole('button', { name: 'Каляндар', exact: true }).click();
      await page.locator('.date-dialog-card').waitFor();
      await fits(page);
      await capture(page, `${width}-${theme}-calendar`);
      await page.keyboard.press('Escape');
      await page.getByLabel('Адкрыць меню').first().click();
      await page.locator('.app-drawer:not([inert])').waitFor();
      await capture(page, `${width}-${theme}-navigation`);
      await page.keyboard.press('Escape');
      await page.goto(`${base}/day/${date}/ora/${encodeURIComponent(day.id)}/laudes`);
      await page.locator('.psalmody-text').first().waitFor();
      await appearance(page, theme);
      await fits(page);
      if (theme === 'marian') assert.equal(await page.locator('.v-application').evaluate((el) => getComputedStyle(el).getPropertyValue('--reader-surface').trim()), 'rgb(255,255,255)');
      await capture(page, `${width}-${theme}-reading`);
      if (width === 390 && theme === 'marian') {
        await page.evaluate(() => window.scrollTo(0, 900));
        await page.locator('.ora-location').waitFor();
        await page.locator('.ora-location').click();
        const menu = page.locator('.ora-hour-menu');
        await menu.waitFor();
        assert.equal(await menu.evaluate((el) => getComputedStyle(el).getPropertyValue('--chrome-accent').trim()), 'rgb(36,77,120)');
        await fits(page);
        await capture(page, `${width}-${theme}-hour-menu`);
        await page.keyboard.press('Escape');
      }
      if (width === 390 && theme === 'marian') {
        for (const [route, selector] of [
          [`/readings/${date}`, '.section-text'],
          ['/prayer/appearance-prayer', '.prayer-reading-surface'],
          ['/songs', '.songs-list-container'],
          ['/song/appearance-song', '.prayer-reading-surface'],
          ['/bible/bel/mt/1', '.bible-page'],
          [`/ordo/${date}`, '.ordo-page'],
        ]) {
          await page.goto(`${base}${route}`);
          await page.locator(selector).first().waitFor();
          await appearance(page, theme);
          await fits(page);
          await capture(page, `${width}-${theme}-${route.split('/')[1]}`);
          record(`Marian coverage: ${route}`);
        }
      }
      await page.goto(`${base}/settings`);
      await page.getByRole('heading', { name: 'Налады', exact: true }).waitFor();
      record(`${width}px ${theme}: home, Hours reading, settings, calendar, navigation, teleported dialog`);
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  for (const legacy of ['light', 'dark']) {
    const { context, page } = await open(390, null, legacy);
    await page.goto(`${base}/settings`);
    await appearance(page, legacy);
    assert.equal(await page.evaluate(() => localStorage.getItem('themePreference')), legacy);
    await page.emulateMedia({ colorScheme: legacy === 'light' ? 'dark' : 'light' });
    await appearance(page, legacy);
    await page.reload();
    await appearance(page, legacy);
    record(`legacy ${legacy}: migrated choice stays explicit and survives reload`);
    await context.close();
  }
} catch (error) {
  failure = error.message;
  throw error;
} finally {
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ base, fixture: 'local public example; remote requests blocked', passed: results.length, failure, results }, null, 2));
  await browser.close();
}
