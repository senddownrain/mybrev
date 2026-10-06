#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';
import { STRUCTURAL_READING_IDS, proseReadingPatch, structuralReadingPatch } from './lib/reading-structural-cleanup.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SNAPSHOT = path.join(ROOT, 'backups', 'core-collections-migration');
const DEFAULT_REPORT = path.join(ROOT, 'reports', 'reading-structural-cleanup.json');
const DEFAULT_ACCOUNT = path.join(ROOT, 'patchs', 'serviceAccountKey.json');
const BACKUP_DIR = path.join(ROOT, 'backups', 'firestore-migrations');

function optionsOf(argv) {
  const options = { snapshot: DEFAULT_SNAPSHOT, report: DEFAULT_REPORT, account: DEFAULT_ACCOUNT, apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--snapshot') options.snapshot = path.resolve(argv[++i]);
    else if (arg === '--report') options.report = path.resolve(argv[++i]);
    else if (arg === '--service-account') options.account = path.resolve(argv[++i]);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function buildStructuralPlan(documents) {
  const byId = new Map(documents.map((document) => [document.id, document]));
  const proseIds = documents.filter((document) => proseReadingPatch(document)).map((document) => document.id);
  return [...STRUCTURAL_READING_IDS, ...proseIds].map((id) => {
    const source = byId.get(id);
    if (!source) throw new Error(`Snapshot is missing ${id}`);
    const patch = structuralReadingPatch(source) ?? proseReadingPatch(source);
    return { id, source, patch, fields: Object.keys(patch),
      beforeHash: hash(Object.fromEntries(Object.keys(patch).map((field) => [field, source[field] ?? null]))),
      afterHash: hash(patch) };
  });
}

async function applyPlan(plan, options, projectId) {
  const [{ default: admin }, accountText] = await Promise.all([
    import('firebase-admin'), readFile(options.account, 'utf8'),
  ]);
  const account = JSON.parse(accountText);
  if (projectId && account.project_id !== projectId) throw new Error('Snapshot and service account project IDs differ.');
  const app = admin.initializeApp({ credential: admin.credential.cert(account), projectId: account.project_id });
  try {
    const db = admin.firestore(app);
    const snapshots = await db.getAll(...plan.map(({ id }) => db.collection('readings').doc(id)));
    const updates = [];
    const skipped = [];
    const alreadyApplied = [];
    for (const snapshot of snapshots) {
      const item = plan.find(({ id }) => id === snapshot.id);
      if (!snapshot.exists) { skipped.push({ id: snapshot.id, reason: 'missing live document' }); continue; }
      const live = snapshot.data();
      if (item.fields.every((field) => isDeepStrictEqual(live[field] ?? null, item.patch[field] ?? null))) {
        alreadyApplied.push(snapshot.id);
        continue;
      }
      if (!item.fields.every((field) => isDeepStrictEqual(live[field] ?? null, item.source[field] ?? null))) {
        skipped.push({ id: snapshot.id, reason: 'reviewed source fields differ from live document' });
        continue;
      }
      updates.push({ snapshot, patch: item.patch,
        previous: Object.fromEntries(item.fields.map((field) => [field, live[field] ?? null])) });
    }

    await mkdir(BACKUP_DIR, { recursive: true });
    const backupPath = path.join(BACKUP_DIR, `reading-structures-${new Date().toISOString().replace(/[:.]/gu, '-')}.json`);
    await writeFile(backupPath, `${JSON.stringify({ createdAt: new Date().toISOString(), collection: 'readings',
      documents: updates.map(({ snapshot, previous }) => ({ id: snapshot.id,
        updateTime: snapshot.updateTime.toDate().toISOString(), fields: previous })) }, null, 2)}\n`);
    const batch = db.batch();
    for (const { snapshot, patch } of updates) batch.update(snapshot.ref, patch, { lastUpdateTime: snapshot.updateTime });
    if (updates.length) await batch.commit();
    return { candidateReads: snapshots.length, writtenDocuments: updates.length,
      writtenFields: updates.reduce((sum, item) => sum + Object.keys(item.patch).length, 0),
      alreadyApplied, skipped, backupPath };
  } finally {
    await app.delete();
  }
}

async function main() {
  const options = optionsOf(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/cleanup-reading-structures.mjs [--snapshot DIR] [--report FILE] [--apply] [--service-account FILE]');
    console.log('Default: dry run on a local snapshot. --apply reads only the reviewed candidate document IDs.');
    return;
  }
  const snapshot = await openFirestoreSnapshot(options.snapshot);
  const collection = snapshot.collectionPaths.includes('readings') ? 'readings' : 'parsedData';
  const documents = await snapshot.collection(collection);
  if (!documents) throw new Error(`Snapshot needs readings or parsedData: ${snapshot.root}`);
  const plan = buildStructuralPlan(documents);
  const report = { mode: options.apply ? 'apply' : 'dry-run', analysisSource: snapshot.root,
    snapshotVersion: snapshot.manifest.snapshotVersion, sourceCollection: collection,
    targetCollection: 'readings', candidates: plan.map(({ id, fields, beforeHash, afterHash }) =>
      ({ id, fields, beforeHash, afterHash })) };
  if (options.apply) report.apply = await applyPlan(plan, options, snapshot.manifest.projectId);
  await mkdir(path.dirname(options.report), { recursive: true });
  await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ reportPath: options.report, ...report }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
