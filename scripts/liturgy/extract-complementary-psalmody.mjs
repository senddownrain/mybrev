#!/usr/bin/env node
/**
 * Complementary (gradual) psalmody of Daytime Prayer — Ps 120–128 — as a
 * verified reusable source.
 *
 * The text is not typed in: it is taken from the `days` documents of the
 * solemnities that carry the whole complementary psalmody, and only when every
 * one of them has exactly the same nine psalms. The result
 * (`patchs/json/complementary-psalmody.json`) feeds `generate:fixed-feasts`,
 * which publishes it as `liturgicalTemplates/complementary-psalmody`.
 *
 *   node scripts/liturgy/extract-complementary-psalmody.mjs [--snapshot backups/firestore-snapshot]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, 'patchs', 'json', 'complementary-psalmody.json');
const argValue = (name) => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : null; };

/** Terce, Sext, None × three psalms; `sext1/2/3` are the three Daytime hours. */
export const COMPLEMENTARY_FIELDS = Object.freeze(['sext1', 'sext2', 'sext3']
  .flatMap((hour) => [1, 2, 3].map((index) => `${hour}Ps${index}`)));
const EXPECTED_PSALMS = [120, 121, 122, 123, 124, 125, 126, 127, 128];

const plain = (value) => (Array.isArray(value) ? value.join('\n') : String(value ?? ''))
  .replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&ndash;/g, ' ').replace(/[\s\u00a0]+/g, ' ').trim();
const psalmNumber = (value) => Number(plain(value).match(/^Псальм\s*(\d+)/)?.[1] || 0);

/** Documents whose Daytime psalmody is exactly Ps 120–128 in order. */
export function complementaryCandidates(days) {
  return days.filter((day) => !day._obsolete
    && COMPLEMENTARY_FIELDS.every((field, index) => psalmNumber(day[field]) === EXPECTED_PSALMS[index]));
}

export function extractComplementaryPsalmody(days) {
  const sources = complementaryCandidates(days).sort((a, b) => a.id.localeCompare(b.id));
  if (sources.length < 2) throw new Error(`Complementary psalmody: ${sources.length} source documents, need at least 2`);
  const reference = sources[0];
  const conflicts = COMPLEMENTARY_FIELDS.flatMap((field) => sources
    .filter((day) => plain(day[field]) !== plain(reference[field]))
    .map((day) => ({ field, id: day.id })));
  if (conflicts.length) throw new Error(`Complementary psalmody differs between sources: ${JSON.stringify(conflicts)}`);
  return {
    fields: Object.fromEntries(COMPLEMENTARY_FIELDS.map((field) => [field, reference[field]])),
    sources: sources.map((day) => day.id),
  };
}

async function main() {
  const snapshot = await openFirestoreSnapshot(path.resolve(argValue('--snapshot') || 'backups/firestore-snapshot'));
  const days = await snapshot.collection('days');
  const { fields, sources } = extractComplementaryPsalmody(days);
  const output = {
    _id: 'complementary-psalmody',
    _source: {
      collection: 'days',
      ids: sources,
      rule: 'identical Ps 120–128 in every listed document (normalized text)',
      snapshot: snapshot.manifest?.exportedAt || null,
    },
    ...fields,
  };
  await fs.writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ output: path.relative(ROOT, OUTPUT), sources: sources.length }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
