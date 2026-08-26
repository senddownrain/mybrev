#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';
import { loadReconstructedDocuments } from './audit-parsed-readings-content-integrity.mjs';

const require = createRequire(import.meta.url);
const serviceAccount = require('../patchs/serviceAccountKey.json');
const APPLY = process.argv.includes('--apply');
const FROM_BACKUPS = process.argv.includes('--from-backups');
const OUTPUT = path.resolve('reports/parsed-readings-cycle-variant-repair-report.json');

const DUPLICATE_PAIRS = [
  ['feast-eastersunday--A', 'holyweek-w1-d7--A'],
  ['feast-eastersunday--B', 'holyweek-w1-d7--B'],
  ['feast-eastersunday--C', 'holyweek-w1-d7--C'],
  ['ordinary-w5-d6', 'easter-w1-d6'],
  ['ordinary-w9-d1', 'ordinary-w9-d1--B'],
];
const ASCENSION_BASE_ID = 'feast-ascension';
const ASCENSION_A_ID = 'feast-ascension--A';
const VIGIL_BASE_ID = 'holyweek-w1-d7--vigil';
const VIGIL_LEGACY_CYCLE_IDS = ['holyweek-w1-d7--A', 'holyweek-w1-d7--B', 'holyweek-w1-d7--C'];
const VIGIL_CANONICAL_CYCLE_IDS = ['holyweek-w1-d7--A-vigil', 'holyweek-w1-d7--B-vigil', 'holyweek-w1-d7--C-vigil'];
const PALM_SOURCE_ID = 'feast-palmsunday';
const PALM_TARGET_ID = 'feast-palmsunday--procession';

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !key.startsWith('_') && !['id', 'parsedAt', 'sectionsFound', 'title', 'year'].includes(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, canonicalValue(item)]));
}

function contentHash(document) {
  return createHash('sha256').update(JSON.stringify(canonicalValue(document))).digest('hex');
}

function bibleFingerprint(document) {
  return Object.entries(document).filter(([key, value]) => /^reading\d+$/.test(key)
    || ['psalm', 'alleluia', 'gospel'].includes(key) && value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${String(value?.bible ?? '').trim()}`)
    .join('|');
}

async function loadDocuments() {
  if (FROM_BACKUPS) return loadReconstructedDocuments();
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const snapshot = await admin.firestore().collection('parsedData').get();
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function main() {
  if (APPLY && FROM_BACKUPS) throw new Error('--apply cannot be combined with --from-backups');
  const documents = await loadDocuments();
  const byId = new Map(documents.map((item) => [item.id, item]));
  const comparisons = DUPLICATE_PAIRS.map(([duplicateId, keeperId]) => {
    const duplicate = byId.get(duplicateId);
    const keeper = byId.get(keeperId);
    return {
      duplicateId,
      keeperId,
      duplicateExists: Boolean(duplicate),
      keeperExists: Boolean(keeper),
      sameContent: Boolean(duplicate && keeper && contentHash(duplicate) === contentHash(keeper)),
      sameBibleReferences: Boolean(duplicate && keeper && bibleFingerprint(duplicate) === bibleFingerprint(keeper)),
      duplicateFingerprint: duplicate ? bibleFingerprint(duplicate) : null,
      keeperFingerprint: keeper ? bibleFingerprint(keeper) : null,
    };
  });
  const safeDuplicates = comparisons.filter((item) => item.duplicateExists && item.keeperExists
    && (item.sameContent || item.sameBibleReferences));
  const unsafeDuplicates = comparisons.filter((item) => item.duplicateExists && !safeDuplicates.includes(item));
  const palmSource = byId.get(PALM_SOURCE_ID);
  const palmTarget = byId.get(PALM_TARGET_ID);
  const palmMoveSafe = Boolean(palmSource && !palmTarget);
  const palmAlreadyApplied = Boolean(!palmSource && palmTarget);
  const ascensionBase = byId.get(ASCENSION_BASE_ID);
  const ascensionA = byId.get(ASCENSION_A_ID);
  const ascensionMergeSafe = Boolean(ascensionBase && ascensionA);
  const ascensionAlreadyApplied = Boolean(!ascensionBase && ascensionA);
  const vigilBase = byId.get(VIGIL_BASE_ID);
  const vigilTargets = VIGIL_LEGACY_CYCLE_IDS.map((id) => byId.get(id));
  const canonicalVigilTargets = VIGIL_CANONICAL_CYCLE_IDS.map((id) => byId.get(id));
  const vigilMergeSafe = Boolean(vigilBase && vigilTargets.every(Boolean));
  const vigilAlreadyApplied = Boolean(!vigilBase && canonicalVigilTargets.every(Boolean));

  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'apply' : FROM_BACKUPS ? 'local-reconstructed-dry-run' : 'production-dry-run',
    counts: {
      documents: documents.length,
      duplicatePairs: comparisons.length,
      safeDuplicateDocumentsToDelete: safeDuplicates.length,
      unsafeDuplicatePairs: unsafeDuplicates.length,
      palmProcessionMovePlanned: Number(palmMoveSafe),
      ascensionBaseMergePlanned: Number(ascensionMergeSafe),
      vigilCycleMergesPlanned: vigilMergeSafe ? VIGIL_LEGACY_CYCLE_IDS.length : 0,
      appliedDeletes: 0,
      appliedMoves: 0,
      appliedMerges: 0,
    },
    comparisons,
    unsafeDuplicates,
    palmProcession: {
      sourceId: PALM_SOURCE_ID,
      targetId: PALM_TARGET_ID,
      sourceExists: Boolean(palmSource),
      targetExists: Boolean(palmTarget),
      safe: palmMoveSafe,
      alreadyApplied: palmAlreadyApplied,
    },
    ascensionMerge: {
      sourceId: ASCENSION_BASE_ID,
      targetId: ASCENSION_A_ID,
      safe: ascensionMergeSafe,
      alreadyApplied: ascensionAlreadyApplied,
    },
    vigilMerge: {
      sourceId: VIGIL_BASE_ID,
      targetIds: vigilAlreadyApplied ? VIGIL_CANONICAL_CYCLE_IDS : VIGIL_LEGACY_CYCLE_IDS,
      safe: vigilMergeSafe,
      alreadyApplied: vigilAlreadyApplied,
    },
  };

  if (APPLY) {
    if (unsafeDuplicates.length
      || (!palmMoveSafe && !palmAlreadyApplied)
      || (!ascensionMergeSafe && !ascensionAlreadyApplied)
      || (!vigilMergeSafe && !vigilAlreadyApplied)) {
      throw new Error('Cycle-variant preflight failed; no writes were performed');
    }
    const affectedIds = [...new Set([
      ...safeDuplicates.flatMap((item) => [item.duplicateId, item.keeperId]),
      PALM_SOURCE_ID,
      ASCENSION_BASE_ID,
      ASCENSION_A_ID,
      VIGIL_BASE_ID,
      ...VIGIL_LEGACY_CYCLE_IDS,
      ...VIGIL_CANONICAL_CYCLE_IDS,
    ])];
    const backupPath = path.resolve('reports/backups', `parsedData-before-cycle-variant-repair-${timestamp()}.json`);
    await mkdir(path.dirname(backupPath), { recursive: true });
    await writeFile(backupPath, `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      collection: 'parsedData',
      documents: affectedIds.map((id) => byId.get(id)).filter(Boolean),
    }, null, 2)}\n`, 'utf8');
    const batch = admin.firestore().batch();
    const collection = admin.firestore().collection('parsedData');
    for (const item of safeDuplicates) batch.delete(collection.doc(item.duplicateId));

    if (ascensionMergeSafe) {
      const ascensionData = structuredClone(ascensionBase);
      delete ascensionData.id;
      ascensionData.year = 'A';
      ascensionData._feast = 'feast-ascension';
      ascensionData._dayId = 'feast-ascension';
      batch.set(collection.doc(ASCENSION_A_ID), ascensionData);
      batch.delete(collection.doc(ASCENSION_BASE_ID));
    }

    if (vigilMergeSafe) {
      for (const [index, targetId] of VIGIL_LEGACY_CYCLE_IDS.entries()) {
        const cycleData = structuredClone(vigilBase);
        delete cycleData.id;
        cycleData.year = ['A', 'B', 'C'][index];
        delete cycleData._variant;
        cycleData._periodType = 'holyweek';
        cycleData._periodWeekNumber = 1;
        cycleData._dayOfWeek = 7;
        cycleData._dayId = 'holyweek-w1-d7';
        cycleData.gospel = structuredClone(vigilTargets[index].gospel);
        batch.set(collection.doc(targetId), cycleData);
      }
      batch.delete(collection.doc(VIGIL_BASE_ID));
    }

    if (palmMoveSafe) {
      const palmData = structuredClone(palmSource);
      delete palmData.id;
      palmData._variant = 'procession';
      batch.create(collection.doc(PALM_TARGET_ID), palmData);
      batch.delete(collection.doc(PALM_SOURCE_ID));
    }
    await batch.commit();
    report.counts.appliedDeletes = safeDuplicates.length;
    report.counts.appliedMoves = Number(palmMoveSafe);
    report.counts.appliedMerges = Number(ascensionMergeSafe) + (vigilMergeSafe ? 3 : 0);
    report.backupPath = backupPath;
  }

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report.counts, null, 2));
  console.log(`Wrote ${OUTPUT}`);
  if (!FROM_BACKUPS) await admin.app().delete();
}

main().catch((error) => {
  console.error('parsedData cycle-variant repair failed:', error);
  process.exitCode = 1;
});
