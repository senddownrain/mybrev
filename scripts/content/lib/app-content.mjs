/**
 * Canonical app content: the collections the Flutter app ships inside the
 * package and keeps current with a version manifest.
 *
 * One definition of «the same document» for both sides:
 *   - the bundle built into the app (build-app-bundle.mjs),
 *   - the manifest published to Firestore (publish-manifest.mjs).
 * A document hash ignores bookkeeping fields that change on re-import
 * without changing the text.
 */
import { createHash } from 'node:crypto';

export const CONTENT_SCHEMA_VERSION = 1;

/** Collections the app ships and updates (order = load priority). */
export const APP_CONTENT_COLLECTIONS = [
  'days',
  'readings',
  'liturgicalTemplates',
  'invitatoriums',
  'completoriums',
  'prayers',
  'prayerCategories',
  'songs',
];

/** Written by imports, not part of the text. */
export const BOOKKEEPING_FIELDS = new Set(['updatedAt', 'importedAt', 'parsedAt', 'miniSavedAt']);

/** A string this long or longer is stored once per collection. */
export const SHARED_STRING_MIN = 32;
/** Marks a reference into the string table; never the start of real text. */
export const STRING_REF = '\u0001';

/** Firestore value → what the app stores (Timestamp → epoch ms, as `firestoreToStorable`). */
export function toStorable(value) {
  if (Array.isArray(value)) return value.map(toStorable);
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object') {
    if (value.__firestoreType === 'timestamp') return value.seconds * 1000 + Math.floor(value.nanoseconds / 1e6);
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (value.__firestoreType === 'date') return new Date(value.iso).getTime();
    if (value.__firestoreType === 'bytes') return value.base64;
    if (typeof value.path === 'string' && typeof value.firestore === 'object') return value.path;
    if (typeof value.latitude === 'number' && typeof value.longitude === 'number' && Object.keys(value).length <= 2) {
      return { lat: value.latitude, lng: value.longitude };
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toStorable(item)]));
  }
  return value;
}

/** Stable JSON: sorted keys at every level. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);

/** Hash of a stored document (bookkeeping fields excluded). */
export function documentHash(doc) {
  const content = Object.fromEntries(Object.entries(doc).filter(([key]) => !BOOKKEEPING_FIELDS.has(key)));
  return sha(canonicalJson(content));
}

/**
 * Digest of a collection: sha256 over «id\thash\n» lines sorted by id
 * (UTF-16 code-unit order, the same in Dart). The app computes it over its
 * effective content to know whether anything differs at all.
 */
export function collectionDigest(hashes) {
  return sha(Object.keys(hashes).sort().map((id) => `${id}\t${hashes[id]}\n`).join(''));
}

/** Stored form of a document: storable values plus its id. */
export function storedDocument(id, data) {
  return { ...toStorable(data), id };
}

/**
 * Long strings once per collection: psalms, hymns and readings repeat across
 * hundreds of days. The table keeps the file small with ordinary gzip and the
 * decoded documents share the same string objects in memory.
 */
export function encodeCollection(docs) {
  const strings = [];
  const index = new Map();
  const encode = (value) => {
    if (typeof value === 'string') {
      if (value.startsWith(STRING_REF)) throw new Error('A content string starts with the reference marker');
      if (value.length < SHARED_STRING_MIN) return value;
      if (!index.has(value)) {
        index.set(value, strings.length);
        strings.push(value);
      }
      return `${STRING_REF}${index.get(value)}`;
    }
    if (Array.isArray(value)) return value.map(encode);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
    return value;
  };
  const encoded = Object.fromEntries(docs.map((doc) => [doc.id, encode(doc)]));
  return { strings, docs: encoded };
}

/** Inverse of `encodeCollection` (tests; the app has its own decoder). */
export function decodeCollection({ strings, docs }) {
  const decode = (value) => {
    if (typeof value === 'string') return value.startsWith(STRING_REF) ? strings[Number(value.slice(1))] : value;
    if (Array.isArray(value)) return value.map(decode);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]));
    return value;
  };
  return Object.fromEntries(Object.entries(docs).map(([id, doc]) => [id, decode(doc)]));
}

/** Hashes and stored sizes of a list of stored documents. */
export function describeDocuments(docs) {
  const hashes = {};
  const sizes = {};
  for (const doc of docs) {
    hashes[doc.id] = documentHash(doc);
    sizes[doc.id] = Buffer.byteLength(JSON.stringify(doc));
  }
  return { hashes, sizes, digest: collectionDigest(hashes), count: docs.length, bytes: Object.values(sizes).reduce((a, b) => a + b, 0) };
}
