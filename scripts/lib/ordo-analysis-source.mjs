/**
 * Local analysis source for the Ordo data follow-ups: the private snapshot
 * (`backups/firestore-snapshot`) when present, otherwise the field-masked
 * public cache (`reports/ordo-firestore-cache`, see ordo-fetch-public-cache.mjs).
 * Never contacts Firestore.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { openFirestoreSnapshot } from './firestore-snapshot.mjs';

export function defaultSourceDirectory(root) {
  const snapshot = path.join(root, 'backups/firestore-snapshot');
  if (existsSync(path.join(snapshot, 'manifest.json'))) return snapshot;
  return path.join(root, 'reports/ordo-firestore-cache');
}

export async function loadAnalysisSource(directory) {
  if (!existsSync(path.join(directory, 'manifest.json'))) {
    throw new Error(`No analysis source at ${directory}. Use a snapshot (npm run db:backup) or run `
      + '`node scripts/ordo-fetch-public-cache.mjs` (read-only, field-masked).');
  }
  const snapshot = await openFirestoreSnapshot(directory);
  const days = await snapshot.collection('days');
  if (!days) throw new Error('The analysis source does not contain `days`.');
  const readings = (await snapshot.collection('readings')) || [];
  const { manifest } = snapshot;
  return {
    days,
    readings,
    source: {
      kind: manifest.scope === 'public-rest-field-mask' ? 'public-rest-cache' : 'firestore-snapshot',
      scope: manifest.scope || 'complete-backup',
      snapshotVersion: manifest.snapshotVersion,
      projectId: manifest.projectId,
      documents: { days: days.length, readings: readings.length },
      readingsComplete: manifest.scope !== 'public-rest-field-mask',
    },
  };
}

/** `{ [diocese]: evidenceJson }` from `src/data/ordo/evidence`. */
export function loadEvidenceFiles(root) {
  const dir = path.join(root, 'src/data/ordo/evidence');
  if (!existsSync(dir)) return {};
  return Object.fromEntries(readdirSync(dir).filter((name) => name.endsWith('.json')).sort()
    .map((name) => [name.replace(/\.json$/, ''), JSON.parse(readFileSync(path.join(dir, name), 'utf8'))]));
}
