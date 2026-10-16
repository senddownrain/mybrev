/**
 * Web analytics performance, before/after on the same machine, browser and data.
 *
 *   npm run analytics:perf
 *
 * "before" = production build WITHOUT VITE_ANALYTICS_LOCAL, "after" = the same sources WITH it.
 * Both builds use a Firestore module swapped for the LOCAL EMULATOR (in memory, source untouched) and the emulator is
 * seeded from LOCAL snapshots only; nothing reads or writes production. Runs are interleaved (A, B, A, B, …) so drift
 * affects both sides alike. Output: median / p25 / p75 / min / max per metric; no invented percentages.
 *
 * Metrics per variant and route: cold ready time, warm SPA navigation, frame-time p50/p95/max and slow-frame count during
 * a scripted scroll, JS heap after the scenario, localStorage bytes, and every network request host (analytics must make 0).
 * Env: ANALYTICS_PERF_RUNS (default 7), PERF_SNAPSHOT / PERF_STATIC_SNAPSHOT, BENCHMARK_BROWSER_PATH, PERF_PORT.
 */
/* global requestAnimationFrame, cancelAnimationFrame, PopStateEvent -- used only inside page.evaluate (browser context) */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';
import { initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';

const host = process.env.FIRESTORE_EMULATOR_HOST || '';
assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/, 'A local Firestore emulator is required (npm run analytics:perf)');
const [emulatorHost, emulatorPort] = host.split(':');
const projectId = 'demo-analytics-perf';
const runs = Math.max(5, Number(process.env.ANALYTICS_PERF_RUNS) || 7);
const basePort = Number(process.env.PERF_PORT || 5290);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outRoot = path.join(root, 'outputs', 'analytics-perf');
fs.mkdirSync(outRoot, { recursive: true });

// ---- seed the emulator from local snapshots -----------------------------------------
const toAdmin = (value) => {
  if (Array.isArray(value)) return value.map(toAdmin);
  if (value instanceof Date || !value || typeof value !== 'object') return value;
  if (value.__firestoreType === 'timestamp') return new Timestamp(value.seconds, value.nanoseconds);
  if (value.__firestoreType === 'date') return new Date(value.iso);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toAdmin(item)]));
};
const db = getFirestore(initializeApp({ projectId }, 'perf-seed'));
let seeded = 0;
const snapshots = [process.env.PERF_SNAPSHOT || 'backups/firestore-snapshot-readings-sets', process.env.PERF_STATIC_SNAPSHOT || 'backups/firestore-snapshot-static'];
for (const dir of snapshots) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const snapshot = await openFirestoreSnapshot(dir);
  for (const name of Object.keys(manifest.collections)) {
    const writer = db.bulkWriter();
    for (const { id, ...data } of (await snapshot.collection(name)) || []) { writer.set(db.doc(`${name}/${id}`), toAdmin(data)); seeded += 1; }
    await writer.close();
  }
}
console.log(`seeded ${seeded} documents into the emulator`);

// ---- two builds of the same sources: flag off / on ----------------------------------
const firebaseModule = `import { initializeApp } from 'firebase/app';
import { initializeFirestore, memoryLocalCache, connectFirestoreEmulator } from 'firebase/firestore';
import { createFirestoreCacheRecovery } from '/src/utils/firestoreCacheRecovery.js';
export const firebaseApp = initializeApp({ projectId: '${projectId}', apiKey: 'demo-key', authDomain: '${projectId}.firebaseapp.com' });
export const firestoreCacheRecovery = createFirestoreCacheRecovery({ projectId: '${projectId}', storage: () => window.sessionStorage, reload: () => window.location.reload(), isOnline: () => true });
export const db = initializeFirestore(firebaseApp, { localCache: memoryLocalCache() });
connectFirestoreEmulator(db, '${emulatorHost}', ${emulatorPort});`;
const swapPlugin = { name: 'perf-local-emulator-only', enforce: 'pre', transform: (source, id) => (id.replaceAll('\\', '/').split('?')[0].endsWith('/src/plugins/firebase.js') ? firebaseModule : null) };

const variants = [];
for (const [index, [name, flag]] of [['off', 'false'], ['on', 'true']].entries()) {
  process.env.VITE_ANALYTICS_LOCAL = flag;
  const outDir = path.join(outRoot, `dist-${name}`);
  await build({ configFile: path.join(root, 'vite.config.js'), logLevel: 'error', plugins: [swapPlugin], build: { outDir, emptyOutDir: true, reportCompressedSize: false }, cacheDir: path.join(root, `node_modules/.vite-perf-${name}`) });
  const server = await preview({ configFile: false, root, preview: { host: '127.0.0.1', port: basePort + index, strictPort: true }, build: { outDir } });
  variants.push({ name, flag, outDir, base: `http://127.0.0.1:${basePort + index}`, server });
}
delete process.env.VITE_ANALYTICS_LOCAL;

const bytesIn = (dir) => { let total = 0; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else total += fs.statSync(p).size; } }(dir)); return total; };

// ---- measurement ----------------------------------------------------------------------
const browser = await chromium.launch(process.env.BENCHMARK_BROWSER_PATH ? { executablePath: process.env.BENCHMARK_BROWSER_PATH } : {});
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const ready = async (page, selector) => {
  await page.locator(selector).first().waitFor({ state: 'visible', timeout: 45_000 });
  await page.waitForFunction((s) => { const el = document.querySelector(s); return el && !el.querySelector('.v-progress-circular'); }, selector, { timeout: 45_000 });
};

async function discover(base) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('.day-options-list .day-option').first().waitFor({ state: 'visible', timeout: 45_000 });
  const dayHref = await page.locator('.day-options-list .day-option').first().getAttribute('href');
  await page.goto(new URL(dayHref, base).href, { waitUntil: 'domcontentloaded' });
  await page.locator('.ora-options-list .ora-card').first().waitFor({ state: 'visible', timeout: 45_000 });
  const href = await page.locator('a[href*="/ora/"]').first().getAttribute('href');
  await context.close();
  return new URL(href, base).pathname + new URL(href, base).search;
}
const hourPath = await discover(variants[0].base);
const routes = [
  { name: 'home', path: '/', ready: '.day-options-list .day-option' },
  { name: 'readings', path: '/readings', ready: '.readings-content' },
  { name: 'hour', path: hourPath, ready: '.liturgical-hour-column .ora .ora-text' },
];

async function coldRun(variant, route) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const hosts = new Set();
  page.on('request', (request) => { try { hosts.add(new URL(request.url()).host); } catch { /* data: urls */ } });
  const started = Date.now();
  await page.goto(`${variant.base}${route.path}`, { waitUntil: 'domcontentloaded' });
  await ready(page, route.ready);
  const ms = Date.now() - started;
  await context.close();
  return { ms, hosts: [...hosts] };
}

async function scenario(variant, route) {
  // One session: load, scripted scroll with frame timing, SPA navigation, then heap and storage.
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 780 } });
  const page = await context.newPage();
  const hosts = new Set();
  page.on('request', (request) => { try { hosts.add(new URL(request.url()).host); } catch { /* data: urls */ } });
  await page.goto(`${variant.base}${route.path}`, { waitUntil: 'domcontentloaded' });
  await ready(page, route.ready);
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = (now) => { window.__frames.push(now - last); last = now; window.__raf = requestAnimationFrame(tick); };
    window.__raf = requestAnimationFrame(tick);
  });
  await page.mouse.move(195, 400);
  for (let step = 0; step < 24; step += 1) { await page.mouse.wheel(0, 260); await sleep(40); }
  for (let step = 0; step < 24; step += 1) { await page.mouse.wheel(0, -260); await sleep(40); }
  const frames = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__frames.slice(2); });
  const nav = await page.evaluate(async (target) => {
    const started = performance.now();
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); });
    return performance.now() - started;
  }, '/readings');
  await ready(page, '.readings-content');
  const client = await context.newCDPSession(page);
  await client.send('Performance.enable').catch(() => {});
  await client.send('HeapProfiler.collectGarbage').catch(() => {});
  const metrics = Object.fromEntries((await client.send('Performance.getMetrics').catch(() => ({ metrics: [] }))).metrics.map((m) => [m.name, m.value]));
  const storage = await page.evaluate(() => Object.entries(localStorage).reduce((sum, [key, value]) => sum + key.length + String(value).length, 0));
  await context.close();
  const sorted = [...frames].sort((a, b) => a - b);
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)];
  return {
    frames: frames.length, frameP50: pick(0.5), frameP95: pick(0.95), frameMax: sorted.at(-1), slow: frames.filter((f) => f > 33.4).length,
    navMs: nav, heapMB: (metrics.JSHeapUsedSize || 0) / 1048576, storageBytes: storage, hosts: [...hosts],
  };
}

const quantile = (values, q) => { const s = [...values].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(s.length * q) - 1)]; };
const stat = (values) => ({ n: values.length, median: +quantile(values, 0.5).toFixed(2), p25: +quantile(values, 0.25).toFixed(2), p75: +quantile(values, 0.75).toFixed(2), min: +Math.min(...values).toFixed(2), max: +Math.max(...values).toFixed(2) });

const data = Object.fromEntries(variants.map((v) => [v.name, { cold: Object.fromEntries(routes.map((r) => [r.name, []])), scenario: [], hosts: new Set() }]));
try {
  for (let run = 0; run < runs; run += 1) {
    const order = run % 2 ? [...variants].reverse() : variants; // interleave A/B and alternate the first
    for (const variant of order) {
      for (const route of routes) {
        const { ms, hosts } = await coldRun(variant, route);
        data[variant.name].cold[route.name].push(ms);
        hosts.forEach((h) => data[variant.name].hosts.add(h));
      }
      const result = await scenario(variant, routes[2]);
      data[variant.name].scenario.push(result);
      result.hosts.forEach((h) => data[variant.name].hosts.add(h));
    }
    console.log(`run ${run + 1}/${runs} done`);
  }
} finally {
  await browser.close();
  await Promise.all(variants.map((v) => v.server.close()));
}

const summary = {};
for (const variant of variants) {
  const d = data[variant.name];
  const col = (key) => d.scenario.map((s) => s[key]);
  summary[variant.name] = {
    flag: variant.flag,
    distBytes: bytesIn(variant.outDir),
    cold_ms: Object.fromEntries(routes.map((r) => [r.name, stat(d.cold[r.name])])),
    frame_p50_ms: stat(col('frameP50')), frame_p95_ms: stat(col('frameP95')), frame_max_ms: stat(col('frameMax')), slow_frames_over_33ms: stat(col('slow')),
    spa_nav_ms: stat(col('navMs')), js_heap_mb: stat(col('heapMB')), storage_bytes: stat(col('storageBytes')),
    request_hosts: [...d.hosts].sort(),
  };
}
const report = {
  generatedAt: new Date().toISOString(),
  stand: { node: process.version, platform: process.platform, arch: process.arch, runs, browser: process.env.BENCHMARK_BROWSER_PATH || 'playwright default', viewport: '390x780 (scenario), default (cold)', seededDocuments: seeded },
  methodology: 'Two production builds of the same sources (flag off / on) served by vite preview with the Firestore module swapped for the local emulator; runs interleaved A/B with alternating first position; each cold run is a new browser context; scenario = load hour page, 24 wheel steps down and up at 40 ms, one SPA navigation; frames from requestAnimationFrame deltas.',
  summary,
};
const out = path.join(root, 'reports', 'performance', `analytics-web-before-after-${new Date().toISOString().slice(0, 10)}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
console.log(`report: ${out}`);
