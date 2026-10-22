/**
 * Read-only first-interaction diagnostic for MyBrev.
 * Measures RAW mouse clicks at the first visible opportunity, not Playwright's
 * locator.click() (which silently waits for actionability).
 *
 * FIRST_CLICK_BASE_URL=http://127.0.0.1:4173 \
 * FIRST_CLICK_BROWSER_PATH=/usr/bin/chromium \
 * node scripts/diagnose-first-interactions.mjs
 *
 * IMPORTANT: Remote sites make actual public Firestore reads. To opt in,
 * explicitly set FIRST_CLICK_ALLOW_REMOTE=yes (max 2 runs per case/mode).
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = (process.env.FIRST_CLICK_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const parsedUrl = new URL(baseUrl);
const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsedUrl.hostname);
const runs = Number(process.env.FIRST_CLICK_RUNS || 8);
const modes = (process.env.FIRST_CLICK_MODES || 'cold,warm,slow').split(',').map((s) => s.trim());
const cases = ['menu', 'day-option'];
const timeout = Number(process.env.FIRST_CLICK_TIMEOUT_MS || 12000);
const browserPath = process.env.FIRST_CLICK_BROWSER_PATH || process.env.BENCHMARK_BROWSER_PATH;

if (!Number.isInteger(runs) || runs < 1 || runs > 50) throw new Error('FIRST_CLICK_RUNS must be 1..50');
if (modes.some((mode) => !['cold', 'warm', 'slow'].includes(mode))) throw new Error('Unsupported FIRST_CLICK_MODES');
if (!local && process.env.FIRST_CLICK_ALLOW_REMOTE !== 'yes') {
  throw new Error('Remote target blocked: set FIRST_CLICK_ALLOW_REMOTE=yes to permit read-only remote checks');
}
if (!local && runs > 2) {
  throw new Error('Remote runs limited to 2 per case/mode to avoid excessive Firestore reads');
}

const browser = await chromium.launch({
  headless: true,
  ...(browserPath ? { executablePath: browserPath } : {}),
});
const measurements = [];
const startedAt = new Date().toISOString();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pct = (arr, p) => {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  return +sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)].toFixed(1);
};

async function instrument(page) {
  await page.addInitScript(() => {
    const log = { inputs: [], longTasks: [] };
    window.__firstClickDiagnostic = log;
    for (const type of ['pointerdown', 'click']) {
      document.addEventListener(type, (event) => {
        const target = event.target;
        log.inputs.push({
          type, at: performance.now(),
          target: target?.closest?.('button, a, [role="button"], .v-list-item')?.getAttribute('aria-label')
            || target?.closest?.('button, a, [role="button"], .v-list-item')?.textContent?.trim().slice(0, 60)
            || target?.tagName || 'unknown',
        });
      }, { capture: true, passive: true });
    }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          log.longTasks.push({ at: entry.startTime, duration: entry.duration });
        }
      }).observe({ type: 'longtask', buffered: true });
    } catch { /* unsupported browser */ }
  });
}

async function firstVisible(page, selector) {
  await page.waitForFunction((s) => {
    const node = document.querySelector(s);
    if (!node) return false;
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== 'hidden';
  }, selector, { polling: 'raf', timeout });
  return page.evaluate(() => performance.now());
}

// Never use locator.click(): it automatically waits for a stable, enabled,
// unobscured element and can hide the precise problem being investigated.
async function rawClick(page, selector) {
  const before = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return { missing: true };
    const box = el.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const hit = document.elementFromPoint(x, y);
    const targetIsHit = hit === el || el.contains(hit);
    const overlay = [...document.querySelectorAll('.v-overlay, .v-navigation-drawer')]
      .filter((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none'
          && rect.width > 0 && rect.height > 0;
      }).map((node) => ({
        className: String(node.className).slice(0, 120),
        inert: node.inert,
      })).slice(0, 12);
    return {
      x, y, targetIsHit,
      hit: hit?.tagName + '.' + String(hit?.className || '').slice(0, 90),
      pointerEvents: getComputedStyle(el).pointerEvents,
      inheritedInert: Boolean(el.closest('[inert]')),
      overlays: overlay,
      at: performance.now(),
    };
  }, selector);
  if (before.missing) throw new Error('Button disappeared before mouse click: ' + selector);
  await page.mouse.click(before.x, before.y, { delay: 0 });
  return before;
}

async function getResult(page) {
  return page.evaluate(() => ({
    at: performance.now(),
    path: location.pathname,
    log: window.__firstClickDiagnostic || { inputs: [], longTasks: [] },
    readyState: document.readyState,
    navigation: performance.getEntriesByType('navigation').map((entry) => ({
      domContentLoadedMs: entry.domContentLoadedEventEnd,
      loadMs: entry.loadEventEnd,
    })),
  }));
}

async function one(mode, testCase, trialNumber) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 820 },
    serviceWorkers: 'allow',
  });
  const page = await context.newPage();
  await instrument(page);
  const errors = [];
  const failures = [];
  let requests = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => failures.push({
    urlHost: (() => { try { return new URL(request.url()).host; } catch { return 'invalid'; } })(),
    error: request.failure()?.errorText || 'unknown',
  }));
  page.on('request', () => { requests += 1; });

  const row = { mode, case: testCase, trial: trialNumber, success: false };
  try {
    if (mode === 'slow') {
      const session = await context.newCDPSession(page);
      await session.send('Network.enable');
      await session.send('Network.emulateNetworkConditions', {
        offline: false, latency: 180, downloadThroughput: 850000,
        uploadThroughput: 250000,
      });
      await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout });
    if (mode === 'warm') {
      await firstVisible(page, '[aria-label="Адкрыць меню"]');
      await page.reload({ waitUntil: 'domcontentloaded', timeout });
    }

    const selector = testCase === 'menu'
      ? '[aria-label="Адкрыць меню"]'
      : '.day-options-list .day-option';
    row.firstVisibleMs = await firstVisible(page, selector);
    row.rawClick = await rawClick(page, selector);
    const initialPath = parsedUrl.pathname;
    if (testCase === 'menu') {
      await page.waitForFunction(() => {
        const node = document.querySelector('.app-drawer');
        return node && node.classList.contains('v-navigation-drawer--active')
          && getComputedStyle(node).visibility !== 'hidden';
      }, null, { polling: 'raf', timeout: 4000 });
      row.menuOpenMs = (await page.evaluate(() => performance.now())) - row.rawClick.at;
      // Also exercise the first click on a menu item, without auto-waiting.
      await firstVisible(page, '.app-drawer a[href="/readings"]');
      row.drawerClick = await rawClick(page, '.app-drawer a[href="/readings"]');
      await page.waitForFunction(() => location.pathname === '/readings', null,
        { polling: 'raf', timeout: 5000 });
      row.drawerNavigationMs = (await page.evaluate(() => performance.now())) - row.drawerClick.at;
    } else {
      await page.waitForFunction((oldPath) => location.pathname !== oldPath
        && /\/day\/[^/]+\/ora\//.test(location.pathname), initialPath,
      { polling: 'raf', timeout: 5000 });
      row.dayNavigationMs = (await page.evaluate(() => performance.now())) - row.rawClick.at;
    }
    row.success = true;
  } catch (error) {
    row.error = String(error?.message || error).slice(0, 500);
  } finally {
    try { row.trace = await getResult(page); } catch { /* navigation may close page */ }
    row.pageErrors = errors.slice(0, 10);
    row.failedRequests = failures.slice(0, 10);
    row.requestCount = requests;
    await context.close();
  }
  return row;
}

try {
  for (const mode of modes) {
    for (const testCase of cases) {
      for (let trial = 1; trial <= runs; trial += 1) {
        const row = await one(mode, testCase, trial);
        measurements.push(row);
        console.log([mode, testCase, trial, row.success ? 'OK' : 'FAIL',
          (row.menuOpenMs ?? row.dayNavigationMs ?? '-'), row.error || ''].join(' | '));
        await sleep(100);
      }
    }
  }
} finally {
  await browser.close();
}

const summary = modes.flatMap((mode) => cases.map((testCase) => {
  const rows = measurements.filter((item) => item.mode === mode && item.case === testCase);
  const observed = rows.filter((item) => item.success).map((item) =>
    testCase === 'menu' ? item.menuOpenMs : item.dayNavigationMs);
  const longTasks = rows.flatMap((item) => item.trace?.log?.longTasks || []);
  return {
    mode, case: testCase, attempts: rows.length,
    success: observed.length, failed: rows.length - observed.length,
    clickToResponseP50Ms: pct(observed, 0.5),
    clickToResponseP95Ms: pct(observed, 0.95),
    clickToResponseMaxMs: observed.length ? +Math.max(...observed).toFixed(1) : null,
    over250Ms: observed.filter((value) => value > 250).length,
    longTasksOver50Ms: longTasks.filter((item) => item.duration >= 50).length,
  };
}));

const report = {
  generatedAt: new Date().toISOString(),
  startedAt, baseOrigin: parsedUrl.origin, runs, modes,
  methodology: 'Chromium desktop viewport. First visible opportunity followed by page.mouse.click (no Playwright actionability wait). Cold = new isolated context. Warm = second navigation in same context. Slow = 4x CPU, 180 ms network latency. Response = drawer visible / SPA route changed. No writes are made by this script; remote loads do read live application data.',
  summary, measurements,
};
const dir = path.resolve('reports/performance');
await mkdir(dir, { recursive: true });
const target = path.join(dir, 'first-interactions-' + Date.now() + '.json');
await writeFile(target, JSON.stringify(report, null, 2) + '\n');
console.log('Report: ' + target);
console.log(JSON.stringify(summary, null, 2));