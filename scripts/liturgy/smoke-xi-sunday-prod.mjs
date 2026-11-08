#!/usr/bin/env node
/** Read-only post-deploy browser capture of Saturday 13 June XI Sunday first Vespers. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const output = path.resolve('audit-evidence/xi-sunday-production');
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.BENCHMARK_BROWSER_PATH ? { executablePath: process.env.BENCHMARK_BROWSER_PATH } : {}) });
try {
  for (const item of [
    { name: 'mobile-light', width: 390, height: 844, scheme: 'light' },
    { name: 'mobile-dark', width: 390, height: 844, scheme: 'dark' },
    { name: 'desktop', width: 1440, height: 960, scheme: 'light' },
  ]) {
    const context = await browser.newContext({ viewport: { width: item.width, height: item.height }, colorScheme: item.scheme });
    const page = await context.newPage();
    const failures = [];
    page.on('pageerror', (e) => failures.push(e.message));
    try {
      await page.goto('https://ibreviaryby.web.app/day/2026-06-13/ora/feast-heartofmary/vesper', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.locator('.liturgical-hour-column .ora-text').first().waitFor({ timeout: 35000 });
      await page.getByText('Усемагутны Божа, наша моц і надзея', { exact: false }).first().waitFor({ timeout: 30000 });
      const text = await page.locator('.liturgical-hour-column').innerText();
      assert.match(text, /I Нешпары|І Нешпары/iu);
      assert.match(text, /Псальм 113 \(112\)/u);
      assert.match(text, /Убачыўшы натоўпы людзей/u);
      assert.match(text, /Усемагутны Божа, наша моц і надзея/u);
      assert.doesNotMatch(text, /Божа, ласкавы Ойча, Ты спаслаў на свет свайго Сына/u);
      assert.equal(failures.length, 0, 'JavaScript errors: ' + failures.join('; '));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 3);
      assert.equal(overflow, false, 'horizontal overflow');
      await page.screenshot({ path: path.join(output, item.name + '.png'), fullPage: true });
      console.log('PASS', item.name, 'correct XI Sunday source and layout');
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
