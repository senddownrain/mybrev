import assert from 'node:assert/strict';
import process from 'node:process';
import { chromium } from 'playwright-core';

const baseUrl = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const executablePath = process.env.BENCHMARK_BROWSER_PATH
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const skipServiceWorker = process.env.SMOKE_SKIP_SERVICE_WORKER === '1';
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
const page = await context.newPage();

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('.day-options-list .day-option').first().waitFor({ state: 'visible', timeout: 30_000 });
  assert.ok(await page.evaluate(async () => {
    await document.fonts.load('24px "Material Design Icons"');
    const icon = document.querySelector('.mdi-menu');
    return document.fonts.check('24px "Material Design Icons"')
      && icon && getComputedStyle(icon, '::before').content !== 'none';
  }), 'the generated MDI subset loads and contains the menu glyph');
  assert.equal(await page.evaluate(() => (
    performance.getEntriesByType('resource').some((entry) => entry.name.includes('vendor-firebase-auth'))
  )), false, 'public home does not load Firebase Auth');

  const menuButton = page.getByLabel('Адкрыць меню').first();
  await menuButton.click();
  const drawer = page.locator('.app-drawer');
  await page.locator('.app-drawer:not([inert])').waitFor({ state: 'attached' });
  const drawerTabIndexes = await drawer.locator('a[href], button, [tabindex]').evaluateAll((elements) => (
    elements.filter((element) => !element.hasAttribute('disabled')).map((element) => element.tabIndex)
  ));
  assert.ok(drawerTabIndexes.length >= 8, 'drawer exposes its navigation controls');
  assert.ok(drawerTabIndexes.every((value) => value >= 0), 'drawer has no negative-tabindex controls');
  await page.keyboard.press('Escape');
  await page.locator('.app-drawer[inert]').waitFor({ state: 'attached' });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Адкрыць меню');

  await page.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Уваход для адміністратара' }).waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => (
    performance.getEntriesByType('resource').some((entry) => entry.name.includes('vendor-firebase-auth'))
  )), true, 'protected admin boundary loads Firebase Auth and redirects to login');

  await page.goto(`${baseUrl}/settings`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('radio', { name: 'Сістэмная' }).click();
  assert.ok(await page.locator('.v-theme--dark').count(), 'system theme follows dark OS preference');

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const dayHref = await page.locator('.day-options-list .day-option').first().getAttribute('href');
  await page.goto(new URL(dayHref, baseUrl).href, { waitUntil: 'domcontentloaded' });
  const vesperHref = await page.locator('a[href*="/ora/"][href$="/vesper"]').first().getAttribute('href');
  await page.goto(new URL(vesperHref, baseUrl).href, { waitUntil: 'domcontentloaded' });
  await page.locator('.liturgical-hour-column .ora .ora-text').first().waitFor({ state: 'visible', timeout: 30_000 });
  const sectionButton = page.locator('.ora-location').first();
  await sectionButton.click();
  const sectionItems = page.locator('.ora-section-menu .v-list-item');
  assert.ok(await sectionItems.count() >= 4, 'reader exposes document-derived section navigation');
  assert.equal(await page.getByRole('link', { name: /Камплета/ }).count(), 1, 'Vespers links to the canonical next hour');
  await sectionItems.nth(2).click();
  await page.waitForTimeout(500);
  const storedPosition = await page.evaluate(() => (
    Object.keys(localStorage).some((key) => key.startsWith('mybrev:reading-position:'))
  ));
  assert.ok(storedPosition, 'reader stores a section-relative reading position');

  if (!skipServiceWorker) {
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.ok(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), 'service worker controls the PWA');
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#app').waitFor({ state: 'attached' });
    assert.ok((await page.locator('body').innerText()).trim().length > 0, 'precache serves the application shell offline');
    await context.setOffline(false);
  }

  console.log(`UI smoke passed: drawer keyboard/focus, system theme, reader sections/resume${skipServiceWorker ? '' : ', service worker'}.`);
} finally {
  await context.close();
  await browser.close();
}
