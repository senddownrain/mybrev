#!/usr/bin/env node
/**
 * Builds the canonical content the Flutter app ships inside its package
 * («offline by installation»): one gzip file per collection plus a small
 * manifest. Reads only local snapshots (AGENTS.md); never Firestore.
 *
 *   npm run content:app-bundle -- --snapshot backups/firestore-snapshot \
 *     --snapshot backups/firestore-snapshot-static --out ../ibreviarybyapp/assets/content
 *
 * Every collection in APP_CONTENT_COLLECTIONS must be found in one of the
 * snapshots. The bundle's contentVersion is the oldest snapshot time: an
 * update downloaded after it is newer, one before it is older.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import {
  APP_CONTENT_COLLECTIONS,
  CONTENT_SCHEMA_VERSION,
  describeDocuments,
  encodeCollection,
  storedDocument,
} from './lib/app-content.mjs';

function parseArgs(argv) {
  const options = { snapshots: [], out: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--snapshot') options.snapshots.push(argv[++index]);
    else if (argv[index] === '--out') options.out = argv[++index];
  }
  if (!options.snapshots.length || !options.out) {
    throw new Error('Usage: build-app-bundle.mjs --snapshot <dir> [--snapshot <dir>] --out <assets/content>');
  }
  return options;
}

export async function readCollections(snapshotDirs, names = APP_CONTENT_COLLECTIONS) {
  const found = new Map();
  const times = [];
  for (const dir of snapshotDirs) {
    const snapshot = await openFirestoreSnapshot(dir);
    for (const name of names) {
      if (found.has(name)) continue;
      const docs = await snapshot.collection(name);
      if (!docs) continue;
      found.set(name, docs.map(({ id, ...data }) => storedDocument(id, data)).sort((a, b) => (a.id < b.id ? -1 : 1)));
      times.push(Date.parse(snapshot.manifest.exportedAt));
    }
  }
  const missing = names.filter((name) => !found.has(name));
  if (missing.length) throw new Error(`Not in the snapshots: ${missing.join(', ')}`);
  return { collections: found, contentVersion: Math.min(...times) };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { collections, contentVersion } = await readCollections(options.snapshots);
  fs.mkdirSync(options.out, { recursive: true });
  const manifest = {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    contentVersion,
    contentDate: new Date(contentVersion).toISOString(),
    collections: {},
  };
  for (const [name, docs] of collections) {
    const described = describeDocuments(docs);
    const { strings, docs: encoded } = encodeCollection(docs);
    const payload = Buffer.from(JSON.stringify({
      schemaVersion: CONTENT_SCHEMA_VERSION,
      collection: name,
      contentVersion,
      strings,
      docs: encoded,
      hashes: described.hashes,
    }));
    const file = `${name}.json.gz`;
    // mtime 0: the same content always gives the same bytes.
    const gz = zlib.gzipSync(payload, { level: 9 });
    gz.writeUInt32LE(0, 4);
    fs.writeFileSync(path.join(options.out, file), gz);
    manifest.collections[name] = {
      file,
      count: described.count,
      digest: described.digest,
      storedBytes: described.bytes,
      bundleBytes: gz.length,
    };
    console.log(`${name.padEnd(20)} ${String(described.count).padStart(5)} docs  ${(described.bytes / 1048576).toFixed(2).padStart(6)} MB stored → ${(gz.length / 1048576).toFixed(2)} MB`);
  }
  fs.writeFileSync(path.join(options.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const total = Object.values(manifest.collections).reduce((sum, item) => sum + item.bundleBytes, 0);
  console.log(`total bundle ${(total / 1048576).toFixed(2)} MB, contentVersion ${manifest.contentDate}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
}
