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

// ── Publishing safeguard ─────────────────────────────────────────────────────

const filled = (value) => (typeof value === 'string' ? value.trim() !== '' : value !== undefined && value !== null && (typeof value !== 'object' || Object.keys(value).length > 0));
const anyOf = (doc, keys) => keys.some((key) => filled(doc[key]));

/** What a document of each collection must have to be shown at all. */
export const DOCUMENT_RULES = {
  // A day is found by its selector; its texts may be partial (a proper
  // over the current day) or empty (a period placeholder such as
  // advent-w4-d6, covered by the 17–24 December documents).
  // office-for-dead is opened by its id.
  days: (doc) => doc.id === 'office-for-dead' || anyOf(doc, ['_periodType', '_feast', '_date', '_schema']) || 'no selector',
  readings: (doc) => anyOf(doc, ['reading1', 'psalm', 'reading2', 'gospel']) || 'no reading',
  liturgicalTemplates: (doc) => (filled(doc._kind) && filled(doc.title)) || 'no _kind/title',
  invitatoriums: (doc) => filled(doc.invitatoriumPs1) || 'no psalm',
  completoriums: (doc) => (filled(doc._periodType) && filled(doc.compPs1)) || 'no period/psalm',
  prayers: (doc) => (anyOf(doc, ['title', 'titleVersions']) && anyOf(doc, ['text', 'textVersions'])) || 'no title/text',
  prayerCategories: (doc) => filled(doc.name) || 'no name',
  songs: (doc) => (filled(doc.title) && filled(doc.text)) || 'no title/text',
};

/** Documents that would reach the app broken: [{collection, id, reason}]. */
export function validateCollection(name, docs) {
  const rule = DOCUMENT_RULES[name] || (() => true);
  return docs.flatMap((doc) => {
    if (!doc?.id) return [{ collection: name, id: '(no id)', reason: 'no id' }];
    const result = rule(doc);
    return result === true ? [] : [{ collection: name, id: doc.id, reason: result }];
  });
}

/**
 * A content patch is what the app installs over its bundle. Above these a
 * diff is a rebuild of the corpus and belongs to a new bundle in an app
 * release. Corpus: days 735 (~70 KB each), readings 815 (~5 KB), prayers
 * 117 (~17 KB), songs 447 (~1 KB): a typical patch (some prayers, a few days)
 * is well under 2 MB; rebuilding days alone is ~50 MB.
 */
export const PATCH_LIMITS = {
  /** Download of the whole patch (stored bytes of added + changed). */
  maxBytes: 5 * 1024 * 1024,
  /** Edited or removed documents of one collection: share of it… */
  maxReplacedShare: 0.25,
  /** …counted only above this many (small collections, single fixes). */
  replacedFloor: 20,
  /** All documents of the patch. */
  maxDocuments: 300,
};

/**
 * Per collection: added / changed / removed ids and bytes against the
 * published hashes (`previous` null: nothing published yet).
 */
export function diffCollection(name, described, previous) {
  const before = previous?.hashes || {};
  const added = Object.keys(described.hashes).filter((id) => !(id in before)).sort();
  const changed = Object.keys(described.hashes).filter((id) => id in before && before[id] !== described.hashes[id]).sort();
  const removed = Object.keys(before).filter((id) => !(id in described.hashes)).sort();
  const bytes = [...added, ...changed].reduce((sum, id) => sum + (described.sizes[id] || 0), 0);
  return { collection: name, count: described.count, previousCount: Object.keys(before).length, added, changed, removed, bytes };
}

/**
 * SAFE PATCH, MASS CONTENT REBUILD, SCHEMA CHANGE or INITIAL MANIFEST, with
 * the reasons. Only SAFE PATCH (and INITIAL MANIFEST) may be published by
 * default.
 */
export function classifyPatch(diffs, { publishedSchema = null, schema = CONTENT_SCHEMA_VERSION, limits = PATCH_LIMITS } = {}) {
  if (publishedSchema === null) return { verdict: 'INITIAL MANIFEST', reasons: ['nothing published yet'] };
  if (publishedSchema !== schema) {
    return { verdict: 'SCHEMA CHANGE', reasons: [`schemaVersion ${publishedSchema} → ${schema}`] };
  }
  const reasons = [];
  const documents = diffs.reduce((sum, d) => sum + d.added.length + d.changed.length + d.removed.length, 0);
  const bytes = diffs.reduce((sum, d) => sum + d.bytes, 0);
  if (bytes > limits.maxBytes) reasons.push(`download ${(bytes / 1048576).toFixed(1)} MB > ${limits.maxBytes / 1048576} MB`);
  if (documents > limits.maxDocuments) reasons.push(`${documents} documents > ${limits.maxDocuments}`);
  for (const d of diffs) {
    const replaced = d.changed.length + d.removed.length;
    if (replaced > limits.replacedFloor && replaced > d.previousCount * limits.maxReplacedShare) {
      reasons.push(`${d.collection}: ${replaced} / ${d.previousCount} replaced`);
    }
  }
  return reasons.length ? { verdict: 'MASS CONTENT REBUILD', reasons } : { verdict: 'SAFE CONTENT PATCH', reasons: [] };
}

const kb = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** The human report printed before any publication. */
export function formatPatchReport(diffs, classification) {
  const lines = ['CONTENT UPDATE DIFF', ''];
  for (const d of diffs) {
    if (!d.added.length && !d.changed.length && !d.removed.length) continue;
    lines.push(`${d.collection}:`);
    if (d.added.length) lines.push(`  added:   ${d.added.length}`);
    if (d.changed.length) lines.push(`  changed: ${d.changed.length} / ${d.previousCount}`);
    if (d.removed.length) lines.push(`  removed: ${d.removed.length}`);
    lines.push(`  bytes:   ${kb(d.bytes)}`, '');
  }
  const documents = diffs.reduce((sum, d) => sum + d.added.length + d.changed.length + d.removed.length, 0);
  const bytes = diffs.reduce((sum, d) => sum + d.bytes, 0);
  lines.push('TOTAL:', `  ${documents.toLocaleString('en-US')} documents`, `  ${kb(bytes)}`, '', 'RESULT:', classification.verdict);
  classification.reasons.forEach((reason) => lines.push(`  - ${reason}`));
  if (classification.verdict === 'MASS CONTENT REBUILD') {
    lines.push('', 'Do not publish this as a content patch.', 'Build a new bundled snapshot and release a new app version.');
  }
  if (classification.verdict === 'SCHEMA CHANGE') {
    lines.push('', 'A schema change always means a new bundle and a new app version.');
  }
  return lines.join('\n');
}
