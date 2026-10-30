/**
 * Long-running local app for manual / browser screen checks, emulator only.
 *
 *   firebase emulators:exec --only firestore --project demo-screens "node scripts/serve-screens-emulator.mjs"
 *
 * Seeds the Firestore emulator from LOCAL snapshots (never production), then overlays the
 * generated Common templates of `patchs/db-templates` (seasonal Commons + D-1 reading
 * choices), which are newer than the snapshot. SCREENS_PROPER=repo additionally overlays the generated
 * Propers of `patchs/db-feasts` (liturgicalProperTexts) - the state the repo intends to publish. Serves the real app with Vite, swapping
 * only the Firebase module for an emulator-connected one, in memory.
 *
 * Env: SCREENS_PORT (default 5190), SCREENS_SNAPSHOT, SCREENS_STATIC_SNAPSHOT.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';
import { storedDocument } from './content/lib/app-content.mjs';

const host = process.env.FIRESTORE_EMULATOR_HOST || '';
assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/, 'A local Firestore emulator is required');
const [emulatorHost, emulatorPort] = host.split(':');
const projectId = 'demo-screens';
const port = Number(process.env.SCREENS_PORT || 5190);

function toAdmin(value) {
  if (Array.isArray(value)) return value.map(toAdmin);
  if (value instanceof Date || !value || typeof value !== 'object') return value;
  if (value.__firestoreType === 'timestamp') return new Timestamp(value.seconds, value.nanoseconds);
  if (value.__firestoreType === 'date') return new Date(value.iso);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toAdmin(item)]));
}

const db = getFirestore(initializeApp({ projectId }, 'screens-seed'));
let seeded = 0;
for (const dir of [process.env.SCREENS_SNAPSHOT || 'backups/firestore-snapshot-readings-sets', process.env.SCREENS_STATIC_SNAPSHOT || 'backups/firestore-snapshot-static']) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const snapshot = await openFirestoreSnapshot(dir);
  for (const name of Object.keys(manifest.collections)) {
    const writer = db.bulkWriter();
    for (const { id, ...data } of (await snapshot.collection(name)) || []) { writer.set(db.doc(`${name}/${id}`), toAdmin(data)); seeded += 1; }
    await writer.close();
  }
}
const templatesDir = 'patchs/db-templates';
for (const name of fs.readdirSync(templatesDir).filter((n) => n.endsWith('.json')).sort()) {
  const { _id, ...data } = JSON.parse(fs.readFileSync(path.join(templatesDir, name), 'utf8'));
  const { id, ...stored } = storedDocument(_id, data);
  await db.doc(`liturgicalTemplates/${id}`).set(stored);
  seeded += 1;
}
if (process.env.SCREENS_PROPER === 'repo') {
  const feastsDir = 'patchs/db-feasts';
  const writer = db.bulkWriter();
  for (const name of fs.readdirSync(feastsDir).filter((n) => n.endsWith('.json')).sort()) {
    const { _id, ...data } = JSON.parse(fs.readFileSync(path.join(feastsDir, name), 'utf8'));
    writer.set(db.doc(`liturgicalProperTexts/${_id}`), data); seeded += 1;
  }
  await writer.close();
}
console.log(`seeded ${seeded} documents into the emulator`);

const firebaseModule = `import { initializeApp } from 'firebase/app';
import { initializeFirestore, memoryLocalCache, connectFirestoreEmulator } from 'firebase/firestore';
import { createFirestoreCacheRecovery } from '/src/utils/firestoreCacheRecovery.js';
export const firebaseApp = initializeApp({ projectId: '${projectId}', apiKey: 'demo-key', authDomain: '${projectId}.firebaseapp.com' });
export const firestoreCacheRecovery = createFirestoreCacheRecovery({ projectId: '${projectId}', storage: () => window.sessionStorage, reload: () => window.location.reload(), isOnline: () => true });
export const db = initializeFirestore(firebaseApp, { localCache: memoryLocalCache() });
connectFirestoreEmulator(db, '${emulatorHost}', ${emulatorPort});`;
const server = await createServer({
  configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
  cacheDir: 'node_modules/.vite-screens',
  logLevel: 'error',
  server: { host: '127.0.0.1', port, strictPort: true },
  plugins: [{
    name: 'screens-local-emulator-only',
    enforce: 'pre',
    transform(source, id) {
      return id.replaceAll('\\', '/').split('?')[0].endsWith('/src/plugins/firebase.js') ? firebaseModule : null;
    },
  }],
});
await server.listen();
console.log(`READY http://127.0.0.1:${port}`);
await new Promise(() => {});
