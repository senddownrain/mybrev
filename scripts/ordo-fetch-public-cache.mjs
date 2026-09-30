#!/usr/bin/env node
/**
 * Build the read-only analysis cache used by the Ordo data follow-ups when no
 * `backups/firestore-snapshot` exists. Anonymous public REST reads only,
 * field-masked; nothing is ever written to Firestore.
 *
 *   node scripts/ordo-fetch-public-cache.mjs [--output reports/ordo-firestore-cache]
 *
 * Reads (documents, 1 read each):
 *   days      — whole collection, metadata fields only (~735)
 *   readings  — documents with `_date` or `_feast` (fixed/dynamic proper readings, ~160)
 * Temporal `readings` (period weekdays) are not needed by these reports.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PROJECT_ID, listCollectionMasked, queryFieldPresent, writeSnapshotCache,
} from './lib/firestore-rest-cache.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DAYS_FIELD_MASK = Object.freeze([
  '_date', '_rank', '_place', '_feast', '_feastName', '_title', 'title', '_templates', '_currentVersion',
  '_periodType', '_periodWeekNumber', '_dayOfWeek', '_obsolete',
]);
export const READINGS_FIELD_MASK = Object.freeze([
  '_date', '_rank', '_place', '_feast', '_dayId', '_dayIds', 'title',
  '_periodType', '_periodWeekNumber', '_dayOfWeek', '_obsolete',
  // Citations and the list of parsed sections (no texts) for the readings audit.
  'year', 'sectionsFound', 'reading1.bible', 'reading2.bible', 'psalm.bible', 'gospel.bible',
]);

function parseArgs(argv) {
  const options = { output: path.join(ROOT, 'reports/ordo-firestore-cache'), projectId: DEFAULT_PROJECT_ID };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--output') options.output = path.resolve(argv[++index]);
    else if (arg === '--project') options.projectId = argv[++index];
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { projectId } = options;
  const days = await listCollectionMasked('days', DAYS_FIELD_MASK, { projectId });
  const byDate = await queryFieldPresent('readings', '_date', READINGS_FIELD_MASK, { projectId });
  const byFeast = await queryFieldPresent('readings', '_feast', READINGS_FIELD_MASK, { projectId });
  const readings = new Map([...byDate.documents, ...byFeast.documents].map((doc) => [doc.id, doc]));
  const manifest = await writeSnapshotCache(options.output, {
    days: { ...days, fieldMask: DAYS_FIELD_MASK, filter: null },
    readings: {
      documents: [...readings.values()],
      requests: byDate.requests + byFeast.requests,
      fieldMask: READINGS_FIELD_MASK,
      filter: "_date > '' OR _feast > '' (two queries)",
    },
  }, { projectId });
  const reads = days.documents.length + byDate.documents.length + byFeast.documents.length;
  console.log(JSON.stringify({ output: options.output, documentReads: reads, collections: Object.fromEntries(Object.entries(manifest.collections).map(([key, item]) => [key, item.documentCount])) }));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
