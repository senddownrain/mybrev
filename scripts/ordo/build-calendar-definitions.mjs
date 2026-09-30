#!/usr/bin/env node
/**
 * Build the bundled snapshot of the calendar definitions from the seed
 * sources (`src/utils/ordo/seed.js`).
 *
 *   node scripts/ordo/build-calendar-definitions.mjs          # write
 *   node scripts/ordo/build-calendar-definitions.mjs --check  # fail when stale
 *
 * Output: src/data/ordo/calendar-definitions.json — the offline fallback of
 * `liturgicalCelebrations`, `liturgicalDioceseOverrides` and
 * `liturgicalYearOverrides`, and the import material of
 * `scripts/ordo/import-calendar.mjs`. The `revision` of an existing snapshot
 * is kept; pass `--revision N` to publish a new one.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildCalendarDefinitionsSeed } from '../../src/utils/ordo/seed.js';
import { normalizeCalendarDefinitions } from '../../src/utils/ordo/definitions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SNAPSHOT_PATH = path.join(ROOT, 'src', 'data', 'ordo', 'calendar-definitions.json');

/** One document per line: readable diffs, stable output. */
export function renderSnapshot(definitions) {
  const list = (items) => (items.length ? `[\n${items.map((item) => `  ${JSON.stringify(item)}`).join(',\n')}\n ]` : '[]');
  return `{\n "schemaVersion": ${definitions.schemaVersion},\n "revision": ${definitions.revision},\n`
    + ` "celebrations": ${list(definitions.celebrations)},\n`
    + ` "dioceseOverrides": ${list(definitions.dioceseOverrides)},\n`
    + ` "yearOverrides": ${list(definitions.yearOverrides)}\n}\n`;
}

export function buildSnapshot({ revision } = {}) {
  let current = null;
  try { current = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')); } catch { /* first build */ }
  const definitions = buildCalendarDefinitionsSeed({ revision: revision ?? (current?.revision || 1) });
  const { warnings } = normalizeCalendarDefinitions(definitions);
  if (warnings.length) throw new Error(`Invalid calendar definitions:\n${warnings.join('\n')}`);
  return { definitions, text: renderSnapshot(definitions), current };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const revisionArg = process.argv.indexOf('--revision');
  const revision = revisionArg > 0 ? Number(process.argv[revisionArg + 1]) : undefined;
  const { definitions, text } = buildSnapshot({ revision });
  const existing = fs.existsSync(SNAPSHOT_PATH) ? fs.readFileSync(SNAPSHOT_PATH, 'utf8') : '';
  if (process.argv.includes('--check')) {
    if (existing !== text) {
      console.error('calendar-definitions.json is stale. Run: npm run ordo:definitions');
      process.exit(1);
    }
    console.log('calendar definitions: up to date');
  } else {
    fs.writeFileSync(SNAPSHOT_PATH, text);
    console.log(`calendar definitions: revision ${definitions.revision}, ${definitions.celebrations.length} celebrations, `
      + `${definitions.dioceseOverrides.length} diocese overrides, ${definitions.yearOverrides.length} year overrides`);
  }
}
