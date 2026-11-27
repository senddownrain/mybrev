/**
 * Novena admin on the real Vue UI, Auth emulator and Firestore Rules:
 *   npm run test:novena:ui
 * Synthetic prayers by default; NOVENA_PRAYERS=<local assets/content or snapshot>
 * seeds the public catalog instead. SHOTS_DIR saves screenshots.
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium } from 'playwright-core';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readPublicPrayers } from './novena/lib.mjs';

const fsHost = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
for (const host of [fsHost, authHost]) assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/, 'Local emulators required');
const [host, port] = fsHost.split(':');
const projectId = 'demo-novena';
const uiPort = Number(process.env.NOVENA_UI_PORT || 4797);
const base = `http://127.0.0.1:${uiPort}`;
const password = 'Synthetic-test-password2345';
const email = 'editor@novena.example.test';
const shots = process.env.SHOTS_DIR;
if (shots) await mkdir(shots, { recursive: true });

const DAYS = ['першы', 'другі', 'трэці', 'чацвёрты', 'пяты', 'шосты', 'сёмы', 'восьмы', 'дзявяты'];
const synthetic = () => new Map([
  ['synthetic-novena', {
    id: 'synthetic-novena', title: 'Сінтэтычная навэнна', tags: ['Навэнна'], textFormat: 'mybrev-markdown',
    text: ['Парадак навэнны', '1\\. Малітва на вызначаны дзень', '2\\. [Літанія](/prayer/synthetic-litany)',
      ...DAYS.flatMap((day, n) => [`## Дзень ${day}`, `Сінтэтычны тэкст дня ${n + 1}.`])].join('\n'),
  }],
  ['synthetic-litany', { id: 'synthetic-litany', title: 'Сінтэтычная літанія', text: 'Сінтэтычны тэкст літаніі.', textFormat: 'mybrev-markdown', tags: [] }],
]);
const real = process.env.NOVENA_PRAYERS;
const prayers = real ? (await readPublicPrayers(real)).prayers : synthetic();
// [id, screenshot name]: identical days, a linked litany, a movable feast.
const samples = real
  ? [['cn_948820d9dd158b9d', 'same-every-day'], ['DVCz2NZEvgNdVFmQJaJB', 'linked-litany'], ['catholicby-yearcycle-100111', 'movable-feast']]
  : [['synthetic-novena', 'synthetic']];

const seedApp = initializeApp({ projectId }, 'novena-ui-seed');
const seed = getFirestore(seedApp);

async function seedData() {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  assert.ok(response.ok, 'Auth emulator fixture creation failed');
  await seed.doc('admins/' + (await response.json()).localId).set({ role: 'admin' });
  const writer = seed.bulkWriter();
  for (const prayer of prayers.values()) writer.set(seed.doc('prayers/' + prayer.id), prayer);
  await writer.close();
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
  cacheDir: 'node_modules/.vite-novena',
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  optimizeDeps: { include: ['vuetify/components', 'vuetify/directives', 'firebase/auth', 'firebase/firestore/lite'] },
  server: { host: '127.0.0.1', port: uiPort, strictPort: true },
  plugins: [vue(), {
    name: 'novena-emulator-only',
    enforce: 'pre',
    transform(source, id) {
      const file = id.replaceAll('\\', '/').split('?')[0];
      if (file.endsWith('/src/plugins/vuetify.js')) return "import * as components from 'vuetify/components'; import * as directives from 'vuetify/directives';\n"
        + source.replace(/components: \{\s*\},/, 'components, directives,');
      if (file.endsWith('/src/plugins/firebase.js')) return firebaseModule;
      if (file.endsWith('/src/plugins/priestFirebase.js')) return emulatePriestFirebase(source);
      return undefined;
    },
  }],
});

const shot = async (page, name, options = {}) => {
  if (shots) await page.screenshot({ animations: 'disabled', path: `${shots}/${name}.png`, ...options });
};
let browser;
try {
  await seedData();
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || chromium.executablePath(), headless: true });
  const context = await browser.newContext({ viewport: { width: 1160, height: 900 }, serviceWorkers: 'block' });
  // Nothing leaves the machine.
  await context.route(/https?:\/\//, (route) => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort()));
  const page = await context.newPage();
  page.setDefaultTimeout(Number(process.env.NOVENA_BROWSER_TIMEOUT || 60000));
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  await page.goto(base + '/admin/novenas', { waitUntil: 'commit' });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.getByTestId('novena-summary').filter({ hasText: /Паказана [1-9]/ }).waitFor();
  console.log(await page.getByTestId('novena-summary').innerText());
  await shot(page, '01-list');

  let index = 2;
  for (const [id, name] of samples) {
    await page.goto(`${base}/admin/novenas/${id}`, { waitUntil: 'commit' });
    await page.getByTestId('validation-ok').waitFor();
    const preview = page.getByTestId('day-preview');
    await preview.locator('article').first().waitFor();
    await page.getByRole('group', { name: 'Выбар дня' }).getByRole('button', { name: '5', exact: true }).click();
    await preview.getByText('Поўны тэкст дня 5').waitFor();
    console.log(`${id}: day 5 blocks ${await preview.locator('article').count()}`);
    await preview.screenshot({ animations: 'disabled', ...(shots ? { path: `${shots}/0${index}-day-preview-${name}.png` } : {}) });
    index += 1;
  }

  // Calendar preview, then draft → publish → unpublish on the last sample.
  await page.getByLabel('Год перадпрагляду').fill('2027');
  const expected = real ? '26.03.2027' : 'прапановы няма';
  await page.getByTestId('schedule-preview').filter({ hasText: expected }).waitFor();
  await page.getByTestId('schedule-preview').scrollIntoViewIfNeeded();
  await shot(page, `0${index}-calendar-preview`);

  const [id] = samples.at(-1);
  const published = seed.doc('novenaDefinitions/' + id);
  const confirm = () => page.getByRole('dialog').getByRole('button', { name: 'Пацвердзіць', exact: true }).click();
  await page.getByRole('button', { name: 'Захаваць чарнавік', exact: true }).click();
  await page.getByText('Чарнавік захаваны.').waitFor();
  assert.equal((await published.get()).exists, false);
  await page.getByRole('button', { name: 'Апублікаваць', exact: true }).click();
  await confirm();
  await page.getByText('Структура апублікавана.').waitFor();
  assert.equal((await published.get()).data().contentVersion, 1);
  await page.getByLabel('Трэкер уключаны').check();
  await page.getByRole('button', { name: 'Апублікаваць', exact: true }).click();
  await confirm();
  await page.getByText('Апублікавана, версія 2').waitFor();
  assert.equal((await published.get()).data().trackerEnabled, true);
  await page.getByRole('button', { name: 'Зняць з публікацыі', exact: true }).click();
  await confirm();
  await page.getByText('Структура знята з публікацыі.').waitFor();
  assert.equal((await published.get()).exists, false);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + '/admin/novenas', { waitUntil: 'commit' });
  await page.getByTestId('novena-summary').filter({ hasText: /Паказана [1-9]/ }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'No horizontal scroll on a phone');
  await shot(page, `0${index + 1}-list-phone`);
  assert.deepEqual(runtimeErrors, []);
  console.log('Novena admin smoke: PASS');
} finally {
  await browser?.close();
  await server.close();
  await deleteApp(seedApp);
}
