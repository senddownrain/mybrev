#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';
import { RANK_ONLY_FEAST_COMMENTS, isRankOnlyFeastComment } from '../src/utils/feastComment.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const COLLECTIONS = ['days', 'liturgicalProperTexts', 'liturgicalTemplates'];
const DEFAULT_SNAPSHOT_DIR = path.join(ROOT, 'backups', 'firestore-snapshot');
const REPORT_PATH = path.join(ROOT, 'reports', 'feast-comment-rank-cleanup-report.json');
const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'patchs', 'serviceAccountKey.json');
const WRITE_CHUNK_SIZE = 100;

function parseArgs(argv) {
  const options = { apply: false, snapshot: DEFAULT_SNAPSHOT_DIR };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--snapshot') options.snapshot = path.resolve(argv[++index]);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log(`Remove standalone liturgical rank labels in days and proper/template comments.

This script uses the local Firestore snapshot for analysis. It is a dry run by default.

Usage:
  node scripts/remove-rank-feast-comments.mjs
  node scripts/remove-rank-feast-comments.mjs --snapshot backups/firestore-snapshot
  node scripts/remove-rank-feast-comments.mjs --apply
`);
}

function chunks(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => (
    items.slice(index * size, (index + 1) * size)
  ));
}

function candidateFrom(document, collection) {
  const fields = ['feastComment', 'comment'].filter(field => isRankOnlyFeastComment(document[field]));
  if (fields.length === 0) return null;
  return {
    collection,
    id: document.id,
    date: document._date ?? null,
    fields,
    // Compare exact source values again before any production write.
    expected: Object.fromEntries(fields.map(field => [field, document[field]])),
    rank: document.rank ?? document._rank ?? null,
    feastName: document._feastName ?? document.title ?? null,
  };
}

async function loadPlan(snapshotDirectory) {
  const snapshot = await openFirestoreSnapshot(snapshotDirectory);
  const candidates = [];
  const scannedDocuments = {};
  const skippedCollections = [];
  for (const collection of COLLECTIONS) {
    const documents = await snapshot.collection(collection);
    if (!documents) {
      skippedCollections.push(collection);
      continue;
    }
    scannedDocuments[collection] = documents.length;
    for (const document of documents) {
      const candidate = candidateFrom(document, collection);
      if (candidate) candidates.push(candidate);
    }
  }
  if (!Object.hasOwn(scannedDocuments, 'days')) {
    throw new Error(`Snapshot does not contain days: ${snapshot.root}`);
  }
  candidates.sort((a, b) => a.collection.localeCompare(b.collection) || a.id.localeCompare(b.id));
  return {
    analysisSource: 'local-firestore-snapshot',
    snapshot: {
      directory: snapshot.root,
      version: snapshot.manifest.snapshotVersion,
      exportedAt: snapshot.manifest.exportedAt,
    },
    collections: COLLECTIONS,
    scannedDocuments,
    skippedCollections,
    rankComments: RANK_ONLY_FEAST_COMMENTS,
    totalDocuments: Object.values(scannedDocuments).reduce((total, n) => total + n, 0),
    candidateCount: candidates.length,
    fieldsToRemove: candidates.reduce((total, candidate) => total + candidate.fields.length, 0),
    candidates,
  };
}

async function writeReport(report) {
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function applyPlan(plan) {
  if (plan.candidates.length === 0) {
    return { applied: 0, removedFields: 0, verification: 'no matching comments' };
  }

  const [{ default: admin }, serviceAccountJson] = await Promise.all([
    import('firebase-admin'),
    readFile(SERVICE_ACCOUNT_PATH, 'utf8'),
  ]);
  const app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountJson)) });
  try {
    const db = admin.firestore();
    const refs = plan.candidates.map(({ collection, id }) => db.collection(collection).doc(id));
    const current = await db.getAll(...refs);
    const stale = current.flatMap((snapshot, index) => {
      const candidate = plan.candidates[index];
      const data = snapshot.data();
      return snapshot.exists && candidate.fields.every(field => data[field] === candidate.expected[field])
        ? []
        : [`${candidate.collection}/${candidate.id}`];
    });
    if (stale.length) {
      throw new Error(`Live data differs from the snapshot for: ${stale.join(', ')}. No writes were made.`);
    }

    for (const group of chunks(plan.candidates, WRITE_CHUNK_SIZE)) {
      const batch = db.batch();
      for (const candidate of group) {
        const deletions = Object.fromEntries(candidate.fields.map(field => [
          field, admin.firestore.FieldValue.delete(),
        ]));
        batch.update(db.collection(candidate.collection).doc(candidate.id), deletions);
      }
      await batch.commit();
    }
    return {
      applied: plan.candidates.length,
      removedFields: plan.fieldsToRemove,
      verification: 'exact pre-write snapshot match passed',
    };
  } finally {
    await app.delete();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();

  const plan = await loadPlan(options.snapshot);
  if (options.apply && plan.skippedCollections.length) {
    throw new Error(
      `Snapshot is incomplete (${plan.skippedCollections.join(', ')}). No writes were made.`,
    );
  }
  const report = {
    generatedAt: new Date().toISOString(),
    mode: options.apply ? 'apply' : 'dry-run',
    ...plan,
  };
  if (options.apply) Object.assign(report, await applyPlan(plan));
  await writeReport(report);
  console.log(JSON.stringify({
    mode: report.mode,
    candidateCount: report.candidateCount,
    fieldsToRemove: report.fieldsToRemove,
    skippedCollections: report.skippedCollections,
    reportPath: REPORT_PATH,
    ...(options.apply ? { applied: report.applied } : {}),
  }, null, 2));
  if (!options.apply) console.log('Dry run only. Re-run with --apply after review to delete the field in Firestore.');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
