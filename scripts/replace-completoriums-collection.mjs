#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_INPUT_DIR = path.join(PROJECT_ROOT, 'reports', 'completorium-clean-35');
const DEFAULT_SERVICE_ACCOUNT = path.join(PROJECT_ROOT, 'patchs', 'serviceAccountKey.json');
const DEFAULT_BACKUP_DIR = path.join(PROJECT_ROOT, 'reports', 'backups');
const COLLECTION = 'completoriums';
const PERIODS = ['ordinary', 'advent', 'easter', 'lent', 'christmas'];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const CONTENT_FIELDS = [
  'compHymn',
  'compAnt1',
  'compAnt2',
  'compPs1',
  'compPs2',
  'compR',
  'compResp',
  'compAntS',
  'compPr',
  'compAntM',
];
const EXPECTED_FIELDS = ['_periodType', '_dayOfWeek', ...CONTENT_FIELDS];

function parseArgs(argv) {
  const options = {
    inputDir: DEFAULT_INPUT_DIR,
    serviceAccount: DEFAULT_SERVICE_ACCOUNT,
    backupDir: DEFAULT_BACKUP_DIR,
    apply: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input-dir') options.inputDir = path.resolve(argv[++index]);
    else if (arg === '--service-account') options.serviceAccount = path.resolve(argv[++index]);
    else if (arg === '--backup-dir') options.backupDir = path.resolve(argv[++index]);
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function expectedIds() {
  return PERIODS.flatMap((period) => WEEKDAYS.map((weekday) => `${period}-d${weekday}`));
}

function assertPlainTemplate(id, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${id}: expected an object`);
  if (JSON.stringify(Object.keys(data)) !== JSON.stringify(EXPECTED_FIELDS)) {
    throw new Error(`${id}: expected exactly these fields in order: ${EXPECTED_FIELDS.join(', ')}`);
  }
  if (`${data._periodType}-d${data._dayOfWeek}` !== id) throw new Error(`${id}: metadata does not match filename`);
  if (!PERIODS.includes(data._periodType) || !WEEKDAYS.includes(data._dayOfWeek)) {
    throw new Error(`${id}: invalid period or weekday`);
  }
  for (const field of CONTENT_FIELDS) {
    if (typeof data[field] !== 'string') throw new Error(`${id}: ${field} must be a string`);
  }
}

async function loadTemplates(inputDir) {
  const ids = expectedIds();
  const jsonFiles = (await fs.readdir(inputDir)).filter((file) => file.endsWith('.json')).sort();
  const expectedFiles = ids.map((id) => `${id}.json`).sort();
  if (JSON.stringify(jsonFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(`Input directory must contain exactly the expected 35 JSON files; found ${jsonFiles.length}.`);
  }
  const templates = new Map();
  for (const id of ids) {
    const data = JSON.parse(await fs.readFile(path.join(inputDir, `${id}.json`), 'utf8'));
    assertPlainTemplate(id, data);
    templates.set(id, data);
  }
  return templates;
}

function backupFileName() {
  return `completoriums-before-replace-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/replace-completoriums-collection.mjs [--apply] [--input-dir directory]');
    return;
  }

  const templates = await loadTemplates(options.inputDir);
  const serviceAccount = JSON.parse(await fs.readFile(options.serviceAccount, 'utf8'));
  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  try {
    const db = admin.firestore();
    const collectionRef = db.collection(COLLECTION);
    const beforeSnapshot = await collectionRef.get();
    const targetIds = new Set(templates.keys());
    const idsToDelete = beforeSnapshot.docs.map((document) => document.id).filter((id) => !targetIds.has(id));
    const operationCount = idsToDelete.length + templates.size;
    if (operationCount > 500) {
      throw new Error(`Atomic replacement needs ${operationCount} operations, exceeding Firestore batch limit 500. Nothing changed.`);
    }

    const plan = {
      mode: options.apply ? 'apply' : 'dry-run',
      collection: COLLECTION,
      existingDocuments: beforeSnapshot.size,
      deleteDocuments: idsToDelete.length,
      replaceOrCreateDocuments: templates.size,
      atomicBatchOperations: operationCount,
      targetDocumentsAfterCommit: templates.size,
    };
    if (!options.apply) {
      console.log(JSON.stringify(plan, null, 2));
      return;
    }

    await fs.mkdir(options.backupDir, { recursive: true });
    const backupPath = path.join(options.backupDir, backupFileName());
    const backup = {
      createdAt: new Date().toISOString(),
      collection: COLLECTION,
      documents: beforeSnapshot.docs.map((document) => ({ id: document.id, ...document.data() })),
    };
    await fs.writeFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`, 'utf8');

    const batch = db.batch();
    for (const id of idsToDelete) batch.delete(collectionRef.doc(id));
    for (const [id, data] of templates) batch.set(collectionRef.doc(id), data);
    await batch.commit();

    const afterSnapshot = await collectionRef.get();
    if (afterSnapshot.size !== templates.size) {
      throw new Error(`Post-commit verification failed: expected ${templates.size}, found ${afterSnapshot.size}. Backup: ${backupPath}`);
    }
    for (const document of afterSnapshot.docs) {
      const expected = templates.get(document.id);
      if (!expected || JSON.stringify(document.data()) !== JSON.stringify(expected)) {
        throw new Error(`Post-commit verification failed for ${document.id}. Backup: ${backupPath}`);
      }
    }

    console.log(JSON.stringify({
      ...plan,
      backupPath,
      verifiedDocuments: afterSnapshot.size,
      verifiedIds: afterSnapshot.docs.map((document) => document.id).sort(),
    }, null, 2));
  } finally {
    await app.delete();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

