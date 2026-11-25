import { GeoPoint, Timestamp } from 'firebase-admin/firestore';
import { openFirestoreSnapshot } from './firestore-snapshot.mjs';
import { catalogError } from '../../src/utils/accessSetsV2Policy.mjs';
import { CONTENT_CONTROL } from '../../src/utils/prayerStoragePlan.mjs';
import { CATALOG_KINDS, CATALOG_PATHS } from './access-sets-v2-storage-plan.mjs';

function restoreSnapshotValue(value, reference) {
  if (Array.isArray(value)) return value.map((item) => restoreSnapshotValue(item, reference));
  if (!value || typeof value !== 'object' || value instanceof Date || value instanceof Uint8Array) return value;
  switch (value.__firestoreType) {
    case 'timestamp': return new Timestamp(value.seconds, value.nanoseconds);
    case 'geopoint': return new GeoPoint(value.latitude, value.longitude);
    case 'reference': return reference(value.path);
    default: return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key, restoreSnapshotValue(item, reference),
    ]));
  }
}

// Offline-only. Supply an SDK document reference constructor for the snapshot's
// project/database. Constructing a reference performs no network operation.
// The snapshot must explicitly cover empty collections in the plan's scope.
export async function readCanonicalCatalogSnapshot(directory, { reference }) {
  const snapshot = await openFirestoreSnapshot(directory);
  const entries = async (path) => {
    const docs = await snapshot.collectionEntries(path);
    if (!docs) throw catalogError('incomplete-catalog-snapshot');
    const map = new Map(docs.map(({ id, data }) => [id, restoreSnapshotValue(data, reference)]));
    if (map.size !== docs.length) throw catalogError('duplicate-snapshot-id');
    return map;
  };
  const [controlCollection, controlId] = CONTENT_CONTROL.split('/');
  const [control, sets] = await Promise.all([entries(controlCollection), entries('accessSetsV2')]);
  const version = control.get(controlId)?.version;
  if (!Number.isSafeInteger(version) || control.get(controlId)?.lockUid !== '') throw catalogError('invalid-content-version');
  const paths = new Set([
    ...Object.values(CATALOG_PATHS).flat(),
    ...[...sets.keys()].flatMap((id) => CATALOG_KINDS.map((kind) => `accessSetsV2/${id}/${kind}`)),
    ...snapshot.collectionPaths.filter((path) => /^accessSetsV2\/[^/]+\/(prayers|categories)$/.test(path)),
  ]);
  const documents = new Map();
  for (const path of paths) {
    for (const [id, data] of await entries(path)) documents.set(`${path}/${id}`, data);
  }
  return { version, sets, documents };
}
