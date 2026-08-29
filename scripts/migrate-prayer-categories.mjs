#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';
import { DEFAULT_CATEGORIES } from '../src/constants/categories.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SNAPSHOT = path.join(ROOT, 'backups', 'firestore-snapshot');
const DEFAULT_SERVICE_ACCOUNT = path.join(ROOT, 'patchs', 'serviceAccountKey.json');
const CONFIRMATION = 'seed-prayer-categories';

function parseArgs(argv) {
  const options = {
    apply: false,
    confirm: '',
    snapshot: DEFAULT_SNAPSHOT,
    serviceAccount: DEFAULT_SERVICE_ACCOUNT,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') options.apply = true;
    else if (argument === '--confirm') options.confirm = argv[++index] || '';
    else if (argument === '--snapshot') options.snapshot = path.resolve(argv[++index]);
    else if (argument === '--service-account') options.serviceAccount = path.resolve(argv[++index]);
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function printHelp() {
  console.log(`Seed the app-wide prayer categories in Firestore.

Dry-run analysis uses only the local Firestore snapshot. The --apply phase
checks the three category names in live Firestore and creates only missing ones.

Usage:
  npm run db:migrate-prayer-categories
  npm run db:migrate-prayer-categories -- --snapshot backups/firestore-snapshot
  npm run db:migrate-prayer-categories -- --apply --confirm ${CONFIRMATION}
`);
}

async function buildPlan(snapshotDirectory) {
  const snapshot = await openFirestoreSnapshot(snapshotDirectory);
  const existing = await snapshot.collection('prayerCategories');
  const existingNames = new Set((existing || []).map((category) => category.name));
  return {
    analysisSource: 'local-firestore-snapshot',
    snapshotVersion: snapshot.manifest.snapshotVersion,
    targetCoveredBySnapshot: existing !== null,
    categories: DEFAULT_CATEGORIES.map((category) => ({
      ...category,
      snapshotStatus: existing === null
        ? 'unknown-target-state'
        : existingNames.has(category.name) ? 'already-present' : 'create',
    })),
  };
}

async function applyPlan(options) {
  if (options.confirm !== CONFIRMATION) {
    throw new Error(`Apply requires --confirm ${CONFIRMATION}`);
  }

  const [{ default: admin }, serviceAccountJson] = await Promise.all([
    import('firebase-admin'),
    readFile(options.serviceAccount, 'utf8'),
  ]);
  const serviceAccount = JSON.parse(serviceAccountJson);
  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });

  try {
    const db = admin.firestore(app);
    const collection = db.collection('prayerCategories');
    let created = 0;
    for (const category of DEFAULT_CATEGORIES) {
      const sameName = await collection.where('name', '==', category.name).limit(1).get();
      if (!sameName.empty) continue;
      await collection.doc(category.id).set({
        name: category.name,
        tags: category.tags,
        addToNewPrayers: category.addToNewPrayers,
        order: category.order,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      created += 1;
    }
    return { created };
  } finally {
    await app.delete();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();

  const plan = await buildPlan(options.snapshot);
  console.log(JSON.stringify(plan, null, 2));
  if (!options.apply) {
    if (!plan.targetCoveredBySnapshot) {
      console.warn('Snapshot does not cover prayerCategories; target state remains unknown until --apply.');
    }
    console.log('Dry run only. No Firestore reads or writes were performed.');
    return;
  }

  const result = await applyPlan(options);
  console.log(`Created ${result.created} missing prayer categories.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
