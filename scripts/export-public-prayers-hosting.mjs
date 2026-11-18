#!/usr/bin/env node
/**
 * One bounded release-time Firestore read, NEVER on a visitor's first load.
 * Usage (CI): node scripts/export-public-prayers-hosting.mjs --live --project ibreviaryby --out dist/public-prayers-v1.json
 * Offline tests: --snapshot <private-local-snapshot> --out <ignored-working-path>
 * No protected prayers, drafts, grant records, user records or arbitrary Firestore fields are published.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPublicPrayerCatalog, validatePublicPrayerCatalog } from '../src/utils/publicPrayerCatalog.mjs';

export function parseArgs(argv) {
  const opts = { live: false, snapshot: null, project: '', out: '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--live') opts.live = true;
    else if (['--snapshot', '--project', '--out'].includes(argv[i])) {
      const value = argv[++i];
      if (!value) throw new Error('Missing value for ' + argv[i - 1]);
      opts[argv[i - 1].slice(2)] = value;
    } else throw new Error('Unknown argument: ' + argv[i]);
  }
  if (!opts.out || Number(Boolean(opts.live)) + Number(Boolean(opts.snapshot)) !== 1) {
    throw new Error('Specify exactly one of --live or --snapshot and --out');
  }
  if (opts.live && opts.project !== 'ibreviaryby') throw new Error('Production export requires explicit ibreviaryby project');
  return opts;
}

export async function readLocalCatalog(snapshotDir) {
  const { openFirestoreSnapshot } = await import('./lib/firestore-snapshot.mjs');
  const snapshot = await openFirestoreSnapshot(snapshotDir);
  const [prayers, categories, protectedCategories] = await Promise.all([
    snapshot.collection('prayers'), snapshot.collection('prayerCategories'),
    snapshot.collection('priestProtectedCategories'),
  ]);
  if (!prayers || !categories || !protectedCategories) {
    throw new Error('Local snapshot must include prayers, prayerCategories and priestProtectedCategories');
  }
  return { prayers, categories, protectedCategories };
}

export async function readLiveCatalog(project) {
  const { initializeApp, applicationDefault, deleteApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = initializeApp({ credential: applicationDefault(), projectId: project }, 'hosting-public-prayers-export');
  try {
    const db = getFirestore(app);
    // Three queries total, only in the deployment job. The protected category query
    // is used for policy decisions and is NEVER copied to the Hosting payload.
    const names = ['prayers', 'prayerCategories', 'priestProtectedCategories'];
    const snapshots = await Promise.all(names.map((name) => db.collection(name).get()));
    const total = snapshots.reduce((sum, snap) => sum + snap.size, 0);
    if (total > 2500) throw new Error('Export exceeded 2500 document guard; review before deployment');
    const [prayers, categories, protectedCategories] = snapshots.map((snap) =>
      snap.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
    return { prayers, categories, protectedCategories };
  } finally {
    await deleteApp(app);
  }
}

export async function exportCatalog({ collections, out }) {
  const catalog = buildPublicPrayerCatalog(collections);
  validatePublicPrayerCatalog(catalog);
  const payload = JSON.stringify(catalog) + '\n';
  if (Buffer.byteLength(payload) > 12 * 1024 * 1024) throw new Error('Public catalog is unexpectedly large');
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, payload, { flag: 'w', mode: 0o644 });
  return { prayers: catalog.prayers.length, categories: catalog.categories.length, bytes: Buffer.byteLength(payload) };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const collections = options.live ? await readLiveCatalog(options.project) : await readLocalCatalog(options.snapshot);
  const result = await exportCatalog({ collections, out: options.out });
  console.log('PUBLIC Hosting catalog:', JSON.stringify({ ...result, destination: options.out, firestoreWrites: 0 }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
