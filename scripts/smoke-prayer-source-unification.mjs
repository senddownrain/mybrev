import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';
import bibliography from '../src/data/sourceBibliography.json' with { type: 'json' };

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';
const origin = new URL(baseUrl).origin;
const output = process.env.SOURCE_EVIDENCE_DIR || 'reports/prayer-source-unification';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const results = [];
try {
  for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: {width, height: 900}, serviceWorkers: 'block' });
    await context.addInitScript((theme) => {
      Object.defineProperty(navigator, 'onLine', { get: () => false });
      localStorage.setItem('themePreference', theme);
    }, theme);
    // Every non-local request, including all Firebase traffic, is blocked.
    await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth));
    await page.goto(baseUrl + '/sources');
    await page.locator('.source-rights__entry').last().waitFor();
    assert.equal(await page.locator('.source-rights__entry').count(), bibliography.entries.length);
    for (const entry of bibliography.entries) {
      const text = await page.locator('#' + entry.id).innerText();
      for (const value of [entry.title, ...entry.notices]) assert.ok(text.includes(value));
    }
    await noOverflow();
    await page.screenshot({path: `${output}/sources-${width}-${theme}.jpg`, fullPage: true, type:'jpeg', quality:65});
    await page.evaluate(async (project) => {
      const data = {revision:'test',complete:true,data:{prayers:[{id:'source-smoke',title:'Малітва',text:'Пс 23, 1–6. Ян 3, 16',textFormat:'mybrev-markdown',source:'«Бог Добры» (Пінск, 2022), с. 135–136',tags:[]}],categories:[]}};
      const db = await new Promise((resolve, reject) => {
        const request = globalThis.indexedDB.open(`mybrev-public-${project}-v1`, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('entries');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('entries', 'readwrite');
        tx.objectStore('entries').put(JSON.stringify(data), '["prayer-content",3]');
        tx.oncomplete = resolve; tx.onerror = reject;
      });
      db.close();
    }, process.env.SMOKE_PROJECT_ID || 'ibreviaryby');
    await page.goto(baseUrl + '/prayer/source-smoke');
    await page.locator('.prayer-source').waitFor();
    assert.equal((await page.locator('.prayer-source').innerText()).replace(/\s+/g,' ').trim(), 'Крыніца: «Бог Добры» (Пінск, 2022)');
    assert.ok((await page.locator('body').innerText()).includes('Пс 23, 1–6. Ян 3, 16'));
    await noOverflow(); assert.deepEqual(errors, []);
    await page.screenshot({path: `${output}/prayer-${width}-${theme}.jpg`, fullPage: true, type:'jpeg', quality:65});
    results.push({theme,width,bibliographyEntries:bibliography.entries.length,source:'«Бог Добры» (Пінск, 2022)',scripturePreserved:true,overflow:false,errors});
    await context.close();
  }
  await fs.writeFile(output + '/smoke.json', JSON.stringify(results,null,2) + '\n');
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
