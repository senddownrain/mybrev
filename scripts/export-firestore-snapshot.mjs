#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SERVICE_ACCOUNT = path.join(ROOT, 'patchs', 'serviceAccountKey.json');
const DEFAULT_BACKUP_OUTPUT = path.join(ROOT, 'backups', 'firestore-snapshot');
const SNAPSHOT_SCHEMA_VERSION = 1;

function parseArgs(argv) {
  const options = {
    output: DEFAULT_BACKUP_OUTPUT,
    serviceAccount: DEFAULT_SERVICE_ACCOUNT,
    projectId: null,
    collections: [],
    outputExplicit: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') {
      options.output = path.resolve(argv[++index]);
      options.outputExplicit = true;
    }
    else if (arg === '--service-account') options.serviceAccount = path.resolve(argv[++index]);
    else if (arg === '--project-id') options.projectId = argv[++index];
    else if (arg === '--collection') options.collections.push(argv[++index]);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log(`Export every Firestore collection and subcollection to a versioned static snapshot.

Usage:
  node scripts/export-firestore-snapshot.mjs [options]

Options:
  --output <dir>            Override output directory
  --service-account <file>  Firebase service-account JSON
  --project-id <id>         Override Firebase project id
  --collection <path>       Export only this top-level collection (repeatable; requires --output)
  --help                    Show this message

This creates a private, complete backup under backups/ by default.
The command reads every Firestore document. Run it only when read quota is available.`);
}

function encodeValue(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(encodeValue);

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
  if (value instanceof Date) {
    return { __firestoreType: 'date', iso: value.toISOString() };
  }
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]));
  }
  return value;
}

function safeFileName(collectionPath) {
  const readable = collectionPath.replace(/[^a-zA-Z0-9._-]+/g, '__');
  return `${readable}-${sha256(collectionPath).slice(0, 12)}.json`;
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function exportCollection(collectionRef, output, manifestCollections, { includeSubcollections = true } = {}) {
  const snapshot = await collectionRef.get();
  const documents = snapshot.docs.map((document) => ({
    id: document.id,
    data: encodeValue(document.data()),
  }));
  const payload = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    collectionPath: collectionRef.path,
    documents,
  };
  const content = `${JSON.stringify(payload)}\n`;
  const file = safeFileName(collectionRef.path);
  await writeFile(path.join(output, file), content, 'utf8');

  manifestCollections[collectionRef.path] = {
    file,
    documentCount: documents.length,
    bytes: Buffer.byteLength(content),
    sha256: sha256(content),
  };
  console.log(`${collectionRef.path}: ${documents.length} documents`);

  if (includeSubcollections) {
    for (const document of snapshot.docs) {
      const subcollections = await document.ref.listCollections();
      for (const subcollection of subcollections) {
        await exportCollection(subcollection, output, manifestCollections);
      }
    }
  }
}

function assertSafeOutput(output) {
  const resolved = path.resolve(output);
  const filesystemRoot = path.parse(resolved).root;
  if (resolved === filesystemRoot || resolved === ROOT || resolved === path.dirname(ROOT)) {
    throw new Error(`Refusing unsafe output directory: ${resolved}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  assertSafeOutput(options.output);
  if (options.collections.length && !options.outputExplicit) {
    throw new Error('A filtered snapshot requires an explicit --output directory');
  }

  const serviceAccount = JSON.parse(await readFile(options.serviceAccount, 'utf8'));
  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: options.projectId || serviceAccount.project_id,
  });

  try {
    const db = admin.firestore(app);
    const topLevelCollections = options.collections.length
      ? [...new Set(options.collections)].map((collectionPath) => db.collection(collectionPath))
      : await db.listCollections();
    const tempOutput = `${options.output}.tmp`;
    await rm(tempOutput, { recursive: true, force: true });
    await mkdir(tempOutput, { recursive: true });

    const collections = {};
    for (const collectionRef of topLevelCollections.sort((a, b) => a.id.localeCompare(b.id))) {
      await exportCollection(collectionRef, tempOutput, collections, {
        includeSubcollections: !options.collections.length,
      });
    }

    const exportedAt = new Date().toISOString();
    const manifest = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      snapshotVersion: exportedAt.replace(/[-:.TZ]/g, ''),
      projectId: options.projectId || serviceAccount.project_id,
      scope: options.collections.length ? 'selected-collections' : 'complete-backup',
      selectedCollections: options.collections.length ? [...new Set(options.collections)].sort() : undefined,
      exportedAt,
      collections,
      totalDocuments: Object.values(collections)
        .reduce((sum, collection) => sum + collection.documentCount, 0),
    };
    await writeFile(
      path.join(tempOutput, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );

    await rm(options.output, { recursive: true, force: true });
    await mkdir(path.dirname(options.output), { recursive: true });
    await import('node:fs/promises').then(({ rename }) => rename(tempOutput, options.output));
    console.log(`Snapshot ${manifest.snapshotVersion}: ${manifest.totalDocuments} documents`);
    console.log(`Written to ${options.output}`);
  } finally {
    await app.delete();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
