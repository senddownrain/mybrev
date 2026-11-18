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
 * The manifest is the published state: a change in Firestore reaches the
 * apps only through this command, after validation and a diff report:
 *
 *   SAFE CONTENT PATCH     → --apply publishes it
 *   MASS CONTENT REBUILD   → refused (a new bundle + app release);
 *                            --allow-large-patch overrides, loudly
 *   SCHEMA CHANGE          → refused; --schema-release only together with
 *                            the app release that reads the new schema
 *   invalid documents      → refused, always
 *
 * Additive: only `contentManifest/*` is written; content is only read.
 * Report: reports/content/manifest-diff.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  APP_CONTENT_COLLECTIONS,
  CONTENT_SCHEMA_VERSION,
  classifyPatch,
  describeDocuments,
  diffCollection,
  formatPatchReport,
  storedDocument,
  validateCollection,
  publicAppCollections,
} from './lib/app-content.mjs';
import { readCollections } from './build-app-bundle.mjs';
import { recordMigration } from '../liturgy/lib/migration-report.mjs';

export const MANIFEST_COLLECTION = 'contentManifest';
const ROOT = process.cwd();

function parseArgs(argv) {
  const options = {
    snapshots: [], collections: [], apply: false, allowLargePatch: false, schemaRelease: false, introduceCollections: false,
    serviceAccount: path.join(ROOT, 'patchs', 'serviceAccountKey.json'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--snapshot') options.snapshots.push(argv[++index]);
    else if (argv[index] === '--collection') options.collections.push(argv[++index]);
    else if (argv[index] === '--apply') options.apply = true;
    else if (argv[index] === '--allow-large-patch') options.allowLargePatch = true;
    else if (argv[index] === '--schema-release') options.schemaRelease = true;
    else if (argv[index] === '--introduce-collections') options.introduceCollections = true;
    else if (argv[index] === '--service-account') options.serviceAccount = argv[++index];
  }
  if (options.apply && options.snapshots.length) throw new Error('--apply publishes hashes of live Firestore only (no --snapshot).');
  for(const name of options.collections)if(!APP_CONTENT_COLLECTIONS.includes(name))throw new Error(`Unsupported public collection: ${name}`);
  return options;
}

/** Next manifest from the described collections and the published one. */
/** Whether [verdict] may be published with these flags (and why not). */
export function publicationDecision(verdict, {
  invalid = 0, allowLargePatch = false, schemaRelease = false, introduceCollections = false,
} = {}) {
  if (invalid > 0) return { publish: false, why: `${invalid} invalid documents` };
  if (verdict === 'SAFE CONTENT PATCH' || verdict === 'INITIAL MANIFEST') return { publish: true };
  if (verdict === 'NEW COLLECTIONS') {
    return introduceCollections
      ? { publish: true, loud: true }
      : { publish: false, why: 'new collections (only after the app release that bundles them: --introduce-collections)' };
  }
  if (verdict === 'MASS CONTENT REBUILD') {
    return allowLargePatch
      ? { publish: true, loud: true }
      : { publish: false, why: 'mass rebuild (new bundle + app release, or --allow-large-patch)' };
  }
  if (verdict === 'SCHEMA CHANGE') {
    return schemaRelease
      ? { publish: true, loud: true }
      : { publish: false, why: 'schema change (only with the app release: --schema-release)' };
  }
  return { publish: false, why: verdict };
}

/** Described collections absent from the published manifest, unless introduced. */
export function heldBackCollections(described, published, { introduceCollections = false } = {}) {
  if (!published || introduceCollections) return [];
  return Object.keys(described).filter((name) => !published.collections?.[name]);
}

export function planManifest(described, published, now = Date.now(), {partial=false} = {}) {
  if(partial&&!published)throw new Error('A partial publication requires an existing manifest.');
  const collections = partial ? {...published.collections} : {};
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
    const invalid = [];
    if (firestore) {
      const collections = new Map();
      const selected=options.collections.length?options.collections:APP_CONTENT_COLLECTIONS;
      const readNames=[...new Set([...selected,...(selected.includes('prayers')?['prayerCategories']:[])])];
      for (const name of readNames) {
        console.log(`reading ${name}…`);
        const snapshot = await firestore.collection(name).get();
        const docs = snapshot.docs.map((doc) => storedDocument(doc.id, doc.data()));
        invalid.push(...validateCollection(name, docs));
        collections.set(name, docs);
      }
      for (const [name, docs] of publicAppCollections(collections)) if(!options.collections.length||options.collections.includes(name))described[name] = describeDocuments(docs);
    } else {
      const { collections } = await readCollections(options.snapshots);
      for (const [name, docs] of publicAppCollections(collections)) {
        if(options.collections.length&&!options.collections.includes(name))continue;
        invalid.push(...validateCollection(name, docs));
        described[name] = describeDocuments(docs);
      }
    }
    const published = firestore ? (await firestore.collection(MANIFEST_COLLECTION).doc('current').get()).data() || null : null;
    // Collections not in the published manifest yet stay out of it until the
    // app release that bundles them: the patch of the others is published.
    const heldBack = heldBackCollections(described, published, options);
    for (const name of heldBack) delete described[name];
    if (heldBack.length) {
      console.log(`held back (not in the manifest until the app release, --introduce-collections): ${heldBack.join(', ')}`);
    }
    const { current, changed } = planManifest(described, published, Date.now(), {partial:options.collections.length>0});

    // Diff against the published hashes (read only for changed collections).
    const diffs = [];
    for (const name of changed) {
      const previous = published && firestore
        ? (await firestore.collection(MANIFEST_COLLECTION).doc(name).get()).data() || null
        : null;
      diffs.push(diffCollection(name, described[name], previous));
    }
    const classification = classifyPatch(diffs, { publishedSchema: published ? published.schemaVersion ?? null : null });
    const decision = publicationDecision(classification.verdict, {
      invalid: invalid.length, allowLargePatch: options.allowLargePatch, schemaRelease: options.schemaRelease,
      introduceCollections: options.introduceCollections,
    });
    console.log(invalid.length
      ? `INVALID DOCUMENTS (${invalid.length}):\n${invalid.slice(0, 20).map((item) => `  ${item.collection}/${item.id}: ${item.reason}`).join('\n')}\n`
      : 'validation: OK');
    console.log(changed.length ? formatPatchReport(diffs, classification) : 'CONTENT UPDATE DIFF\n\nNothing changed.');
    const reportPath = path.join(ROOT, 'reports', 'content', 'manifest-diff.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify({
      at: new Date().toISOString(), source: firestore ? 'firestore' : options.snapshots,
      published: published ? { contentVersion: published.contentVersion, schemaVersion: published.schemaVersion } : null,
      classification, decision, invalid,
      diffs: diffs.map((d) => ({ ...d, added: d.added.length, changed: d.changed.length, removed: d.removed.length, ids: { added: d.added, changed: d.changed, removed: d.removed } })),
    }, null, 1)}\n`);
    console.log(`report: ${path.relative(ROOT, reportPath)}`);

    if (!options.apply) {
      console.log(!changed.length ? 'Nothing to publish.'
        : decision.publish ? 'Dry-run: repeat with --apply to publish.' : `Would be refused: ${decision.why}.`);
      return;
    }
    if (!changed.length) {
      recordMigration(ROOT, { collection: MANIFEST_COLLECTION, mode: 'apply', unchanged: APP_CONTENT_COLLECTIONS.length });
      return;
    }
    if (!decision.publish) {
      process.exitCode = 2;
      console.error(`\nREFUSED: ${decision.why}. Nothing was published.`);
      recordMigration(ROOT, { collection: MANIFEST_COLLECTION, mode: 'refused', skipped: changed.length, notes: `${classification.verdict}: ${decision.why}` });
      return;
    }
    if (decision.loud) {
      console.warn(`\n${'!'.repeat(72)}\n!! PUBLISHING ${classification.verdict} AS A PATCH (explicit override)\n!! Every app downloads it over the network.\n${'!'.repeat(72)}\n`);
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

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const run = process.argv.includes('--reviewed-manifest-authorization')
    ? import('./lib/reviewed-manifest.mjs').then(m => m.reviewedManifestMain(process.argv.slice(2))) : main();
  run.catch((error) => { console.error(error.message || error); process.exitCode = 1; });
}
