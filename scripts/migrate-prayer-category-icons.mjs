#!/usr/bin/env node
/**
 * Assign `iconKey` to global prayer categories that have none (or an invalid one).
 *
 * - Dry-run (default) reads ONLY a local read-only Firestore snapshot and writes a plan + a backup
 *   of exactly the documents that would change. Nothing is sent to Firestore.
 * - `--apply` additionally needs `--service-account <file>` and `--i-understand-this-writes-production`.
 *   It writes only `iconKey` (no other field, no permission/tag/parent/order change), per collection
 *   the document is already in (public stays public, protected stays protected), in ONE transaction
 *   that also checks every document is still unchanged and bumps `priestContentControl/state.version`
 *   the way the admin writers do. Re-running is a no-op (idempotent): documents with a valid iconKey are skipped.
 * - `--verify` (needs a service account) re-reads only the planned documents, read-only.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';
import { SEED_CATEGORY_ICON_KEYS, isValidCategoryIconKey, suggestCategoryIconKey } from '../src/constants/prayerCategoryIcons.js';

export const CATEGORY_COLLECTIONS = ['prayerCategories', 'priestProtectedCategories'];
const CONTROL_DOC = 'priestContentControl/state';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Reviewed assignment for the categories that exist in the live snapshot of 2026-11-13
 * (see docs/prayer-category-icons.md). Chosen from id, name and tags; ambiguous names get a neutral icon.
 */
export const REVIEWED_ASSIGNMENTS = Object.freeze({
  ...SEED_CATEGORY_ICON_KEYS,
  devotions: ['church', 'Набажэнствы: агульнае, без вузкага сэнсу'],
  HnibKjwimvddbXnhoary: ['crucifix', 'Крыжовы шлях: Укрыжаванне'],
  m3CFvwPfWksxFkIIiVoP: ['saint-halo', 'Да святых'],
  m7OMF6Hqiykw36idPNU0: ['candle', 'За памерлых: свечка'],
  O2L514ta7IVCf2VcEKkh: ['prayer', 'Розныя / асноўныя малітвы: нейтральная Малітва'],
  qUmzRwzqIfSPHc2eZURa: ['vocation', 'Кансэкраванае жыццё: Пакліканне'],
  gMzVAGRUogiZa2MAxpr4: ['cross', 'Для святара (абароненая): нейтральны Крыж'],
});

function assignment(doc) {
  const reviewed = REVIEWED_ASSIGNMENTS[doc.id];
  if (typeof reviewed === 'string') return { iconKey: reviewed, source: 'seed (required)', reason: 'built-in category' };
  if (Array.isArray(reviewed)) return { iconKey: reviewed[0], source: 'reviewed table', reason: reviewed[1] };
  return { iconKey: suggestCategoryIconKey({ id: doc.id, name: doc.name, tags: doc.tags }), source: 'keyword rules / stable hash', reason: 'not in reviewed table' };
}

/** Pure planner: documents in → changes out. Valid existing keys are never touched. */
export function buildCategoryIconPlan(collections) {
  const changes = []; const kept = [];
  for (const [collection, documents] of Object.entries(collections)) {
    for (const doc of documents || []) {
      if (isValidCategoryIconKey(doc.iconKey)) { kept.push({ collection, id: doc.id, iconKey: doc.iconKey }); continue; }
      const next = assignment(doc);
      changes.push({ collection, id: doc.id, name: doc.name, oldIconKey: doc.iconKey ?? null, proposedIconKey: next.iconKey, source: next.source, reason: next.reason });
    }
  }
  return { changes, kept };
}

function parseArgs(argv) {
  const options = { apply: false, verify: false, confirmed: false, snapshot: null, out: path.join(ROOT, 'backups', 'prayer-category-icons'), serviceAccount: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') options.apply = true;
    else if (a === '--verify') options.verify = true;
    else if (a === '--i-understand-this-writes-production') options.confirmed = true;
    else if (a === '--snapshot') options.snapshot = path.resolve(argv[++i]);
    else if (a === '--out') options.out = path.resolve(argv[++i]);
    else if (a === '--service-account') options.serviceAccount = path.resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${a}`);
  }
  return options;
}

async function withFirestore(serviceAccount, work) {
  const { default: admin } = await import('firebase-admin');
  const app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(await fs.readFile(serviceAccount, 'utf8'))) });
  try { return await work(admin.firestore(), admin); } finally { await app.delete(); }
}

async function applyPlan(plan, serviceAccount) {
  return withFirestore(serviceAccount, (db) => db.runTransaction(async (transaction) => {
    const control = db.doc(CONTROL_DOC);
    const [controlSnap, ...docSnaps] = await Promise.all([transaction.get(control), ...plan.changes.map((c) => transaction.get(db.collection(c.collection).doc(c.id)))]);
    if (controlSnap.data()?.lockUid) throw new Error('Content migration lock is held; refusing to write.');
    const pending = [];
    docSnaps.forEach((snap, index) => {
      const change = plan.changes[index];
      if (!snap.exists) throw new Error(`Category vanished: ${change.collection}/${change.id}`);
      if (isValidCategoryIconKey(snap.data().iconKey)) return; // someone set it meanwhile: keep their choice
      pending.push([snap.ref, change]);
    });
    pending.forEach(([ref, change]) => transaction.update(ref, { iconKey: change.proposedIconKey }));
    if (pending.length) transaction.set(control, { version: (controlSnap.data()?.version || 0) + 1, lockUid: '', updatedAt: new Date() });
    return pending.map(([, change]) => `${change.collection}/${change.id}`);
  }));
}

async function verifyPlan(plan, serviceAccount) {
  return withFirestore(serviceAccount, async (db) => Promise.all(plan.changes.map(async (change) => {
    const snap = await db.collection(change.collection).doc(change.id).get();
    return { collection: change.collection, id: change.id, iconKey: snap.data()?.iconKey ?? null, ok: isValidCategoryIconKey(snap.data()?.iconKey) };
  })));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.snapshot) throw new Error('--snapshot <dir> (a read-only export containing both category collections) is required.');
  const snapshot = await openFirestoreSnapshot(options.snapshot);
  const collections = {};
  for (const name of CATEGORY_COLLECTIONS) {
    collections[name] = (await snapshot.collection(name)) || [];
  }
  const plan = buildCategoryIconPlan(collections);
  await fs.mkdir(options.out, { recursive: true });
  const rawBackup = plan.changes.map((c) => ({ collection: c.collection, id: c.id, data: collections[c.collection].find((d) => d.id === c.id) }));
  await fs.writeFile(path.join(options.out, 'affected-documents-backup.json'), `${JSON.stringify(rawBackup, null, 2)}\n`);
  await fs.writeFile(path.join(options.out, 'plan.json'), `${JSON.stringify({ snapshotVersion: snapshot.manifest.snapshotVersion, mode: options.apply ? 'apply' : 'dry-run', ...plan }, null, 2)}\n`);
  console.table(plan.changes.map(({ collection, id, name, oldIconKey, proposedIconKey, source }) => ({ collection, id, name, oldIconKey, proposedIconKey, source })));
  console.log(`planned=${plan.changes.length} alreadyValid=${plan.kept.length} backup+plan: ${options.out}`);
  if (options.verify && !options.serviceAccount) throw new Error('--verify needs --service-account <file> (read-only reads).');
  if (options.verify) console.log(JSON.stringify(await verifyPlan(plan, options.serviceAccount), null, 2));
  if (!options.apply) { console.log('Firestore: NOT APPLIED (dry-run).'); return; }
  if (!options.confirmed || !options.serviceAccount) throw new Error('--apply needs --service-account <file> and --i-understand-this-writes-production.');
  const written = await applyPlan(plan, options.serviceAccount);
  console.log(`Firestore: APPLIED, ${written.length} document(s) updated: ${written.join(', ')}`);
  console.log(JSON.stringify(await verifyPlan(plan, options.serviceAccount), null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
