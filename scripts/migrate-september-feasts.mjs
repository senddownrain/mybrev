#!/usr/bin/env node

// Plan from the local snapshot; read and write only the two target days on --apply.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ids = ['29-09-archangels-michael-gabriel-raphael', '30-09-sv-jerome'];
const options = {
  snapshot: path.join(root, 'backups', 'firestore-snapshot'),
  generated: path.join(root, 'patchs', 'db-feasts'),
  report: path.join(root, 'reports', 'september-feasts-migration.json'),
  serviceAccount: path.join(root, 'patchs', 'serviceAccountKey.json'),
  apply: false,
};
for (let i = 2; i < process.argv.length; i += 1) {
  const flag = process.argv[i];
  if (flag === '--apply') options.apply = true;
  else if (flag === '--snapshot') options.snapshot = path.resolve(process.argv[++i]);
  else if (flag === '--generated') options.generated = path.resolve(process.argv[++i]);
  else if (flag === '--report') options.report = path.resolve(process.argv[++i]);
  else if (flag === '--service-account') options.serviceAccount = path.resolve(process.argv[++i]);
  else throw new Error(`Unknown argument: ${flag}`);
}

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const snapshot = await openFirestoreSnapshot(options.snapshot);
const plan = [];
for (const id of ids) {
  const before = await snapshot.document('fixedDays', id);
  if (!before) throw new Error(`Missing local snapshot document: fixedDays/${id}`);
  const after = JSON.parse(await fs.readFile(path.join(options.generated, `${id}.json`), 'utf8'));
  if (after._id !== id || after._date !== before._date || after._rank !== before._rank) {
    throw new Error(`Generated document identity mismatch: ${id}`);
  }
  const changes = Object.entries(after)
    .filter(([field, value]) => !field.startsWith('_') && !equal(value, before[field]))
    .map(([field, value]) => ({ field, before: before[field], after: value, delete: false }));
  if (id === '30-09-sv-jerome') {
    for (const field of Object.keys(before).filter((key) => key.startsWith('vesper1') && !Object.hasOwn(after, key))) {
      changes.push({ field, before: before[field], delete: true });
    }
  }
  plan.push({ id, changes });
}

const report = {
  mode: options.apply ? 'apply' : 'dry-run',
  analysisSource: 'local-firestore-snapshot',
  snapshotVersion: snapshot.manifest.snapshotVersion,
  targetCollection: 'days',
  documents: plan.map(({ id, changes }) => ({ id, changedFields: changes.map((item) => item.field) })),
};

if (options.apply) {
  const [{ default: admin }, serviceAccountText] = await Promise.all([
    import('firebase-admin'),
    fs.readFile(options.serviceAccount, 'utf8'),
  ]);
  const app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountText)) });
  try {
    const db = app.firestore();
    const refs = ids.map((id) => db.collection('days').doc(id));
    const current = await db.getAll(...refs);
    const drift = [];
    const pending = [];
    for (const document of current) {
      const planned = plan.find((item) => item.id === document.id);
      if (!document.exists) {
        drift.push(`${document.id}: document missing`);
        continue;
      }
      for (const change of planned.changes) {
        const live = document.get(change.field);
        if (change.delete ? live === undefined : equal(live, change.after)) continue;
        if (!equal(live, change.before)) drift.push(`${document.id}.${change.field}: differs from local snapshot`);
        else pending.push({ id: document.id, ...change });
      }
    }
    if (drift.length) throw new Error(`No writes made; live values require review: ${drift.join(', ')}`);

    if (pending.length) {
      const backupDirectory = path.join(root, 'backups', 'firestore-migrations');
      await fs.mkdir(backupDirectory, { recursive: true });
      const backupPath = path.join(backupDirectory, `september-feasts-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      await fs.writeFile(backupPath, `${JSON.stringify({
        createdAt: new Date().toISOString(),
        collection: 'days',
        documents: current.map((document) => ({ id: document.id, data: document.data() })),
      }, null, 2)}\n`);
      const batch = db.batch();
      for (const ref of refs) {
        const fields = pending.filter((item) => item.id === ref.id);
        if (fields.length) batch.update(ref, Object.fromEntries(fields.map(({ field, after, delete: remove }) =>
          [field, remove ? admin.firestore.FieldValue.delete() : after])));
      }
      await batch.commit();
      report.backupPath = backupPath;
    }
    const verified = await db.getAll(...refs);
    const failures = plan.flatMap(({ id, changes }) => changes.filter(({ field, after, delete: remove }) => {
      const value = verified.find((document) => document.id === id)?.get(field);
      return remove ? value !== undefined : !equal(value, after);
    }).map(({ field }) => `${id}.${field}`));
    if (failures.length) throw new Error(`Post-write verification failed: ${failures.join(', ')}`);
    report.writtenDocuments = new Set(pending.map((item) => item.id)).size;
    report.writtenFields = pending.length;
    report.verifiedFields = plan.reduce((sum, item) => sum + item.changes.length, 0);
  } finally {
    await app.delete();
  }
}

await fs.mkdir(path.dirname(options.report), { recursive: true });
await fs.writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ reportPath: options.report, ...report }, null, 2));
