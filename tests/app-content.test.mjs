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
