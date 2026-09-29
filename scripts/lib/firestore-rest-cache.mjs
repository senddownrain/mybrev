/**
 * Read-only public Firestore REST access for analysis caches.
 *
 * Only anonymous GET/list and `runQuery` calls with a field mask are made —
 * never a write. The result is stored in the local snapshot format of
 * `scripts/lib/firestore-snapshot.mjs` (schema 1, one file per collection),
 * so audit scripts read it exactly like `backups/firestore-snapshot`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { FIRESTORE_SNAPSHOT_SCHEMA_VERSION } from './firestore-snapshot.mjs';

export const DEFAULT_PROJECT_ID = 'ibreviaryby';

export function restBase(projectId = DEFAULT_PROJECT_ID) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

/** Firestore REST `Value` → plain JSON (timestamps keep the snapshot marker). */
export function decodeRestValue(value) {
  if (!value || typeof value !== 'object') return value ?? null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return { __firestoreType: 'date', iso: value.timestampValue };
  if ('referenceValue' in value) return { __firestoreType: 'reference', path: value.referenceValue };
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeRestValue);
  if ('mapValue' in value) return decodeRestFields(value.mapValue.fields || {});
  return null;
}

export function decodeRestFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, item]) => [key, decodeRestValue(item)]));
}

function documentId(name) {
  return String(name).split('/').pop();
}

async function requestJson(fetchImpl, url, init) {
  const response = await fetchImpl(url, init);
  if (!response.ok) throw new Error(`Firestore REST ${response.status}: ${url}`);
  return response.json();
}

/** Page through a collection with `mask.fieldPaths` (1 read per document). */
export async function listCollectionMasked(collectionId, fieldPaths, {
  projectId = DEFAULT_PROJECT_ID, pageSize = 300, fetchImpl = fetch,
} = {}) {
  const documents = [];
  let pageToken = '';
  let requests = 0;
  do {
    const params = new URLSearchParams({ pageSize: String(pageSize) });
    fieldPaths.forEach((field) => params.append('mask.fieldPaths', field));
    if (pageToken) params.set('pageToken', pageToken);
    const json = await requestJson(fetchImpl, `${restBase(projectId)}/${collectionId}?${params}`, { method: 'GET' });
    requests++;
    (json.documents || []).forEach((doc) => documents.push({ id: documentId(doc.name), data: decodeRestFields(doc.fields) }));
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return { documents, requests };
}

/** `runQuery` with a projection and one `field > ''` filter (documents that have the field). */
export async function queryFieldPresent(collectionId, field, fieldPaths, {
  projectId = DEFAULT_PROJECT_ID, fetchImpl = fetch,
} = {}) {
  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      select: { fields: fieldPaths.map((fieldPath) => ({ fieldPath })) },
      where: { fieldFilter: { field: { fieldPath: field }, op: 'GREATER_THAN', value: { stringValue: '' } } },
    },
  };
  const rows = await requestJson(fetchImpl, `${restBase(projectId)}:runQuery`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const documents = rows.filter((row) => row.document)
    .map((row) => ({ id: documentId(row.document.name), data: decodeRestFields(row.document.fields) }));
  return { documents, requests: 1 };
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Write collections in the local snapshot format. `collections` maps a
 * collection path to `{ documents, fieldMask, filter, requests }`.
 */
export async function writeSnapshotCache(output, collections, { projectId = DEFAULT_PROJECT_ID, now = new Date() } = {}) {
  await mkdir(output, { recursive: true });
  const manifestCollections = {};
  for (const [collectionPath, item] of Object.entries(collections)) {
    const documents = [...item.documents].sort((a, b) => a.id.localeCompare(b.id));
    const content = `${JSON.stringify({ schemaVersion: FIRESTORE_SNAPSHOT_SCHEMA_VERSION, collectionPath, documents })}\n`;
    const file = `${collectionPath.replace(/[^a-z0-9_-]+/gi, '_')}.json`;
    await writeFile(path.join(output, file), content, 'utf8');
    manifestCollections[collectionPath] = {
      file,
      documentCount: documents.length,
      bytes: Buffer.byteLength(content),
      sha256: sha256(content),
      fieldMask: item.fieldMask,
      filter: item.filter || null,
      documentReads: documents.length,
      requests: item.requests,
    };
  }
  const exportedAt = now.toISOString();
  const manifest = {
    schemaVersion: FIRESTORE_SNAPSHOT_SCHEMA_VERSION,
    snapshotVersion: exportedAt.replace(/[-:.TZ]/g, ''),
    projectId,
    scope: 'public-rest-field-mask',
    note: 'Partial, field-masked read-only cache. Not a backup; never used as a write source.',
    exportedAt,
    collections: manifestCollections,
    totalDocuments: Object.values(manifestCollections).reduce((sum, item) => sum + item.documentCount, 0),
  };
  await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}
