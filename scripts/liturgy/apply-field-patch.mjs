#!/usr/bin/env node
/**
 * Reviewed field patch (the private patch file is not in git; its SHA-256 is).
 *
 *   --patch f --snapshot dir [--out dir]     offline dry run; --out writes a patched copy. 0 reads, 0 writes.
 *   --patch f --live --service-account k     read-only check: one read per listed document.
 *   --patch f --apply --confirm <sha256 of the patch file> --service-account k --backup dir
 *       one transaction: re-reads the listed documents, writes only the listed fields,
 *       then reads them back. Any conflict aborts everything.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { applyPlan, documentPath, planFieldPatch, valueHash } from './lib/field-patch.mjs';

const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const fail = (message) => { console.error(message); process.exit(1); };

const bytes = fs.readFileSync(arg('--patch') || fail('--patch is required'));
const patch = JSON.parse(bytes);
const sha = createHash('sha256').update(bytes).digest('hex');
const paths = [...new Set(patch.changes.map(documentPath))];
const report = (plan, extra) => console.log(JSON.stringify({
  patchSha256: sha, ...plan.summary, conflicts: plan.conflicts, ...extra,
}, null, 2));

function offline(directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  const files = new Map();
  const documents = new Map();
  for (const name of new Set(patch.changes.map((change) => change.collection))) {
    const descriptor = manifest.collections[name] || fail(`Snapshot has no ${name}`);
    const payload = JSON.parse(fs.readFileSync(path.join(directory, descriptor.file), 'utf8'));
    files.set(name, payload);
    for (const item of payload.documents) documents.set(`${name}/${item.id}`, item.data);
  }
  const plan = planFieldPatch(patch, documents);
  const out = arg('--out');
  if (out && !plan.conflicts.length) {
    applyPlan(plan, documents);
    fs.cpSync(directory, out, { recursive: true });
    for (const [name, payload] of files) {
      payload.documents = payload.documents.map((item) => ({ ...item, data: documents.get(`${name}/${item.id}`) }));
      const text = JSON.stringify(payload);
      const descriptor = manifest.collections[name];
      fs.writeFileSync(path.join(out, descriptor.file), text);
      descriptor.bytes = Buffer.byteLength(text);
      descriptor.sha256 = createHash('sha256').update(text).digest('hex');
    }
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
  }
  report(plan, { mode: 'offline', reads: 0, writes: 0 });
  if (plan.conflicts.length) process.exit(2);
}

async function live() {
  const keyFile = arg('--service-account') || fail('--service-account is required');
  const apply = args.includes('--apply');
  if (apply && arg('--confirm') !== sha) fail(`--confirm must be the patch SHA-256 ${sha}`);
  const backupDir = apply ? (arg('--backup') || fail('--backup is required')) : null;
  const { default: admin } = await import('firebase-admin');
  const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  if (key.project_id !== patch.project) fail(`Wrong project ${key.project_id}`);
  const app = admin.initializeApp({ credential: admin.credential.cert(key) }, 'field-patch');
  const db = app.firestore();
  const refs = paths.map((item) => db.doc(item));
  const read = (snapshots) => new Map(snapshots.map((snap, i) => [paths[i], snap.exists ? snap.data() : undefined]));
  try {
    if (!apply) {
      const plan = planFieldPatch(patch, read(await db.getAll(...refs)));
      report(plan, { mode: 'live check', reads: paths.length, writes: 0 });
      if (plan.conflicts.length) process.exitCode = 2;
      return;
    }
    const plan = await db.runTransaction(async (transaction) => {
      const before = read(await transaction.getAll(...refs));
      const planned = planFieldPatch(patch, before);
      if (planned.conflicts.length) return planned;
      fs.mkdirSync(backupDir, { recursive: true });
      fs.writeFileSync(path.join(backupDir, `before-${sha.slice(0, 12)}-${Date.now()}.json`),
        JSON.stringify(Object.fromEntries(before), null, 1), { mode: 0o600 });
      for (const [item, fields] of planned.updates) {
        const data = Object.fromEntries([...fields].map(([field, value]) => [
          field, value === null ? admin.firestore.FieldValue.delete() : value,
        ]));
        // Clients accept a calendar publication by revision; stamp it like every earlier one.
        if (item === 'liturgicalCalendarMeta/current') data.publishedAt = admin.firestore.FieldValue.serverTimestamp();
        transaction.update(db.doc(item), data);
      }
      return planned;
    });
    if (plan.conflicts.length) {
      report(plan, { mode: 'apply aborted', writes: 0 });
      process.exitCode = 2;
      return;
    }
    const after = read(await db.getAll(...refs));
    const mismatch = patch.changes.filter((change) => valueHash(after.get(documentPath(change))?.[change.field]) !== change.afterSha256);
    report(plan, { mode: 'applied', reads: paths.length * 2, writes: plan.summary.documents, readbackMismatches: mismatch.map(documentPath) });
    if (mismatch.length) process.exitCode = 3;
  } finally {
    await app.delete();
  }
}

if (args.includes('--live') || args.includes('--apply')) await live();
else offline(arg('--snapshot') || fail('--snapshot is required for the offline dry run'));
