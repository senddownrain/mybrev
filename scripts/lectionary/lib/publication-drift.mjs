/**
 * Publication drift of the lectionary-related layers (read-only):
 *   repo (staged)  →  production Firestore snapshot  →  contentManifest  →  Flutter bundle  →  browser
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { collectionDigest, decodeCollection, describeDocuments, storedDocument } from '../../content/lib/app-content.mjs';
import { comparable } from '../../liturgy/audit-drift.mjs';
import { ROOT, sha256 } from './source-pages.mjs';
import { short } from './reports.mjs';

const COLLECTIONS = ['readings', 'days', 'liturgicalTemplates', 'invitatoriums', 'completoriums', 'liturgicalCalendarMeta', 'liturgicalCelebrations', 'liturgicalDioceseOverrides', 'liturgicalYearOverrides', 'liturgicalProperTexts', 'liturgicalOrdoNotes'];
const FLUTTER_REPO = '/Users/gleb/Documents/GitHub/senddownrain/ibreviarybyapp';
const idsDiff = (left, right) => ({
  added: Object.keys(right).filter((id) => !(id in left)).sort(),
  removed: Object.keys(left).filter((id) => !(id in right)).sort(),
  changed: Object.keys(left).filter((id) => id in right && left[id] !== right[id]).sort(),
});

async function describeSnapshot(snap) {
  const out = {};
  for (const name of COLLECTIONS) {
    if (!snap.manifest.collections[name]) { out[name] = null; continue; }
    const docs = (await snap.collection(name)).map(({ id, ...data }) => storedDocument(id, data));
    out[name] = { ...describeDocuments(docs), file: snap.manifest.collections[name].file, fileSha256: snap.manifest.collections[name].sha256 };
  }
  return out;
}

export async function buildPublicationDrift({ audit, snapshotDir, previousSnapshotDir = path.join(ROOT, 'backups', 'firestore-snapshot') }) {
  const snap = audit.snap;
  const production = await describeSnapshot(snap);
  const publishedDocs = Object.fromEntries((await snap.collection('contentManifest')).map(({ id, ...data }) => [id, data]));
  const current = publishedDocs.current;
  // ── manifest vs production (STALE_PUBLISHED when the digests differ)
  const manifest = {};
  for (const name of COLLECTIONS) {
    const published = publishedDocs[name];
    const live = production[name];
    if (!published) { manifest[name] = { published: false, note: current?.collections?.[name] ? 'listed in current but no hash document' : 'not in the manifest (held back until the app release that bundles it)', production: live ? { digest: live.digest, count: live.count } : null }; continue; }
    const diff = idsDiff(published.hashes, live?.hashes || {});
    manifest[name] = {
      published: true, version: published.version, digest: published.digest, count: Object.keys(published.hashes).length,
      production: live ? { digest: live.digest, count: live.count } : null,
      inSync: live ? published.digest === live.digest : null, ...(live && published.digest !== live.digest ? { staleDocuments: diff } : {}),
    };
  }
  // ── Flutter bundle vs manifest
  let flutterBundle = null;
  const bundleManifestPath = path.join(FLUTTER_REPO, 'assets', 'content', 'manifest.json');
  if (fs.existsSync(bundleManifestPath)) {
    const man = JSON.parse(fs.readFileSync(bundleManifestPath, 'utf8'));
    flutterBundle = { path: 'ibreviarybyapp/assets/content', contentVersion: man.contentVersion, contentDate: man.contentDate };
    for (const name of COLLECTIONS) {
      const entry = man.collections?.[name];
      if (!entry) { flutterBundle[name] = null; continue; }
      const file = path.join(FLUTTER_REPO, 'assets', 'content', entry.file);
      const bundleHashes = describeDocuments(Object.values(decodeCollection(JSON.parse(zlib.gunzipSync(fs.readFileSync(file)))))).hashes;
      const published = publishedDocs[name]?.hashes;
      const live = production[name]?.hashes;
      flutterBundle[name] = {
        contentVersion: entry.contentVersion, count: entry.count, digest: entry.digest, recomputedDigest: collectionDigest(bundleHashes),
        vsManifest: published ? { equal: collectionDigest(bundleHashes) === publishedDocs[name].digest, ...idsDiff(bundleHashes, published) } : 'not in the manifest',
        vsProduction: live ? { equal: collectionDigest(bundleHashes) === production[name].digest, ...idsDiff(bundleHashes, live) } : null,
      };
    }
  }
  // ── previous local snapshot (what the earlier audits worked on)
  let previous = null;
  const previousManifest = path.join(previousSnapshotDir, 'manifest.json');
  if (fs.existsSync(previousManifest)) {
    const m = JSON.parse(fs.readFileSync(previousManifest, 'utf8'));
    previous = { dir: 'backups/firestore-snapshot', exportedAt: m.exportedAt, snapshotVersion: m.snapshotVersion, collections: Object.fromEntries(Object.entries(m.collections).filter(([n]) => COLLECTIONS.includes(n)).map(([n, c]) => [n, { count: c.documentCount, fileSha256: c.sha256 }])) };
  }
  // ── repo (staged) vs production
  const definitions = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ordo/calendar-definitions.json'), 'utf8'));
  const notes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ordo/notes.json'), 'utf8'));
  const [meta] = await snap.collection('liturgicalCalendarMeta');
  const productionOverrides = (await snap.collection('liturgicalYearOverrides')).map(({ id, ...data }) => ({ id, ...data })).sort((a, b) => a.id.localeCompare(b.id));
  const bundledOverrides = (definitions.yearOverrides || []).map((item) => ({ ...item })).sort((a, b) => a.id.localeCompare(b.id));
  const sameOverrides = JSON.stringify(productionOverrides.map(comparable)) === JSON.stringify(bundledOverrides.map(comparable));
  const driftFile = path.join(ROOT, 'reports', 'liturgy', 'firestore-drift.json');
  const liturgyDrift = fs.existsSync(driftFile) ? JSON.parse(fs.readFileSync(driftFile, 'utf8')) : null;
  const fixtureDir = path.join(ROOT, 'tests', 'fixtures', 'catholicby');
  const repo = {
    calendarDefinitions: { revision: definitions.revision, celebrations: definitions.celebrations?.length, dioceseOverrides: definitions.dioceseOverrides?.length, yearOverrides: bundledOverrides.length, sha256: short(definitions) },
    notes: { revision: notes.revision, sha256: short(notes.items ? notes.items.length : Object.keys(notes)) },
    production: { calendarRevision: meta?.revision ?? null, notesRevision: meta?.notesRevision ?? null, properTextsRevision: meta?.properTextsRevision ?? null, templatesRevision: meta?.templatesRevision ?? null },
    liturgicalYearOverrides: { production: productionOverrides.length, bundled: bundledOverrides.length, inSync: sameOverrides },
    ordoCollectionsVsBundled: liturgyDrift ? { generatedAt: liturgyDrift.generatedAt, snapshot: liturgyDrift.snapshot, summary: liturgyDrift.summary, revisions: liturgyDrift.revisions } : 'run `npm run liturgy:audit -- --snapshot <dir>` first',
    lectionaryFixtures: { pages: fs.readdirSync(fixtureDir).filter((f) => f.endsWith('.html')).length, sha256: short(fs.readdirSync(fixtureDir).sort().map((f) => sha256(fs.readFileSync(path.join(fixtureDir, f), 'utf8')))) },
    crawlSnapshots: { articles: Object.keys(audit.crawl.items).length, crawledAt: audit.crawl.crawledAt, sha256: short(Object.values(audit.crawl.items).map((i) => [i.id, i.sha256])) },
    readingsSetsPlan: readingsSetsPlanState(),
    resyncPlan: { changes: audit.resync.changes.length, skipped: audit.resync.skipped.length, status: 'PENDING APPLY: dry-run plan only (reports/lectionary/resync-plan.json)' },
  };
  const table = COLLECTIONS.map((name) => ({
    collection: name,
    production: production[name] ? { count: production[name].count, digest: production[name].digest } : null,
    manifest: manifest[name]?.published ? { version: manifest[name].version, digest: manifest[name].digest, inSync: manifest[name].inSync } : 'not published',
    flutterBundle: flutterBundle?.[name] ? { count: flutterBundle[name].count, digest: flutterBundle[name].digest, equalsManifest: flutterBundle[name].vsManifest?.equal ?? null, behindManifestBy: typeof flutterBundle[name].vsManifest === 'object' ? flutterBundle[name].vsManifest.changed.length + flutterBundle[name].vsManifest.added.length + flutterBundle[name].vsManifest.removed.length : null } : null,
    status: statusOf(name, manifest[name], flutterBundle?.[name]),
  }));
  return {
    schema: 1, generatedAt: audit.generatedAt,
    snapshot: { dir: path.relative(ROOT, snap.dir), snapshotVersion: snap.manifest.snapshotVersion, exportedAt: snap.manifest.exportedAt, totalDocuments: snap.manifest.totalDocuments, readOnly: true, collectionFiles: Object.fromEntries(COLLECTIONS.filter((n) => production[n]).map((n) => [n, production[n].fileSha256])) },
    production: Object.fromEntries(COLLECTIONS.map((n) => [n, production[n] ? { count: production[n].count, digest: production[n].digest, bytes: production[n].bytes } : null])),
    manifest: { current: current ? { contentVersion: current.contentVersion, publishedAt: current.publishedAt, schemaVersion: current.schemaVersion, collections: current.collections } : null, ...manifest },
    flutterBundle, previousLocalSnapshot: previous, repo,
    browser: {
      status: 'NOT_OBSERVABLE_HEADLESSLY',
      consumes: 'live Firestore queries for `readings`/`days` + bundled calendar definitions (revision above) and notes; IndexedDB/persistent cache by content key (src/utils/publicContentCache.js)',
      bundledCalendarRevision: definitions.revision, productionCalendarRevision: meta?.revision ?? null,
      note: 'A browser always reads readings from production Firestore (not through the manifest); a stale browser = a stale Service Worker/IndexedDB copy, refreshed by requestContentRefresh.',
    },
    driftTable: table,
    pendingApply: [
      { id: 'lectionary-resync', description: `${audit.resync.changes.length} legacy readings documents differ from the canonical page text (dry-run plan, never applied)`, command: 'node scripts/lectionary/resync-readings.mjs --apply (after review)' },
      { id: 'engine-sunday-readings', description: 'Engine change (Sundays of Advent 17–24.12 / Christmas time, Sunday 24.12 vigil) ships with the next web build and the Flutter port of the same lookup', command: 'npm run build && firebase deploy --only hosting (owner)' },
    ],
  };
}

function statusOf(name, manifestEntry, bundle) {
  if (!manifestEntry?.published) return 'HELD_BACK';
  if (manifestEntry.inSync === false) return 'STALE_PUBLISHED';
  if (bundle && typeof bundle.vsManifest === 'object' && !bundle.vsManifest.equal) return 'APP_BUNDLE_BEHIND_MANIFEST (patch delivered by the manifest)';
  return 'IN_SYNC';
}

function readingsSetsPlanState() {
  const file = path.join(ROOT, 'reports', 'liturgy', 'readings-sets', 'plan.json');
  if (!fs.existsSync(file)) return null;
  const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { generatedAt: plan.generatedAt, source: plan.source, documents: plan.changes.length, identicalToProduction: plan.changes.filter((c) => !c.changedFields.length).length, withChanges: plan.changes.filter((c) => c.changedFields.length).length };
}
