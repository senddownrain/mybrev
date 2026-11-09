#!/usr/bin/env node
/* global innerHeight, requestAnimationFrame */
/** Production browser proof: capture actual painted prayer cards, not an empty full-page scroll region. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const output = path.resolve('audit-evidence/xi-sunday-production');
fs.mkdirSync(output, { recursive: true });
const url = 'https://ibreviaryby.web.app/day/2026-06-13/ora/feast-heartofmary/vesper';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BENCHMARK_BROWSER_PATH ? { executablePath: process.env.BENCHMARK_BROWSER_PATH } : {}),
});
const cases = [
  { name: 'mobile-light', width: 390, height: 844, scheme: 'light' },
  { name: 'mobile-dark', width: 390, height: 844, scheme: 'dark' },
  { name: 'desktop', width: 1440, height: 960, scheme: 'light' },
];
const audit = [];

async function screenshotCard(page, locator, label) {
  const count = await locator.count();
  assert.ok(count > 0, label + ': missing prayer section');
  const element = locator.first();
  await element.scrollIntoViewIfNeeded();
  await element.waitFor({ state: 'visible' });
  const state = await element.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      display: style.display, visibility: style.visibility, opacity: Number(style.opacity),
      textLength: (el.innerText || '').trim().length,
      viewportHeight: innerHeight,
    };
  });
  assert.ok(state.width > 180 && state.height > 40
    && state.textLength >= 40 && state.display !== 'none'
    && state.visibility !== 'hidden' && state.opacity > 0.5,
  label + ': invisible or empty rendered prayer card ' + JSON.stringify(state));
  assert.ok(state.y < state.viewportHeight && state.y + state.height > 0,
    label + ': element not in viewport');
  // Firestore revalidation may replace Vue cards while Chromium is rasterizing.
  // Re-resolve the locator instead of failing on an obsolete element handle.
  let captured = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await locator.first().screenshot({
        path: path.join(output, label + '.png'), animations: 'disabled', timeout: 25000,
      });
      captured = true;
      break;
    } catch (error) {
      if (attempt === 4 || !/detached|not attached|Element is not attached/iu.test(String(error.message))) throw error;
      await page.waitForTimeout(400);
    }
  }
  assert.ok(captured, label + ': screenshot capture did not stabilize');
  const bytes = fs.statSync(path.join(output, label + '.png')).size;
  assert.ok(bytes > 2000, label + ': screenshot unexpectedly small');
  return { ...state, bytes };
}

try {
  for (const item of cases) {
    const context = await browser.newContext({
      viewport: { width: item.width, height: item.height }, colorScheme: item.scheme,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.locator('.liturgical-hour-column .ora').first().waitFor({ timeout: 35000 });
      const collectText = 'Усемагутны Божа, наша моц і надзея';
      const magnText = 'Убачыўшы натоўпы людзей';
      await page.getByText(collectText, { exact: false }).first().waitFor({ timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(600); // let the cached-to-live Firestore refresh settle
      const text = await page.locator('.liturgical-hour-column').innerText();
      assert.match(text, /I Нешпары|І Нешпары/iu);
      assert.match(text, /Псальм 113 \(112\)/u);
      assert.match(text, new RegExp(magnText, 'u'));
      assert.match(text, new RegExp(collectText, 'u'));
      assert.doesNotMatch(text, /Божа, ласкавы Ойча, Ты спаслаў на свет свайго Сына/u);
      assert.deepEqual(errors, []);
      const collect = page.locator('.liturgical-hour-column .ora').filter({ hasText: collectText });
      const antiphon = page.locator('.liturgical-hour-column .ora').filter({ hasText: magnText });
      const psalms = page.locator('.liturgical-hour-column .ora').filter({ hasText: 'Псальм 113 (112)' });
      const collectProof = await screenshotCard(page, collect, item.name + '-collect');
      const antiphonProof = await screenshotCard(page, antiphon, item.name + '-magnificat');
      // Scroll the hymn/psalmody into view and capture what the user ACTUALLY sees.
      const psalmProof = await screenshotCard(page, psalms, item.name + '-psalmody');
      await psalms.first().scrollIntoViewIfNeeded();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const intersects = await psalms.first().evaluate(el => {
        const b=el.getBoundingClientRect(); return b.bottom > 0 && b.top < window.innerHeight;
      });
      assert.ok(intersects, 'Psalmody not painted inside viewport');
      await page.screenshot({ path: path.join(output, item.name + '-viewport.png'), fullPage: false, animations: 'disabled' });
      audit.push({
        case: item.name, viewport: { width: item.width, height: item.height },
        expectedCollect: true, expectedMagnificat: true, trinityContamination: false,
        errors, collectProof, antiphonProof, psalmProof,
      });
      console.log('PASS', item.name, 'visible collect/Magnificat/psalmody screenshots');
    } finally {
      await context.close();
    }
  }
  fs.writeFileSync(path.join(output, 'visual-acceptance.json'), JSON.stringify({
    target: url, outcome: 'PASS', cases: audit,
    notes: 'Individual prayer-card PNGs come from element.screenshot after scrollIntoViewIfNeeded. Viewport PNG is the true painted viewport, not a full-page off-screen capture.',
  }, null, 2) + '\n');
} finally {
  await browser.close();
}
