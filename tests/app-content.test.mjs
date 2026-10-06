import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalJson,
  collectionDigest,
  decodeCollection,
  describeDocuments,
  documentHash,
  encodeCollection,
  storedDocument,
  STRING_REF,
} from '../scripts/content/lib/app-content.mjs';
import { planManifest } from '../scripts/content/publish-manifest.mjs';

const psalm = 'Пан — мой пастыр, нічога мне не бракуе. '.repeat(3);

test('canonical JSON sorts keys at every level', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: null } }), '{"a":{"c":null,"d":[2,{"x":2,"y":1}]},"b":1}');
});

test('a document hash ignores bookkeeping, not text', () => {
  const doc = { id: 'x', laudesPs1: psalm, updatedAt: 1 };
  assert.equal(documentHash(doc), documentHash({ ...doc, updatedAt: 2, importedAt: 3 }));
  assert.notEqual(documentHash(doc), documentHash({ ...doc, laudesPs1: `${psalm}!` }));
  assert.match(documentHash(doc), /^[0-9a-f]{16}$/);
});

test('timestamps become epoch milliseconds, as the app stores them', () => {
  const doc = storedDocument('x', { at: { __firestoreType: 'timestamp', seconds: 2, nanoseconds: 5_000_000 }, list: [new Date(7)] });
  assert.deepEqual(doc, { at: 2005, list: [7], id: 'x' });
});

test('long strings are stored once and decode to the same documents', () => {
  const docs = [
    { id: 'a', laudesPs1: psalm, title: 'A' },
    { id: 'b', vesperPs1: psalm, nested: [{ text: psalm }] },
  ];
  const encoded = encodeCollection(docs);
  assert.equal(encoded.strings.length, 1);
  assert.equal(encoded.docs.a.laudesPs1, `${STRING_REF}0`);
  assert.deepEqual(decodeCollection(encoded), { a: docs[0], b: docs[1] });
  assert.throws(() => encodeCollection([{ id: 'c', t: `${STRING_REF}1` }]));
});

test('the digest depends on ids and hashes only, in id order', () => {
  assert.equal(collectionDigest({ b: '2', a: '1' }), collectionDigest({ a: '1', b: '2' }));
  assert.notEqual(collectionDigest({ a: '1' }), collectionDigest({ a: '2' }));
  const described = describeDocuments([{ id: 'a', t: 'x' }]);
  assert.equal(described.count, 1);
  assert.equal(described.digest, collectionDigest(described.hashes));
});

test('the manifest version moves only with the content', () => {
  const described = { days: { digest: 'd1', count: 1, bytes: 10 }, songs: { digest: 's1', count: 2, bytes: 20 } };
  const first = planManifest(described, null, 100);
  assert.deepEqual(first.changed, ['days', 'songs']);
  assert.equal(first.current.contentVersion, 100);
  assert.equal(first.current.collections.days.version, 1);
  const same = planManifest(described, first.current, 200);
  assert.deepEqual(same.changed, []);
  assert.equal(same.current.contentVersion, 100);
  const next = planManifest({ ...described, days: { digest: 'd2', count: 1, bytes: 11 } }, first.current, 300);
  assert.deepEqual(next.changed, ['days']);
  assert.equal(next.current.contentVersion, 300);
  assert.equal(next.current.collections.days.version, 2);
  assert.equal(next.current.collections.songs.version, 1);
});

import { classifyPatch, diffCollection, formatPatchReport, validateCollection, PATCH_LIMITS } from '../scripts/content/lib/app-content.mjs';
import { publicationDecision } from '../scripts/content/publish-manifest.mjs';

// A pretend published collection of [count] documents of [size] bytes.
function corpus(prefix, count, size) {
  const hashes = {};
  const sizes = {};
  for (let i = 0; i < count; i += 1) {
    hashes[`${prefix}-${i}`] = `h${i}`;
    sizes[`${prefix}-${i}`] = size;
  }
  return { hashes, sizes, count };
}

function edit(published, { change = 0, add = 0, remove = 0, size = 1000 }) {
  const next = { hashes: { ...published.hashes }, sizes: { ...published.sizes } };
  Object.keys(published.hashes).slice(0, change).forEach((id) => { next.hashes[id] = `${next.hashes[id]}x`; });
  Object.keys(published.hashes).slice(-remove || Infinity).forEach((id) => { if (remove) { delete next.hashes[id]; delete next.sizes[id]; } });
  for (let i = 0; i < add; i += 1) { next.hashes[`new-${i}`] = `n${i}`; next.sizes[`new-${i}`] = size; }
  next.count = Object.keys(next.hashes).length;
  return next;
}

test('+100 prayers, 8 songs, 3 days, 2 readings: a safe patch', () => {
  const prayers = corpus('p', 117, 17_000);
  const songs = corpus('s', 447, 800);
  const days = corpus('d', 735, 70_000);
  const readings = corpus('r', 815, 5_000);
  const diffs = [
    diffCollection('prayers', edit(prayers, { add: 100, change: 2, size: 3_000 }), prayers),
    diffCollection('songs', edit(songs, { add: 8, change: 1, size: 800 }), songs),
    diffCollection('days', edit(days, { change: 3 }), days),
    diffCollection('readings', edit(readings, { change: 2 }), readings),
  ];
  const result = classifyPatch(diffs, { publishedSchema: 1 });
  assert.equal(result.verdict, 'SAFE CONTENT PATCH');
  assert.equal(diffs[0].added.length, 100);
  assert.equal(diffs[0].changed.length, 2);
  const report = formatPatchReport(diffs, result);
  assert.match(report, /prayers:\n {2}added: {3}100\n {2}changed: 2 \/ 117/);
  assert.match(report, /RESULT:\nSAFE CONTENT PATCH/);
  assert.deepEqual(publicationDecision(result.verdict), { publish: true });
});

test('most days rebuilt: refused as a mass rebuild', () => {
  const days = corpus('d', 735, 70_000);
  const readings = corpus('r', 815, 5_000);
  const diffs = [
    diffCollection('days', edit(days, { change: 690 }), days),
    diffCollection('readings', edit(readings, { change: 704 }), readings),
  ];
  const result = classifyPatch(diffs, { publishedSchema: 1 });
  assert.equal(result.verdict, 'MASS CONTENT REBUILD');
  assert.ok(result.reasons.some((reason) => reason.startsWith('days: 690 / 735')));
  assert.match(formatPatchReport(diffs, result), /Do not publish this as a content patch/);
  assert.equal(publicationDecision(result.verdict).publish, false);
  assert.deepEqual(publicationDecision(result.verdict, { allowLargePatch: true }), { publish: true, loud: true });
});

test('size alone can make a patch a rebuild', () => {
  const days = corpus('d', 735, 70_000);
  const diffs = [diffCollection('days', edit(days, { change: 90 }), days)];
  assert.ok(90 * 70_000 > PATCH_LIMITS.maxBytes);
  assert.equal(classifyPatch(diffs, { publishedSchema: 1 }).verdict, 'MASS CONTENT REBUILD');
});

test('a schema change is refused; the large-patch override does not help', () => {
  const result = classifyPatch([], { publishedSchema: 1, schema: 2 });
  assert.equal(result.verdict, 'SCHEMA CHANGE');
  assert.equal(publicationDecision(result.verdict, { allowLargePatch: true }).publish, false);
  assert.equal(publicationDecision(result.verdict, { schemaRelease: true }).publish, true);
});

test('invalid documents are never published', () => {
  const invalid = validateCollection('songs', [{ id: 'a', title: 'A', text: 'x' }, { id: 'b', title: '', text: 'x' }]);
  assert.deepEqual(invalid, [{ collection: 'songs', id: 'b', reason: 'no title/text' }]);
  assert.equal(publicationDecision('SAFE CONTENT PATCH', { invalid: 1, allowLargePatch: true }).publish, false);
  assert.deepEqual(validateCollection('prayers', [{ id: 'p', titleVersions: { be: 'Т' }, textVersions: { be: 'Т' } }]), []);
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { readCollections, writeBundle } from '../scripts/content/build-app-bundle.mjs';

/** A minimal private snapshot directory (scripts/lib/firestore-snapshot.mjs format). */
function fakeSnapshot(exportedAt, collections) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-'));
  const manifest = { schemaVersion: 1, exportedAt, collections: {} };
  for (const [name, docs] of Object.entries(collections)) {
    const file = `${name}.json`;
    fs.writeFileSync(path.join(dir, file), JSON.stringify({
      schemaVersion: 1, collectionPath: name, documents: docs.map(({ id, ...data }) => ({ id, data })),
    }));
    manifest.collections[name] = { file };
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  return dir;
}

test('every bundled collection carries the version of its own snapshot', async () => {
  const days = fakeSnapshot('2026-10-06T00:00:00.000Z', { days: [{ id: 'd1', _periodType: 'ordinary' }] });
  const statics = fakeSnapshot('2026-09-01T00:00:00.000Z', { prayers: [{ id: 'p1', title: 'Т', text: 'Т' }] });
  const { collections, versions, contentVersion } = await readCollections([days, statics], ['days', 'prayers']);
  assert.equal(versions.get('days'), Date.parse('2026-10-06T00:00:00.000Z'));
  assert.equal(versions.get('prayers'), Date.parse('2026-09-01T00:00:00.000Z'));
  assert.equal(contentVersion, versions.get('days'), 'top-level: the newest');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-'));
  const manifest = writeBundle(collections, versions, contentVersion, out, { log: () => {} });
  assert.equal(manifest.collections.days.contentVersion, versions.get('days'));
  assert.equal(manifest.collections.prayers.contentVersion, versions.get('prayers'));
  const file = (name) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(out, `${name}.json.gz`))));
  assert.equal(file('days').contentVersion, versions.get('days'));
  assert.equal(file('prayers').contentVersion, versions.get('prayers'));
});
