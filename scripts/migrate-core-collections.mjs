#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SNAPSHOT = path.join(ROOT, 'backups', 'firestore-snapshot');
const DEFAULT_SERVICE_ACCOUNT = path.join(ROOT, 'patchs', 'serviceAccountKey.json');
const DEFAULT_REPORT = path.join(ROOT, 'reports', 'core-collections-migration-plan.json');
const CONFIRMATION = 'replace-core-collections';
const BATCH_MAX_DOCUMENTS = 100;
const BATCH_MAX_BYTES = 4 * 1024 * 1024;
const MAX_COMMIT_ATTEMPTS = 4;
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
  console.log(`Replace the two core Firestore collections using a local snapshot.

Mappings:
  fixedDays  -> days      (fixedDays is retained)
  parsedData -> readings  (parsedData is retained)

The command only builds a plan unless --apply is supplied. A usable snapshot
must cover the two source collections. Existing days and readings collections
are treated as obsolete and are dropped before the snapshot data is copied.

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
  const requiredCollections = RENAMES.map(({ source }) => source);
  const missingCoverage = requiredCollections.filter(
    (collectionName) => !snapshotCoversCollection(snapshot, collectionName),
  );
  if (missingCoverage.length) {
    throw new Error(
      `Snapshot does not cover: ${missingCoverage.join(', ')}. `
      + 'Export one snapshot containing fixedDays and parsedData before migration.',
    );
  }

  const mappings = [];
  for (const { source, target } of RENAMES) {
    const sourceEntries = await snapshot.collectionEntries(source) || [];
    mappings.push({
      source,
      target,
      sourceEntries,
      sourceCount: sourceEntries.length,
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
      targetStrategy: 'drop-and-recreate',
      targetCountAfterMigration: mapping.sourceEntries.length,
      sourceRetained: true,
    })),
  };
}

async function writeReport(reportPath, report) {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function chunks(items) {
  const groups = [];
  let group = [];
  let groupBytes = 0;
  for (const item of items) {
    const itemBytes = Buffer.byteLength(JSON.stringify(item), 'utf8');
    if (group.length && (
      group.length >= BATCH_MAX_DOCUMENTS
      || groupBytes + itemBytes > BATCH_MAX_BYTES
    )) {
      groups.push(group);
      group = [];
      groupBytes = 0;
    }
    group.push(item);
    groupBytes += itemBytes;
  }
  if (group.length) groups.push(group);
  return groups;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function commitWriteGroup(db, mapping, group, admin) {
  for (let attempt = 1; attempt <= MAX_COMMIT_ATTEMPTS; attempt += 1) {
    try {
      const batch = db.batch();
      group.forEach(({ id, data }) => {
        batch.set(
          db.collection(mapping.target).doc(id),
          restoreFirestoreTypes(data, admin, db),
        );
      });
      await batch.commit();
      return;
    } catch (error) {
      const transient = [4, 10, 13, 14].includes(error.code);
      if (!transient || attempt === MAX_COMMIT_ATTEMPTS) throw error;
      const delay = attempt * 1000;
      console.warn(
        `Transient Firestore error while writing ${mapping.target}; `
        + `retrying in ${delay} ms (${attempt}/${MAX_COMMIT_ATTEMPTS}).`,
      );
      await wait(delay);
    }
  }
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
    return { __firestoreType: 'timestamp', nanoseconds: value.nanoseconds, seconds: value.seconds };
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

function summarizeEntryDifferences(expectedEntries, actualEntries, admin) {
  const normalize = (entries) => new Map(entries.map(({ id, data }) => [
    id,
    comparableValue(data, admin),
  ]));
  const expected = normalize(expectedEntries);
  const actual = normalize(actualEntries);
  const missing = [...expected.keys()].filter((id) => !actual.has(id));
  const unexpected = [...actual.keys()].filter((id) => !expected.has(id));
  const changed = [...expected.keys()].filter(
    (id) => actual.has(id)
      && JSON.stringify(actual.get(id)) !== JSON.stringify(expected.get(id)),
  );
  const sample = (ids) => ids.sort().slice(0, 10).join(', ') || 'none';
  const changedFieldSamples = changed.slice(0, 5).map((id) => {
    const expectedData = expected.get(id);
    const actualData = actual.get(id);
    const fieldNames = new Set([
      ...Object.keys(expectedData || {}),
      ...Object.keys(actualData || {}),
    ]);
    const changedFields = [...fieldNames].filter(
      (field) => JSON.stringify(expectedData?.[field]) !== JSON.stringify(actualData?.[field]),
    );
    const timestampDetail = changedFields.includes('updatedAt')
      ? ` snapshot.updatedAt=${JSON.stringify(expectedData?.updatedAt)}`
        + ` live.updatedAt=${JSON.stringify(actualData?.updatedAt)}`
      : '';
    return `${id}[${changedFields.join(', ')}]${timestampDetail}`;
  });
  return `snapshot=${expected.size}, live=${actual.size}; `
    + `missing(${missing.length})=${sample(missing)}; `
    + `unexpected(${unexpected.length})=${sample(unexpected)}; `
    + `changed(${changed.length})=${sample(changed)}; `
    + `changedFields=${changedFieldSamples.join('; ') || 'none'}`;
}

async function assertLiveMatchesSnapshot(plan, admin, db) {
  for (const mapping of plan.mappings) {
    const liveSnapshot = await db.collection(mapping.source).get();
    const actual = liveSnapshot.docs.map((document) => ({
      id: document.id,
      data: document.data(),
    }));
    if (comparableEntries(actual, admin) !== comparableEntries(mapping.sourceEntries, admin)) {
      throw new Error(
        `Live collection ${mapping.source} differs from snapshot ${plan.snapshot.version}: `
        + `${summarizeEntryDifferences(mapping.sourceEntries, actual, admin)}. No writes were made.`,
      );
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

    // The old target collections are disposable. Drop them before copying the
    // verified source snapshot so no legacy target document can survive.
    for (const mapping of plan.mappings) {
      const target = db.collection(mapping.target);
      const countSnapshot = await target.count().get();
      const targetCount = countSnapshot.data().count;
      if (targetCount > 0) {
        console.log(`Dropping ${mapping.target} (${targetCount} documents)...`);
        await db.recursiveDelete(target);
      } else {
        console.log(`${mapping.target} is already empty; skipping drop.`);
      }
    }

    // Copy the verified source snapshot into both replacement targets.
    for (const mapping of plan.mappings) {
      console.log(`Copying ${mapping.source} -> ${mapping.target} (${mapping.sourceCount} documents)...`);
      const groups = chunks(mapping.sourceEntries);
      for (let index = 0; index < groups.length; index += 1) {
        await commitWriteGroup(db, mapping, groups[index], admin);
        console.log(`  batch ${index + 1}/${groups.length}`);
      }
      console.log(`Finished ${mapping.target}.`);
    }

    // Keep fixedDays and parsedData as an additional rollback source for now.
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
