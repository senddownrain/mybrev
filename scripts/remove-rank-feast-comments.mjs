#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const COLLECTION = 'fixedDays';
const DEFAULT_SNAPSHOT_DIR = path.join(ROOT, 'backups', 'firestore-snapshot');
const REPORT_PATH = path.join(ROOT, 'reports', 'feast-comment-rank-cleanup-report.json');
const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'patchs', 'serviceAccountKey.json');
const WRITE_CHUNK_SIZE = 100;

// These are standalone labels for a liturgical rank, not descriptive comments.
const RANK_COMMENTS = new Set(['Урачыстасць', 'Свята', 'Успамін']);

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
  console.log(`Remove standalone rank labels accidentally stored in fixedDays.feastComment.

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

function comment(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function candidateFrom(document) {
  const feastComment = comment(document.feastComment);
  if (!RANK_COMMENTS.has(feastComment)) return null;
  return {
    id: document.id,
    date: document._date ?? null,
    feastComment,
    rank: document.rank ?? null,
    internalRank: document._rank ?? null,
    feastName: document._feastName ?? document.title ?? null,
  };
}

async function loadPlan(snapshotDirectory) {
  const snapshot = await openFirestoreSnapshot(snapshotDirectory);
  const documents = await snapshot.collection(COLLECTION);
  if (!documents) throw new Error(`Snapshot does not contain ${COLLECTION}: ${snapshot.root}`);

  const candidates = documents.map(candidateFrom).filter(Boolean)
    .sort((left, right) => left.id.localeCompare(right.id));
  return {
    analysisSource: 'local-firestore-snapshot',
    snapshot: {
      directory: snapshot.root,
      version: snapshot.manifest.snapshotVersion,
      exportedAt: snapshot.manifest.exportedAt,
    },
    collection: COLLECTION,
    rankComments: [...RANK_COMMENTS],
    totalDocuments: documents.length,
    candidateCount: candidates.length,
    candidates,
  };
}

async function writeReport(report) {
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function applyPlan(plan) {
  const [{ default: admin }, serviceAccountJson] = await Promise.all([
    import('firebase-admin'),
    readFile(SERVICE_ACCOUNT_PATH, 'utf8'),
  ]);
  const app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountJson)) });
  try {
    const db = admin.firestore();
    const refs = plan.candidates.map(({ id }) => db.collection(COLLECTION).doc(id));
    const current = await db.getAll(...refs);
    const stale = current.flatMap((snapshot, index) => {
      const candidate = plan.candidates[index];
      return snapshot.exists && comment(snapshot.data().feastComment) === candidate.feastComment
        ? []
        : [candidate.id];
    });
    if (stale.length) {
      throw new Error(`Live data differs from the snapshot for: ${stale.join(', ')}. No writes were made.`);
    }

    for (const group of chunks(plan.candidates, WRITE_CHUNK_SIZE)) {
      const batch = db.batch();
      for (const candidate of group) {
        batch.update(db.collection(COLLECTION).doc(candidate.id), {
          feastComment: admin.firestore.FieldValue.delete(),
        });
      }
      await batch.commit();
    }
    return { applied: plan.candidates.length, verification: 'pre-write snapshot match passed' };
  } finally {
    await app.delete();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();

  const plan = await loadPlan(options.snapshot);
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
    reportPath: REPORT_PATH,
    ...(options.apply ? { applied: report.applied } : {}),
  }, null, 2));
  if (!options.apply) console.log('Dry run only. Re-run with --apply after review to delete the field in Firestore.');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
