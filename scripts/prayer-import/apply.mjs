#!/usr/bin/env node
// Apply / rollback of an APPROVED canonical plan. Refuses by default; see docs/prayer-import.md.
//   apply:    node scripts/prayer-import/apply.mjs apply --plan <dir> --approve-sha <planSha256> --rights <file.json>
//                    --backup-dir <private dir> --project <id> [--service-account <file>] [--only-sources a,b]
//   rollback: node scripts/prayer-import/apply.mjs rollback --backup <file> --project <id> [--service-account <file>]
// Production needs --i-understand-this-writes-production; the local emulator (FIRESTORE_EMULATOR_HOST, demo-*) does not.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, stableJson } from './lib/corpus.mjs';
import { draftDocument, newDocument, replacementDocument } from './lib/documents.mjs';
import { fingerprintOf } from './lib/plan-canon.mjs';

const CONTROL = 'priestContentControl/state';
const BATCH = 200;
export const isEmulator = () => /^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '');

export function loadApprovedPlan(planDir, approvedSha) {
  const plan = JSON.parse(readFileSync(path.join(planDir, 'planned_operations.json'), 'utf8'));
  const recomputed = sha256(stableJson(plan.operations.map(({ evidence: _evidence, ...op }) => op)));
  if (recomputed !== plan.planSha256) throw new Error('Plan file was modified after the dry-run (hash mismatch).');
  if (approvedSha !== plan.planSha256) throw new Error('Apply refused: --approve-sha does not match the dry-run planSha256.');
  const payloads = {};
  for (const op of plan.operations.filter((item) => item.targetId)) {
    const payload = JSON.parse(readFileSync(path.join(planDir, 'payloads', `${op.targetId}.json`), 'utf8'));
    const text = payload.data.text;
    if (createHash('sha256').update(text).digest('hex') !== op.textSha256) throw new Error(`Payload does not match the plan: ${op.targetId}`);
    payloads[op.targetId] = payload;
  }
  return { plan, payloads };
}

/** Operations that may be written now, with the reason for every skipped one. */
export function selectOperations(plan, rights, onlySources) {
  const run = []; const skipped = [];
  for (const op of plan.operations) {
    if (!op.targetId) continue;
    if (onlySources && !onlySources.includes(op.sourceId)) { skipped.push({ op, why: 'source not selected' }); continue; }
    if (plan.draftsOnly && op.targetCollection !== 'prayerDrafts') { skipped.push({ op, why: 'drafts-only plan' }); continue; }
    if (op.targetCollection === 'prayers' && !rights?.[op.sourceId]?.confirmedBy) { skipped.push({ op, why: 'digital publication rights not confirmed for this source' }); continue; }
    run.push(op);
  }
  return { run, skipped };
}

export async function applyCanonPlan({ db, FieldValue, planDir, approvedSha, rights, onlySources, backupDir, log = console.log, stopAfterBatch = null }) {
  const { plan, payloads } = loadApprovedPlan(planDir, approvedSha);
  const { run, skipped } = selectOperations(plan, rights, onlySources);
  if (!run.length) throw new Error('Nothing to apply: no operation passes the rights/source gate.');
  const control = db.doc(CONTROL);
  const [prayers, protectedPrayers, drafts] = await Promise.all(['prayers', 'priestProtectedPrayers', 'prayerDrafts'].map((name) => db.collection(name).get()));
  const live = new Map([...prayers.docs, ...protectedPrayers.docs].map((d) => [d.id, { ...d.data(), id: d.id, _collection: d.ref.parent.id }]));
  const liveDrafts = new Map(drafts.docs.map((d) => [d.id, d.data()]));
  const writes = []; const noop = []; const conflicts = [];
  for (const op of run) {
    const payload = payloads[op.targetId];
    if (op.targetCollection === 'prayerDrafts') {
      const existing = liveDrafts.get(op.targetId);
      if (existing) { (existing.fingerprint === payload.data.fingerprint ? noop : conflicts).push(op); continue; }
      writes.push({ op, collection: 'prayerDrafts', id: op.targetId, data: { ...draftDocument(payload, { rightsStatus: rights?.[op.sourceId]?.confirmedBy ? 'confirmed' : 'unconfirmed', createdBy: `import:${plan.batch}` }), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, before: null });
    } else if (op.action === 'REPLACE_KEEP_ID') {
      const old = live.get(op.targetId);
      if (!old) { conflicts.push(op); continue; }
      if (old.sourceEntryId === op.sourceEntryId && sha256(old.text || '') === op.textSha256) { noop.push(op); continue; }
      if (fingerprintOf(old) !== op.oldFingerprint) { conflicts.push(op); continue; } // live changed since the dry-run
      writes.push({ op, collection: old._collection, id: op.targetId, data: { ...replacementDocument(old, payload), updatedAt: FieldValue.serverTimestamp() }, before: old });
    } else {
      const existing = live.get(op.targetId);
      if (existing) { (existing.sourceEntryId === op.sourceEntryId && sha256(existing.text || '') === op.textSha256 ? noop : conflicts).push(op); continue; }
      writes.push({ op, collection: 'prayers', id: op.targetId, data: { ...newDocument(payload), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, before: null });
    }
  }
  if (conflicts.length) throw new Error(`Live content differs from the approved dry-run for ${conflicts.length} operation(s) (e.g. ${conflicts[0].targetId}). Nothing was written; re-run backup and dry-run.`);
  log(`Plan ${plan.planSha256.slice(0, 12)}: ${writes.length} writes, ${noop.length} already applied, ${skipped.length} skipped by gate.`);
  const state = (await control.get()).data() || {};
  // A lock left by an interrupted run of THIS plan (its private backup is on disk) may be resumed; any other lock blocks.
  const previous = state.lockUid ? findBackup(backupDir, plan.planSha256, state.lockUid) : null;
  if (state.lockUid && !previous) throw new Error('Content is locked by another migration.');
  if (!writes.length && !previous) return { written: 0, noop: noop.length, skipped };
  const nonce = previous?.nonce || randomUUID();
  let backupPath = previous?.path;
  if (!previous) {
    mkdirSync(backupDir, { recursive: true });
    backupPath = path.join(backupDir, `canon-before-${nonce}.json`);
    const serialisable = (value) => JSON.parse(JSON.stringify(value, (_k, v) => (v && typeof v.toDate === 'function' ? { __ts: v.toDate().toISOString() } : v)));
    writeFileSync(backupPath, JSON.stringify({ schemaVersion: 1, planSha256: plan.planSha256, nonce, control: serialisable(state), touched: writes.map((w) => ({ collection: w.collection, id: w.id, before: w.before ? serialisable(w.before) : null })) }), { flag: 'wx' });
    log(`Private backup of every touched document: ${backupPath}`);
    await db.runTransaction(async (tx) => { const current = await tx.get(control); if ((current.data() || {}).lockUid) throw new Error('Concurrent lock.'); tx.set(control, { version: ((current.data() || {}).version || 0) + 1, lockUid: nonce, updatedAt: FieldValue.serverTimestamp() }); });
  } else log(`Resuming interrupted apply (backup ${backupPath}).`);
  try {
    let batchNo = 0;
    for (let i = 0; i < writes.length; i += BATCH) {
      const batch = db.batch();
      for (const w of writes.slice(i, i + BATCH)) batch.set(db.doc(`${w.collection}/${w.id}`), w.data);
      await batch.commit(); batchNo += 1;
      log(`Batch ${batchNo}: ${Math.min(i + BATCH, writes.length)}/${writes.length}`);
      if (stopAfterBatch === batchNo) throw new Error('TEST interruption');
    }
  } catch (error) {
    log(`Interrupted: ${error.message}. The content lock stays; re-run apply (idempotent) or rollback with ${backupPath}.`);
    throw error;
  }
  await db.runTransaction(async (tx) => { const current = await tx.get(control); tx.set(control, { version: current.data().version + 1, lockUid: '', updatedAt: FieldValue.serverTimestamp() }); });
  return { written: writes.length, noop: noop.length, skipped, backupPath };
}

function findBackup(backupDir, planSha256, lockUid) {
  if (!existsSync(backupDir)) return null;
  for (const name of readdirSync(backupDir).filter((file) => file.startsWith('canon-before-'))) {
    const full = path.join(backupDir, name);
    const backup = JSON.parse(readFileSync(full, 'utf8'));
    if (backup.nonce === lockUid && backup.planSha256 === planSha256) return { nonce: backup.nonce, path: full };
  }
  return null;
}

export async function rollbackFromBackup({ db, FieldValue, backupPath, log = console.log }) {
  const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
  const control = db.doc(CONTROL);
  const state = (await control.get()).data() || {};
  if (state.lockUid && state.lockUid !== backup.nonce) throw new Error('Content is locked by a different operation.');
  await db.runTransaction(async (tx) => { const current = await tx.get(control); tx.set(control, { version: ((current.data() || {}).version || 0) + 1, lockUid: backup.nonce, updatedAt: FieldValue.serverTimestamp() }); });
  const revive = (value) => (Array.isArray(value) ? value.map(revive) : value && typeof value === 'object' ? (value.__ts ? new Date(value.__ts) : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v)]))) : value);
  for (let i = 0; i < backup.touched.length; i += BATCH) {
    const batch = db.batch();
    for (const item of backup.touched.slice(i, i + BATCH)) {
      const ref = db.doc(`${item.collection}/${item.id}`);
      if (item.before) { const { id: _id, _collection, ...data } = revive(item.before); batch.set(ref, data); } else batch.delete(ref);
    }
    await batch.commit();
  }
  await db.runTransaction(async (tx) => { const current = await tx.get(control); tx.set(control, { version: current.data().version + 1, lockUid: '', updatedAt: FieldValue.serverTimestamp() }); });
  log(`Restored ${backup.touched.length} documents from ${backupPath}.`);
  return backup.touched.length;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (['--plan', '--approve-sha', '--rights', '--backup-dir', '--backup', '--project', '--service-account', '--only-sources'].includes(arg)) options[arg.slice(2)] = rest[++i];
    else if (arg === '--i-understand-this-writes-production') options.production = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!['apply', 'rollback'].includes(command)) throw new Error('Usage: apply.mjs apply|rollback ... (see docs/prayer-import.md)');
  if (!options.project) throw new Error('--project is required.');
  if (!isEmulator() && !options.production) throw new Error('Refusing to write: not the local emulator. Production needs the owner-approved plan AND --i-understand-this-writes-production.');
  if (isEmulator() && !/^demo-/.test(options.project)) throw new Error('Emulator runs must use a demo-* project.');
  const { default: admin } = await import('firebase-admin');
  const credential = !isEmulator() && options['service-account'] ? admin.credential.cert(JSON.parse(readFileSync(options['service-account'], 'utf8'))) : undefined;
  const app = admin.initializeApp({ projectId: options.project, ...(credential ? { credential } : {}) }, 'prayer-import');
  try {
    const db = admin.firestore(app); const FieldValue = admin.firestore.FieldValue;
    if (command === 'rollback') { await rollbackFromBackup({ db, FieldValue, backupPath: path.resolve(options.backup) }); return; }
    if (!options.plan || !options['approve-sha'] || !options.rights || !options['backup-dir']) throw new Error('apply needs --plan, --approve-sha, --rights, --backup-dir');
    const rights = JSON.parse(readFileSync(options.rights, 'utf8'));
    const result = await applyCanonPlan({ db, FieldValue, planDir: path.resolve(options.plan), approvedSha: options['approve-sha'], rights, onlySources: options['only-sources']?.split(','), backupDir: path.resolve(options['backup-dir']) });
    console.log(JSON.stringify({ written: result.written, alreadyApplied: result.noop, skipped: result.skipped.length }));
    console.log('Next: verify readback, then npm run content:manifest (see AGENTS.md); nothing is published to the apps before that.');
  } finally { await app.delete(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
