// Local-only adapter: reuse the project's snapshot verification and categories.
import { readFile } from 'node:fs/promises';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';
import { TAGS_LIST } from '../src/constants/songTags.js';

const [seedPath, sourcePath = seedPath] = process.argv.slice(2);
const hash = (s) => createHash('sha256').update(s).digest('hex');
const errors = [];
const report = { source: 'seed-only', overrides: 0, additions: 0, missing: 0, duplicateIds: 0, errors };
function indexed(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`${label}: expected a JSON array of songs`);
  const result = new Map();
  for (const [i, row] of rows.entries()) {
    if (!row || typeof row.id !== 'string' || !row.id.trim() || row.id.includes('/') || /[\r\n]/.test(row.id)) {
      report.missing++; errors.push(`${label}: missing/invalid ID at row ${i + 1}`); continue;
    }
    if (result.has(row.id)) { report.duplicateIds++; errors.push(`${label}: duplicate ID ${row.id}`); }
    result.set(row.id, row);
  }
  return result;
}
try {
  const source = path.resolve(sourcePath);
  let rows;
  const provenance = { source, seed: path.resolve(seedPath) };
  if ((await stat(source)).isDirectory()) {
    const seedRaw = await readFile(seedPath, 'utf8');
    const merged = indexed(JSON.parse(seedRaw), 'seed');
    const snapshot = await openFirestoreSnapshot(source);
    const entries = await snapshot.collectionEntries('songs');
    if (entries === null) throw new Error('Snapshot does not cover songs; completeness is unknown');
    indexed(entries, 'snapshot');
    for (const { id, data } of entries) {
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`Invalid snapshot song ${id}`);
      if (merged.has(id)) report.overrides++; else report.additions++;
      merged.set(id, { ...merged.get(id), ...data, id });
    }
    rows = [...merged.values()];
    report.source = 'merged-snapshot';
    provenance.seedSha256 = hash(seedRaw);
    provenance.snapshot = {
      projectId: snapshot.manifest.projectId,
      exportedAt: snapshot.manifest.exportedAt,
      snapshotVersion: snapshot.manifest.snapshotVersion,
      descriptor: snapshot.manifest.collections.songs,
      manifestSha256: hash(await readFile(path.join(source, 'manifest.json'))),
    };
  } else {
    const raw = await readFile(source, 'utf8');
    rows = [...indexed(JSON.parse(raw), 'source').values()];
    provenance.sourceSha256 = hash(raw);
  }
  console.log(JSON.stringify({ rows, categories: TAGS_LIST, provenance, report }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
