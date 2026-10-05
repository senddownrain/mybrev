#!/usr/bin/env node
/**
 * Reading references: a lightweight projection of `readings` for the Ordo.
 *
 * Every `readings` document that has content becomes one entry with the
 * selector fields the runtime queries/filters by and the biblical citation of
 * each section — no texts. The Ordo runs the same plan
 * (`planReadings` → `orderReadingsByPlan`) on these entries that the Readings
 * screen runs on the full documents, so both name the same readings.
 *
 *   node scripts/liturgy/build-reading-references.mjs [--snapshot dir]
 *
 * Output: src/data/ordo/reading-references.json (bundled, lazy-loaded).
 * `readings` stays the single source of truth: regenerate after it changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { hasReadingDocumentContent, hasReadingSectionContent, READING_SECTIONS } from '../../src/utils/parsedReadingsIdentity.js';
import { snapshotDirectory } from './lib/snapshot-content.mjs';

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, 'src', 'data', 'ordo', 'reading-references.json');
export const REFERENCE_SELECTOR_FIELDS = Object.freeze([
  '_date', '_feast', '_periodType', '_periodWeekNumber', '_dayOfWeek', '_dayId', '_dayIds', '_calendarDayOfWeek',
  '_variant', '_rank', '_place', 'year', 'title',
]);
const SECTION_KEYS = Object.freeze({ reading1: 'reading1', reading: 'reading1', reading2: 'reading2', psalm: 'psalm', gospel: 'gospel' });

const clean = (value) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** One projection entry, or null for a document without content. */
export function referenceOf(doc) {
  if (doc._obsolete === true || !hasReadingDocumentContent(doc)) return null;
  const entry = { id: doc.id };
  REFERENCE_SELECTOR_FIELDS.forEach((field) => {
    const value = doc[field];
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) return;
    entry[field] = value;
  });
  const citations = {};
  ['reading1', 'reading', 'psalm', 'reading2', 'gospel'].forEach((section) => {
    const bible = clean(doc[section]?.bible);
    if (bible && hasReadingSectionContent(doc[section])) citations[SECTION_KEYS[section]] = bible;
  });
  entry.citations = citations;
  // The runtime filters documents by content; every entry here has it.
  entry._hasContent = READING_SECTIONS.some((section) => hasReadingSectionContent(doc[section]));
  return entry;
}

export function buildReadingReferences(readings) {
  return readings.map(referenceOf).filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));
}

async function main() {
  const snapshot = await openFirestoreSnapshot(snapshotDirectory());
  const readings = await snapshot.collection('readings');
  const references = buildReadingReferences(readings);
  const output = {
    schemaVersion: 1,
    source: { collection: 'readings', snapshot: snapshot.manifest.exportedAt, documents: readings.length },
    references,
  };
  // One entry per line: reviewable diffs, small bundle.
  const text = `{\n "schemaVersion": 1,\n "source": ${JSON.stringify(output.source)},\n "references": [\n${references.map((item) => `  ${JSON.stringify(item)}`).join(',\n')}\n ]\n}\n`;
  fs.writeFileSync(OUTPUT, text);
  console.log(JSON.stringify({ output: path.relative(ROOT, OUTPUT), references: references.length, skipped: readings.length - references.length, bytes: text.length }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
