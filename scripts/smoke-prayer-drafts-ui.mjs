/**
 * Browser smoke + acceptance screenshots for «Чарнавікі малітваў». Real Vue app, router, Pinia and
 * Firebase SDKs against local emulators only (synthetic texts, no production data):
 *   firebase emulators:exec --only auth,firestore --project demo-drafts "node scripts/smoke-prayer-drafts-ui.mjs"
 * SHOTS_DIR=<dir> writes screenshots. BENCHMARK_BROWSER_PATH overrides the Chrome binary.
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { chromium } from 'playwright-core';
import { initializeApp as adminApp } from 'firebase-admin/app';
import { getFirestore as adminDb } from 'firebase-admin/firestore';

const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '';
for (const host of [firestoreHost, authHost]) assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/, 'Local emulators required; live requests forbidden');
const projectId = 'demo-drafts';
const shotsDir = process.env.SHOTS_DIR;
if (shotsDir) await mkdir(shotsDir, { recursive: true });
const PASSWORD = 'Local-test-password-2345';
const [fsHostName, fsPort] = firestoreHost.split(':');
const seed = adminDb(adminApp({ projectId }, 'drafts-ui-seed'));

const users = { admin: { email: 'plain-admin@example.test', doc: { role: 'admin' } }, nobody: { email: 'nobody@example.test', doc: null } };
for (const user of Object.values(users)) {
  const res = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: PASSWORD, returnSecureToken: true }) });
  const body = await res.json(); assert.ok(res.ok, body.error?.message);
  user.uid = body.localId;
  if (user.doc) await seed.doc(`admins/${user.uid}`).set({ email: user.email, ...user.doc });
}
const ts = (seconds) => new Date(seconds * 1000);
await seed.doc('priestContentControl/state').set({ version: 1, lockUid: '', updatedAt: new Date() });
for (const [id, name, tag, order] of [['litanies', 'Літаніі', 'Літанія', 20], ['mary', 'Марыйныя', 'Марыя', 10], ['novenas', 'Навэнны', 'Навэнна', 30]]) {
  await seed.doc(`prayerCategories/${id}`).set({ name, tags: [tag], order, addToNewPrayers: false });
}
for (const [id, title, tags] of [['p-mary', 'Літанія да Найсвяцейшай Панны Марыі', ['Літанія', 'Марыя']], ['p-novena', 'Навэнна да св. Юзафа', ['Навэнна']]]) {
  await seed.doc(`prayers/${id}`).set({ title, text: 'Тэставы тэкст існуючай малітвы.', textFormat: 'mybrev-markdown', textFormatVersion: 1, tags, createdAt: ts(1.7e9), updatedAt: ts(1.7e9) });
}
const litany = `Кірые, элейсон,
_Хрыстэ, элейсон, Кірые, элейсон._

:::rubric
Просьбы прамаўляе кантар, адказ — усе.
:::

**К.:** Святы Юзафе,
**Н.:** _маліся за нас._
**К.:** Апекуне Святой Сям’і,
**Н.:** _маліся за нас._

**Молімся.** Божа, Ты даў нам святога Юзафа ў абаронцы. Дай нам заўсёды карыстацца яго заступніцтвам.`;
const base = { textFormat: 'mybrev-markdown', version: 1, createdBy: 'import-dry-run', createdAt: ts(1.79e9), updatedAt: ts(1.79e9), sourceBook: '«Бог Добры» (Пінск, 2022)', copyrightNotices: ['© Пінская дыяцэзія, 2022', '© Выдавецтва Пінскай дыяцэзіі Рымска-Каталіцкага Касцёла ў РБ, 2022'], priestOnly: false, originBatch: 'demo' };
const drafts = [
  { id: 'bd-litany', title: 'Літанія да святога Юзафа (набожнае выданне)', text: litany, tags: ['Літанія'], status: 'draft', origin: 'bog_dobry', reason: 'unique_bog_dobry', sourceId: 'bog_dobry_pinsk_edition_2022', originalEntryId: 'bog-0412', printedPageStart: 412, printedPageEnd: 414, pdfPageStart: 430, pdfPageEnd: 432, sourceSha256: 'a'.repeat(64) },
  { id: 'bd-dup', title: 'Навэнна да св. Юзафа', text: 'Дзень першы\n\nТэставы тэкст навэнны.', tags: ['Навэнна'], status: 'draft', origin: 'disputed', reason: 'ambiguous', flagReasons: ['Назва супадае з існуючай малітвай, тэксты розныя'], originalEntryId: 'bog-0101', printedPageStart: 120, pdfPageStart: 138 },
  { id: 'bd-draft', title: 'Малітва за ўрадлівасць зямлі', text: 'Усемагутны Божа, дабраславі палі.', tags: [], status: 'draft', origin: 'bog_dobry', reason: 'unique_bog_dobry', printedPageStart: 305, pdfPageStart: 323 },
  { id: 'bd-priest', title: 'Малітва святара перад споведдзю', text: 'Тэставы тэкст.', tags: ['Сакрамэнт'], status: 'draft', origin: 'bog_dobry', priestOnly: true, printedPageStart: 55, pdfPageStart: 73 },
  { id: 'bd-done', title: 'Ужо апублікаваная малітва', text: 'Тэкст.', tags: ['Марыя'], status: 'published', origin: 'bog_dobry', targetPrayerId: 'p-mary', printedPageStart: 9, pdfPageStart: 27 },
];
for (const draft of drafts) { const { id, ...rest } = draft; await seed.doc(`prayerDrafts/${id}`).set({ ...base, ...rest, draftId: id }); }

// Private preview of REAL dry-run payloads (full book text: screenshots stay outside git):
//   PREVIEW_PAYLOADS=<plan dir> PREVIEW_ENTRIES=id1,id2 PREVIEW_SHOTS=<private dir> ...
const previewIds = [];
if (process.env.PREVIEW_PAYLOADS) {
  const { readFileSync, readdirSync } = await import('node:fs');
  const plan = JSON.parse(readFileSync(`${process.env.PREVIEW_PAYLOADS}/planned_operations.json`, 'utf8'));
  for (const match of (process.env.PREVIEW_ENTRIES || '').split(',').filter(Boolean)) {
    const op = plan.operations.find((item) => item.sourceEntryId.includes(match) && item.targetId);
    if (!op) continue;
    const payload = JSON.parse(readFileSync(`${process.env.PREVIEW_PAYLOADS}/payloads/${op.targetId}.json`, 'utf8')).data;
    const id = `preview-${previewIds.length}`;
    await seed.doc(`prayerDrafts/${id}`).set({ ...base, draftId: id, title: payload.title, text: payload.text, tags: payload.tags, sourceBook: op.source.split('. ©')[0], copyrightNotices: op.copyrightNotices, status: 'draft', origin: 'disputed', reason: 'ambiguous', printedPageStart: op.printedPageStart, printedPageEnd: op.printedPageEnd, pdfPageStart: op.pdfPageStart, originalEntryId: op.sourceEntryId });
    previewIds.push({ id, label: op.kind });
  }
  void readdirSync;
}
const firebaseModule = `import { initializeApp } from 'firebase/app';
import { initializeFirestore, memoryLocalCache, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
export const firebaseApp = initializeApp({ projectId: '${projectId}', apiKey: 'demo-key', authDomain: '${projectId}.firebaseapp.com' });
export const firestoreCacheRecovery = { usesMemoryCache: () => true };
export const db = initializeFirestore(firebaseApp, { localCache: memoryLocalCache() });
connectFirestoreEmulator(db, '${fsHostName}', ${fsPort});
connectAuthEmulator(getAuth(firebaseApp), 'http://${authHost}', { disableWarnings: true });
`;
const server = await createServer({
  configFile: false, define: { 'process.env': {} }, cacheDir: 'node_modules/.vite-prayer-drafts',
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 4791, strictPort: true },
  plugins: [vue(), vuetify({ styles: false }), {
    name: 'drafts-emulator-only', enforce: 'pre',
    transform(source, id) {
      const file = id.replaceAll('\\', '/').split('?')[0];
      if (file.endsWith('/src/plugins/firebase.js')) return firebaseModule;
      if (file.endsWith('/src/plugins/priestFirebase.js')) {
        return `import { connectFirestoreEmulator } from 'firebase/firestore';import { connectAuthEmulator } from 'firebase/auth';const testAuth = (auth) => { connectAuthEmulator(auth, 'http://${authHost}', { disableWarnings: true }); return auth; };\n${source
          .replace('return { app, db: initializeFirestore(app, { localCache: memoryLocalCache() }) };', `const db = initializeFirestore(app, { localCache: memoryLocalCache() }); connectFirestoreEmulator(db, '${fsHostName}', ${fsPort}); return { app, db };`)
          .replace('initializeAuth(priestEditorFirebase.app, { persistence: inMemoryPersistence })', 'testAuth(initializeAuth(priestEditorFirebase.app, { persistence: inMemoryPersistence }))')
          .replace('initializeAuth(priestFirebase.app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })', 'testAuth(initializeAuth(priestFirebase.app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] }))')}`;
      }
      return undefined;
    },
  }],
});
await server.listen();
const BASE = 'http://127.0.0.1:4791';
const browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const failures = [];
const check = async (name, fn) => { try { await fn(); console.log('PASS', name); } catch (e) { failures.push(name); console.log('FAIL', name, '-', e.message.split('\n')[0]); } };

async function open(who, { width = 1440, height = 900, theme = 'light', path = '/admin' } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.route(/https?:\/\//, (route) => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await context.addInitScript((value) => { try { localStorage.setItem('themePreference', value); localStorage.setItem('theme', value); } catch { /* ignore */ } }, theme);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('console', (m) => { if (m.type() === 'error') console.log('  console:', m.text().slice(0, 300)); });
  page.on('pageerror', (e) => console.log('  pageerror:', e.message.slice(0, 200)));
  await page.goto(`${BASE}${path}`);
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', users[who].email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  return { context, page };
}
const shot = async (page, name) => { if (shotsDir) await page.screenshot({ path: `${shotsDir}/${name}.png`, fullPage: false }); };
const settle = (page) => page.waitForTimeout(400);

await check('admin home shows the card for a plain admin', async () => {
  const { context, page } = await open('admin');
  await page.waitForURL(`${BASE}/admin`);
  const card = page.locator('.admin-home__card', { hasText: 'Чарнавікі малітваў' });
  await card.waitFor(); await settle(page);
  await shot(page, '01-admin-home-card-1440-light');
  await context.close();
});

await check('list: counts, origin filter, search, dark 390', async () => {
  const { context, page } = await open('admin', { path: '/admin/prayer-drafts' });
  await page.waitForSelector('.draft-row');
  assert.equal(await page.locator('.draft-row').count(), 4); // archived/published hidden unless chosen
  await page.getByRole('button', { name: 'Спрэчныя' }).click();
  assert.equal(await page.locator('.draft-row').count(), 1);
  await page.getByRole('button', { name: 'Усе' }).click();
  await page.fill('.drafts-toolbar input', 'юзафа');
  await settle(page); assert.equal(await page.locator('.draft-row').count(), 2);
  await page.fill('.drafts-toolbar input', '');
  await settle(page); await shot(page, '02-drafts-list-1440-light');
  await context.close();
  const mobile = await open('admin', { width: 390, height: 844, theme: 'dark', path: '/admin/prayer-drafts' });
  await mobile.page.waitForSelector('.draft-row'); await settle(mobile.page);
  await shot(mobile.page, '03-drafts-list-390-dark');
  assert.ok(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal scroll');
  await mobile.context.close();
});

await check('editor renders rubric preview, tags and simple source; responsive widths', async () => {
  for (const [width, theme, name] of [[1440, 'light', '04-editor-1440-light'], [768, 'light', '05-editor-768-light'], [390, 'dark', '06-editor-390-dark'], [320, 'light', '07-editor-320-light']]) {
    const { context, page } = await open('admin', { width, height: width < 500 ? 800 : 900, theme, path: '/admin/prayer-drafts/bd-litany' });
    console.log('  width', width);
    await page.locator('.preview').waitFor(); await settle(page);
    assert.match(await page.locator('.preview').innerText(), /Кірые, элейсон/);
    assert.match(await page.locator('.preview-source').innerText(), /Пінская дыяцэзія/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `no horizontal scroll at ${width}`);
    await shot(page, name);
    await context.close();
  }
});

await check('similar prayers are shown for a disputed draft', async () => {
  const { context, page } = await open('admin', { path: '/admin/prayer-drafts/bd-dup' });
  await page.locator('.dup-list').waitFor(); await settle(page);
  assert.match(await page.locator('.dup-list').innerText(), /Навэнна да св\. Юзафа/);
  await shot(page, '08-duplicates-1440-light');
  await context.close();
});

await check('plain admin publishes through the confirmation dialog; one public prayer; result visible', async () => {
  const { context, page } = await open('admin', { path: '/admin/prayer-drafts/bd-litany' });
  await page.locator('.preview').waitFor();
  await page.getByRole('button', { name: 'Апублікаваць' }).first().click();
  const dialog = page.locator('.publish-dialog');
  await dialog.waitFor(); await settle(page);
  // No legal approval or intermediate readiness state is required.
  assert.equal(await dialog.getByText('Падстава правоў').count(), 0);
  assert.match(await dialog.innerText(), /Усе чытачы/);
  assert.match(await dialog.innerText(), /\/prayer\/d_bd-litany/);
  await shot(page, '09-publish-confirm-1440-light');
  await dialog.getByRole('button', { name: 'Апублікаваць' }).click();
  await page.locator('.v-alert', { hasText: 'Апублікавана' }).first().waitFor();
  await settle(page); await shot(page, '10-after-publish-1440-light');
  const published = await seed.collection('prayers').where('sourceDraftId', '==', 'bd-litany').get();
  assert.equal(published.size, 1);
  assert.equal((await seed.doc('prayerDrafts/bd-litany').get()).data().status, 'published');
  await page.goto(`${BASE}/prayer/d_bd-litany`);
  await page.getByText('Крыніца:').waitFor(); await settle(page);
  assert.match(await page.locator('.prayer-source').innerText(), /© Пінская дыяцэзія/);
  await shot(page, '11-published-prayer-with-source-1440-light');
  await context.close();
});

await check('a signed-in non-admin never reaches the drafts pages', async () => {
  const { context, page } = await open('nobody');
  await page.waitForSelector('.v-alert');
  await page.goto(`${BASE}/admin/prayer-drafts`);
  await page.waitForURL(/\/login/);
  assert.equal(await page.locator('.drafts-page').count(), 0);
  await context.close();
});

if (previewIds.length) {
  for (const [width, theme] of [[1440, 'light'], [390, 'dark']]) {
    for (const item of previewIds) {
      const { context, page } = await open('admin', { width, height: width < 500 ? 844 : 900, theme, path: `/admin/prayer-drafts/${item.id}` });
      await page.locator('.preview').waitFor(); await settle(page);
      await page.screenshot({ path: `${process.env.PREVIEW_SHOTS}/preview-${item.label}-${width}-${theme}.png` });
      await context.close();
    }
  }
}
await browser.close();
await server.close();
process.exit(failures.length ? 1 : 0);
