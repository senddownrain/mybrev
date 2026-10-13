/**
 * Guarded write of a prepared wave of `readings` changes (and its rollback).
 *
 * Pure of process state: the Firestore handle and the `admin` namespace are
 * injected, so the guards are tested against a fake (tests/lectionary-apply.test.mjs)
 * and the CLI (resync-readings.mjs) only wires the real ones.
 *
 * Guards, in order:
 *   1. every document of the wave is read first; each must still be exactly
 *      the reviewed «before» (pending) or exactly the reviewed «after» (applied).
 *      Anything else aborts BEFORE the first write (somebody edited it).
 *   2. a wave whose documents are all applied is refused (no re-apply);
 *      a mixed wave (an interrupted run) needs `resume` with the backup of
 *      the first run, which is verified against its own sha256 manifest.
 *   3. a verifiable backup is written BEFORE the first write: document ids,
 *      data (Firestore types encoded), updateTime, sha256 of every file and of the list.
 *   4. a document is written with only the fields that differ
 *      (`update`, never `set`), with an update-time precondition, one at a
 *      time; the first error stops the wave (no further write).
 *   5. every document is read back: it must be exactly the reviewed «after»
 *      and every field outside the update must equal the field read before.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { documentHash, storedDocument } from '../../content/lib/app-content.mjs';
import { stableJson } from './snapshot-docs.mjs';

export const COLLECTION = 'readings';
/** Bookkeeping that the manifest hash ignores; never part of a «changed field». */
export const BOOKKEEPING = new Set(['updatedAt', 'parsedAt', 'importedAt', 'miniSavedAt']);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

// ---- Firestore value encoding (round-trips Timestamps, which JSON.stringify does not)
const isTimestamp = (value) => value && typeof value === 'object' && typeof value.toDate === 'function' && 'seconds' in value && 'nanoseconds' in value;

export function encodeValue(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(encodeValue);
  if (isTimestamp(value)) return { __firestoreType: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (value && typeof value === 'object' && value.__firestoreType) return value;
  if (value && typeof value === 'object' && typeof value.path === 'string' && value.firestore) return { __firestoreType: 'reference', path: value.path };
  if (value instanceof Date) return { __firestoreType: 'date', iso: value.toISOString() };
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]));
  return value;
}

export function decodeValue(value, { Timestamp }) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => decodeValue(item, { Timestamp }));
  if (typeof value === 'object') {
    if (value.__firestoreType === 'timestamp') return new Timestamp(value.seconds, value.nanoseconds);
    if (value.__firestoreType === 'date') return new Date(value.iso);
    if (value.__firestoreType) throw new Error(`cannot restore a Firestore ${value.__firestoreType}`);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeValue(item, { Timestamp })]));
  }
  return value;
}

/** Top-level fields that differ between the reviewed before/after (bookkeeping excluded). */
export function updateFields(before, after) {
  const set = {};
  const remove = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (BOOKKEEPING.has(key)) continue;
    const had = key in before;
    const has = key in after;
    if (had && has && stableJson(before[key]) === stableJson(after[key])) continue;
    if (!has) remove.push(key); else set[key] = after[key];
  }
  return { set, remove };
}

export const hashLive = (id, data) => documentHash(storedDocument(id, data));
const comparable = (data) => stableJson(Object.fromEntries(Object.entries(data).filter(([key]) => !BOOKKEEPING.has(key))));

/** `pending` (= reviewed before), `applied` (= reviewed after) or `diverged`. */
export function stateOf(change, data) {
  const hash = hashLive(change.id, data);
  if (hash === change.beforeHash) return 'pending';
  if (hash === change.afterHash) return 'applied';
  return 'diverged';
}

const stamp = (time) => (time ? { seconds: time.seconds, nanoseconds: time.nanoseconds } : null);

/** Reads every document of the wave and classifies it (read-only). */
export async function readWave({ firestore, changes }) {
  const rows = [];
  for (const change of changes) {
    const snapshot = await firestore.collection(COLLECTION).doc(change.id).get();
    if (!snapshot.exists) { rows.push({ change, snapshot, state: 'missing', data: null }); continue; }
    const data = snapshot.data();
    rows.push({ change, snapshot, data, state: stateOf(change, data) });
  }
  return rows;
}

// ---- backup
export function writeBackup({ dir, rows, meta }) {
  fs.mkdirSync(dir, { recursive: true });
  const documents = rows.map(({ change, snapshot, data }) => {
    const body = `${JSON.stringify({ id: change.id, exists: true, updateTime: stamp(snapshot.updateTime), data: encodeValue(data) }, null, 1)}\n`;
    const file = `${change.id}.json`;
    fs.writeFileSync(path.join(dir, file), body);
    return { id: change.id, file, bytes: Buffer.byteLength(body), sha256: sha256(body), updateTime: stamp(snapshot.updateTime), beforeHash: change.beforeHash, afterHash: change.afterHash };
  });
  const manifest = { kind: 'readings-apply-backup', schema: 1, createdAt: new Date().toISOString(), collection: COLLECTION, ...meta, count: documents.length, documents, listSha256: sha256(JSON.stringify(documents)) };
  fs.writeFileSync(path.join(dir, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  return manifest;
}

/** Every file of the backup against its sha256, and the stored data against its reviewed before-hash. */
export function verifyBackup(dir, { decode = (value) => value } = {}) {
  const problems = [];
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'MANIFEST.json'), 'utf8'));
  if (manifest.listSha256 !== sha256(JSON.stringify(manifest.documents))) problems.push('the document list does not match its sha256');
  const docs = [];
  for (const entry of manifest.documents) {
    const body = fs.readFileSync(path.join(dir, entry.file), 'utf8');
    if (sha256(body) !== entry.sha256) { problems.push(`${entry.id}: file sha256 differs`); continue; }
    const parsed = JSON.parse(body);
    if (hashLive(entry.id, decode(parsed.data)) !== entry.beforeHash) problems.push(`${entry.id}: backed-up data does not hash to the reviewed before-hash`);
    docs.push({ ...entry, data: parsed.data });
  }
  if (manifest.count !== manifest.documents.length) problems.push('count mismatch');
  return { ok: !problems.length, problems, manifest, docs };
}

// ---- apply
const log = (dir, entry) => fs.appendFileSync(path.join(dir, 'apply-log.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);

/**
 * @param {object} options
 * @param {object} options.firestore   Firestore handle
 * @param {object} options.admin       firebase-admin namespace (FieldValue)
 * @param {object[]} options.changes   the reviewed changes of ONE wave ({id, before, after, beforeHash, afterHash})
 * @param {string} options.backupDir   where the backup goes (created) — or the verified backup of the first run when `resume`
 * @param {boolean} [options.resume]
 * @param {object} [options.meta]      recorded in the backup manifest
 * @param {boolean} [options.dryRun]   classify and report only
 */
export async function applyWave({ firestore, admin, changes, backupDir, resume = false, meta = {}, dryRun = false }) {
  const rows = await readWave({ firestore, changes });
  const states = rows.reduce((acc, row) => ({ ...acc, [row.state]: (acc[row.state] || 0) + 1 }), {});
  const bad = rows.filter((row) => row.state === 'missing' || row.state === 'diverged');
  if (bad.length) throw new Error(`Refusing to write: ${bad.length} document(s) are not in the reviewed state (${bad.slice(0, 8).map((row) => `${row.change.id}: ${row.state}`).join(', ')}). Take a fresh snapshot and review again.`);
  if (rows.every((row) => row.state === 'applied')) throw new Error('This wave is already applied (every document equals the reviewed after-state); refusing to re-apply.');
  const pending = rows.filter((row) => row.state === 'pending');
  if (pending.length !== rows.length && !resume) throw new Error(`${rows.length - pending.length} of ${rows.length} documents are already applied: an interrupted run. Resume with the backup of that run (--resume <backup dir>).`);
  if (resume && pending.length === rows.length) throw new Error('--resume given but nothing of the wave is applied yet; run without --resume.');
  if (dryRun) return { dryRun: true, states, documents: rows.length, pending: pending.length };

  let manifest;
  if (resume) {
    const check = verifyBackup(backupDir);
    if (!check.ok) throw new Error(`The resume backup is not intact: ${check.problems.join('; ')}`);
    const ids = new Set(check.manifest.documents.map((entry) => entry.id));
    const missing = rows.filter((row) => !ids.has(row.change.id));
    if (missing.length) throw new Error(`The resume backup does not cover ${missing.length} document(s): ${missing.slice(0, 5).map((row) => row.change.id).join(', ')}`);
    manifest = check.manifest;
  } else {
    if (fs.existsSync(path.join(backupDir, 'MANIFEST.json'))) throw new Error(`${backupDir} already holds a backup; refusing to overwrite it.`);
    manifest = writeBackup({ dir: backupDir, rows, meta });
    const check = verifyBackup(backupDir);
    if (!check.ok) throw new Error(`The backup just written does not verify: ${check.problems.join('; ')}`);
  }
  log(backupDir, { event: resume ? 'resume' : 'start', documents: rows.length, pending: pending.length, ...meta });

  const written = [];
  for (const row of pending) {
    const { change, snapshot } = row;
    const { set, remove } = updateFields(change.before, change.after);
    if (!Object.keys(set).length && !remove.length) { log(backupDir, { event: 'noop', id: change.id }); continue; }
    const payload = { ...set, ...Object.fromEntries(remove.map((key) => [key, admin.firestore.FieldValue.delete()])), updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    try {
      await firestore.collection(COLLECTION).doc(change.id).update(payload, { lastUpdateTime: snapshot.updateTime });
    } catch (error) {
      log(backupDir, { event: 'error', id: change.id, message: String(error.message || error) });
      throw new Error(`Write of ${change.id} failed (${error.message || error}); the wave is STOPPED after ${written.length} written document(s). Analyse before resuming (--resume ${backupDir}).`);
    }
    written.push(change.id);
    log(backupDir, { event: 'written', id: change.id, fields: [...Object.keys(set), ...remove.map((key) => `-${key}`)] });
  }

  // read back everything
  const after = await readWave({ firestore, changes });
  const failures = [];
  const readback = [];
  for (const row of after) {
    const reference = rows.find((item) => item.change.id === row.change.id);
    const { set, remove } = updateFields(row.change.before, row.change.after);
    if (row.state !== 'applied') { failures.push(`${row.change.id}: ${row.state} after the write`); continue; }
    // nothing outside the planned fields may have moved
    const touched = new Set([...Object.keys(set), ...remove, ...BOOKKEEPING]);
    const untouchedBefore = comparable(Object.fromEntries(Object.entries(reference.data).filter(([key]) => !touched.has(key))));
    const untouchedAfter = comparable(Object.fromEntries(Object.entries(row.data).filter(([key]) => !touched.has(key))));
    if (untouchedBefore !== untouchedAfter) failures.push(`${row.change.id}: a field outside the plan changed`);
    readback.push({ id: row.change.id, updateTime: stamp(row.snapshot.updateTime), hash: hashLive(row.change.id, row.data) });
  }
  fs.writeFileSync(path.join(backupDir, 'AFTER.json'), `${JSON.stringify({ readAt: new Date().toISOString(), documents: readback }, null, 1)}\n`);
  log(backupDir, { event: failures.length ? 'verify-failed' : 'verified', written: written.length, failures });
  if (failures.length) throw new Error(`Verification failed: ${failures.join('; ')}`);
  return { dryRun: false, states, documents: rows.length, written: written.length, backupDir, manifest: { count: manifest.count, listSha256: manifest.listSha256 } };
}

/** Restores the backed-up documents (exact original data, Firestore types included). */
export async function rollbackWave({ firestore, admin, backupDir, apply = false }) {
  const Timestamp = admin.firestore.Timestamp;
  const check = verifyBackup(backupDir, { decode: (data) => data });
  if (!check.ok) throw new Error(`The backup is not intact: ${check.problems.join('; ')}`);
  const plan = [];
  for (const entry of check.docs) {
    const snapshot = await firestore.collection(COLLECTION).doc(entry.id).get();
    if (!snapshot.exists) throw new Error(`${entry.id} no longer exists; refusing an automatic restore.`);
    const hash = hashLive(entry.id, snapshot.data());
    const state = hash === entry.afterHash ? 'restore' : hash === entry.beforeHash ? 'already-original' : 'diverged';
    plan.push({ entry, snapshot, state });
  }
  const diverged = plan.filter((row) => row.state === 'diverged');
  if (diverged.length) throw new Error(`Refusing to restore: ${diverged.length} document(s) were edited after the wave (${diverged.slice(0, 8).map((row) => row.entry.id).join(', ')}).`);
  const summary = { documents: plan.length, toRestore: plan.filter((row) => row.state === 'restore').length, alreadyOriginal: plan.filter((row) => row.state === 'already-original').length };
  if (!apply) return { dryRun: true, ...summary };
  for (const row of plan.filter((item) => item.state === 'restore')) {
    const ref = firestore.collection(COLLECTION).doc(row.entry.id);
    await firestore.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.updateTime.isEqual(row.snapshot.updateTime)) throw new Error(`${row.entry.id} changed during the restore`);
      tx.set(ref, decodeValue(row.entry.data, { Timestamp }));
    });
    log(backupDir, { event: 'restored', id: row.entry.id });
  }
  for (const row of plan) {
    const live = (await firestore.collection(COLLECTION).doc(row.entry.id).get()).data();
    if (hashLive(row.entry.id, live) !== row.entry.beforeHash) throw new Error(`restore verification failed for ${row.entry.id}`);
  }
  return { dryRun: false, ...summary };
}
