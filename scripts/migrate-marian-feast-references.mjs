#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isFromDayReference } from '../src/constants/days.js';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaults = {
  snapshot: path.join(root, 'backups', 'firestore-snapshot'),
  generated: path.join(root, 'patchs', 'db-feasts'),
  report: path.join(root, 'reports', 'marian-feast-references-migration.json'),
  serviceAccount: path.join(root, 'patchs', 'serviceAccountKey.json'),
  apply: false,
};

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') options.apply = true;
    else if (argument === '--snapshot') options.snapshot = path.resolve(argv[++index]);
    else if (argument === '--generated') options.generated = path.resolve(argv[++index]);
    else if (argument === '--report') options.report = path.resolve(argv[++index]);
    else if (argument === '--service-account') options.serviceAccount = path.resolve(argv[++index]);
    else if (argument === '--help' || argument === '-h') {
      console.log('Usage: node scripts/migrate-marian-feast-references.mjs [--snapshot DIR] [--generated DIR] [--report FILE] [--apply] [--service-account FILE]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function isReference(value) {
  if (!Array.isArray(value) || value.length !== 1 || typeof value[0] !== 'string') return false;
  const instruction = value[0].trim().replace(/\s+/g, ' ').toLocaleLowerCase('be');
  return instruction === 'з нядзелі і тыдня'
    || instruction === 'з бягучага дня'
    || instruction === 'ты гонар з нешпараў'
    || /^(?:просьбы )?з агульных тэкстаў пра найсв\. панну марыю$/.test(instruction);
}

export async function buildPlan(snapshot, generatedDirectory) {
  const documents = await snapshot.collection('fixedDays');
  if (!documents) throw new Error('The local snapshot has no fixedDays collection');
  const marian = documents.filter((document) => document._templates?.includes('blessed-virgin-mary'));
  const changes = [];
  for (const document of marian) {
    const references = Object.entries(document).filter(([, value]) => isReference(value));
    if (!references.length) continue;
    const generated = JSON.parse(await fs.readFile(path.join(generatedDirectory, `${document.id}.json`), 'utf8'));
    if (generated._id !== document.id || !generated._templates?.includes('blessed-virgin-mary')) {
      throw new Error(`Generated feast identity mismatch: ${document.id}`);
    }
    for (const [field, before] of references) {
      const after = generated[field];
      if (typeof after !== 'string' || !after) {
        throw new Error(`Unresolved generated field: ${document.id}.${field}`);
      }
      changes.push({ id: document.id, field, before, after });
    }
  }
  return { scannedDocuments: marian.length, changes };
}

async function applyPlan(changes, serviceAccountPath) {
  const [{ default: admin }, serviceAccountText] = await Promise.all([
    import('firebase-admin'),
    fs.readFile(serviceAccountPath, 'utf8'),
  ]);
  const app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountText)) });
  try {
    const db = app.firestore();
    const ids = [...new Set(changes.map((change) => change.id))].sort();
    const refs = ids.map((id) => db.collection('days').doc(id));
    const current = await db.getAll(...refs);
    const drift = [];
    const pending = [];
    for (const document of current) {
      if (!document.exists) {
        drift.push(`${document.id}: missing`);
        continue;
      }
      for (const change of changes.filter((item) => item.id === document.id)) {
        const value = document.get(change.field);
        if (value === change.after || change.after === 'from-day' && isFromDayReference(value)) continue;
        if (JSON.stringify(value) === JSON.stringify(change.before)) pending.push(change);
        else {
          const preview = typeof value === 'string' ? value.slice(0, 48) : JSON.stringify(value)?.slice(0, 48);
          drift.push(`${document.id}.${change.field}: differs from local snapshot (${preview ?? 'missing'})`);
        }
      }
    }
    if (drift.length) throw new Error(`No writes made; candidate fields changed: ${drift.join(', ')}`);
    if (!pending.length) return { writtenDocuments: 0, verifiedFields: changes.length, alreadyCurrentFields: changes.length };

    const backupDirectory = path.join(root, 'backups', 'firestore-migrations');
    await fs.mkdir(backupDirectory, { recursive: true });
    const backupPath = path.join(backupDirectory, `marian-feast-references-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    await fs.writeFile(backupPath, `${JSON.stringify({
      createdAt: new Date().toISOString(),
      collection: 'days',
      documents: current.map((document) => ({
        id: document.id,
        fields: Object.fromEntries(pending.filter((change) => change.id === document.id)
          .map((change) => [change.field, document.get(change.field)])),
      })),
    }, null, 2)}\n`, 'utf8');

    const batch = db.batch();
    const pendingIds = [...new Set(pending.map((change) => change.id))];
    for (const ref of refs.filter((item) => pendingIds.includes(item.id))) {
      batch.update(ref, Object.fromEntries(pending.filter((change) => change.id === ref.id)
        .map((change) => [change.field, change.after])));
    }
    await batch.commit();
    const verified = await db.getAll(...refs);
    const failures = changes.filter((change) => {
      const value = verified.find((document) => document.id === change.id)?.get(change.field);
      return value !== change.after && !(change.after === 'from-day' && isFromDayReference(value));
    });
    if (failures.length) throw new Error(`Post-write verification failed; backup: ${backupPath}`);
    return {
      writtenDocuments: pendingIds.length,
      writtenFields: pending.length,
      alreadyCurrentFields: changes.length - pending.length,
      verifiedFields: changes.length,
      backupPath,
    };
  } finally {
    await app.delete();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const snapshot = await openFirestoreSnapshot(options.snapshot);
  const plan = await buildPlan(snapshot, options.generated);
  const ids = [...new Set(plan.changes.map((change) => change.id))].sort();
  const report = {
    mode: options.apply ? 'apply' : 'dry-run',
    analysisSource: 'local-firestore-snapshot',
    snapshotVersion: snapshot.manifest.snapshotVersion,
    scannedDocuments: plan.scannedDocuments,
    affectedDocuments: ids,
    affectedFields: plan.changes.map(({ id, field, before, after }) => ({
      id, field, before: before[0], afterType: after === 'from-day' ? 'from-day' : 'html',
    })),
  };
  if (options.apply && plan.changes.length) Object.assign(report, await applyPlan(plan.changes, options.serviceAccount));
  await fs.mkdir(path.dirname(options.report), { recursive: true });
  await fs.writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ reportPath: options.report, ...report }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
