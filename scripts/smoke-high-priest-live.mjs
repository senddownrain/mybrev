#!/usr/bin/env node
/** Browser acceptance screenshots of the public High Priest feast, no writes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const output = process.argv[2] || 'audit-evidence/high-priest-live';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
  headless: true,
});
const results = [];
try {
  for (const [hour, reference] of [
    ['terz', 'Гбр 7, 26-27'],
    ['sext', '1 П 2, 4-5'],
    ['none', '1 П 2, 9-10'],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: 'be-BY',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error.message || error)));
    const url = 'https://ibreviaryby.web.app/day/2026-05-28/ora/'
      + 'feast-christthehighpriest/' + hour
      + '?diocese=pinsk&view=reference&option=christ-the-high-priest';
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    let ready = false;
    try {
      await page.waitForFunction(
        target => document.body && document.body.innerText.includes(target),
        reference,
        { timeout: 45000 },
      );
      ready = true;
    } catch { /* Still save the screenshot for diagnostic evidence. */ }
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    const file = path.join(output, hour + '-pinsk-2026-05-28.png');
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
    results.push({ hour, url, httpStatus: response?.status(), expected: reference,
      referenceVisible: ready, jsErrors: errors, screenshot: file });
    await context.close();
  }
} finally {
  await browser.close();
}
await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
if (results.some(item => !item.referenceVisible || !item.httpStatus
  || item.httpStatus >= 400 || item.jsErrors.length)) {
  console.error('Production browser acceptance failed. Screenshots saved for review.');
  process.exitCode = 1;
}
