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
/* global PerformanceObserver, location, indexedDB, IDBDatabase, MutationObserver, innerWidth, innerHeight */
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
const localFixtures = process.env.FIRST_CLICK_LOCAL_FIXTURES === '1';
const visiblePoint = process.env.FIRST_CLICK_VISIBLE_POINT === '1';
const settledWarm = process.env.FIRST_CLICK_SETTLED_WARM === '1';
if (localFixtures && !local) throw new Error('Fixtures require localhost');

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
  ...(localFixtures ? { args: ['--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost'] } : {}),
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
    const log = { inputs: [], longTasks: [], indexedDB: [], mutations: [], events: [] };
    window.__firstClickDiagnostic = log;
    for (const type of ['pointerdown', 'click']) {
      document.addEventListener(type, (event) => {
        const target = event.target;
        log.inputs.push({
          type, at: performance.now(),
          x: event.clientX, y: event.clientY, trusted: event.isTrusted,
          href: target?.closest?.('a')?.getAttribute('href'),
          className: String(target?.className || '').slice(0, 120),
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
    try {
      new PerformanceObserver(list => {
        for (const e of list.getEntries()) log.events.push({name:e.name, at:e.startTime, duration:e.duration, processingStart:e.processingStart, processingEnd:e.processingEnd, interactionId:e.interactionId});
      }).observe({type:'event', buffered:true, durationThreshold:16});
    } catch { /* unsupported browser */ }
    const originalOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = function(name, version) {
      const row = {kind:'open', name, at:performance.now()}; log.indexedDB.push(row);
      const request = version === undefined ? originalOpen(name) : originalOpen(name, version);
      for (const event of ['success','error','blocked','upgradeneeded']) request.addEventListener(event, () => {
        row[event] = performance.now();
        if (event === 'error') row.error = request.error?.name;
      });
      return request;
    };
    const originalTransaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, options) {
      const row = {kind:'transaction', name:this.name, stores:[].concat(stores), mode:mode || 'readonly', at:performance.now()};
      log.indexedDB.push(row);
      const transaction = originalTransaction.call(this, stores, mode, options);
      for (const event of ['complete','abort','error']) transaction.addEventListener(event, () => { row[event] = performance.now(); });
      return transaction;
    };
    new MutationObserver(records => {
      for (const r of records) {
        if (log.mutations.length >= 250) break;
        const el = r.target;
        if (!el.matches?.('.app-drawer, .day-options-list, [inert]') && r.attributeName !== 'inert') continue;
        log.mutations.push({at:performance.now(), tag:el.tagName, className:String(el.className).slice(0,180), attribute:r.attributeName, value:el.getAttribute(r.attributeName)});
      }
    }).observe(document, {subtree:true, attributes:true, attributeFilter:['class','inert','aria-busy']});
  });
}

async function firstVisible(page, selector) {
  await page.waitForFunction(({ s, visiblePoint }) => {
    const node = document.querySelector(s);
    if (!node) return false;
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== 'hidden'
      && (!visiblePoint || (box.right > 0 && box.bottom > 0 && box.left < innerWidth && box.top < innerHeight));
  }, {s:selector, visiblePoint}, { polling: 'raf', timeout });
  return page.evaluate(() => performance.now());
}

// Never use locator.click(): it automatically waits for a stable, enabled,
// unobscured element and can hide the precise problem being investigated.
async function rawClick(page, selector) {
  const before = await page.evaluate(({s, visiblePoint}) => {
    const el = document.querySelector(s);
    if (!el) return { missing: true };
    const box = el.getBoundingClientRect();
    const x = visiblePoint ? (Math.max(0,box.left) + Math.min(innerWidth,box.right)) / 2 : box.left + box.width / 2;
    const y = visiblePoint ? (Math.max(0,box.top) + Math.min(innerHeight,box.bottom)) / 2 : box.top + box.height / 2;
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
      box: {left:box.left, top:box.top, width:box.width, height:box.height},
      inViewport: x >= 0 && x < innerWidth && y >= 0 && y < innerHeight,
      href: el.getAttribute('href'),
      transform: getComputedStyle(el.closest('.app-drawer') || el).transform,
      loadingList: Boolean(el.closest('.day-options-list--loading')),
      hit: hit?.tagName + '.' + String(hit?.className || '').slice(0, 90),
      pointerEvents: getComputedStyle(el).pointerEvents,
      inheritedInert: Boolean(el.closest('[inert]')),
      overlays: overlay,
      at: performance.now(),
    };
  }, {s:selector, visiblePoint});
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
    serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
    resources: performance.getEntriesByType('resource').filter(e => /\.(js|css)(\?|$)/.test(e.name)).map(e => ({
      host:new URL(e.name).host, path:new URL(e.name).pathname, at:e.startTime, duration:e.duration,
      responseStart:e.responseStart, responseEnd:e.responseEnd, transferSize:e.transferSize,
    })),
    drawer: (() => {const el = document.querySelector('.app-drawer'); if (!el) return null; const b=el.getBoundingClientRect(); return {inert:el.inert, active:el.classList.contains('v-navigation-drawer--active'), left:b.left, right:b.right, transform:getComputedStyle(el).transform};})(),
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
  if (localFixtures) await page.addInitScript((iso) => {
    // Freeze only the calendar date. Playwright clock also virtualizes
    // performance.now(), which cannot be compared with native PerformanceEntry
    // timestamps across navigation. Keep every timing API native here.
    const NativeDate = Date;
    const fixed = NativeDate.parse(iso);
    window.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [fixed])); }
      static now() { return fixed; }
    };
  }, '2026-02-08T12:00:00.000Z');
  await instrument(page);
  const errors = [];
  const failures = [];
  const requestHosts = {};
  const responseHosts = {};
  let requests = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => failures.push({
    urlHost: (() => { try { return new URL(request.url()).host; } catch { return 'invalid'; } })(),
    error: request.failure()?.errorText || 'unknown',
  }));
  page.on('request', request => {
    requests += 1;
    const host = new URL(request.url()).host;
    requestHosts[host] = (requestHosts[host] || 0) + 1;
  });
  page.on('response', response => {
    const host = new URL(response.url()).host;
    responseHosts[host] = (responseHosts[host] || 0) + 1;
  });

  const row = { mode, case: testCase, trial: trialNumber, success: false };
  const session = await context.newCDPSession(page);
  const captureProfile = process.env.FIRST_CLICK_PROFILE === '1';
  if (captureProfile) { await session.send('Performance.enable'); await session.send('Profiler.enable'); await session.send('Profiler.start'); }
  try {
    if (mode === 'slow') {
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
      if (settledWarm) {
        await firstVisible(page, '.day-options-list .day-option');
        await page.evaluate(async () => { await navigator.serviceWorker.ready; });
        await page.waitForFunction(() => window.__firstClickDiagnostic.indexedDB.some(e => e.kind === 'open' && e.name.startsWith('firestore/') && e.success), null, {timeout});
        row.warmup = await getResult(page);
      }
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
    await mkdir('reports/performance/screenshots', {recursive:true});
    row.screenshot = `reports/performance/screenshots/${mode}-${testCase}-${trialNumber}-${Date.now()}.png`;
    await page.screenshot({path:row.screenshot});
    if (row.rawClick) {
      row.beforeRetry = await getResult(page);
      // Diagnostic second click only after the first attempt has timed out.
      const selector = row.drawerClick ? '.app-drawer a[href="/readings"]'
        : testCase === 'menu' ? '[aria-label="Адкрыць меню"]' : '.day-options-list .day-option';
      try {
        row.retryClick = await rawClick(page, selector);
        const retryTarget = row.drawerClick ? 'readings' : testCase;
        await page.waitForFunction(kind => kind === 'readings' ? location.pathname === '/readings'
          : kind === 'menu' ? document.querySelector('.app-drawer')?.classList.contains('v-navigation-drawer--active')
            : /\/day\/[^/]+\/ora\//.test(location.pathname), retryTarget, {timeout:1500});
        row.retrySuccess = true;
      } catch { row.retrySuccess = false; }
    }
  } finally {
    if (captureProfile) {
      const {profile} = await session.send('Profiler.stop');
      row.profileMetrics = (await session.send('Performance.getMetrics')).metrics.filter(e => ['Timestamp','NavigationStart','TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration'].includes(e.name));
      await mkdir('reports/performance/profiles', {recursive:true});
      row.cpuProfile = `reports/performance/profiles/${Date.parse(startedAt)}-${mode}-${testCase}-${trialNumber}.cpuprofile`;
      await writeFile(row.cpuProfile, JSON.stringify(profile));
    }
    try { row.trace = await getResult(page); } catch { /* navigation may close page */ }
    row.pageErrors = errors.slice(0, 10);
    row.failedRequests = failures.slice(0, 10);
    row.requestCount = requests;
    row.requestHosts = requestHosts;
    row.responseHosts = responseHosts;
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
  environment: {browserVersion:browser.version(), localFixtures, fixedDate:localFixtures ? '2026-02-08T12:00:00.000Z' : null, timingClock:'native performance.now and PerformanceEntry; Date-only calendar override', externalNetworkBlocked:localFixtures, diagnosticRetriesExcludedFromSummary:true, visiblePoint, settledWarm},
  summary, measurements,
};
const dir = path.resolve('reports/performance');
await mkdir(dir, { recursive: true });
const target = path.join(dir, 'first-interactions-' + Date.now() + '.json');
await writeFile(target, JSON.stringify(report, null, 2) + '\n');
console.log('Report: ' + target);
console.log(JSON.stringify(summary, null, 2));
