/** Local-only: use identical public fixture data, browser and network for both builds. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { decodeCollection } from './content/lib/app-content.mjs';

const [baseline, flutter, fixtureRef = '696b71089bc6d135865d9c930249bb2ecfc55c0b'] = process.argv.slice(2);
const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
assert.ok(baseline && flutter && process.env.BENCHMARK_BROWSER_PATH,
  'Pass the baseline worktree and Flutter checkout, and set BENCHMARK_BROWSER_PATH');
assert.match(endpoint || '', /^127\.0\.0\.1:\d+$/, 'Start a local Firestore emulator and set FIRESTORE_EMULATOR_HOST');
const [hostname, firestorePort] = endpoint.split(':');
const projectId = 'demo-startup';
const fixtureFile = (file) => execFileSync('git', ['-C', flutter, 'show', `${fixtureRef}:assets/content/${file}`], { maxBuffer: 30_000_000 });
const collections = ['days', 'readings', 'liturgicalTemplates', 'liturgicalProperTexts', 'liturgicalCalendarMeta',
  'liturgicalCelebrations', 'liturgicalDioceseOverrides', 'liturgicalYearOverrides', 'invitatoriums', 'completoriums'];
const manifest = JSON.parse(fixtureFile('manifest.json'));
const seeded = collections.reduce((count, name) => count + manifest.collections[name].count, 0);
const manifestPath = `http://${endpoint}/v1/projects/${projectId}/databases/(default)/documents/contentManifest/current`;
const saved = await fetch(manifestPath).then((response) => response.ok ? response.json() : null);
const savedCollections = saved?.fields?.collections?.mapValue?.fields;
if (!collections.every((name) => savedCollections?.[name]?.mapValue?.fields?.digest?.stringValue === manifest.collections[name].digest)) {
  const db = getFirestore(initializeApp({ projectId }));
  try {
    let batch = db.batch();
    let pending = 0;
    for (const name of collections) {
      const docs = decodeCollection(JSON.parse(gunzipSync(fixtureFile(`${name}.json.gz`))));
      for (const [id, data] of Object.entries(docs)) {
        const { id: _id, ...fields } = data;
        batch.set(db.doc(`${name}/${id}`), fields);
        pending += 1;
        if (pending < 100) continue;
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }
    batch.set(db.doc('contentManifest/current'), { collections: manifest.collections });
    await batch.commit();
  } finally {
    await db.terminate();
  }
}

Object.assign(process.env, {
  VITE_FIREBASE_API_KEY: 'demo-key', VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-startup.firebaseapp.com', VITE_FIREBASE_STORAGE_BUCKET: 'demo-startup.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '1', VITE_FIREBASE_APP_ID: '1:1:web:demo',
  VITE_FIREBASE_APP_CHECK_SITE_KEY: '', VITE_SENTRY_DSN: '', VITE_FIREBASE_ANALYTICS: 'false',
  VITE_ANALYTICS_LOCAL: 'false', VITE_ENABLE_EXTENDED_CACHE_WARMUP: 'false',
});
const work = await mkdtemp(path.join(os.tmpdir(), 'mybrev-startup-'));
const variants = [];
let browser;

async function serve(name, root, port) {
  const outDir = path.join(work, name);
  await build({
    root, configFile: path.join(root, 'vite.config.js'), logLevel: 'error',
    build: { outDir, emptyOutDir: true, reportCompressedSize: false },
    plugins: [{
      name: 'local-startup-measurement',
      enforce: 'pre',
      transform(source, id) {
        const file = id.replaceAll('\\', '/');
        if (file.endsWith('/src/plugins/firebase.js')) {
          return `import { connectFirestoreEmulator } from 'firebase/firestore';\n${source}\nconnectFirestoreEmulator(db, '${hostname}', ${firestorePort});`;
        }
        if (!file.endsWith('/src/utils/firestoreRead.js')) return;
        return source.replaceAll(/export async function (getDocs?OfflineAware)/g, 'async function $1Impl') + `
          export const getDocOfflineAware = record(getDocOfflineAwareImpl);
          export const getDocsOfflineAware = record(getDocsOfflineAwareImpl);
          function record(read) {
            return async (ref, session) => {
              const metric = { path: ref.path || ref._query.path.canonicalString(), documents: null };
              (window.startupReads ||= []).push(metric);
              const result = await read(ref, session);
              metric.documents = result.metadata.fromCache ? 0 : result.size ?? Number(result.exists());
              return result;
            };
          }`;
      },
    }],
  });
  const server = await preview({ root, configFile: false, logLevel: 'error', preview: { host: '127.0.0.1', port, strictPort: true }, build: { outDir } });
  return { name, server, base: `http://127.0.0.1:${port}` };
}

const weekday = '/day/2026-11-27/ora/ordinary-w34-d6/laudes';
const memorial = '/day/2026-11-16/ora/ordinary-w33-d2/laudes';
const textSelector = '.liturgical-hour-column .ora-text';

async function measure(variant, context, page, route, reload = false) {
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false, latency: 80, downloadThroughput: 10_000_000 / 8, uploadThroughput: 5_000_000 / 8,
  });
  await client.send('Emulation.setCPUThrottlingRate', { rate: 2 });
  const traffic = new Map();
  client.on('Network.requestWillBeSent', ({ requestId, request }) => {
    if (request.url.startsWith(variant.base) || request.url.startsWith(`http://${endpoint}`)) {
      traffic.set(requestId, { bytes: 0, firestore: request.url.startsWith(`http://${endpoint}`) });
    }
  });
  client.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
    if (traffic.has(requestId)) traffic.get(requestId).bytes = Math.max(traffic.get(requestId).bytes, encodedDataLength);
  });
  client.on('Network.dataReceived', ({ requestId, encodedDataLength }) => {
    if (traffic.has(requestId)) traffic.get(requestId).bytes += encodedDataLength;
  });
  try {
    if (reload) await page.reload({ waitUntil: 'commit' });
    else await page.goto(variant.base + route, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.startupTextAt, null, { timeout: 20000 });
    const { ms, reads, text } = await page.evaluate((selector) => ({
      ms: window.startupTextAt,
      reads: (window.startupReads || []).map(item => ({ ...item })),
      text: [...document.querySelectorAll(selector)].map(item => item.textContent).join('\n'),
    }), textSelector);
    const transfers = [...traffic.values()];
    return {
      ms: Math.round(ms), requests: transfers.length,
      bytes: transfers.reduce((sum, entry) => sum + entry.bytes, 0),
      firestoreRequests: transfers.filter(entry => entry.firestore).length,
      queryCalls: reads.length,
      returnedDocuments: reads.reduce((sum, item) => sum + (item.documents || 0), 0),
      templates: reads.filter(item => item.path === 'liturgicalTemplates').length,
      text,
    };
  } catch (error) {
    console.error(variant.name, route, (await page.locator('body').innerText()).slice(-1200));
    throw error;
  } finally {
    await client.detach();
  }
}

async function expireReaderCache(page) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('mybrev-public-demo-startup-v1', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const tx = database.transaction('entries', 'readwrite');
      const cursorRequest = tx.objectStore('entries').openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const entry = JSON.parse(cursor.value);
        entry.fetchedAt -= 20 * 60 * 1000;
        if (JSON.parse(cursor.key)[0] === 'content') entry.revision = '2026-11-17T18:48:00Z:previous-deployment';
        cursor.update(JSON.stringify(entry));
        cursor.continue();
      };
      tx.oncomplete = () => { database.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }));
}

async function checkRecovery(variant) {
  for (const persistentFailure of [false, true]) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      const page = await context.newPage();
      let entries = 0;
      const navigations = [];
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) navigations.push(frame.url());
      });
      await context.route('**/assets/index-*.js', (route) => {
        entries += 1;
        return entries === 1 || persistentFailure ? route.fulfill({ status: 404 }) : route.continue();
      });
      await page.goto(variant.base + weekday, { waitUntil: 'commit' });
      await page.locator(persistentFailure ? '#app-startup a' : textSelector).first().waitFor({ timeout: 20000 });
      assert.equal(navigations.filter((url) => new URL(url).searchParams.has('app-retry')).length, 1);
      if (!persistentFailure) assert.equal(new URL(page.url()).pathname, weekday);
    } finally { await context.close(); }
  }

  const context = await browser.newContext();
  try {
    const firstTab = await context.newPage();
    const secondTab = await context.newPage();
    await Promise.all([firstTab, secondTab].map(async (tab) => {
      await tab.goto(variant.base + weekday, { waitUntil: 'commit' });
      await tab.locator(textSelector).first().waitFor({ timeout: 20000 });
    }));
    await firstTab.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await firstTab.reload({ waitUntil: 'commit' });
    await firstTab.locator(textSelector).first().waitFor({ timeout: 20000 });
  } finally { await context.close(); }
}

const measurements = {};
const expectedText = new Map();
try {
  variants.push(await serve('before', path.resolve(baseline), 4311));
  variants.push(await serve('after', process.cwd(), 4312));
  browser = await chromium.launch({
    executablePath: process.env.BENCHMARK_BROWSER_PATH,
    args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'],
  });
  for (let run = 0; run < 3; run += 1) {
    for (const variant of run % 2 ? [...variants].reverse() : variants) {
      const result = measurements[variant.name] ||= { weekday: [], memorial: [], expiredAfterDeploy: [] };
      for (const [name, route] of [['weekday', weekday], ['memorial', memorial]]) {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 780 } });
        try {
          await context.addInitScript((selector) => {
            const observer = new MutationObserver(() => {
              if (!document.querySelector(selector)?.textContent.trim()) return;
              observer.disconnect();
              requestAnimationFrame(() => requestAnimationFrame(() => { window.startupTextAt = performance.now(); }));
            });
            observer.observe(document, { childList: true, subtree: true });
          }, textSelector);
          const page = await context.newPage();
          const cold = await measure(variant, context, page, route);
          const { text, ...metrics } = cold;
          if (expectedText.has(name)) assert.equal(text, expectedText.get(name), name);
          else expectedText.set(name, text);
          result[name].push(metrics);
          if (name === 'memorial') {
            await expireReaderCache(page);
            const { text: warmText, ...warm } = await measure(variant, context, page, route, true);
            assert.equal(warmText, text);
            result.expiredAfterDeploy.push(warm);
          }
        } finally { await context.close(); }
      }
    }
  }
  console.log(JSON.stringify({ fixtureRef, seeded, measurements }, null, 2));
  await checkRecovery(variants[1]);
  console.log('Recovery passed: missing entry, persistent failure, two tabs and offline reload.');
} finally {
  await browser?.close();
  await Promise.all(variants.map(variant => variant.server.close()));
  await rm(work, { recursive: true, force: true });
}
