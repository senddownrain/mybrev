import fs from 'node:fs';
import path from 'node:path';
import { openFirestoreSnapshot } from '../../lib/firestore-snapshot.mjs';
import { sha256 } from './source-pages.mjs';

/** Stable JSON (sorted keys, Firestore timestamps as ISO) for hashing. */
export function stableJson(value) {
  const norm = (v) => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      if (v.__firestoreType === 'timestamp') return { ts: v.seconds };
      if (v instanceof Date) return v.toISOString();
      return Object.fromEntries(Object.keys(v).filter((k) => typeof v[k] !== 'function').sort().map((k) => [k, norm(v[k])]));
    }
    return v;
  };
  return JSON.stringify(norm(value));
}
export const docHash = (doc) => sha256(stableJson(doc)).slice(0, 16);

export async function openSnapshot(dir) {
  const snapshot = await openFirestoreSnapshot(path.resolve(dir));
  const manifest = snapshot.manifest;
  const collection = async (name) => (await snapshot.collection(name)) || [];
  return { snapshot, manifest, collection, dir: path.resolve(dir) };
}

export const snapshotDirFromArgs = (argv = process.argv) => {
  const i = argv.indexOf('--snapshot');
  return path.resolve(i > 0 ? argv[i + 1] : (process.env.MYBREV_SNAPSHOT || '.cache/prod-snapshot-20261012'));
};
