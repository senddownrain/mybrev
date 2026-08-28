#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { autoFixPrayerMarkdown, PRAYER_TEXT_FORMAT, PRAYER_TEXT_FORMAT_VERSION } from '../src/utils/prayerMarkdown.js';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const COLLECTION = 'prayers';
const DEFAULT_SNAPSHOT_DIR = path.join(ROOT, 'backups', 'firestore-snapshot-prayers');
const DEFAULT_REPORT_PATH = path.join(ROOT, 'reports', 'prayer-markdown-autofix-report.json');
const DEFAULT_SERVICE_ACCOUNT_PATH = path.join(ROOT, 'patchs', 'serviceAccountKey.json');
const BACKUP_DIR = path.join(ROOT, 'backups', 'firestore-migrations');
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
    else if (argument.startsWith('--service-account=')) options.serviceAccount = path.resolve(argument.slice('--service-account='.length));
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function printHelp() {
  console.log(`Apply safe MyBrev Markdown autofixes to prayer texts.

Dry-run reads only a local snapshot. Firestore is contacted only with --apply.

Usage:
  node scripts/autofix-prayer-markdown.mjs
  node scripts/autofix-prayer-markdown.mjs --apply

Options:
  --snapshot <dir>          Local snapshot containing the prayers collection
  --report <file>           Dry-run/apply report path
  --apply                   Verify, back up, write, and verify again
  --service-account <file>  Firebase service account used only with --apply`);
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function equal(valueA, valueB) {
  return JSON.stringify(valueA) === JSON.stringify(valueB);
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export function buildPrayerAutofixPlan(documents) {
  return documents.flatMap((document) => {
    const updates = [];
    const fixes = new Set();

    if (typeof document.text === 'string') {
      const result = autoFixPrayerMarkdown(document.text);
      if (result.changed) {
        updates.push({ field: 'text', before: document.text, after: result.markdown });
        result.fixes.forEach((fix) => fixes.add(fix));
      }
    }

    if (document.textVersions && typeof document.textVersions === 'object' && !Array.isArray(document.textVersions)) {
      const afterTextVersions = { ...document.textVersions };
      let textVersionsChanged = false;
      Object.entries(document.textVersions).forEach(([locale, value]) => {
        if (typeof value !== 'string') return;
        const result = autoFixPrayerMarkdown(value);
        if (!result.changed) return;
        afterTextVersions[locale] = result.markdown;
        textVersionsChanged = true;
        result.fixes.forEach((fix) => fixes.add(fix));
      });
      if (textVersionsChanged) {
        updates.push({ field: 'textVersions', before: document.textVersions, after: afterTextVersions });
      }
    }

    if (!updates.length) return [];
    if (document.textFormat !== PRAYER_TEXT_FORMAT) {
      updates.push({ field: 'textFormat', before: document.textFormat, after: PRAYER_TEXT_FORMAT });
    }
    if (document.textFormatVersion !== PRAYER_TEXT_FORMAT_VERSION) {
      updates.push({ field: 'textFormatVersion', before: document.textFormatVersion, after: PRAYER_TEXT_FORMAT_VERSION });
    }

    return [{ id: document.id, updates, fixes: [...fixes].sort() }];
  });
}

function reportChanges(changes) {
  return changes.map((change) => ({
    id: change.id,
    fields: change.updates.map((update) => ({
      field: update.field,
      beforeSha256: sha256(JSON.stringify(update.before)),
      afterSha256: sha256(JSON.stringify(update.after)),
    })),
    fixes: change.fixes,
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
  const app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountText)) });

  try {
    const db = admin.firestore();
    const ids = changes.map((change) => change.id);
    const currentSnapshots = await getSnapshots(db, ids);
    const drift = [];

    currentSnapshots.forEach((snapshot) => {
      const change = changes.find((item) => item.id === snapshot.id);
      if (!snapshot.exists) {
        drift.push({ id: snapshot.id, reason: 'document-missing' });
        return;
      }
      change.updates.forEach((update) => {
        if (!equal(snapshot.data()[update.field], update.before)) {
          drift.push({ id: snapshot.id, field: update.field, reason: 'snapshot-field-stale' });
        }
      });
    });
    if (drift.length) throw new Error(`Snapshot is stale for planned fields: ${JSON.stringify(drift)}`);

    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const backupPath = path.join(BACKUP_DIR, `prayer-markdown-autofix-${timestamp()}.json`);
    await fs.writeFile(backupPath, `${JSON.stringify({
      createdAt: new Date().toISOString(),
      collection: COLLECTION,
      documents: currentSnapshots.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() })),
    }, null, 2)}\n`, 'utf8');

    for (const group of chunks(changes, WRITE_CHUNK_SIZE)) {
      const batch = db.batch();
      group.forEach((change) => {
        const patch = Object.fromEntries(change.updates.map((update) => [update.field, update.after]));
        patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        batch.update(db.collection(COLLECTION).doc(change.id), patch);
      });
      await batch.commit();
    }

    const afterSnapshots = await getSnapshots(db, ids);
    const verificationFailures = [];
    afterSnapshots.forEach((snapshot) => {
      const change = changes.find((item) => item.id === snapshot.id);
      change.updates.forEach((update) => {
        if (!snapshot.exists || !equal(snapshot.data()[update.field], update.after)) {
          verificationFailures.push({ id: change.id, field: update.field });
        }
      });
    });
    if (verificationFailures.length) {
      throw new Error(`Post-write verification failed; backup=${backupPath}; failures=${JSON.stringify(verificationFailures)}`);
    }
    return { backupPath, writtenDocuments: changes.length, verification: 'passed' };
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
  const changes = buildPrayerAutofixPlan(documents);
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
    affectedDocuments: changes.length,
    affectedFields: changes.reduce((sum, change) => sum + change.updates.length, 0),
    changes: reportChanges(changes),
  };
  if (options.apply && changes.length) Object.assign(report, await applyPlan(changes, options));

  await fs.mkdir(path.dirname(options.report), { recursive: true });
  await fs.writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    reportPath: options.report,
    scannedDocuments: report.scannedDocuments,
    affectedDocuments: report.affectedDocuments,
    affectedFields: report.affectedFields,
    ...(report.writtenDocuments === undefined ? {} : { writtenDocuments: report.writtenDocuments, verification: report.verification, backupPath: report.backupPath }),
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
