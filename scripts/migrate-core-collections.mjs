#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SNAPSHOT = path.join(ROOT, 'backups', 'firestore-snapshot');
const DEFAULT_SERVICE_ACCOUNT = path.join(ROOT, 'patchs', 'serviceAccountKey.json');
const DEFAULT_REPORT = path.join(ROOT, 'reports', 'core-collections-migration-plan.json');
const CONFIRMATION = 'rename-core-collections';
const BATCH_SIZE = 400;
const RENAMES = Object.freeze([
  { source: 'fixedDays', target: 'days' },
  { source: 'parsedData', target: 'readings' },
]);

function parseArgs(argv) {
  const options = {
    apply: false,
    confirm: '',
    snapshot: DEFAULT_SNAPSHOT,
    serviceAccount: DEFAULT_SERVICE_ACCOUNT,
    report: DEFAULT_REPORT,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') options.apply = true;
    else if (argument === '--confirm') options.confirm = argv[++index] || '';
    else if (argument === '--snapshot') options.snapshot = path.resolve(argv[++index]);
    else if (argument === '--service-account') options.serviceAccount = path.resolve(argv[++index]);
    else if (argument === '--report') options.report = path.resolve(argv[++index]);
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function printHelp() {
  console.log(`Rename the two core Firestore collections using a local snapshot.

Mappings:
  fixedDays  -> days
  parsedData -> readings

The command only builds a plan unless --apply is supplied. A usable snapshot
must cover all four collections so obsolete target documents can be removed
without an unbounded live audit.

Usage:
  npm run db:migrate-core-collections
  npm run db:migrate-core-collections -- --snapshot backups/firestore-snapshot
  npm run db:migrate-core-collections -- --apply --confirm ${CONFIRMATION}
`);
}

function snapshotCoversCollection(snapshot, collectionName) {
  if (snapshot.manifest.scope === 'complete-backup') return true;
  return snapshot.manifest.selectedCollections?.includes(collectionName) === true;
}

async function buildPlan(snapshotDirectory) {
  const snapshot = await openFirestoreSnapshot(snapshotDirectory);
  const requiredCollections = RENAMES.flatMap(({ source, target }) => [source, target]);
  const missingCoverage = requiredCollections.filter(
    (collectionName) => !snapshotCoversCollection(snapshot, collectionName),
  );
  if (missingCoverage.length) {
    throw new Error(
      `Snapshot does not cover: ${missingCoverage.join(', ')}. `
      + 'Export one snapshot containing fixedDays, parsedData, days and readings before migration.',
    );
  }

  const mappings = [];
  for (const { source, target } of RENAMES) {
    const sourceEntries = await snapshot.collectionEntries(source) || [];
    const targetEntries = await snapshot.collectionEntries(target) || [];
    const sourceIds = new Set(sourceEntries.map(({ id }) => id));
    mappings.push({
      source,
      target,
      sourceEntries,
      targetEntries,
      sourceCount: sourceEntries.length,
      previousTargetCount: targetEntries.length,
      targetDocumentsToRemove: targetEntries
        .map(({ id }) => id)
        .filter((id) => !sourceIds.has(id))
        .sort(),
    });
  }

  return {
    analysisSource: 'local-firestore-snapshot',
    snapshot: {
      directory: snapshot.root,
      version: snapshot.manifest.snapshotVersion,
      exportedAt: snapshot.manifest.exportedAt,
      projectId: snapshot.manifest.projectId,
    },
    mappings,
  };
}

function reportFromPlan(plan, status) {
  return {
    status,
    analysisSource: plan.analysisSource,
    snapshot: plan.snapshot,
    mappings: plan.mappings.map((mapping) => ({
      source: mapping.source,
      target: mapping.target,
      sourceCount: mapping.sourceCount,
      previousTargetCount: mapping.previousTargetCount,
      targetDocumentsToRemove: mapping.targetDocumentsToRemove,
      targetCountAfterMigration: mapping.sourceEntries.length,
      sourceDocumentsToRemove: mapping.sourceEntries.length,
    })),
  };
}

async function writeReport(reportPath, report) {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function chunks(items) {
  return Array.from({ length: Math.ceil(items.length / BATCH_SIZE) }, (_, index) => (
    items.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE)
  ));
}

function restoreFirestoreTypes(value, admin, db) {
  if (Array.isArray(value)) return value.map((item) => restoreFirestoreTypes(item, admin, db));
  if (!value || typeof value !== 'object') return value;
  if (value.__firestoreType === 'timestamp') {
    return new admin.firestore.Timestamp(value.seconds, value.nanoseconds);
  }
  if (value.__firestoreType === 'date') return new Date(value.iso);
  if (value.__firestoreType === 'bytes') return Buffer.from(value.base64, 'base64');
  if (value.__firestoreType === 'geopoint') {
    return new admin.firestore.GeoPoint(value.latitude, value.longitude);
  }
  if (value.__firestoreType === 'reference') return db.doc(value.path);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, restoreFirestoreTypes(item, admin, db)]),
  );
}

function comparableValue(value, admin) {
  if (Array.isArray(value)) return value.map((item) => comparableValue(item, admin));
  if (value === null || value === undefined) return value;
  if (value instanceof admin.firestore.Timestamp) {
    return { __firestoreType: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (value instanceof admin.firestore.GeoPoint) {
    return { __firestoreType: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (value instanceof admin.firestore.DocumentReference) {
    return { __firestoreType: 'reference', path: value.path };
  }
  if (Buffer.isBuffer(value)) {
    return { __firestoreType: 'bytes', base64: value.toString('base64') };
  }
  if (value instanceof Date) return { __firestoreType: 'date', iso: value.toISOString() };
  if (typeof value !== 'object') return value;
  if (value.__firestoreType) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => typeof item !== 'function')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, comparableValue(item, admin)]),
    );
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, comparableValue(item, admin)]),
  );
}

function comparableEntries(entries, admin) {
  return JSON.stringify(entries
    .map(({ id, data }) => ({ id, data: comparableValue(data, admin) }))
    .sort((left, right) => left.id.localeCompare(right.id)));
}

async function assertLiveMatchesSnapshot(plan, admin, db) {
  for (const mapping of plan.mappings) {
    for (const collectionName of [mapping.source, mapping.target]) {
      const expected = collectionName === mapping.source
        ? mapping.sourceEntries
        : mapping.targetEntries;
      const liveSnapshot = await db.collection(collectionName).get();
      const actual = liveSnapshot.docs.map((document) => ({
        id: document.id,
        data: document.data(),
      }));
      if (comparableEntries(actual, admin) !== comparableEntries(expected, admin)) {
        throw new Error(
          `Live collection ${collectionName} differs from snapshot ${plan.snapshot.version}. No writes were made.`,
        );
      }
    }
  }
}

async function applyPlan(plan, serviceAccountPath) {
  const [{ default: admin }, serviceAccountJson] = await Promise.all([
    import('firebase-admin'),
    readFile(serviceAccountPath, 'utf8'),
  ]);
  const serviceAccount = JSON.parse(serviceAccountJson);
  if (plan.snapshot.projectId && serviceAccount.project_id !== plan.snapshot.projectId) {
    throw new Error(
      `Snapshot project ${plan.snapshot.projectId} does not match service account project ${serviceAccount.project_id}.`,
    );
  }

  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
  try {
    const db = admin.firestore(app);
    await assertLiveMatchesSnapshot(plan, admin, db);

    // Write complete targets first. Sources remain untouched until both targets exist.
    for (const mapping of plan.mappings) {
      for (const group of chunks(mapping.sourceEntries)) {
        const batch = db.batch();
        group.forEach(({ id, data }) => {
          batch.set(
            db.collection(mapping.target).doc(id),
            restoreFirestoreTypes(data, admin, db),
          );
        });
        await batch.commit();
      }
    }

    // Remove documents that belonged to the obsolete target collections.
    for (const mapping of plan.mappings) {
      for (const group of chunks(mapping.targetDocumentsToRemove)) {
        const batch = db.batch();
        group.forEach((id) => batch.delete(db.collection(mapping.target).doc(id)));
        await batch.commit();
      }
    }

    // Only after both targets are complete, remove the old source collections.
    for (const mapping of plan.mappings) {
      for (const group of chunks(mapping.sourceEntries)) {
        const batch = db.batch();
        group.forEach(({ id }) => batch.delete(db.collection(mapping.source).doc(id)));
        await batch.commit();
      }
    }
  } finally {
    await app.delete();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const plan = await buildPlan(options.snapshot);
  if (!options.apply) {
    const report = reportFromPlan(plan, 'dry-run');
    await writeReport(options.report, report);
    console.log(JSON.stringify(report, null, 2));
    console.log(`Dry run only. Plan written to ${options.report}`);
    return;
  }
  if (options.confirm !== CONFIRMATION) {
    throw new Error(`Refusing destructive migration without --confirm ${CONFIRMATION}`);
  }

  await applyPlan(plan, options.serviceAccount);
  const report = reportFromPlan(plan, 'applied');
  await writeReport(options.report, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`Core collection migration failed: ${error.message}`);
  process.exitCode = 1;
});
