#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const COLLECTION = 'fixedDays';
const DEFAULT_SNAPSHOT_DIR = path.join(ROOT, 'backups', 'firestore-snapshot');
const DEFAULT_REPORT_PATH = path.join(ROOT, 'reports', 'psalm-cadence-breaks-cleanup-report.json');
const DEFAULT_SERVICE_ACCOUNT_PATH = path.join(ROOT, 'patchs', 'serviceAccountKey.json');
const BACKUP_DIR = path.join(ROOT, 'backups', 'firestore-migrations');
const READ_CHUNK_SIZE = 100;
const WRITE_CHUNK_SIZE = 400;
const PSALM_FIELD_PATTERN = /Ps[123]$/u;
const DAGGER_BREAK_PATTERN = /((?:†|&#0*8224;|&#x0*2020;|&dagger;)(?:\s|&nbsp;)*(?:<\/(?:span|font|strong|b|em|i)>\s*)*)(?:<br\s*\/?>\s*)+/giu;

function parseArgs(argv) {
  const options = {
    apply: false,
    snapshot: DEFAULT_SNAPSHOT_DIR,
    report: DEFAULT_REPORT_PATH,
    serviceAccount: DEFAULT_SERVICE_ACCOUNT_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') options.apply = true;
    else if (argument === '--snapshot') options.snapshot = path.resolve(argv[++index]);
    else if (argument.startsWith('--snapshot=')) options.snapshot = path.resolve(argument.slice(11));
    else if (argument === '--report') options.report = path.resolve(argv[++index]);
    else if (argument.startsWith('--report=')) options.report = path.resolve(argument.slice(9));
    else if (argument === '--service-account') options.serviceAccount = path.resolve(argv[++index]);
    else if (argument.startsWith('--service-account=')) options.serviceAccount = path.resolve(argument.slice(18));
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function printHelp() {
  console.log(`Remove legacy HTML line breaks after dagger signs in psalm fields.

Dry-run uses only the local Firestore snapshot. Firestore is contacted only
with --apply, which reads only candidate documents and updates only fields
that still contain matching breaks.

Usage:
  npm run db:cleanup-psalm-breaks
  npm run db:cleanup-psalm-breaks -- --snapshot <directory>
  npm run db:cleanup-psalm-breaks -- --apply

Options:
  --snapshot <dir>          Local snapshot directory
  --report <file>           Report path
  --apply                   Read candidates and write changes to Firestore
  --service-account <file>  Firebase service account used only with --apply`);
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function daggerBreakCount(value) {
  if (typeof value !== 'string') return 0;
  DAGGER_BREAK_PATTERN.lastIndex = 0;
  return [...value.matchAll(DAGGER_BREAK_PATTERN)].length;
}

export function cleanupPsalmField(value) {
  const removedBreaks = daggerBreakCount(value);
  if (!removedBreaks) return { value, removedBreaks: 0 };
  return { value: value.replace(DAGGER_BREAK_PATTERN, '$1 '), removedBreaks };
}

export function buildPsalmBreakCleanupPlan(documents) {
  const documentsWithChanges = [];

  for (const document of documents) {
    const fields = [];
    for (const [field, value] of Object.entries(document)) {
      if (!PSALM_FIELD_PATTERN.test(field)) continue;
      const cleaned = cleanupPsalmField(value);
      if (!cleaned.removedBreaks) continue;
      fields.push({
        field,
        removedBreaks: cleaned.removedBreaks,
        beforeSha256: sha256(value),
        afterSha256: sha256(cleaned.value),
      });
    }
    if (fields.length) documentsWithChanges.push({ id: document.id, fields });
  }

  return documentsWithChanges.sort((left, right) => left.id.localeCompare(right.id));
}

function cleanupLiveDocument(data) {
  const patch = {};
  const fields = [];
  for (const [field, value] of Object.entries(data || {})) {
    if (!PSALM_FIELD_PATTERN.test(field)) continue;
    const cleaned = cleanupPsalmField(value);
    if (!cleaned.removedBreaks) continue;
    patch[field] = cleaned.value;
    fields.push({ field, removedBreaks: cleaned.removedBreaks, before: value });
  }
  return { patch, fields };
}

async function getCandidateSnapshots(db, ids) {
  const snapshots = [];
  for (const group of chunks(ids, READ_CHUNK_SIZE)) {
    snapshots.push(...await db.getAll(...group.map((id) => db.collection(COLLECTION).doc(id))));
  }
  return snapshots;
}

async function applyPlan(plan, options) {
  const [{ default: admin }, serviceAccountText] = await Promise.all([
    import('firebase-admin'),
    readFile(options.serviceAccount, 'utf8'),
  ]);
  const app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountText)) });

  try {
    const db = admin.firestore();
    const snapshots = await getCandidateSnapshots(db, plan.map(({ id }) => id));
    const liveChanges = snapshots.flatMap((snapshot) => {
      if (!snapshot.exists) return [];
      const cleaned = cleanupLiveDocument(snapshot.data());
      return cleaned.fields.length ? [{ snapshot, ...cleaned }] : [];
    });

    await mkdir(BACKUP_DIR, { recursive: true });
    const backupPath = path.join(BACKUP_DIR, `psalm-cadence-breaks-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    const backup = liveChanges.map(({ snapshot, fields }) => ({
      id: snapshot.id,
      updateTime: snapshot.updateTime.toDate().toISOString(),
      fields: Object.fromEntries(fields.map(({ field, before }) => [field, before])),
    }));
    await writeFile(backupPath, `${JSON.stringify({
      createdAt: new Date().toISOString(),
      collection: COLLECTION,
      documents: backup,
    }, null, 2)}\n`, 'utf8');

    for (const group of chunks(liveChanges, WRITE_CHUNK_SIZE)) {
      const batch = db.batch();
      for (const { snapshot, patch } of group) {
        batch.update(snapshot.ref, patch, { lastUpdateTime: snapshot.updateTime });
      }
      await batch.commit();
    }

    return {
      candidateReads: snapshots.length,
      writtenDocuments: liveChanges.length,
      writtenFields: liveChanges.reduce((sum, item) => sum + item.fields.length, 0),
      removedBreaks: liveChanges.reduce(
        (sum, item) => sum + item.fields.reduce((fieldSum, field) => fieldSum + field.removedBreaks, 0),
        0,
      ),
      backupPath,
      writePrecondition: 'document updateTime unchanged since candidate read',
    };
  } finally {
    await app.delete();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();

  const snapshot = await openFirestoreSnapshot(options.snapshot);
  const documents = await snapshot.collection(COLLECTION);
  if (!documents) throw new Error(`Snapshot does not contain ${COLLECTION}: ${snapshot.root}`);

  const plan = buildPsalmBreakCleanupPlan(documents);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: options.apply ? 'apply' : 'dry-run',
    analysisSource: 'local-firestore-snapshot',
    snapshot: {
      directory: snapshot.root,
      version: snapshot.manifest.snapshotVersion,
      exportedAt: snapshot.manifest.exportedAt,
    },
    collection: COLLECTION,
    scannedDocuments: documents.length,
    candidateDocuments: plan.length,
    candidateFields: plan.reduce((sum, item) => sum + item.fields.length, 0),
    candidateBreaks: plan.reduce(
      (sum, item) => sum + item.fields.reduce((fieldSum, field) => fieldSum + field.removedBreaks, 0),
      0,
    ),
    plan,
  };

  if (options.apply) Object.assign(report, await applyPlan(plan, options));
  await mkdir(path.dirname(options.report), { recursive: true });
  await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    mode: report.mode,
    reportPath: options.report,
    scannedDocuments: report.scannedDocuments,
    candidateDocuments: report.candidateDocuments,
    candidateFields: report.candidateFields,
    candidateBreaks: report.candidateBreaks,
    ...(options.apply ? {
      candidateReads: report.candidateReads,
      writtenDocuments: report.writtenDocuments,
      writtenFields: report.writtenFields,
      removedBreaks: report.removedBreaks,
      backupPath: report.backupPath,
    } : {}),
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
