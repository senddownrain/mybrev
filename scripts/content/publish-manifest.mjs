#!/usr/bin/env node
/**
 * Publishes the version manifest of the app content: what the app compares
 * to know whether anything changed since its bundle, and which documents.
 *
 *   contentManifest/current       tiny: per collection digest, count, version
 *   contentManifest/<collection>  per document hash and stored size
 *
 * The app reads `current` (one small document) at most once a day; a
 * collection document only when that collection's digest differs; then
 * only the changed documents by id.
 *
 *   npm run content:manifest                         dry-run, live Firestore
 *   npm run content:manifest -- --snapshot <dir>     dry-run from a snapshot (analysis)
 *   npm run content:manifest -- --apply              write (live source only)
 *
 * Run after every content publication (imports, admin edits). Additive:
 * only `contentManifest/*` is written; content collections are only read.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { APP_CONTENT_COLLECTIONS, CONTENT_SCHEMA_VERSION, describeDocuments, storedDocument } from './lib/app-content.mjs';
import { readCollections } from './build-app-bundle.mjs';
import { recordMigration } from '../liturgy/lib/migration-report.mjs';

export const MANIFEST_COLLECTION = 'contentManifest';
const ROOT = process.cwd();

function parseArgs(argv) {
  const options = { snapshots: [], apply: false, serviceAccount: path.join(ROOT, 'patchs', 'serviceAccountKey.json') };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--snapshot') options.snapshots.push(argv[++index]);
    else if (argv[index] === '--apply') options.apply = true;
    else if (argv[index] === '--service-account') options.serviceAccount = argv[++index];
  }
  if (options.apply && options.snapshots.length) throw new Error('--apply publishes hashes of live Firestore only (no --snapshot).');
  return options;
}

/** Next manifest from the described collections and the published one. */
export function planManifest(described, published, now = Date.now()) {
  const collections = {};
  const changed = [];
  for (const [name, item] of Object.entries(described)) {
    const before = published?.collections?.[name];
    const same = before?.digest === item.digest;
    if (!same) changed.push(name);
    collections[name] = { digest: item.digest, count: item.count, bytes: item.bytes, version: same ? before.version : (before?.version || 0) + 1 };
  }
  const current = {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    contentVersion: changed.length ? now : published.contentVersion,
    publishedAt: changed.length ? new Date(now).toISOString() : published.publishedAt,
    collections,
  };
  return { current, changed };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let firestore = null;
  let app = null;
  if (!options.snapshots.length) {
    if (!fs.existsSync(options.serviceAccount)) throw new Error('Service-account key not found (or pass --snapshot for an analysis).');
    const [{ default: admin }, credentials] = await Promise.all([import('firebase-admin'), fs.promises.readFile(options.serviceAccount, 'utf8')]);
    const serviceAccount = JSON.parse(credentials);
    app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id }, `content-manifest-${Date.now()}`);
    firestore = admin.firestore(app);
    // REST goes through an HTTPS proxy where gRPC streams drop.
    firestore.settings({ preferRest: true });
  }
  try {
    const described = {};
    if (firestore) {
      for (const name of APP_CONTENT_COLLECTIONS) {
        console.log(`reading ${name}…`);
        const snapshot = await firestore.collection(name).get();
        described[name] = describeDocuments(snapshot.docs.map((doc) => storedDocument(doc.id, doc.data())));
      }
    } else {
      const { collections } = await readCollections(options.snapshots);
      for (const [name, docs] of collections) described[name] = describeDocuments(docs);
    }
    const published = firestore ? (await firestore.collection(MANIFEST_COLLECTION).doc('current').get()).data() || null : null;
    const { current, changed } = planManifest(described, published);
    console.log(JSON.stringify({
      source: firestore ? 'firestore' : options.snapshots,
      published: published ? { contentVersion: published.contentVersion, publishedAt: published.publishedAt } : null,
      changed,
      collections: Object.fromEntries(Object.entries(current.collections).map(([name, item]) => [name, `${item.count} docs, v${item.version}, ${item.digest}`])),
    }, null, 2));
    if (!options.apply) {
      console.log(changed.length ? 'Dry-run: repeat with --apply to publish.' : 'Nothing changed.');
      return;
    }
    if (!changed.length) {
      recordMigration(ROOT, { collection: MANIFEST_COLLECTION, mode: 'apply', unchanged: APP_CONTENT_COLLECTIONS.length });
      return;
    }
    // Collection documents first: `current` never points to a digest whose
    // hashes are not readable yet.
    for (const name of changed) {
      const item = described[name];
      await firestore.collection(MANIFEST_COLLECTION).doc(name).set({
        collection: name, digest: item.digest, version: current.collections[name].version, hashes: item.hashes, sizes: item.sizes,
      });
    }
    await firestore.collection(MANIFEST_COLLECTION).doc('current').set(current);
    const check = (await firestore.collection(MANIFEST_COLLECTION).doc('current').get()).data();
    if (check.contentVersion !== current.contentVersion) throw new Error('Verification failed: current was not written.');
    recordMigration(ROOT, {
      collection: MANIFEST_COLLECTION, mode: 'apply',
      create: published ? 0 : changed.length + 1, update: published ? changed.length + 1 : 0,
      unchanged: APP_CONTENT_COLLECTIONS.length - changed.length,
      revisionBefore: published?.contentVersion ?? null, revisionAfter: current.contentVersion,
      notes: `changed: ${changed.join(', ')}`,
    });
    console.log(`Published contentManifest (contentVersion ${current.contentVersion}).`);
  } finally {
    await app?.delete();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
}
