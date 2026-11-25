import { createHash } from 'node:crypto';
import { FieldValue, GeoPoint, Timestamp } from 'firebase-admin/firestore';
import { ACCESS_SET_ID } from '../../src/utils/accessSetsV2Code.mjs';
import { catalogError, validCatalogId, V2_CONTENT_FIELDS } from '../../src/utils/accessSetsV2Policy.mjs';
import { CONTENT_CONTROL } from '../../src/utils/prayerStoragePlan.mjs';
import { catalogContentHash } from './access-sets-v2-content-values.mjs';
import { assertCatalogParity, CATALOG_KINDS, CATALOG_PATHS, CATALOG_ROLLOUT } from './access-sets-v2-storage-plan.mjs';
import { wireJson, wireTimestampFields } from './access-sets-v2-copy-firestore.mjs';

export const JOURNAL = 'priestContentControl/accessSetsV2CopyS5';
export const RECEIPTS = JOURNAL + '/operations';
export const SETS = 'accessSetsV2';
export const CONTROLS = [CONTENT_CONTROL, CATALOG_ROLLOUT];
const ROOTS = [...Object.values(CATALOG_PATHS).flat(), SETS];
const SCHEMA = 'access-sets-v2-copy/1';
const fail = (code) => { throw catalogError(code); };
const string = (value) => ({ stringValue: value });
const priest = () => ({ arrayValue: { values: [string('priest')] } });
const indexCollections = (id) => CATALOG_KINDS.map((kind) => SETS + '/' + id + '/' + kind);
const sort = (rows) => [...rows].sort();
export const checksum = (value) => createHash('sha256').update(wireJson(value)).digest('hex');
export const wireEqual = (left, right) => wireJson(left) === wireJson(right);

export async function captureCopyState(store) {
  const { readTime } = await store.get([CONTROLS[0]]);
  if (!readTime) fail('missing-firestore-read-time');
  const { docs } = await store.get([...CONTROLS, JOURNAL], { readTime });
  // showMissing discovers index subcollections even if the set document was deleted.
  const registry = await store.list(SETS, readTime, { showMissing: true, max: 256 });
  const collections = Object.fromEntries(await Promise.all(ROOTS.filter((p) => p !== SETS).map(async (p) =>
    [p, await store.list(p, readTime)])));
  collections[SETS] = registry.filter((doc) => doc.createTime);
  const setIds = sort(new Set(['priest', ...registry.map((doc) => store.relative(doc.name).split('/')[1])]));
  for (const id of setIds) {
    if (!validCatalogId(id)) fail('invalid-registry-document-id');
    for (const path of indexCollections(id)) collections[path] = await store.list(path, readTime);
  }
  const controls = Object.fromEntries(CONTROLS.map((path) => [path, docs.get(path)]));
  const journal = docs.get(JOURNAL);
  const receipts = await store.list(RECEIPTS, readTime, { max: 10_000 });
  return { database: store.database, readTime, collections, controls, journal, receipts };
}

export function makeCopyBackup(state) {
  if (state.journal || state.receipts.length) fail('copy-journal-already-exists');
  const { database, readTime, collections, controls } = state;
  const data = { schema: SCHEMA, database, readTime, collections, controls };
  return { data, sha256: checksum(data) };
}

function parseTime(value) {
  const { seconds, nanos } = wireTimestampFields(value);
  return new Timestamp(Number(seconds), nanos);
}

function decodeValue(wire, reference) {
  if (!wire || typeof wire !== 'object' || Object.keys(wire).length !== 1) fail('invalid-wire-value');
  if (Object.hasOwn(wire, 'nullValue') && wire.nullValue === null) return null;
  if (typeof wire.booleanValue === 'boolean') return wire.booleanValue;
  if (typeof wire.stringValue === 'string') return wire.stringValue;
  if (typeof wire.integerValue === 'string' && /^-?\d+$/.test(wire.integerValue)) return BigInt(wire.integerValue);
  if (typeof wire.doubleValue === 'number' || ['Infinity', '-Infinity', 'NaN', '-0'].includes(wire.doubleValue)) return Number(wire.doubleValue);
  if (typeof wire.timestampValue === 'string') return parseTime(wire.timestampValue);
  if (typeof wire.bytesValue === 'string') return Buffer.from(wire.bytesValue, 'base64');
  if (typeof wire.referenceValue === 'string') return reference(wire.referenceValue);
  if (wire.geoPointValue) return new GeoPoint(wire.geoPointValue.latitude ?? 0, wire.geoPointValue.longitude ?? 0);
  if (wire.arrayValue) return (wire.arrayValue.values ?? []).map((item) => decodeValue(item, reference));
  if (wire.mapValue) {
    const fields = decodeFields(wire.mapValue.fields ?? {}, reference);
    if (fields.__type__ === '__vector__' && Array.isArray(fields.value)) return FieldValue.vector(fields.value.map(Number));
    return fields;
  }
  return fail('invalid-wire-value');
}

const decodeFields = (fields, reference) => Object.fromEntries(Object.entries(fields).map(([key, value]) =>
  [key, decodeValue(value, reference)]));

function readDocuments(data) {
  if (data.schema !== SCHEMA || !/^projects\/[a-z][a-z0-9-]+\/databases\/(?:\(default\)|[a-z][a-z0-9-]+)$/.test(data.database)) {
    fail('invalid-copy-backup');
  }
  parseTime(data.readTime);
  const prefix = data.database + '/documents/';
  const documents = new Map();
  function add(path, doc) {
    if (doc?.name !== prefix + path || !doc.fields || Array.isArray(doc.fields) || typeof doc.fields !== 'object'
      || documents.has(path)) fail('invalid-copy-backup-document');
    parseTime(doc.createTime);
    parseTime(doc.updateTime);
    documents.set(path, doc);
  }
  if (!data.controls || !wireEqual(sort(Object.keys(data.controls)), sort(CONTROLS))) fail('incomplete-copy-backup');
  for (const [path, doc] of Object.entries(data.controls)) if (doc !== null) add(path, doc);
  if (!data.collections || ROOTS.some((path) => !Array.isArray(data.collections[path]))) fail('incomplete-copy-backup');
  const registryPaths = new Set(indexCollections('priest'));
  for (const doc of data.collections[SETS]) {
    const id = doc.name?.split('/').at(-1);
    if (!ACCESS_SET_ID.test(id ?? '')) fail('invalid-registry-document-id');
    for (const path of indexCollections(id)) registryPaths.add(path);
  }
  if ([...registryPaths].some((path) => !Array.isArray(data.collections[path]))) fail('incomplete-copy-backup');
  for (const [collection, rows] of Object.entries(data.collections)) {
    if (!ROOTS.includes(collection) && !/^accessSetsV2\/[^/]+\/(prayers|categories)$/.test(collection)) fail('unexpected-copy-collection');
    if (!Array.isArray(rows)) fail('invalid-copy-backup');
    for (const doc of rows) {
      const id = doc.name?.split('/').at(-1);
      if (!validCatalogId(id)) fail('invalid-copy-document-id');
      add(collection + '/' + id, doc);
    }
  }
  return documents;
}

export function planAccessSetsCopy(backup, reference) {
  if (!backup?.data || checksum(backup.data) !== backup.sha256) fail('copy-backup-checksum-mismatch');
  const before = readDocuments(backup.data);
  const contentState = before.get(CONTROLS[0])?.fields;
  const version = contentState?.version?.integerValue;
  if (!/^(?:0|[1-9]\d*)$/.test(version ?? '') || Number(version) >= Number.MAX_SAFE_INTEGER
    || contentState?.lockUid?.stringValue !== '') fail('invalid-content-version');
  const rollout = before.get(CONTROLS[1]);
  if (rollout && !['legacy', 'suspended'].includes(rollout.fields.mode?.stringValue)) fail('copy-rollout-open');
  const registry = before.get(SETS + '/priest')?.fields;
  if (registry?.status?.stringValue !== 'active' || !registry.name?.stringValue?.trim()
    || !registry.updatedAt?.timestampValue) fail('missing-priest-access-set');

  const desired = new Map();
  const sets = new Map();
  for (const [path, doc] of before) {
    if (path.startsWith('priestContentControl/')) continue;
    if (path.startsWith(SETS + '/') && path.split('/').length === 2) {
      sets.set(path.split('/')[1], decodeFields(doc.fields, reference));
    } else {
      desired.set(path, doc.fields);
    }
  }
  const operations = [];
  for (const kind of sort(CATALOG_KINDS)) {
    const [, legacy, canonical] = CATALOG_PATHS[kind];
    for (const source of sort(before.keys()).filter((path) => path.startsWith(legacy + '/'))) {
      const id = source.split('/')[1];
      const payload = before.get(source).fields;
      if (['id', ...V2_CONTENT_FIELDS].some((key) => Object.hasOwn(payload, key))) fail('invalid-legacy-mirror');
      const target = canonical + '/' + id;
      const index = SETS + '/priest/' + kind + '/' + id;
      const fields = {
        ...payload,
        accessSchemaVersion: { integerValue: '2' },
        accessSets: priest(),
        effectiveAccessSets: priest(),
        contentHash: string(catalogContentHash(decodeFields(payload, reference))),
      };
      const paths = [target, index];
      const creates = [];
      for (const [path, expected] of [[target, fields], [index, {}]]) {
        if (before.has(path)) {
          if (!wireEqual(before.get(path).fields, expected)) fail('copy-destination-conflict');
        } else {
          creates.push(path);
        }
        desired.set(path, expected);
      }
      if (creates.length) operations.push({ source, paths, creates });
    }
  }
  assertCatalogParity({ sets, documents: new Map([...desired].map(([path, fields]) => [path, decodeFields(fields, reference)])) });
  // Digest both manifests and the order of journaled operations. Desired payloads stay private.
  const afterDigest = checksum(Object.fromEntries(desired));
  const planDigest = checksum({ schema: SCHEMA, backupDigest: backup.sha256, afterDigest, operations });
  return { database: backup.data.database, before, desired, operations, backupDigest: backup.sha256, afterDigest, planDigest };
}

export function observedCopyDocuments(state) {
  return readDocuments({ schema: SCHEMA, database: state.database, readTime: state.readTime,
    controls: state.controls, collections: state.collections });
}

export function summarizeAccessSetsCopy(plan) {
  return {
    database: plan.database,
    backupDigest: plan.backupDigest,
    planDigest: plan.planDigest,
    afterDigest: plan.afterDigest,
    operations: plan.operations.length,
    creates: plan.operations.reduce((count, operation) => count + operation.creates.length, 0),
    parity: 'verified',
  };
}
