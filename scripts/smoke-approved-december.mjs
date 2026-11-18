import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';
const out = process.env.SOURCE_EVIDENCE_DIR || 'work/pr217/december-ui';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const results = [];
try {
  for (const diocese of ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await context.addInitScript(diocese => {
      localStorage.setItem('ordoDiocese', diocese);
      localStorage.setItem('ordoDioceses', JSON.stringify([diocese]));
    }, diocese);
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const year of [2026, 2027]) for (const day of ['09', '12']) {
      const date = `${year}-12-${day}`;
      await page.goto(`${base}/ordo/${date}`);
      await page.locator('.ordo-day').waitFor();
      const rendered = await page.locator('.ordo-day').innerText();
      assert.doesNotMatch(rendered, /Дыега|Гвадэлуп/u);
      const ids = await page.evaluate(async ({ date, diocese }) => {
        const { resolveRuntimeDay } = await import('/src/utils/ordo/runtime.js');
        const d = resolveRuntimeDay(date, { diocese });
        return [d.primary, ...d.alternatives, ...d.commemorations].map(x => x.id);
      }, { date, diocese });
      assert.ok(!ids.some(id => ['sv-juan-diego', 'our-lady-guadalupe'].includes(id)));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      results.push({ diocese, date, ids, renderedExclusions: 'PASS', overflow: false });
      if (year === 2027) await page.screenshot({ path: `${out}/${diocese}-${date}.png`, fullPage: true });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally { await browser.close(); }
await fs.writeFile(`${out}/results.json`, JSON.stringify(results, null, 2) + '\n');
console.log(`${results.length} mounted December checks: PASS (2026/2027, four dioceses)`);
