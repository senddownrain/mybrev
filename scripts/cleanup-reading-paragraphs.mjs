#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';
import { inspectReadingText } from '../src/utils/readingTextNormalization.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SNAPSHOT = path.join(ROOT, 'backups', 'core-collections-migration');
const DEFAULT_REPORT = path.join(ROOT, 'reports', 'reading-paragraphs-cleanup.json');
const DEFAULT_ACCOUNT = path.join(ROOT, 'patchs', 'serviceAccountKey.json');
const BACKUP_DIR = path.join(ROOT, 'backups', 'firestore-migrations');
const TARGET_COLLECTION = 'readings';
const SECTION_PATTERN = /^reading\d+$/u;

function args(argv) {
  const options = { snapshot: DEFAULT_SNAPSHOT, report: DEFAULT_REPORT, serviceAccount: DEFAULT_ACCOUNT, apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--apply') options.apply = true;
    else if (item === '--snapshot') options.snapshot = path.resolve(argv[++i]);
    else if (item === '--report') options.report = path.resolve(argv[++i]);
    else if (item === '--service-account') options.serviceAccount = path.resolve(argv[++i]);
    else if (item === '--help' || item === '-h') options.help = true;
    else throw new Error(`Unknown option: ${item}`);
  }
  return options;
}

function excerpt(value) {
  return String(value).slice(0, 145).replace(/\r?\n/gu, '↵');
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function buildReadingParagraphPlan(documents) {
  const changes = [];
  const review = [];
  for (const document of documents) {
    for (const sectionName of Object.keys(document).filter((key) => SECTION_PATTERN.test(key) || key === 'gospel')) {
      const before = document[sectionName]?.text;
      const result = inspectReadingText(before);
      if (result.kind === 'unchanged') continue;
      const entry = {
        id: document.id,
        date: document._date ?? null,
        title: document.title ?? null,
        type: sectionName === 'gospel' ? 'gospel' : 'reading',
        section: sectionName,
        lineCount: result.lineCount,
        before: excerpt(before),
        beforeSha256: digest(before),
      };
      if (result.kind === 'change') {
        changes.push({ ...entry, after: excerpt(result.value), afterSha256: digest(result.value) });
      } else {
        review.push({ ...entry, reason: 'Mixed or marked-up paragraphs; no automatic change' });
      }
    }
  }
  return { changes, review };
}

async function applyPlan(plan, sourceDocuments, options, projectId) {
  const [{ default: admin }, accountText] = await Promise.all([
    import('firebase-admin'),
    readFile(options.serviceAccount, 'utf8'),
  ]);
  const account = JSON.parse(accountText);
  if (projectId && account.project_id !== projectId) throw new Error('Snapshot and service account project IDs differ.');
  const app = admin.initializeApp({ credential: admin.credential.cert(account), projectId: account.project_id });
  try {
    const db = admin.firestore(app);
    const sourceById = new Map(sourceDocuments.map((document) => [document.id, document]));
    const ids = [...new Set(plan.changes.map((change) => change.id))];
    const snapshots = [];
    for (let i = 0; i < ids.length; i += 100) {
      snapshots.push(...await db.getAll(...ids.slice(i, i + 100).map((id) => db.collection(TARGET_COLLECTION).doc(id))));
    }

    const skipped = [];
    const alreadyApplied = [];
    const updates = [];
    for (const snapshot of snapshots) {
      const candidateFields = plan.changes.filter((change) => change.id === snapshot.id);
      if (!snapshot.exists) {
        skipped.push({ id: snapshot.id, reason: 'Missing live document' });
        continue;
      }
      const patch = {};
      const previous = {};
      for (const candidate of candidateFields) {
        const source = sourceById.get(snapshot.id)?.[candidate.section]?.text;
        const live = snapshot.get(`${candidate.section}.text`);
        if (live === inspectReadingText(source).value) {
          alreadyApplied.push({ id: snapshot.id, section: candidate.section });
          continue;
        }
        if (live !== source || digest(live) !== candidate.beforeSha256) {
          skipped.push({ id: snapshot.id, section: candidate.section, reason: 'Live text differs from snapshot' });
          continue;
        }
        const result = inspectReadingText(live);
        if (result.kind !== 'change') {
          skipped.push({ id: snapshot.id, section: candidate.section, reason: 'Live text no longer matches rule' });
          continue;
        }
        patch[`${candidate.section}.text`] = result.value;
        previous[candidate.section] = live;
      }
      if (Object.keys(patch).length) updates.push({ snapshot, patch, previous });
    }

    // Save private rollback values before the first write.
    await mkdir(BACKUP_DIR, { recursive: true });
    const backupPath = path.join(BACKUP_DIR, `reading-paragraphs-${new Date().toISOString().replace(/[:.]/gu, '-')}.json`);
    await writeFile(backupPath, `${JSON.stringify({
      createdAt: new Date().toISOString(), collection: TARGET_COLLECTION,
      documents: updates.map(({ snapshot, previous }) => ({
        id: snapshot.id, updateTime: snapshot.updateTime.toDate().toISOString(), fields: previous,
      })),
    }, null, 2)}\n`, 'utf8');

    for (let i = 0; i < updates.length; i += 400) {
      const batch = db.batch();
      for (const { snapshot, patch } of updates.slice(i, i + 400)) {
        batch.update(snapshot.ref, patch, { lastUpdateTime: snapshot.updateTime });
      }
      await batch.commit();
    }
    return { candidateReads: snapshots.length, writtenDocuments: updates.length,
      writtenFields: updates.reduce((count, item) => count + Object.keys(item.patch).length, 0),
      alreadyApplied: alreadyApplied.length, skipped, backupPath };
  } finally {
    await app.delete();
  }
}

async function main() {
  const options = args(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/cleanup-reading-paragraphs.mjs [--snapshot DIR] [--report FILE] [--apply] [--service-account FILE]');
    console.log('Default: local snapshot dry run. --apply reads only candidate IDs and writes matching fields in readings.');
    return;
  }
  const snapshot = await openFirestoreSnapshot(options.snapshot);
  const collection = snapshot.collectionPaths.includes(TARGET_COLLECTION) ? TARGET_COLLECTION : 'parsedData';
  const documents = await snapshot.collection(collection);
  if (!documents) throw new Error(`Snapshot needs readings or parsedData: ${snapshot.root}`);
  const plan = buildReadingParagraphPlan(documents);
  const report = {
    mode: options.apply ? 'apply' : 'dry-run', analysisSource: snapshot.root,
    snapshotVersion: snapshot.manifest.snapshotVersion, sourceCollection: collection,
    targetCollection: TARGET_COLLECTION, scannedDocuments: documents.length,
    candidateFields: plan.changes.length,
    candidateDocuments: new Set(plan.changes.map((item) => item.id)).size,
    reviewFields: plan.review.length, changes: plan.changes, review: plan.review,
  };
  if (options.apply) report.apply = await applyPlan(plan, documents, options, snapshot.manifest.projectId);
  await mkdir(path.dirname(options.report), { recursive: true });
  await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ mode: report.mode, scannedDocuments: report.scannedDocuments,
    candidateFields: report.candidateFields, candidateDocuments: report.candidateDocuments,
    reviewFields: report.reviewFields, reportPath: options.report,
    ...(report.apply ?? {}) }, null, 2));
  for (const change of plan.changes) console.log(`${change.id} ${change.section}: ${change.before} -> ${change.after}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
