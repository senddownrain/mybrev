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
 * snapshots and every document must pass validation. Every collection
 * carries its own contentVersion: the export time of the snapshot it was
 * read from (an update downloaded after it is newer, one before it is older;
 * the app reconciles its overlay per collection). The manifest's top-level
 * contentVersion is the newest of them (the «version of the texts»).
 *
 * Before an app release (`npm run content:app-release -- …`):
 *   --compare-live   also reads contentManifest/current (one read) and
 *                    fails when the bundle differs from what is published
 *                    (a stale snapshot, or a change not published yet).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import {
  APP_CONTENT_COLLECTIONS,
  PRAYER_EXPORT_GUARDS,
  CONTENT_SCHEMA_VERSION,
  describeDocuments,
  encodeCollection,
  storedDocument,
  validateCollection,
  publicAppCollections,
} from './lib/app-content.mjs';

function parseArgs(argv) {
  const options = { snapshots: [], out: null, compareLive: false, serviceAccount: path.join(process.cwd(), 'patchs', 'serviceAccountKey.json') };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--snapshot') options.snapshots.push(argv[++index]);
    else if (argv[index] === '--out') options.out = argv[++index];
    else if (argv[index] === '--compare-live') options.compareLive = true;
  }
  if (!options.snapshots.length || !options.out) {
    throw new Error('Usage: build-app-bundle.mjs --snapshot <dir> [--snapshot <dir>] --out <assets/content>');
  }
  return options;
}

export async function readCollections(snapshotDirs, names = APP_CONTENT_COLLECTIONS) {
  const found = new Map();
  const versions = new Map();
  const readsPrayers = names.includes('prayers') || names.includes('prayerCategories');
  const sources = readsPrayers ? [...new Set([...names, ...PRAYER_EXPORT_GUARDS])] : names;
  for (const dir of snapshotDirs) {
    const snapshot = await openFirestoreSnapshot(dir);
    if (readsPrayers && ['prayers', 'prayerCategories'].some((name) => snapshot.collectionPaths.includes(name))) {
      const rollout = await snapshot.document('priestContentControl', 'accessSetsV2');
      if (['canonical', 'suspended'].includes(rollout?.mode)
        && !['prayers', 'prayerCategories', ...PRAYER_EXPORT_GUARDS].every((name) => snapshot.collectionPaths.includes(name))) {
        throw new Error('Canonical prayer bundle snapshot must cover public paths, canonical paths and legacy mirrors');
      }
    }
    for (const name of sources) {
      if (found.has(name)) continue;
      // Document id and data apart: a data field `id` (compendiumMeta has
      // one) must not replace the document id — as in the app and Firestore.
      const entries = await snapshot.collectionEntries(name);
      if (!entries) continue;
      found.set(name, entries.map(({ id, data }) => storedDocument(id, data)).sort((a, b) => (a.id < b.id ? -1 : 1)));
      versions.set(name, Date.parse(snapshot.manifest.exportedAt));
    }
  }
  const missing = names.filter((name) => !found.has(name));
  if (missing.length) throw new Error(`Not in the snapshots: ${missing.join(', ')}`);
  return { collections: found, versions, contentVersion: Math.max(...versions.values()) };
}

/**
 * Writes `<collection>.json.gz` and `manifest.json` into [out]. Every
 * collection file and manifest entry carries the version of that collection
 * (its snapshot time), never a shared minimum.
 */
export function writeBundle(collections, versions, contentVersion, out, { log = console.log } = {}) {
  collections = publicAppCollections(collections);
  fs.mkdirSync(out, { recursive: true });
  const manifest = {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    contentVersion,
    contentDate: new Date(contentVersion).toISOString(),
    collections: {},
  };
  for (const [name, docs] of collections) {
    const described = describeDocuments(docs);
    const { strings, docs: encoded } = encodeCollection(docs);
    const version = versions.get(name);
    const payload = Buffer.from(JSON.stringify({
      schemaVersion: CONTENT_SCHEMA_VERSION,
      collection: name,
      contentVersion: version,
      strings,
      docs: encoded,
      hashes: described.hashes,
    }));
    const file = `${name}.json.gz`;
    // mtime 0: the same content always gives the same bytes.
    const gz = zlib.gzipSync(payload, { level: 9 });
    gz.writeUInt32LE(0, 4);
    fs.writeFileSync(path.join(out, file), gz);
    manifest.collections[name] = {
      file,
      contentVersion: version,
      contentDate: new Date(version).toISOString(),
      count: described.count,
      digest: described.digest,
      storedBytes: described.bytes,
      bundleBytes: gz.length,
    };
    log(`${name.padEnd(20)} ${String(described.count).padStart(5)} docs  ${(described.bytes / 1048576).toFixed(2).padStart(6)} MB stored → ${(gz.length / 1048576).toFixed(2)} MB  (${new Date(version).toISOString().slice(0, 10)})`);
  }
  fs.writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { collections, versions, contentVersion } = await readCollections(options.snapshots);
  const invalid = [...collections].flatMap(([name, docs]) => validateCollection(name, docs));
  if (invalid.length) {
    invalid.slice(0, 20).forEach((item) => console.error(`  ${item.collection}/${item.id}: ${item.reason}`));
    throw new Error(`${invalid.length} invalid documents: the bundle was not written.`);
  }
  const manifest = writeBundle(collections, versions, contentVersion, options.out);
  const total = Object.values(manifest.collections).reduce((sum, item) => sum + item.bundleBytes, 0);
  console.log(`total bundle ${(total / 1048576).toFixed(2)} MB, contentVersion ${manifest.contentDate}`);
  if (options.compareLive) await compareLive(manifest, options.serviceAccount);
}

/** The bundle must equal the published content (one Firestore read). */
async function compareLive(manifest, serviceAccountPath) {
  const [{ default: admin }, credentials] = await Promise.all([import('firebase-admin'), fs.promises.readFile(serviceAccountPath, 'utf8')]);
  const serviceAccount = JSON.parse(credentials);
  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id }, `content-bundle-${Date.now()}`);
  try {
    const firestore = admin.firestore(app);
    firestore.settings({ preferRest: true });
    const published = (await firestore.collection('contentManifest').doc('current').get()).data();
    if (!published) throw new Error('contentManifest/current is not published.');
    // A collection the published manifest does not name yet is introduced by
    // this release (old apps ignore it); publish it after the release with
    // `content:manifest -- --apply --introduce-collections`.
    const introduced = Object.keys(manifest.collections).filter((name) => !published.collections?.[name]);
    const differing = Object.entries(manifest.collections)
      .filter(([name, item]) => published.collections?.[name] && published.collections[name].digest !== item.digest)
      .map(([name]) => name);
    if (introduced.length) {
      console.warn(`\nNEW IN THIS RELEASE (not in contentManifest yet): ${introduced.join(', ')}.\n`
        + 'Publish them only after this app version is live: npm run content:manifest -- --apply --introduce-collections');
    }
    if (published.schemaVersion !== manifest.schemaVersion) differing.push(`schemaVersion ${published.schemaVersion} ≠ ${manifest.schemaVersion}`);
    if (differing.length) {
      process.exitCode = 3;
      console.error(`\nBUNDLE ≠ PUBLISHED: ${differing.join(', ')}.\nRefresh the snapshot, or publish the manifest (content:manifest), then rebuild — do not release this bundle.`);
    } else {
      console.log('bundle = published manifest: ready for the app release.');
    }
  } finally {
    await app.delete();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
}
