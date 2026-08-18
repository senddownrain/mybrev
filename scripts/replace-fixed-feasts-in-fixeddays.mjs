#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const INPUT_DIR = path.join(ROOT, 'patchs', 'db-feasts');
const CACHE_PATH = path.join(ROOT, 'patchs', 'json', 'ranked-fixed-days.json');
const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'patchs', 'serviceAccountKey.json');
const REPORT_PATH = path.join(ROOT, 'reports', 'fixed-feasts-import-report.json');
const BACKUP_DIR = path.join(ROOT, 'reports', 'backups');
const COLLECTION = 'fixedDays';
const WRITE_CHUNK_SIZE = 40;
const APPLY = process.argv.includes('--apply');
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
  const [localDocuments, cachedStaticIds, serviceAccount] = await Promise.all([
    loadLocalDocuments(),
    loadCachedStaticIds(),
    fs.readFile(SERVICE_ACCOUNT_PATH, 'utf8').then(JSON.parse),
  ]);
  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  let report;
  try {
    const db = admin.firestore();
    const collection = db.collection(COLLECTION);
    const beforeSnapshot = await collection.get();
    const beforeById = new Map(beforeSnapshot.docs.map((document) => [document.id, document.data()]));
    const liveRanked = beforeSnapshot.docs.filter((document) => hasField(document.data(), '_rank'));
    const protectedDynamic = liveRanked.filter((document) => hasField(document.data(), '_feast'));
    const liveStaticRanked = liveRanked.filter((document) => !hasField(document.data(), '_feast'));
    const cachedStaticSet = new Set(cachedStaticIds);
    const deleteIds = cachedStaticIds.filter((id) => {
      const data = beforeById.get(id);
      return data && hasField(data, '_rank') && !hasField(data, '_feast');
    });
    const skippedCachedIds = cachedStaticIds.filter((id) => !deleteIds.includes(id));
    const untouchedStaticRankedIds = liveStaticRanked
      .map((document) => document.id)
      .filter((id) => !cachedStaticSet.has(id))
      .sort();
    const targetIds = localDocuments.map(({ id }) => id);
    const targetIdSet = new Set(targetIds);
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

    const protectedBefore = new Map(protectedDynamic.map((document) => [document.id, document.data()]));
    const existingTargetIds = targetIds.filter((id) => beforeById.has(id));
    const plan = {
      mode: APPLY ? 'apply' : 'dry-run',
      collection: COLLECTION,
      documentsBefore: beforeSnapshot.size,
      localDocuments: localDocuments.length,
      localBytes: localDocuments.reduce((total, document) => total + document.bytes, 0),
      cachedStaticIds: cachedStaticIds.length,
      deleteIds,
      skippedCachedIds,
      protectedDynamicIds: [...protectedBefore.keys()].sort(),
      untouchedStaticRankedIds,
      existingTargetIds,
      writeChunks: chunks(localDocuments, WRITE_CHUNK_SIZE).length,
    };

    if (!APPLY) {
      report = { generatedAt: new Date().toISOString(), ...plan };
      await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      console.log(JSON.stringify({ reportPath: REPORT_PATH, ...report }, null, 2));
      return;
    }

    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const backupPath = path.join(BACKUP_DIR, backupName());
    const backupIds = [...new Set([...deleteIds, ...existingTargetIds, ...protectedBefore.keys()])].sort();
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

    await writeLocalDocuments(db, localDocuments);

    const [deletedAfter, targetsAfter, protectedAfter] = await Promise.all([
      getSnapshots(db, deleteIds),
      getSnapshots(db, targetIds),
      getSnapshots(db, [...protectedBefore.keys()]),
    ]);
    const deleteFailures = deletedAfter.filter((snapshot) => snapshot.exists).map((snapshot) => snapshot.id);
    const targetFailures = targetsAfter.flatMap((snapshot, index) => {
      const expected = localDocuments[index];
      return snapshot.exists && equal(snapshot.data(), expected.payload) ? [] : [expected.id];
    });
    const dynamicChanges = protectedAfter.flatMap((snapshot) => {
      const expected = protectedBefore.get(snapshot.id);
      return snapshot.exists && equal(snapshot.data(), expected) ? [] : [snapshot.id];
    });
    if (deleteFailures.length || targetFailures.length || dynamicChanges.length) {
      throw new Error(`Post-write verification failed; backup: ${backupPath}; `
        + `deleteFailures=${deleteFailures.join(',')}; targetFailures=${targetFailures.join(',')}; `
        + `dynamicChanges=${dynamicChanges.join(',')}`);
    }

    report = {
      generatedAt: new Date().toISOString(),
      ...plan,
      backupPath,
      deletedDocuments: deleteIds.length,
      writtenDocuments: localDocuments.length,
      verifiedProtectedDynamicDocuments: protectedAfter.length,
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
