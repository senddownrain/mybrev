/**
 * Real-screen check of the local analytics (test build, flag on) against the LOCAL Firestore emulator.
 *
 *   npm run analytics:smoke
 *
 * Drives the built app in Chromium through the matrix of screens (today, daily readings, hours, mass, short and long prayer,
 * song, compendium, Bible bel/ru, catalogs), scrolls to the end where the text is longer than the screen, leaves the screen,
 * and reads the aggregated cells from `window.__analyticsLocal.snapshot()`. Prints the matrix and exits non-zero on a violated
 * expectation. Nothing is sent anywhere; production is never contacted.
 * Env: BENCHMARK_BROWSER_PATH (Chromium), SMOKE_PORT (default 5320), SMOKE_OUT (JSON path).
 */
/* global PopStateEvent, Event -- used only inside page.evaluate (browser context) */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { ROOT, buildAndServe, emulatorFromEnv, seedBible, seedEmulator } from './lib/emulator-app.mjs';

const { emulatorHost, emulatorPort } = emulatorFromEnv();
const projectId = 'demo-analytics-smoke';
const outRoot = path.join(ROOT, 'outputs', 'analytics-smoke');
fs.mkdirSync(outRoot, { recursive: true });
const inventory = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/utils/analytics/public-inventory.json'), 'utf8')).ids;
const MASS_ORDER_PRAYER_ID = 'eMmCtxwyJ75ogmL5rwye';

const { db, seeded } = await seedEmulator({ projectId, snapshots: [process.env.SMOKE_SNAPSHOT || 'backups/firestore-snapshot-readings-sets', process.env.SMOKE_STATIC_SNAPSHOT || 'backups/firestore-snapshot-static'] });
const bibleBooks = await seedBible(db, ['gn']);
console.log(`seeded ${seeded} documents + ${bibleBooks} Bible books into the emulator`);

// pick prayers by real text length (inventory ids only)
const prayerIds = inventory.filter((id) => id.startsWith('prayer:')).map((id) => id.slice(7));
const prayers = [];
for (const id of prayerIds) {
  const snap = await db.doc(`prayers/${id}`).get();
  if (!snap.exists) continue;
  const data = snap.data();
  const length = String(data.text || data.content || data.body || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().length;
  if (length > 0 && id !== MASS_ORDER_PRAYER_ID) prayers.push({ id, length });
}
prayers.sort((a, b) => a.length - b.length);
const shortPrayer = prayers[0];
const longPrayer = prayers.at(-1);
// a public id whose document does not exist: delete one real prayer from the (local) emulator
const missingPrayer = prayers.length > 2 ? prayers[1].id : null;
if (missingPrayer) { await db.doc(`prayers/${missingPrayer}`).delete(); prayers.splice(1, 1); }
const songIds = inventory.filter((id) => id.startsWith('song:')).map((id) => id.slice(5));
let song = null;
for (const id of songIds) { if ((await db.doc(`songs/${id}`).get()).exists) { song = id; break; } }

const app = await buildAndServe({ name: 'smoke', flag: 'true', projectId, emulatorHost, emulatorPort, outRoot, port: Number(process.env.SMOKE_PORT || 5320) });
const browser = await chromium.launch(process.env.BENCHMARK_BROWSER_PATH ? { executablePath: process.env.BENCHMARK_BROWSER_PATH } : {});
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function discoverHours() {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(app.base, { waitUntil: 'domcontentloaded' });
  await page.locator('.day-options-list .day-option').first().waitFor({ state: 'visible', timeout: 45_000 });
  const dayHref = await page.locator('.day-options-list .day-option').first().getAttribute('href');
  await page.goto(new URL(dayHref, app.base).href, { waitUntil: 'domcontentloaded' });
  await page.locator('.ora-options-list .ora-card').first().waitFor({ state: 'visible', timeout: 45_000 });
  const hrefs = await page.locator('a[href*="/ora/"]').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
  await context.close();
  const pick = (name) => hrefs.find((h) => h.endsWith(`/${name}`) || h.includes(`/${name}?`));
  return { laudes: pick('laudes'), vesper: pick('vesper') };
}
const hours = await discoverHours();

const SCENARIOS = [
  { id: 'today', path: '/', dwell: 2000, expect: { screen: 'today' } },
  { id: 'short open (2 s): fv only, no sd/er', path: '/readings', ready: '.readings-content', dwell: 2000, expect: { screen: 'readings', content: 'reading:day', onlyFv: true } },
  { id: 'catalog prayers', path: '/prayers', expect: { catalog: 'prayers_home' } },
  { id: 'readings', path: '/readings', ready: '.readings-content', scroll: true, expect: { screen: 'readings', content: 'reading:day', texts: true } },
  hours.laudes && { id: 'hour laudes', path: hours.laudes, ready: '.liturgical-hour-column', scroll: true, expect: { screen: 'hours', content: 'hour:laudes', texts: true } },
  hours.vesper && { id: 'hour vesper', path: hours.vesper, ready: '.liturgical-hour-column', scroll: true, expect: { screen: 'hours', content: 'hour:vesper', texts: true } },
  { id: 'mass order', path: `/prayer/${MASS_ORDER_PRAYER_ID}`, ready: '.prayer-reading-surface', scroll: true, expect: { screen: 'mass', content: 'mass:order', texts: true } },
  shortPrayer && { id: `short prayer (${shortPrayer.length} chars), tall screen`, path: `/prayer/${shortPrayer.id}`, ready: '.prayer-reading-surface', viewport: { width: 390, height: 1400 }, expect: { screen: 'prayers', content: `prayer:${shortPrayer.id}`, texts: true, fit: true } },
  shortPrayer && { id: 'short prayer, 320 px, text ×1.8', path: `/prayer/${shortPrayer.id}`, ready: '.prayer-reading-surface', viewport: { width: 320, height: 640 }, scale: 1.8, scroll: true, expect: { screen: 'prayers', content: `prayer:${shortPrayer.id}`, texts: true } },
  longPrayer && { id: `long prayer (${longPrayer.length} chars)`, path: `/prayer/${longPrayer.id}`, ready: '.prayer-reading-surface', scroll: true, expect: { screen: 'prayers', content: `prayer:${longPrayer.id}`, texts: true } },
  missingPrayer && { id: 'prayer not found in the data', path: `/prayer/${missingPrayer}`, expect: { none: true } },
  song && { id: 'song', path: `/song/${song}`, ready: '.prayer-reading-surface', scroll: true, expect: { screen: 'songs', content: `song:${song}`, texts: true } },
  { id: 'catalog songs', path: '/songs', expect: { catalog: 'songs' } },
  { id: 'compendium part p1', path: '/compendium/part/p1', ready: '.compendium-part-outline', scroll: true, expect: { screen: 'compendium', content: 'comp:p1', texts: true } },
  { id: 'catalog compendium', path: '/compendium', expect: { catalog: 'compendium_home' } },
  { id: 'Bible bel gn 1', path: '/bible/bel/gn/1', ready: '.bible-reader', scroll: true, expect: { screen: 'bible', content: 'bible:bel:gn', texts: true } },
  { id: 'Bible ru gn 1', path: '/bible/ru/gn/1', ready: '.bible-reader', scroll: true, expect: { screen: 'bible', content: 'bible:ru:gn', texts: true } },
  longPrayer && { id: 'Back navigation: the same screen twice = two visits, no double count', path: `/prayer/${longPrayer.id}`, ready: '.prayer-reading-surface', dwell: 6200, expect: { screen: 'prayers', content: `prayer:${longPrayer.id}`, texts: true, views: 2 },
    act: async (page, wait) => { await page.evaluate(() => { window.history.pushState({}, '', '/about'); window.dispatchEvent(new PopStateEvent('popstate')); }); await wait(400); await page.goBack(); await page.locator('.prayer-reading-surface').first().waitFor({ state: 'visible' }); await wait(6200); } },
  longPrayer && { id: 'background 9 s: hidden time is not reading time', path: `/prayer/${longPrayer.id}`, ready: '.prayer-reading-surface', dwell: 6200, expect: { screen: 'prayers', content: `prayer:${longPrayer.id}`, texts: true, fvAtMost: '5_15s' },
    act: async (page, wait) => { await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); }); await wait(9000); await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }); await wait(300); } },
  shortPrayer && longPrayer && { id: 'quick switch before the text is read: only the last screen is a read', path: `/prayer/${shortPrayer.id}`, ready: '.prayer-reading-surface', dwell: 200, expect: { screen: 'prayers', content: `prayer:${longPrayer.id}`, texts: true, noCell: `prayer:${shortPrayer.id}` },
    act: async (page, wait) => { await page.evaluate((id) => { window.history.pushState({}, '', `/prayer/${id}`); window.dispatchEvent(new PopStateEvent('popstate')); }, longPrayer.id); await wait(6500); } },
  hours.laudes && { id: 'feature_use: hour_switch (menu of hours)', path: hours.laudes, ready: '.liturgical-hour-column', dwell: 1500, expect: { screen: 'hours', feature: 'hour_switch' },
    act: async (page, wait) => { await page.mouse.wheel(0, 900); await wait(700); await page.locator('.ora-location').first().click(); await wait(400); await page.locator('.ora-hour-menu .v-list-item:not(.v-list-item--active)').first().click(); await wait(800); } },
  { id: 'feature_use: search_open (Bible search sheet)', path: '/bible/bel/gn/1', ready: '.bible-reader', dwell: 1500, expect: { screen: 'bible', feature: 'search_open' },
    act: async (page, wait) => { await page.locator('button[aria-label="Пошук у Бібліі"]').click(); await wait(500); } },
  { id: 'Bible without a book (catalog or last book)', path: '/bible', dwell: 2000, expect: { optional: true } },
].filter(Boolean).filter((scenario) => !process.env.SMOKE_ONLY || scenario.id.includes(process.env.SMOKE_ONLY));

const cellsOf = (packets) => packets.flatMap((p) => p.cells);
async function run(scenario) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: scenario.viewport || { width: 390, height: 780 } });
  if (scenario.scale) await context.addInitScript((m) => { localStorage.setItem('fontSizeMultiplier', String(m)); }, scenario.scale);
  const page = await context.newPage();
  const requests = new Set();
  page.on('request', (request) => { try { requests.add(new URL(request.url()).host); } catch { /* data: */ } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (process.env.SMOKE_DEBUG) page.on('console', (message) => console.log(`  [console] ${message.text()}`));
  await page.goto(`${app.base}${scenario.path}`, { waitUntil: 'domcontentloaded' });
  if (scenario.ready) await page.locator(scenario.ready).first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => errors.push(`ready selector ${scenario.ready} never appeared`));
  // a visit shorter than 5 s counts as an opening (fv only); a read needs more. Not-found: wait past the readiness window (~9.5 s)
  await sleep(scenario.expect.none ? 11_500 : (scenario.dwell ?? 6500));
  if (scenario.act) await scenario.act(page, sleep);
  if (scenario.scroll) {
    for (let step = 0; step < 80; step += 1) {
      const atEnd = await page.evaluate(() => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2);
      if (atEnd) break;
      await page.mouse.wheel(0, 500);
      await sleep(60);
    }
    await sleep(500);
  }
  const shown = await page.evaluate(() => (document.querySelector('.v-main')?.innerText || '').replace(/\s+/g, ' ').slice(0, 90));
  const finalPath = new URL(page.url()).pathname;
  if (process.env.SMOKE_DEBUG && scenario.ready) console.log('  [not-final]', JSON.stringify(await page.evaluate((selector) => [...(document.querySelector(selector)?.querySelectorAll('.v-progress-circular, .v-progress-linear, .v-skeleton-loader, .v-alert') || [])].map((n) => `${n.className}|${(n.parentElement?.className || '').toString().slice(0, 40)}|${n.textContent.slice(0, 40)}`), scenario.ready)));
  if (process.env.SMOKE_DEBUG) console.log('  [dbg]', JSON.stringify(await page.evaluate(() => window.__dbg || null)));
  const rect = scenario.ready ? await page.evaluate((selector) => { const nodes = [...document.querySelectorAll(selector)]; return nodes.map((n) => { const r = n.getBoundingClientRect(); const chain = []; for (let a = n.parentElement; a && a !== document.documentElement; a = a.parentElement) { const o = getComputedStyle(a).overflowY; if (o !== 'visible') chain.push(`${a.tagName}.${String(a.className).split(' ')[0]}:${o}:${a.scrollHeight}/${a.clientHeight}`); } return [Math.round(r.top), Math.round(r.height), Math.round(r.width), getComputedStyle(n).display, chain.join(' > ')]; }); }, scenario.ready) : null;
  // leave the screen: closes the visit
  await page.evaluate(() => { window.history.pushState({}, '', '/about'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await sleep(600);
  const packets = await page.evaluate(() => window.__analyticsLocal.snapshot());
  await context.close();
  return { cells: cellsOf(packets), requests: [...requests], errors, shown, finalPath, rect };
}

const rows = [];
let failed = 0;
try {
  for (const scenario of SCENARIOS) {
    const { cells, requests, errors, shown, finalPath, rect } = await run(scenario);
    const forContent = scenario.expect.content ? cells.filter((c) => c.content_id === scenario.expect.content) : cells.filter((c) => c.section !== 'about');
    const get = (metric) => forContent.find((c) => c.e === 'text_read' && c.metric === metric)?.bucket || '—';
    const row = {
      screen: scenario.id,
      screen_view: forContent.some((c) => c.e === 'screen_view') || cells.some((c) => c.e === 'screen_view' && c.section === scenario.expect.screen),
      features: cells.filter((c) => c.e === 'feature_use').map((c) => `${c.feature_id}@${c.section}`),
      catalog_open: cells.filter((c) => c.e === 'catalog_open').map((c) => c.catalog_id),
      fv: get('fv'), sd: get('sd'), er: get('er'),
      errors: cells.filter((c) => c.e === 'measurement_error').map((c) => c.error_id),
      foreignHosts: requests.filter((h) => !/^127\.0\.0\.1|^localhost/.test(h) && !/fonts\.(googleapis|gstatic)\.com$/.test(h)),
      pageErrors: errors, finalPath, shown, rect,
    };
    const problems = [];
    if (scenario.expect.none && cells.some((c) => c.content_id)) problems.push('a not-found screen produced a material cell');
    if (scenario.expect.catalog && !row.catalog_open.includes(scenario.expect.catalog)) problems.push(`no catalog_open ${scenario.expect.catalog}`);
    if (scenario.expect.screen && !scenario.expect.none && !row.screen_view && !scenario.expect.catalog) problems.push('no screen_view');
    if (scenario.expect.onlyFv && (row.fv === '—' || row.sd !== '—' || row.er !== '—')) problems.push(`short open must give fv only: fv=${row.fv} sd=${row.sd} er=${row.er}`);
    if (scenario.expect.texts && (row.fv === '—' || row.sd === '—' || row.er === '—')) problems.push(`missing metric fv=${row.fv} sd=${row.sd} er=${row.er}`);
    if (scenario.expect.views && forContent.find((c) => c.e === 'screen_view')?.n !== scenario.expect.views) problems.push(`expected ${scenario.expect.views} visits, got ${forContent.find((c) => c.e === 'screen_view')?.n}`);
    if (scenario.expect.fvAtMost && row.fv !== scenario.expect.fvAtMost) problems.push(`fv should stay ${scenario.expect.fvAtMost} (hidden time must not count), got ${row.fv}`);
    if (scenario.expect.noCell && cells.some((c) => c.content_id === scenario.expect.noCell && c.e === 'text_read')) problems.push(`the abandoned screen ${scenario.expect.noCell} produced a read`);
    if (scenario.expect.feature && !cells.some((c) => c.e === 'feature_use' && c.feature_id === scenario.expect.feature)) problems.push(`no feature_use ${scenario.expect.feature}`);
    if (scenario.expect.fit && row.sd !== 'fit') problems.push(`expected sd=fit, got ${row.sd}`);
    if (row.foreignHosts.length) problems.push(`foreign hosts: ${row.foreignHosts.join(',')}`);
    if (errors.length) problems.push(`page errors: ${errors.join(' | ')}`);
    row.problems = problems;
    rows.push(row);
    if (problems.length) failed += 1;
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${scenario.id}: view=${row.screen_view} fv=${row.fv} sd=${row.sd} er=${row.er} catalog=${row.catalog_open.join(',') || '—'} features=${row.features.join(',') || '—'} errors=${row.errors.join(',') || '—'}${problems.length ? ` :: ${problems.join('; ')}` : ''}`);
  }
} finally {
  await browser.close();
  await app.server.close();
}
const out = process.env.SMOKE_OUT || path.join(ROOT, 'reports', 'performance', 'analytics-web-screens-smoke.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify({ generatedAt: new Date().toISOString(), shortPrayer, longPrayer, hours, song, rows }, null, 2)}\n`);
console.log(`report: ${out}`);
process.exitCode = failed ? 1 : 0;
