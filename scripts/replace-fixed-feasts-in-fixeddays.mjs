#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const INPUT_DIR = path.join(ROOT, 'patchs', 'db-feasts');
const CACHE_PATH = path.join(ROOT, 'patchs', 'json', 'ranked-fixed-days.json');
const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'patchs', 'serviceAccountKey.json');
const REPORT_PATH = path.join(ROOT, 'reports', 'fixed-feasts-import-report.json');
const BACKUP_DIR = path.join(ROOT, 'reports', 'backups');
const DEFAULT_SNAPSHOT_DIR = path.join(ROOT, 'backups', 'firestore-snapshot');
const COLLECTION = 'fixedDays';
const WRITE_CHUNK_SIZE = 40;
const APPLY = process.argv.includes('--apply');
const snapshotArgument = process.argv.find((argument) => argument.startsWith('--snapshot='));
const SNAPSHOT_DIR = snapshotArgument
  ? path.resolve(ROOT, snapshotArgument.slice('--snapshot='.length))
  : DEFAULT_SNAPSHOT_DIR;
const VALID_RANKS = new Set(['solemnitas', 'festum', 'memoria', 'memoria-ad-libitum']);

function hasField(value, field) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function equal(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function backupName() {
  return `fixedDays-before-fixed-feasts-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
}

async function loadLocalDocuments() {
  const filenames = (await fs.readdir(INPUT_DIR)).filter((name) => name.endsWith('.json')).sort();
  const documents = [];
  const ids = new Set();
  for (const filename of filenames) {
    const payload = JSON.parse(await fs.readFile(path.join(INPUT_DIR, filename), 'utf8'));
    const id = path.basename(filename, '.json');
    if (payload._id !== id) throw new Error(`${filename}: _id must equal filename`);
    if (id.includes('/')) throw new Error(`${filename}: _id cannot contain /`);
    if (ids.has(id)) throw new Error(`${filename}: duplicate _id ${id}`);
    if (hasField(payload, '_feast')) throw new Error(`${filename}: fixed feast must not contain _feast`);
    if (!VALID_RANKS.has(payload._rank)) throw new Error(`${filename}: invalid _rank ${payload._rank}`);
    if (!/^\d{2}\.\d{2}$/.test(payload._date)) throw new Error(`${filename}: invalid _date ${payload._date}`);
    if (!payload._feastName) throw new Error(`${filename}: missing _feastName`);
    const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    if (bytes >= 1_000_000) throw new Error(`${filename}: document exceeds Firestore 1 MB limit`);
    ids.add(id);
    documents.push({ id, filename, payload, bytes });
  }
  if (!documents.length) throw new Error('No fixed feast JSON files found');
  return documents;
}

async function loadCachedStaticIds() {
  const cache = JSON.parse(await fs.readFile(CACHE_PATH, 'utf8'));
  const documents = Array.isArray(cache) ? cache : cache.documents;
  if (!Array.isArray(documents)) throw new Error('Invalid ranked fixedDays cache');
  return documents
    .filter((document) => hasField(document, '_rank') && !hasField(document, '_feast'))
    .map((document) => document._firestoreId)
    .sort();
}

async function loadSnapshotDocuments() {
  let snapshot;
  try {
    snapshot = await openFirestoreSnapshot(SNAPSHOT_DIR);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Local Firestore snapshot is missing: ${SNAPSHOT_DIR}`);
    }
    throw error;
  }
  const documents = await snapshot.collection(COLLECTION);
  if (!documents) throw new Error(`Snapshot does not contain ${COLLECTION}: ${SNAPSHOT_DIR}`);
  return {
    documents,
    metadata: {
      directory: snapshot.root,
      version: snapshot.manifest.snapshotVersion,
      exportedAt: snapshot.manifest.exportedAt,
    },
  };
}

async function getSnapshots(db, ids) {
  const result = [];
  for (const group of chunks(ids, WRITE_CHUNK_SIZE)) {
    result.push(...await db.getAll(...group.map((id) => db.collection(COLLECTION).doc(id))));
  }
  return result;
}

async function writeLocalDocuments(db, documents) {
  for (const group of chunks(documents, WRITE_CHUNK_SIZE)) {
    const before = await db.getAll(...group.map(({ id }) => db.collection(COLLECTION).doc(id)));
    const protectedConflicts = before
      .filter((snapshot) => snapshot.exists && hasField(snapshot.data(), '_feast'))
      .map((snapshot) => snapshot.id);
    if (protectedConflicts.length) {
      throw new Error(`Refusing to overwrite dynamic _feast documents: ${protectedConflicts.join(', ')}`);
    }
    const batch = db.batch();
    group.forEach(({ id, payload }) => batch.set(db.collection(COLLECTION).doc(id), payload, { merge: false }));
    await batch.commit();
  }
}

async function main() {
  const [localDocuments, cachedStaticIds, snapshotSource] = await Promise.all([
    loadLocalDocuments(),
    loadCachedStaticIds(),
    loadSnapshotDocuments(),
  ]);
  const beforeById = new Map(snapshotSource.documents.map(({ id, ...data }) => [id, data]));
  const ranked = snapshotSource.documents.filter((document) => hasField(document, '_rank'));
  const protectedDynamic = ranked.filter((document) => hasField(document, '_feast'));
  const staticRanked = ranked.filter((document) => !hasField(document, '_feast'));
  const cachedDeleteIds = cachedStaticIds.filter((id) => {
    const data = beforeById.get(id);
    return data && hasField(data, '_rank') && !hasField(data, '_feast');
  });
  const targetIds = localDocuments.map(({ id }) => id);
  const targetIdSet = new Set(targetIds);
  const writeDocuments = localDocuments.filter(({ id, payload }) => (
    !beforeById.has(id) || !equal(beforeById.get(id), payload)
  ));
  const writeIds = writeDocuments.map(({ id }) => id);
  const obsoleteStaticIds = staticRanked
    .map((document) => document.id)
    .filter((id) => !targetIdSet.has(id));
  const deleteIds = [...new Set([...cachedDeleteIds, ...obsoleteStaticIds])].sort();
  const skippedCachedIds = cachedStaticIds.filter((id) => !deleteIds.includes(id));
  const dynamicTargetConflicts = protectedDynamic
    .map((document) => document.id)
    .filter((id) => targetIdSet.has(id));
  if (dynamicTargetConflicts.length) {
    throw new Error(`Local IDs collide with protected dynamic documents: ${dynamicTargetConflicts.join(', ')}`);
  }
  const overlappingDeleteAndTarget = deleteIds.filter((id) => targetIdSet.has(id));
  if (overlappingDeleteAndTarget.length) {
    throw new Error(`Delete IDs unexpectedly overlap target IDs: ${overlappingDeleteAndTarget.join(', ')}`);
  }

  const protectedBefore = new Map(protectedDynamic.map(({ id, ...data }) => [id, data]));
  const existingTargetIds = targetIds.filter((id) => beforeById.has(id));
  const unchangedTargetIds = targetIds.filter((id) => !writeIds.includes(id));
  const plan = {
    mode: APPLY ? 'apply' : 'dry-run',
    analysisSource: 'local-firestore-snapshot',
    snapshot: snapshotSource.metadata,
    collection: COLLECTION,
    documentsBefore: snapshotSource.documents.length,
    localDocuments: localDocuments.length,
    localBytes: localDocuments.reduce((total, document) => total + document.bytes, 0),
    cachedStaticIds: cachedStaticIds.length,
    deleteIds,
    skippedCachedIds,
    protectedDynamicIds: [...protectedBefore.keys()].sort(),
    obsoleteStaticIds,
    existingTargetIds,
    writeIds,
    unchangedTargetIds,
    writeChunks: chunks(writeDocuments, WRITE_CHUNK_SIZE).length,
  };

  if (!APPLY) {
    const report = { generatedAt: new Date().toISOString(), ...plan };
    await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ reportPath: REPORT_PATH, ...report }, null, 2));
    return;
  }

  const serviceAccount = JSON.parse(await fs.readFile(SERVICE_ACCOUNT_PATH, 'utf8'));
  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  let report;
  try {
    const db = admin.firestore();
    const collection = db.collection(COLLECTION);
    const guardedIds = [...new Set([...deleteIds, ...writeIds])].sort();
    const currentSnapshots = await getSnapshots(db, guardedIds);
    const driftedIds = currentSnapshots.flatMap((snapshot) => {
      const expected = beforeById.get(snapshot.id);
      if (!expected) return snapshot.exists ? [snapshot.id] : [];
      return snapshot.exists && equal(snapshot.data(), expected) ? [] : [snapshot.id];
    });
    if (driftedIds.length) {
      throw new Error(`Snapshot is stale for planned migration IDs: ${driftedIds.join(', ')}`);
    }

    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const backupPath = path.join(BACKUP_DIR, backupName());
    const backupIds = [...new Set([
      ...deleteIds,
      ...writeIds.filter((id) => beforeById.has(id)),
    ])].sort();
    await fs.writeFile(backupPath, `${JSON.stringify({
      createdAt: new Date().toISOString(),
      collection: COLLECTION,
      documents: backupIds.map((id) => ({ id, data: beforeById.get(id) })),
    }, null, 2)}\n`, 'utf8');

    await db.runTransaction(async (transaction) => {
      const refs = deleteIds.map((id) => collection.doc(id));
      const snapshots = refs.length ? await transaction.getAll(...refs) : [];
      snapshots.forEach((snapshot) => {
        if (!snapshot.exists) throw new Error(`Delete candidate disappeared: ${snapshot.id}`);
        const data = snapshot.data();
        if (!hasField(data, '_rank') || hasField(data, '_feast')) {
          throw new Error(`Protected or invalid delete candidate: ${snapshot.id}`);
        }
      });
      refs.forEach((ref) => transaction.delete(ref));
    });

    await writeLocalDocuments(db, writeDocuments);

    const [deletedAfter, targetsAfter] = await Promise.all([
      getSnapshots(db, deleteIds),
      getSnapshots(db, writeIds),
    ]);
    const deleteFailures = deletedAfter.filter((snapshot) => snapshot.exists).map((snapshot) => snapshot.id);
    const targetFailures = targetsAfter.flatMap((snapshot, index) => {
      const expected = writeDocuments[index];
      return snapshot.exists && equal(snapshot.data(), expected.payload) ? [] : [expected.id];
    });
    if (deleteFailures.length || targetFailures.length) {
      throw new Error(`Post-write verification failed; backup: ${backupPath}; `
        + `deleteFailures=${deleteFailures.join(',')}; targetFailures=${targetFailures.join(',')}`);
    }

    report = {
      generatedAt: new Date().toISOString(),
      ...plan,
      backupPath,
      deletedDocuments: deleteIds.length,
      writtenDocuments: writeDocuments.length,
      verifiedSnapshotDocumentsBeforeWrite: currentSnapshots.length,
      verification: 'passed',
    };
    await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ reportPath: REPORT_PATH, ...report }, null, 2));
  } finally {
    await app.delete();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
