/**
 * Shared harness for the analytics measurement scripts: seed the LOCAL Firestore emulator from local snapshots and
 * build/serve the real app (flag on or off) with the Firebase module swapped for the emulator, in memory.
 * Never contacts production; the emulator host must be local.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { openFirestoreSnapshot } from '../../lib/firestore-snapshot.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function emulatorFromEnv() {
  const host = process.env.FIRESTORE_EMULATOR_HOST || '';
  assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/, 'A local Firestore emulator is required (run through `firebase emulators:exec`)');
  const [emulatorHost, emulatorPort] = host.split(':');
  return { emulatorHost, emulatorPort: Number(emulatorPort) };
}

const toAdmin = (value) => {
  if (Array.isArray(value)) return value.map(toAdmin);
  if (value instanceof Date || !value || typeof value !== 'object') return value;
  if (value.__firestoreType === 'timestamp') return new Timestamp(value.seconds, value.nanoseconds);
  if (value.__firestoreType === 'date') return new Date(value.iso);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toAdmin(item)]));
};

/** @returns {Promise<{ db: import('firebase-admin/firestore').Firestore, seeded: number }>} */
export async function seedEmulator({ projectId, snapshots }) {
  const db = getFirestore(initializeApp({ projectId }, `analytics-seed-${projectId}`));
  let seeded = 0;
  for (const dir of snapshots) {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const snapshot = await openFirestoreSnapshot(dir);
    for (const name of Object.keys(manifest.collections)) {
      const writer = db.bulkWriter();
      for (const { id, ...data } of (await snapshot.collection(name)) || []) { writer.set(db.doc(`${name}/${id}`), toAdmin(data)); seeded += 1; }
      await writer.close();
    }
  }
  return { db, seeded };
}

/** One book of each Bible from the repository seeds (`bible_bel`, `bible_ru`): the Bible is not in the Firestore snapshots. */
export async function seedBible(db, bookIds = ['gn']) {
  const zlib = await import('node:zlib');
  const read = (file) => JSON.parse((file.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(file)) : fs.readFileSync(file)).toString('utf8'));
  const sources = { bible_bel: read(path.join(ROOT, 'scripts/bible/bible_seed_bel.json.gz')), bible_ru: read(path.join(ROOT, 'scripts/bible/bible_seed_ru.json')) };
  let count = 0;
  for (const [collection, seed] of Object.entries(sources)) {
    for (const book of seed.books.filter((item) => bookIds.includes(item.id))) {
      const chapters = Object.fromEntries(book.chapters.map((verses, index) => [String(index + 1), verses]));
      await db.doc(`${collection}/${book.id}`).set({ ...book, chapters, chapterCount: book.chapters.length });
      count += 1;
    }
  }
  return count;
}

const firebaseModule = (projectId, host, port) => `import { initializeApp } from 'firebase/app';
import { initializeFirestore, memoryLocalCache, connectFirestoreEmulator } from 'firebase/firestore';
import { createFirestoreCacheRecovery } from '/src/utils/firestoreCacheRecovery.js';
export const firebaseApp = initializeApp({ projectId: '${projectId}', apiKey: 'demo-key', authDomain: '${projectId}.firebaseapp.com' });
export const firestoreCacheRecovery = createFirestoreCacheRecovery({ projectId: '${projectId}', storage: () => window.sessionStorage, reload: () => window.location.reload(), isOnline: () => true });
export const db = initializeFirestore(firebaseApp, { localCache: memoryLocalCache() });
connectFirestoreEmulator(db, '${host}', ${port});`;

/** Production build of the app, flag on/off, served by `vite preview`. */
export async function buildAndServe({ name, flag, projectId, emulatorHost, emulatorPort, outRoot, port }) {
  const swapPlugin = {
    name: 'analytics-local-emulator-only',
    enforce: 'pre',
    transform: (source, id) => (id.replaceAll('\\', '/').split('?')[0].endsWith('/src/plugins/firebase.js') ? firebaseModule(projectId, emulatorHost, emulatorPort) : null),
  };
  process.env.VITE_ANALYTICS_LOCAL = flag;
  const outDir = path.join(outRoot, `dist-${name}`);
  await build({ configFile: path.join(ROOT, 'vite.config.js'), logLevel: 'error', plugins: [swapPlugin], build: { outDir, emptyOutDir: true, reportCompressedSize: false }, cacheDir: path.join(ROOT, `node_modules/.vite-analytics-${name}`) });
  delete process.env.VITE_ANALYTICS_LOCAL;
  const server = await preview({ configFile: false, root: ROOT, preview: { host: '127.0.0.1', port, strictPort: true }, build: { outDir } });
  return { name, flag, outDir, base: `http://127.0.0.1:${port}`, server };
}
