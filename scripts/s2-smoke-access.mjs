import { catalogContentHash } from './lib/access-sets-v2-content-values.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { codeProof } from '../src/utils/priestCode.mjs';

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
for (const host of [authHost, firestoreHost]) assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/);
const projectId = 'demo-rules';
const uiPort = Number(process.env.S2_UI_PORT || 5182);
const legacyOnly = process.env.S2_LEGACY_RULES === '1';
const [host, port] = firestoreHost.split(':');
const { valid: [first, second] } = JSON.parse(await readFile(new URL('../tests/fixtures/access-sets-v2-code-vectors.json', import.meta.url)));
const legacyCode = 'A2B3-C4D5-E6F7-G8H9-J2K3-L4M5';
const account = { email: 's2-admin@example.test', password: 'Synthetic-S2-Password', returnSecureToken: true };
const signup = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(account),
});
assert.equal(signup.ok, true);
const { localId: adminUid } = await signup.json();
const app = initializeApp({ projectId }, 's2-browser-seed');
const db = getFirestore(app);
const mode = value => db.doc('priestContentControl/accessSetsV2').set({ mode: value });
const profile = (id, status, allowedSets, revision) => {
  const batch = db.batch();
  batch.set(db.doc('accessProfilesV2/' + id), { name: id, status, allowedSets, revision, updatedAt: new Date() });
  batch.set(db.doc('accessProfilesV2/' + id + '/client/entitlements'), { allowedSets, revision });
  return batch.commit();
};
const seedCode = (vector, profileId) => {
  const batch = db.batch();
  batch.set(db.doc('accessCodesV2/' + vector.codeId), {
    profileId, codeProof: vector.proof, status: 'active', issuedAt: new Date(), disabledAt: null, label: '',
  });
  batch.set(db.doc('accessCodesV2/' + vector.codeId + '/client/profile'), { profileId });
  return batch.commit();
};

async function seedCatalog() {
  const batch = db.batch();
  for (const [set, id] of [['priest', 's8-priest'], ['marian', 's8-marian']]) {
    const payload = { title: 'Synthetic ' + set, text: 'Synthetic protected text ' + set };
    batch.set(db.doc('accessSetsV2/' + set), { status: 'active' });
    batch.set(db.doc('protectedPrayers/' + id), {
      ...payload, accessSets: [set], effectiveAccessSets: [set], accessSchemaVersion: 2,
      contentHash: catalogContentHash(payload),
    });
    batch.set(db.doc('accessSetsV2/' + set + '/prayers/' + id), {});
  }
  await batch.commit();
}

const server = await createServer({
  configFile: false, cacheDir: 'node_modules/.vite-s2-ui',
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: uiPort, strictPort: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, entries: [], include: ['vue', 'vuetify', 'vuetify/components', 'firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/firestore/lite'] },
  plugins: [vue(), vuetify({ styles: false }), {
    name: 's2-local-emulators',
    enforce: 'pre',
    configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        if (req.url !== '/__s2') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end('<!doctype html><html lang="be"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module" src="/tests/ui/s2-access-harness.mjs"></script></body></html>');
      });
    },
    transform(source, id) {
      if (id.endsWith('/src/plugins/firebase.js')) return `
        import { initializeApp } from 'firebase/app';
        import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
        export const firebaseApp = initializeApp({projectId:'demo-rules', apiKey:'demo-key'});
        const auth = getAuth(firebaseApp);
        connectAuthEmulator(auth, 'http://${authHost}', {disableWarnings:true});
        await auth.authStateReady();
        if (!auth.currentUser) await signInWithEmailAndPassword(auth, ${JSON.stringify(account.email)}, ${JSON.stringify(account.password)});
      `;
      if (!id.endsWith('/src/plugins/priestFirebase.js')) return;
      return `
        import { connectFirestoreEmulator } from 'firebase/firestore';
        import { connectFirestoreEmulator as connectLite } from 'firebase/firestore/lite';
        import { connectAuthEmulator } from 'firebase/auth';
        let liteConnected=false;
        const connectDevice = auth => {
          connectAuthEmulator(auth, 'http://${authHost}', {disableWarnings:true});
          return auth;
        };
      ` + source
        .replace('return { app, db: initializeFirestore(app, { localCache: memoryLocalCache() }) };',
          `const db=initializeFirestore(app,{localCache:memoryLocalCache()});
          connectFirestoreEmulator(db,'${host}',${port}); return {app,db};`)
        .replace('return getActivationFirestore(priestFirebase.app);',
          `const db=getActivationFirestore(priestFirebase.app);
          if(!liteConnected){connectLite(db,'${host}',${port});liteConnected=true;}return db;`)
        .replace('initializeAuth(priestFirebase.app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })',
          'connectDevice(initializeAuth(priestFirebase.app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] }))');
    },
  }],
});

let browser;
try {
  await Promise.all([
    db.doc('priestAccess/settings').set({ activeCodeProof: await codeProof(legacyCode), changedAt: new Date(), helpText: '' }),
    db.doc('priestProtectedPrayers/s2-fixture').set({ text: 'Synthetic restricted S2 fixture' }),
    ...(!legacyOnly ? [
      profile('s2-marian', 'active', ['marian'], 1), profile('s2-priest', 'active', ['priest'], 1),
      seedCode(first, 's2-marian'), seedCode(second, 's2-priest'), seedCatalog(),
    ] : []),
  ]);
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || '/usr/bin/chromium' });
  const consoleEntries = [];
  const errors = [];
  let lostCommits = 0;

  async function open({ loseV2Ack = false } = {}) {
    const context = await browser.newContext({ viewport: { width: 390, height: 760 } });
    await context.route(/https?:\/\//, async route => {
      const url = new URL(route.request().url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
      if (loseV2Ack && url.pathname.endsWith(':commit') && route.request().postData()?.includes('/accessActivationClaimsV2/')) {
        lostCommits++;
        const result = await route.fetch();
        assert.equal(result.ok(), true);
        return route.fulfill({
          status: 503, contentType: 'application/json',
          body: JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'Synthetic transport failure' } }),
        });
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.name));
    page.on('console', entry => consoleEntries.push(entry.text()));
    await page.goto(`http://127.0.0.1:${uiPort}/__s2`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Доступ для святароў', exact: true }).waitFor();
    await page.waitForFunction(() => window.__s2?.session.checked);
    return { page, context };
  }
  const sets = (page, expected, expectedMode) => page.waitForFunction(
    ({ values, expectedMode }) => JSON.stringify(window.__s2.session.allowedSets) === JSON.stringify(values)
      && (expectedMode === undefined || window.__s2.session.mode === expectedMode),
    { values: expected, expectedMode },
  );
  const uid = page => page.evaluate(() => window.__s2.uid());
  async function enter(page, code) {
    await page.getByLabel('Код актывацыі', { exact: true }).fill(code.trim());
    await page.getByRole('button', { name: 'Адкрыць доступ', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.v-btn--loading'));
    assert.equal(await page.getByLabel('Код актывацыі', { exact: true }).inputValue(), '');
    assert.equal(await page.locator('.v-alert').textContent({ timeout: 100 }).catch(() => null), null, 'Activation UI reported an error');
  }

  const { page, context } = await open({ loseV2Ack: !legacyOnly });
  assert.equal(await uid(page), null);
  assert.equal(await page.getByLabel('Код актывацыі', { exact: true }).count(), 1);
  if (process.env.S2_SCREENSHOT) await page.screenshot({ path: process.env.S2_SCREENSHOT, animations: 'disabled' });
  await enter(page, legacyCode);
  await sets(page, ['priest'], 'legacy');
  const deviceUid = await uid(page);
  assert.ok(deviceUid);
  assert.notEqual(deviceUid, adminUid);
  assert.equal(await page.evaluate(() => window.__s2.modeReadable()), !legacyOnly);
  const mirror = () => page.evaluate(() => window.__s2.legacyText());
  assert.equal(await mirror(), 'Synthetic restricted S2 fixture');
  assert.deepEqual(await page.evaluate(() => window.__s2.catalogIds()), ['s2-fixture']);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__s2?.session.legacyActive);
  assert.equal(await uid(page), deviceUid);

  if (legacyOnly) {
    await page.getByRole('button', { name: 'Выключыць доступ', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.v-btn--loading'));
    assert.equal(await uid(page), null);
    assert.equal((await db.doc('priestDeviceGrants/' + deviceUid).get()).data().status, 'revoked');
    assert.deepEqual(errors, []);
    console.log('PASS pre-S1 Rules: legacy activation, mirror server read, persistent UID and owner disable.');
  } else {
    await mode('canonical');
    await sets(page, ['priest'], 'canonical');
    assert.equal(await mirror(), null);
    assert.deepEqual(await page.evaluate(() => window.__s2.catalogIds()), ['s8-priest']);
    assert.equal(await page.evaluate(() => window.__s2.deepLink('s8-marian')), null);
    await enter(page, first.input);
    await sets(page, ['marian', 'priest'], 'canonical');
    assert.equal(lostCommits, 1);
    assert.deepEqual(await page.evaluate(() => window.__s2.catalogIds()), ['s8-marian', 's8-priest']);
    assert.equal(await uid(page), deviceUid);
    assert.equal(await page.evaluate(() => window.__s2.adminUid()), adminUid);
    assert.equal((await db.doc('accessDeviceGrantsV2/' + deviceUid).get()).data().codeId, first.codeId);
    for (const claim of ['priestActivationClaims', 'accessActivationClaimsV2']) {
      assert.equal(await page.evaluate(({ claim, deviceUid }) => window.__s2.cachedClaim(claim, deviceUid), { claim, deviceUid }), null);
    }

    const marianOnly = await open();
    await enter(marianOnly.page, first.input);
    await sets(marianOnly.page, ['marian'], 'canonical');
    assert.equal(await marianOnly.page.evaluate(() => window.__s2.legacyText()), null);
    assert.equal(await marianOnly.page.evaluate(() => window.__s2.deepLink('s8-marian')), 's8-marian');
    assert.equal(await marianOnly.page.evaluate(() => window.__s2.deepLink('s8-priest')), null);
    assert.deepEqual(await marianOnly.page.evaluate(() => window.__s2.catalogIds()), ['s8-marian']);
    assert.equal((await db.doc('priestDeviceGrants/' + await uid(marianOnly.page)).get()).exists, false);
    const priestOnly = await open();
    await enter(priestOnly.page, second.input);
    await sets(priestOnly.page, ['priest'], 'canonical');
    assert.equal(await priestOnly.page.evaluate(() => window.__s2.legacyText()), null);

    await db.doc('accessCodesV2/' + first.codeId).update({ status: 'disabled', disabledAt: new Date() });
    await marianOnly.page.evaluate(() => window.__s2.refresh());
    await sets(marianOnly.page, ['marian'], 'canonical');
    await profile('s2-marian', 'active', ['priest'], 2);
    await sets(marianOnly.page, ['priest'], 'canonical');
    await profile('s2-marian', 'disabled', ['priest'], 3);
    await sets(marianOnly.page, [], 'canonical');
    assert.deepEqual(await marianOnly.page.evaluate(() => window.__s2.catalogIds()), []);
    await sets(page, ['priest'], 'canonical');
    await profile('s2-marian', 'active', ['marian'], 4);
    await page.evaluate(() => window.__s2.refresh());
    await sets(page, ['marian', 'priest'], 'canonical');
    await profile('s2-marian', 'revoked', ['marian'], 5);
    await sets(page, ['priest'], 'canonical');
    await db.doc('accessDeviceGrantsV2/' + await uid(priestOnly.page)).update({ status: 'revoked', revokedAt: new Date() });
    await sets(priestOnly.page, [], 'canonical');

    await mode('suspended');
    await sets(page, [], 'suspended');
    assert.deepEqual(await page.evaluate(() => window.__s2.catalogIds()), []);
    await mode('canonical');
    await sets(page, ['priest'], 'canonical');

    await context.setOffline(true);
    await sets(page, [], null);
    await page.getByRole('button', { name: 'Выключыць доступ', exact: true }).click();
    await page.waitForFunction(() => window.__s2.session.pendingDisable);
    assert.equal(await uid(page), deviceUid);
    const local = await page.evaluate(() => ({ ...localStorage, ...sessionStorage }));
    assert.equal(local['mybrev-access-disable-pending-v4'], deviceUid);
    const privateValues = [legacyCode, await codeProof(legacyCode), first.canonical, first.proof, second.canonical, second.proof, first.canonical.split('-').at(-1), 'Synthetic restricted S2 fixture'];
    for (const value of privateValues) {
      assert.equal(JSON.stringify(local).includes(value), false, 'No private values in Web storage');
      assert.equal(consoleEntries.some(line => line.includes(value)), false, 'No private values in browser logs');
    }
    assert.equal((await db.doc('accessDeviceGrantsV2/' + deviceUid).get()).data().status, 'active');
    await page.close();
    await context.setOffline(false);
    const restarted = await context.newPage();
    restarted.on('pageerror', error => errors.push(error.name));
    await restarted.goto(`http://127.0.0.1:${uiPort}/__s2`, { waitUntil: 'domcontentloaded' });
    await restarted.waitForFunction(() => window.__s2?.session.checked
      && !localStorage.getItem('mybrev-access-disable-pending-v4'));
    assert.equal(await uid(restarted), null);
    assert.equal((await db.doc('priestDeviceGrants/' + deviceUid).get()).data().status, 'revoked');
    assert.equal((await db.doc('accessDeviceGrantsV2/' + deviceUid).get()).data().status, 'revoked');
    assert.equal(await restarted.evaluate(() => window.__s2.adminUid()), adminUid);
    assert.deepEqual(errors, []);
    console.log('PASS S1 Rules: single form, Auth isolation, legacy and V2 activation, lost commit acknowledgement, entitlement changes, mode changes, offline disable/reconnect, no claim cache or console/storage leak.');
  }
} finally {
  await browser?.close();
  await server.close();
  await deleteApp(app);
}
