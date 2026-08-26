import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const FIRESTORE_SNAPSHOT_SCHEMA_VERSION = 1;

function decodeValue(value) {
  if (Array.isArray(value)) return value.map(decodeValue);
  if (!value || typeof value !== 'object') return value;

  if (value.__firestoreType === 'timestamp') {
    return {
      __firestoreType: 'timestamp',
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
      toDate: () => new Date((value.seconds * 1000) + Math.floor(value.nanoseconds / 1e6)),
    };
  }
  if (value.__firestoreType === 'date') return new Date(value.iso);
  if (value.__firestoreType === 'bytes') return Buffer.from(value.base64, 'base64');

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeValue(item)]));
}

export function matchesSnapshotFilters(document, filters = []) {
  return filters.every(({ field, op = '==', value }) => {
    const actual = document[field];
    if (op === '==') return actual === value;
    if (op === 'array-contains') return Array.isArray(actual) && actual.includes(value);
    if (op === 'in') return Array.isArray(value) && value.includes(actual);
    throw new Error(`Unsupported local snapshot operator: ${op}`);
  });
}

export async function openFirestoreSnapshot(snapshotDirectory) {
  const root = path.resolve(snapshotDirectory);
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.schemaVersion !== FIRESTORE_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`Unsupported Firestore snapshot schema: ${manifest.schemaVersion}`);
  }

  const cache = new Map();

  async function collection(collectionPath) {
    if (cache.has(collectionPath)) return cache.get(collectionPath);
    const descriptor = manifest.collections?.[collectionPath];
    if (!descriptor) return null;

    const rawPayload = await readFile(path.join(root, descriptor.file), 'utf8');
    if (descriptor.sha256) {
      const actualHash = createHash('sha256').update(rawPayload).digest('hex');
      if (actualHash !== descriptor.sha256) {
        throw new Error(`Snapshot checksum mismatch: ${collectionPath}`);
      }
    }
    const payload = JSON.parse(rawPayload);
    if (payload.schemaVersion !== FIRESTORE_SNAPSHOT_SCHEMA_VERSION
      || payload.collectionPath !== collectionPath
      || !Array.isArray(payload.documents)) {
      throw new Error(`Invalid snapshot collection payload: ${collectionPath}`);
    }
    if (descriptor.documentCount !== undefined
      && payload.documents.length !== descriptor.documentCount) {
      throw new Error(`Snapshot document count mismatch: ${collectionPath}`);
    }

    const documents = payload.documents.map((item) => ({
      id: item.id,
      ...decodeValue(item.data),
    }));
    cache.set(collectionPath, documents);
    return documents;
  }

  async function document(collectionPath, documentId) {
    const documents = await collection(collectionPath);
    return documents?.find((item) => item.id === documentId) ?? null;
  }

  async function query(collectionPath, filters = []) {
    const documents = await collection(collectionPath);
    return documents?.filter((item) => matchesSnapshotFilters(item, filters)) ?? null;
  }

  return {
    root,
    manifest,
    collectionPaths: Object.keys(manifest.collections || {}).sort(),
    collection,
    document,
    query,
  };
}
