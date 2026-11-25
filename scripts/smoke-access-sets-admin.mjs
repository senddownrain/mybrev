/** Real Vue UI, Auth and Firestore Rules. Local synthetic fixtures only. */
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium } from 'playwright-core';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRegistry } from '../src/components/admin/accessSets/registry.mjs';
import { parseAccessSetsV2Code } from '../src/utils/accessSetsV2Code.mjs';

const fsHost = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
for (const host of [fsHost, authHost]) assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/, 'Local emulators required');
const [host, port] = fsHost.split(':');
const canonicalSmoke = process.env.S8_CANONICAL_ADMIN === '1';
const projectId = canonicalSmoke ? 'demo-s4-catalog' : 'demo-rules';
const functionsConfig = canonicalSmoke
  ? JSON.parse(await readFile(new URL('../firebase.s4-catalog.json', import.meta.url), 'utf8')) : null;
const callableUrl = functionsConfig
  ? 'http://127.0.0.1:' + functionsConfig.emulators.functions.port + '/' + projectId + '/europe-west1/canonicalCatalog' : null;
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const appCheck = [encode({ alg: 'none', typ: 'JWT' }), encode({ sub: 'synthetic-ui' }), 'local-only'].join('.');
const uiPort = 4783;
const base = `http://127.0.0.1:${uiPort}`;
const path = '/admin/access-sets';
const password = 'Synthetic-test-password2345';
const proofMarker = 'synthetic-marker-never-in-registry';
const shots = process.env.SHOTS_DIR;
if (shots) await mkdir(shots, { recursive: true });

const seedApp = initializeApp({ projectId }, 's3-ui-seed');
const seed = getFirestore(seedApp);
const users = {};
async function seedUser(name, role) {
  const email = `${name}@access-s3.example.test`;
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  assert.ok(response.ok, 'Auth emulator fixture creation failed');
  const { localId, idToken } = await response.json();
  if (role) await seed.doc('admins/' + localId).set(role);
  users[name] = { email, idToken };
}

function grant(id, codeId) {
  return {
    uid: id, ...(codeId ? { codeId } : {}), status: 'active', deviceName: 'Сінтэтычная прылада ' + id,
    client: 'Web', platform: 'Тэст', label: '', activatedAt: new Date(), lastActiveAt: new Date(), revokedAt: null,
  };
}

async function seedData() {
  await Promise.all([
    seedUser('super', { role: 'superadmin' }),
    seedUser('manager', { role: 'admin', accessSetsV2: true }),
    seedUser('priest', { role: 'admin', priestAccess: true }),
    seedUser('admin', { role: 'admin' }),
    seedUser('ordinary', null),
  ]);
  const batch = seed.batch();
  for (let i = 0; i < 27; i++) {
    const id = 'device-' + String(i).padStart(2, '0');
    batch.set(seed.doc('accessDeviceGrantsV2/' + id), grant(id, 'EFGHJKLMNPQRSTUV'));
  }
  batch.set(seed.doc('priestDeviceGrants/legacy-test'), { ...grant('legacy-test'), activationProof: proofMarker });
  batch.set(seed.doc('accessActivationClaimsV2/synthetic-claim'), { activationProof: proofMarker });
  batch.set(seed.doc('accessSetsV2/synthetic-inactive'), { name: 'Сінтэтычны неактыўны набор', status: 'inactive' });
  batch.set(seed.doc('prayerCategories/synthetic-category'), { name: 'Сінтэтычная катэгорыя', tags: [], order: 0 });
  await batch.commit();
}

const firebaseModule = `
import { initializeApp } from 'firebase/app';
import { initializeFirestore, memoryLocalCache, connectFirestoreEmulator } from 'firebase/firestore';
import { getFirestore as getLite, connectFirestoreEmulator as connectLite } from 'firebase/firestore/lite';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
export const firebaseApp = initializeApp({ projectId: '${projectId}', apiKey: 'demo-key', authDomain: '${projectId}.firebaseapp.com' });
export const firestoreCacheRecovery = { usesMemoryCache: () => true };
export const db = initializeFirestore(firebaseApp, { localCache: memoryLocalCache() });
connectFirestoreEmulator(db, '${host}', ${port});
connectLite(getLite(firebaseApp), '${host}', ${port});
connectAuthEmulator(getAuth(firebaseApp), 'http://${authHost}', { disableWarnings: true });
`;

function emulatePriestFirebase(source) {
  return `import { connectFirestoreEmulator } from 'firebase/firestore';
import { connectFirestoreEmulator as connectLite } from 'firebase/firestore/lite';
import { connectAuthEmulator } from 'firebase/auth';
const liteApps = new WeakSet();
const testAuth = auth => { connectAuthEmulator(auth, 'http://${authHost}', { disableWarnings: true }); return auth; };
function testLite(app) {
  const db = getActivationFirestore(app);
  if (!liteApps.has(app)) { connectLite(db, '${host}', ${port}); liteApps.add(app); }
  return db;
}
` + source
    .replace('return getActivationFirestore(priestFirebase.app);', 'return testLite(priestFirebase.app);')
    .replace('return getActivationFirestore(priestEditorFirebase.app);', 'return testLite(priestEditorFirebase.app);')
    .replace('return { app, db: initializeFirestore(app, { localCache: memoryLocalCache() }) };',
      `const db = initializeFirestore(app, { localCache: memoryLocalCache() }); connectFirestoreEmulator(db, '${host}', ${port}); return { app, db };`)
    .replace('initializeAuth(priestFirebase.app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })',
      'testAuth(initializeAuth(priestFirebase.app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] }))')
    .replace('initializeAuth(priestEditorFirebase.app, { persistence: inMemoryPersistence })',
      'testAuth(initializeAuth(priestEditorFirebase.app, { persistence: inMemoryPersistence }))');
}

const server = await createServer({
  configFile: false,
  define: { 'process.env': {} },
  cacheDir: 'node_modules/.vite-access-admin',
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  optimizeDeps: { include: ['vuetify/components', 'vuetify/directives', 'firebase/auth', 'firebase/firestore/lite'] },
  server: { host: '127.0.0.1', port: uiPort, strictPort: true },
  plugins: [vue(), {
    name: 'access-s3-emulator-only',
    enforce: 'pre',
    transform(source, id) {
      const file = id.replaceAll('\\', '/').split('?')[0];
      // Register Vuetify's components once so lazy routes do not trigger a
      // dependency optimization reload halfway through a test interaction.
      if (file.endsWith('/src/plugins/vuetify.js')) return "import * as components from 'vuetify/components'; import * as directives from 'vuetify/directives';\n"
        + source.replace(/components: \{\s*\},/, 'components, directives,');
      if (file.endsWith('/src/plugins/firebase.js')) return firebaseModule;
      if (file.endsWith('/src/plugins/priestFirebase.js')) return emulatePriestFirebase(source);
      // Use the real request builders and emulator endpoint. The local proxy
      // supplies test-only attestation without altering production CORS.
      if (canonicalSmoke && file.endsWith('/src/services/canonicalPrayerCallable.js')) {
        return source.replace("import { getFunctions, httpsCallable } from 'firebase/functions';", "import { getAuth } from 'firebase/auth';")
          .replace(/const invoke = httpsCallable.*;/, "const invoke = async data => { const token = await getAuth(firebaseApp).currentUser.getIdToken(); const response = await fetch('/__s8/catalog', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ data }) }); const reply = await response.json(); if (!response.ok) throw Object.assign(new Error(reply.error.message), { code: 'functions/' + reply.error.status.toLowerCase().replaceAll('_', '-') }); return { data: reply.result }; };");
      }
      if (file.endsWith('/accessSets/client.js')) return source.replace('https://firestore.googleapis.com', 'http://' + fsHost);
      return undefined;
    },
  }],
});

const browser = await chromium.launch({
  executablePath: process.env.BENCHMARK_BROWSER_PATH || chromium.executablePath(),
  headless: true,
});
const queries = [];
const faults = [];
let ordinal = 0;

async function session(who) {
  const context = await browser.newContext({ viewport: { width: 1160, height: 900 }, serviceWorkers: 'block' });
  const runtimeErrors = [];
  await context.route(/https?:\/\//, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (canonicalSmoke && url.origin === base && url.pathname === '/__s8/catalog' && request.method() === 'POST') {
      const reply = await fetch(callableUrl, { method: 'POST', headers: {
        'content-type': 'application/json', authorization: request.headers().authorization, 'X-Firebase-AppCheck': appCheck,
      }, body: request.postData() });
      return route.fulfill({ status: reply.status, contentType: 'application/json', body: await reply.text() });
    }
    if (url.pathname.endsWith('/documents:runQuery') && request.method() === 'POST') {
      const { structuredQuery } = request.postDataJSON();
      if (structuredQuery?.select) {
        queries.push(structuredQuery);
        const kind = structuredQuery.from[0].collectionId;
        const index = faults.findIndex(fault => fault.kind === kind && (!fault.id
          || structuredQuery.where?.fieldFilter?.value?.referenceValue?.endsWith('/' + fault.id)));
        if (index >= 0) {
          const [{ http, status }] = faults.splice(index, 1);
          return route.fulfill({ status: http, json: { error: { status, message: proofMarker } } });
        }
      }
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(23000);
  page.on('pageerror', error => { runtimeErrors.push(error.name); });
  await page.goto(base + path);
  try {
    await page.locator('input[type="email"]').waitFor();
  } catch (error) {
    console.log('Login fixture failed before credentials were submitted:', page.url(), runtimeErrors);
    throw error;
  }
  if (who) {
    await page.locator('input[type="email"]').fill(users[who].email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
  }
  return {
    context, page,
    async close() {
      await context.close();
      assert.deepEqual(runtimeErrors, []);
    },
  };
}

const button = (page, name) => page.getByRole('button', { name, exact: true });
const dialog = page => page.getByRole('dialog');
const tab = (page, name) => page.getByRole('navigation', { name: 'Асаблівы доступ' }).getByRole('button', { name, exact: true }).click();
const hasText = (page, value) => page.getByText(value, { exact: true }).first().waitFor();
const shot = async (page, name) => {
  if (!shots) return;
  assert.equal(await page.locator('.access-admin-secret__value').count(), 0, 'Secret UI cannot be captured');
  await page.screenshot({ animations: 'disabled', path: `${shots}/${String(++ordinal).padStart(2, '0')}-${name}.png` });
};

async function addSet(page, id, name) {
  await page.getByLabel('Ідэнтыфікатар набору').fill(id);
  await page.getByLabel('Назва набору').fill(name);
  await button(page, 'Стварыць набор').click();
}
async function fillProfile(page, id, name) {
  await page.getByLabel('Ідэнтыфікатар профілю').fill(id);
  await page.getByLabel('Назва профілю').fill(name);
}
async function saveProfile(page) {
  await button(page, 'Праверыць змены').click();
  await button(dialog(page), 'Пацвердзіць і захаваць').click();
}

async function prepareCode(page, profileId, prefix, rotation = false) {
  if (!rotation) await page.getByLabel('Ідэнтыфікатар актыўнага профілю').fill(profileId);
  await page.getByLabel('Прэфікс').fill(prefix);
  await button(page, rotation ? 'Падрыхтаваць замену' : 'Падрыхтаваць выдачу').click();
  await dialog(page).waitFor();
  assert.equal(await page.locator('.access-admin-secret__value').count(), 0);
  await button(dialog(page), 'Пацвердзіць').click();
}

async function readAndCloseCode(page, prefix) {
  const value = page.locator('.access-admin-secret__value');
  const code = await value.innerText();
  assert.ok(code.startsWith(prefix + '-'));
  const parsed = parseAccessSetsV2Code(code);
  assert.ok(parsed);
  await button(page, 'Скапіяваць код').click();
  await hasText(page, 'Код скапіяваны.');
  await page.emulateMedia({ media: 'print' });
  assert.equal(await value.isVisible(), false, 'One-time dialog cannot be printed');
  await page.emulateMedia({ media: 'screen' });
  await button(page, 'Закрыць код').click();
  await value.waitFor({ state: 'detached' });
  assert.ok(!(await page.locator('body').innerText()).includes(code), 'Plaintext must disappear when the dialog closes');
  const inStorage = await page.evaluate(candidate => [localStorage, sessionStorage]
    .some(storage => Object.values(storage).some(value => value.includes(candidate))), code);
  assert.equal(inStorage, false);
  const stored = (await seed.doc('accessCodesV2/' + parsed.codeId).get()).data();
  assert.ok(!JSON.stringify(stored).includes(code));
  return parsed.codeId;
}

try {
  await seedData();
  function registryFor(who) {
    return createRegistry({
      database: 'projects/' + projectId + '/databases/(default)',
      endpoint: 'http://' + fsHost,
      headers: () => who ? { Authorization: 'Bearer ' + users[who].idToken } : {},
    });
  }
  for (const who of [null, 'ordinary', 'admin', 'priest']) {
    for (const kind of ['sets', 'profiles', 'codes', 'v2']) {
      await assert.rejects(registryFor(who).list(kind), { code: 'permission-denied' });
    }
  }
  await assert.rejects(registryFor('manager').list('legacy'), { code: 'permission-denied' });
  const projection = await registryFor('super').read('legacy', 'legacy-test');
  assert.equal(projection.id, 'legacy-test');
  assert.ok(!JSON.stringify(projection).includes(proofMarker));
  await server.listen();

  for (const who of [null, 'ordinary', 'admin', 'priest']) {
    const before = queries.length;
    const login = await session(who);
    const { page } = login;
    if (!who || who === 'ordinary') {
      await page.waitForURL(/\/login\?/);
      if (who) await page.locator('.v-alert').waitFor();
    } else {
      await page.waitForURL(base + '/admin');
      await page.locator('.admin-home__card').first().waitFor();
      assert.equal(await page.getByRole('link', { name: /Доступ для святароў/ }).count(), who === 'priest' ? 1 : 0);
    }
    assert.equal(await page.getByRole('heading', { name: 'Асаблівы доступ' }).count(), 0);
    assert.equal(await page.getByRole('link', { name: /Асаблівы доступ/ }).count(), 0);
    assert.equal(queries.length, before);
    await login.close();
  }
  console.log('PASS anonymous, ordinary, admin and priest role gates');

  const manager = await session('manager');
  const { page } = manager;
  await page.waitForURL(base + path);
  await page.getByRole('heading', { name: 'Наборы малітваў' }).waitFor();
  await addSet(page, 'Invalid', 'Няслушны');
  assert.equal(await page.getByLabel('Ідэнтыфікатар набору').evaluate(input => input.validity.valid), false);
  for (const [id, name] of [['priest', 'Сінтэтычны набор A'], ['marian', 'Сінтэтычны набор B'], ['removed-test', 'Сінтэтычны часовы набор']]) {
    await addSet(page, id, name);
    await hasText(page, name);
  }
  await addSet(page, 'priest', 'Нельга перазапісаць');
  await hasText(page, 'Набор з гэтым ідэнтыфікатарам ужо існуе.');
  assert.equal((await seed.doc('accessSetsV2/priest').get()).data().name, 'Сінтэтычны набор A');
  assert.equal((await seed.doc('accessSetsV2/capuchin').get()).exists, false);
  await shot(page, 'sets');

  await tab(page, 'Профілі');
  await fillProfile(page, 'marian-test', 'Сінтэтычны профіль B');
  await page.getByRole('checkbox', { name: /Сінтэтычны набор B/ }).check();
  assert.equal(await page.getByRole('checkbox', { name: /неактыўны/ }).isEnabled(), false);
  await button(page, 'Праверыць змены').click();
  assert.equal(await dialog(page).locator('dd').nth(1).innerText(), 'marian');
  assert.equal((await seed.doc('accessProfilesV2/marian-test').get()).exists, false);
  await shot(page, 'profile-preview');
  await button(dialog(page), 'Пацвердзіць і захаваць').click();
  await hasText(page, 'Профіль захаваны. Рэвізія 1.');
  assert.deepEqual((await seed.doc('accessProfilesV2/marian-test').get()).data().allowedSets, ['marian']);

  await fillProfile(page, 'empty-test', 'Пусты сінтэтычны профіль');
  await saveProfile(page);
  await page.locator('li').filter({ hasText: 'Пусты сінтэтычны профіль' }).waitFor();
  assert.deepEqual((await seed.doc('accessProfilesV2/empty-test').get()).data().allowedSets, []);

  await fillProfile(page, 'unknown-test', 'Профіль са зніклым наборам');
  await page.getByRole('checkbox', { name: /часовы/ }).check();
  await seed.doc('accessSetsV2/removed-test').delete();
  await saveProfile(page);
  await hasText(page, 'Набор не існуе або недаступны.');
  assert.equal((await seed.doc('accessProfilesV2/unknown-test').get()).exists, false);

  const profileRow = page.locator('li').filter({ hasText: 'Сінтэтычны профіль B' });
  await button(profileRow, 'Рэдагаваць').click();
  await page.getByRole('checkbox', { name: /Сінтэтычны набор A/ }).check();
  const bumped = seed.batch();
  bumped.update(seed.doc('accessProfilesV2/marian-test'), { revision: 2 });
  bumped.update(seed.doc('accessProfilesV2/marian-test/client/entitlements'), { revision: 2 });
  await bumped.commit();
  await saveProfile(page);
  await hasText(page, 'Профіль змяніўся ў іншай сесіі. Абнавіце спіс і адкрыйце яго нанова.');
  const emptyRow = page.locator('li').filter({ hasText: 'Пусты сінтэтычны профіль' });
  for (const status of ['disabled', 'active', 'revoked']) {
    await button(emptyRow, 'Рэдагаваць').click();
    await page.getByLabel('Статус профілю').selectOption(status);
    await saveProfile(page);
    await dialog(page).waitFor({ state: 'hidden' });
    assert.equal((await seed.doc('accessProfilesV2/empty-test').get()).data().status, status);
  }
  await emptyRow.waitFor();
  assert.equal(await button(emptyRow, 'Рэдагаваць').isEnabled(), false);
  console.log('PASS set creation and duplicate protection, profile preview, empty, missing set, stale revision and status transitions');

  await tab(page, 'Коды');
  await prepareCode(page, 'unknown-test', 'PRST');
  await hasText(page, 'Для выдачы кода патрэбны існуючы актыўны профіль.');
  await contextPermission(manager.context);
  await prepareCode(page, 'marian-test', 'PRST');
  const firstCode = await readAndCloseCode(page, 'PRST');
  await seed.doc('accessDeviceGrantsV2/device-00').update({ codeId: firstCode });
  await button(page, 'Замяніць код').click();
  await prepareCode(page, 'marian-test', 'MARI', true);
  const replacement = await readAndCloseCode(page, 'MARI');
  assert.notEqual(replacement, firstCode);
  assert.equal((await seed.doc('accessCodesV2/' + firstCode).get()).data().status, 'disabled');
  assert.equal((await seed.doc('accessCodesV2/' + replacement).get()).data().profileId, 'marian-test');
  await button(page, 'Адключыць код').click();
  await button(dialog(page), 'Пацвердзіць').click();
  await hasText(page, 'Код адключаны. Дазволы прылад працягваюць дзейнічаць.');
  assert.equal((await seed.doc('accessDeviceGrantsV2/device-00').get()).data().status, 'active');
  await dialog(page).waitFor({ state: 'hidden' });
  await shot(page, 'code-registry');
  console.log('PASS commit-gated one-time code, copy, print and storage guards, rotate and disable');

  await tab(page, 'Прылады');
  await hasText(page, 'device-24');
  assert.equal(await page.getByText('device-25', { exact: true }).count(), 0);
  assert.equal(await page.getByLabel('Тып дазволу').count(), 0);
  await button(page, 'Наступная').click();
  await hasText(page, 'device-26');
  await button(page, 'Папярэдняя').click();
  await hasText(page, 'device-00');
  await page.getByLabel('Дакладны UID прылады').fill('device-26');
  await button(page, 'Шукаць').click();
  await hasText(page, 'device-26');
  assert.equal(await page.locator('tbody tr').count(), 1);
  await button(page, 'Адклікаць device-26').click();
  await button(dialog(page), 'Пацвердзіць адкліканне').click();
  await hasText(page, 'Адкліканне пацверджана.');
  assert.equal((await seed.doc('accessDeviceGrantsV2/device-26').get()).data().status, 'revoked');

  await page.getByLabel('Дакладны UID прылады').fill('');
  await page.getByLabel('Статус дазволу').selectOption('active');
  await button(page, 'Шукаць').click();
  for (const id of ['device-00', 'device-01', 'device-02']) await page.getByLabel('Выбраць ' + id).check();
  faults.push({ kind: 'accessDeviceGrantsV2', id: 'device-01', http: 503, status: 'UNAVAILABLE' });
  await button(page, 'Адклікаць выбраныя (3)').click();
  await button(dialog(page), 'Пацвердзіць адкліканне').click();
  await hasText(page, 'Не ўдалося пацвердзіць адкліканне. Праверце стан на серверы.');
  await hasText(page, 'Спроба спынена. Адкліканне не запускалася.');
  assert.equal((await seed.doc('accessDeviceGrantsV2/device-00').get()).data().status, 'revoked');
  assert.equal((await seed.doc('accessDeviceGrantsV2/device-01').get()).data().status, 'revoked');
  assert.equal((await seed.doc('accessDeviceGrantsV2/device-02').get()).data().status, 'active');
  await dialog(page).waitFor({ state: 'hidden' });
  await shot(page, 'device-readback');

  for (const [http, status, message] of [
    [403, 'PERMISSION_DENIED', 'Дзеянне недаступнае.'],
    [429, 'RESOURCE_EXHAUSTED', 'Ліміт запытаў вычарпаны. Паспрабуйце пазней.'],
    [503, 'UNAVAILABLE', 'Сервер недаступны. Перад паўторам праверце стан.'],
  ]) {
    faults.push({ kind: 'accessDeviceGrantsV2', http, status });
    await button(page, 'Абнавіць').click();
    await hasText(page, message);
    assert.equal(await page.locator('tbody tr').count(), 0);
    assert.equal(await page.getByText(proofMarker).count(), 0);
  }
  await button(page, 'Абнавіць').click();
  await hasText(page, 'device-02');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  const mobileAction = button(page, 'Адклікаць device-02');
  assert.ok(await mobileAction.evaluate(element => element.getBoundingClientRect().right <= window.innerWidth));
  await shot(page, 'devices-mobile');
  console.log('PASS device paging, UID/status filtering, individual and partial group revoke, denied/quota/unavailable');

  await page.goto(base + '/prayer/add');
  await page.getByText('Наборы доступу V2 (толькі прагляд)', { exact: true }).click();
  assert.equal(await page.getByRole('checkbox', { name: /Сінтэтычны набор A/ }).isEnabled(), false);
  const control = page.getByRole('checkbox', { name: /Сінтэтычны набор A/ });
  await control.evaluate(input => {
    input.checked = true;
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await page.getByText('Наборы доступу V2 (толькі прагляд)', { exact: true }).click();
  await page.getByText('Наборы доступу V2 (толькі прагляд)', { exact: true }).click();
  await control.waitFor();
  assert.equal(await control.isChecked(), false);
  assert.equal((await seed.collection('protectedPrayers').get()).size, 0);
  assert.equal((await seed.collection('protectedCategories').get()).size, 0);
  await shot(page, 'locked-prayer-access');
  await page.goto(base + '/admin/prayer-categories');
  await page.getByLabel('Рэдагаваць катэгорыю Сінтэтычная катэгорыя').click();
  await dialog(page).getByText('Наборы доступу V2 (толькі прагляд)', { exact: true }).click();
  const categoryChoice = dialog(page).getByRole('checkbox', { name: /Сінтэтычны набор B/ });
  await categoryChoice.waitFor();
  assert.equal(await categoryChoice.isEnabled(), false);
  assert.equal((await seed.doc('prayerCategories/synthetic-category').get()).data().accessSets, undefined);
  if (canonicalSmoke) {
    await seed.doc('priestContentControl/state').set({ version: 0, lockUid: '' });
    await seed.doc('priestContentControl/accessSetsV2').set({ mode: 'canonical' });
    await seed.doc('prayerDrafts/s8-browser').set({
      draftId: 's8-browser', title: 'Synthetic browser draft', text: 'Synthetic text for canonical publication',
      tags: ['s8-ui'], source: 'Synthetic source', textFormat: 'mybrev-markdown', status: 'draft', version: 1,
    });
    const confirm = async (prompt) => {
      assert.match(prompt.message(), /Запісаў:/);
      await prompt.accept();
    };
    await page.goto(base + '/admin/prayer-categories');
    await page.getByLabel('Рэдагаваць катэгорыю Сінтэтычная катэгорыя').click();
    await dialog(page).getByText('Наборы доступу V2', { exact: true }).click();
    await dialog(page).getByRole('checkbox', { name: /Сінтэтычны набор B/ }).check();
    page.once('dialog', confirm);
    await button(dialog(page), 'Захаваць').click();
    await hasText(page, 'Катэгорыя захавана');
    assert.deepEqual((await seed.doc('protectedCategories/synthetic-category').get()).data().effectiveAccessSets, ['marian']);
    assert.equal((await seed.doc('prayerCategories/synthetic-category').get()).exists, false);

    await page.goto(base + '/admin/prayer-drafts/s8-browser');
    await page.getByText('Наборы доступу V2', { exact: true }).click();
    await page.getByRole('checkbox', { name: /Сінтэтычны набор B/ }).check();
    await button(page, 'Апублікаваць').click();
    page.once('dialog', confirm);
    await button(dialog(page), 'Апублікаваць').click();
    await hasText(page, 'Апублікавана: /prayer/d_s8-browser');
    assert.deepEqual((await seed.doc('protectedPrayers/d_s8-browser').get()).data().effectiveAccessSets, ['marian']);
    assert.equal((await seed.doc('prayerDrafts/s8-browser/audit/publish-v2-2').get()).exists, true);
    console.log('PASS S8 canonical category and draft from the administrator UI through Callable.');
  }
  await manager.close();

  const superadmin = await session('super');
  await superadmin.page.waitForURL(base + path);
  await tab(superadmin.page, 'Прылады');
  await hasText(superadmin.page, 'device-00');
  await superadmin.page.getByLabel('Тып дазволу').selectOption('legacy');
  await button(superadmin.page, 'Шукаць').click();
  await hasText(superadmin.page, 'legacy-test');
  assert.equal(await superadmin.page.getByText(proofMarker).count(), 0);
  await button(superadmin.page, 'Адклікаць legacy-test').click();
  await button(dialog(superadmin.page), 'Пацвердзіць адкліканне').click();
  await hasText(superadmin.page, 'Адкліканне пацверджана.');
  assert.equal((await seed.doc('priestDeviceGrants/legacy-test').get()).data().status, 'revoked');
  await superadmin.close();

  const legacyQuery = queries.find(query => query.from[0].collectionId === 'priestDeviceGrants');
  assert.ok(legacyQuery);
  const response = await fetch(`http://${fsHost}/v1/projects/${projectId}/databases/(default)/documents:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + users.super.idToken },
    body: JSON.stringify({ structuredQuery: legacyQuery }),
  });
  assert.equal(response.status, 200);
  const responseBody = await response.text();
  assert.ok(responseBody.includes('legacy-test'));
  assert.ok(!responseBody.includes(proofMarker) && !responseBody.includes('activationProof'));

  assert.equal(faults.length, 0);
  for (const request of queries) {
    assert.ok(request.limit <= 26);
    assert.ok(!request.select.fields.some(field => /proof|claim/i.test(field.fieldPath)));
    assert.ok(!request.from.some(from => /claim/i.test(from.collectionId)));
  }
  console.log('PASS locked editor component, superadmin legacy revoke, bounded field-projected queries');
} finally {
  await browser.close();
  await server.close();
  await deleteApp(seedApp);
}

function contextPermission(context) {
  return context.grantPermissions(['clipboard-read', 'clipboard-write']);
}
