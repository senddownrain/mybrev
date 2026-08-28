#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_SNAPSHOT_DIR = path.join(ROOT, 'backups', 'firestore-snapshot');
const DEFAULT_REPORT_PATH = path.join(ROOT, 'reports', 'fixed-days-intercessions-cleanup-report.json');
const DEFAULT_SERVICE_ACCOUNT_PATH = path.join(ROOT, 'patchs', 'serviceAccountKey.json');
const BACKUP_DIR = path.join(ROOT, 'backups', 'firestore-migrations');
const COLLECTION = 'days';
const WRITE_CHUNK_SIZE = 40;

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
    else if (argument.startsWith('--snapshot=')) options.snapshot = path.resolve(argument.slice('--snapshot='.length));
    else if (argument === '--report') options.report = path.resolve(argv[++index]);
    else if (argument.startsWith('--report=')) options.report = path.resolve(argument.slice('--report='.length));
    else if (argument === '--service-account') options.serviceAccount = path.resolve(argv[++index]);
    else if (argument.startsWith('--service-account=')) {
      options.serviceAccount = path.resolve(argument.slice('--service-account='.length));
    } else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function printHelp() {
  console.log(`Remove UI-owned headings and Lord's Prayer conclusions from days intercessions.

Dry-run reads only the local Firestore snapshot. Firestore is contacted only with --apply.

Usage:
  node scripts/cleanup-fixed-day-intercessions.mjs
  node scripts/cleanup-fixed-day-intercessions.mjs --snapshot <directory>
  node scripts/cleanup-fixed-day-intercessions.mjs --apply

Options:
  --snapshot <dir>          Local snapshot directory
  --report <file>           Dry-run/apply report path
  --apply                   Verify against Firestore, back up, and write changes
  --service-account <file>  Firebase service account used only with --apply`);
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function cleanupIntercessionHtml(html) {
  if (typeof html !== 'string') {
    return { html, removedHeading: false, removedPaterNoster: false };
  }

  let cleaned = html;
  let removedHeading = false;
  let removedPaterNoster = false;

  const standaloneHeadingPattern = /^\s*<p\b[^>]*>\s*Просьбы\s*<\/p>\s*/iu;
  cleaned = cleaned.replace(standaloneHeadingPattern, () => {
    removedHeading = true;
    return '';
  });
  if (!removedHeading) {
    const inlineHeadingPattern = /^(\s*<p\b[^>]*>\s*)<span\b[^>]*>\s*Просьбы\s*<\/span>\s*(?:<br\s*\/?\s*>\s*)?/iu;
    cleaned = cleaned.replace(inlineHeadingPattern, (_match, paragraphStart) => {
      removedHeading = true;
      return paragraphStart;
    });
  }

  const paterNosterPattern = /\s*<p\b[^>]*>\s*(?:Ойча|Отче)\s+наш[.!…]?\s*<\/p>\s*$/iu;
  cleaned = cleaned.replace(paterNosterPattern, () => {
    removedPaterNoster = true;
    return '';
  });

  return {
    html: cleaned.trim(),
    removedHeading,
    removedPaterNoster,
  };
}

export function buildCleanupPlan(documents) {
  const changes = [];
  for (const document of documents) {
    for (const [field, value] of Object.entries(document)) {
      if (!/Inter$/u.test(field) || typeof value !== 'string') continue;
      const cleaned = cleanupIntercessionHtml(value);
      if (cleaned.html === value) continue;
      changes.push({
        id: document.id,
        date: document._date || null,
        field,
        before: value,
        after: cleaned.html,
        removedHeading: cleaned.removedHeading,
        removedPaterNoster: cleaned.removedPaterNoster,
      });
    }
  }
  return changes;
}

function reportChanges(changes) {
  return changes.map((change) => ({
    id: change.id,
    date: change.date,
    field: change.field,
    removedHeading: change.removedHeading,
    removedPaterNoster: change.removedPaterNoster,
    beforeSha256: sha256(change.before),
    afterSha256: sha256(change.after),
  }));
}

async function getSnapshots(db, ids) {
  const result = [];
  for (const group of chunks(ids, WRITE_CHUNK_SIZE)) {
    result.push(...await db.getAll(...group.map((id) => db.collection(COLLECTION).doc(id))));
  }
  return result;
}

async function applyPlan(changes, options) {
  const [{ default: admin }, serviceAccountText] = await Promise.all([
    import('firebase-admin'),
    fs.readFile(options.serviceAccount, 'utf8'),
  ]);
  const serviceAccount = JSON.parse(serviceAccountText);
  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

  try {
    const db = admin.firestore();
    const changesById = new Map();
    for (const change of changes) {
      if (!changesById.has(change.id)) changesById.set(change.id, []);
      changesById.get(change.id).push(change);
    }
    const ids = [...changesById.keys()].sort();
    const currentSnapshots = await getSnapshots(db, ids);
    const drift = [];

    for (const snapshot of currentSnapshots) {
      if (!snapshot.exists) {
        drift.push({ id: snapshot.id, field: null, reason: 'document-missing' });
        continue;
      }
      const data = snapshot.data();
      for (const change of changesById.get(snapshot.id)) {
        if (data[change.field] !== change.before) {
          drift.push({ id: snapshot.id, field: change.field, reason: 'snapshot-field-stale' });
        }
      }
    }
    if (drift.length) {
      throw new Error(`Snapshot is stale for planned fields: ${JSON.stringify(drift)}`);
    }

    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const backupPath = path.join(BACKUP_DIR, `days-intercessions-${timestamp()}.json`);
    const backup = currentSnapshots.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() }));
    await fs.writeFile(backupPath, `${JSON.stringify({
      createdAt: new Date().toISOString(),
      collection: COLLECTION,
      documents: backup,
    }, null, 2)}\n`, 'utf8');

    for (const group of chunks(ids, WRITE_CHUNK_SIZE)) {
      const batch = db.batch();
      for (const id of group) {
        const patch = Object.fromEntries(changesById.get(id).map((change) => [change.field, change.after]));
        patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        batch.update(db.collection(COLLECTION).doc(id), patch);
      }
      await batch.commit();
    }

    const afterSnapshots = await getSnapshots(db, ids);
    const verificationFailures = [];
    for (const snapshot of afterSnapshots) {
      const data = snapshot.data();
      for (const change of changesById.get(snapshot.id)) {
        if (data?.[change.field] !== change.after) {
          verificationFailures.push({ id: snapshot.id, field: change.field });
        }
      }
    }
    if (verificationFailures.length) {
      throw new Error(`Post-write verification failed; backup=${backupPath}; failures=${JSON.stringify(verificationFailures)}`);
    }
    return { backupPath, writtenDocuments: ids.length, verification: 'passed' };
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
  const changes = buildCleanupPlan(documents);
  const documentIds = [...new Set(changes.map((change) => change.id))].sort();

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
    affectedDocuments: documentIds.length,
    affectedFields: changes.length,
    removedHeadings: changes.filter((change) => change.removedHeading).length,
    removedPaterNosters: changes.filter((change) => change.removedPaterNoster).length,
    changes: reportChanges(changes),
  };

  if (options.apply) Object.assign(report, await applyPlan(changes, options));
  await fs.mkdir(path.dirname(options.report), { recursive: true });
  await fs.writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ reportPath: options.report, ...report }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
