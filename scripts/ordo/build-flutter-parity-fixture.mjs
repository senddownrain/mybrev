#!/usr/bin/env node
/**
 * Web ↔ Flutter parity fixture (read-only).
 *
 * Runs the canonical web Ordo engine and the web Hours pipeline on the LOCAL
 * snapshot — the same documents the Flutter app ships in its content bundle
 * (`liturgicalCelebrations`, `liturgicalDioceseOverrides`,
 * `liturgicalYearOverrides`, `liturgicalOrdoNotes`, `liturgicalProperTexts`,
 * `liturgicalTemplates`, `days`, `readings`) — and writes a compact gzip
 * fixture the Dart port is tested against (exact match).
 *
 *   node scripts/ordo/build-flutter-parity-fixture.mjs \
 *     --snapshot backups/firestore-snapshot \
 *     --out ../ibreviarybyapp/test/fixtures/ordo_parity.json.gz [--from 2025 --to 2032]
 *
 * Never writes Firestore; never touches the web runtime. The fixture is a
 * test artefact, not app content.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { storedDocument } from '../content/lib/app-content.mjs';
import { generateLiturgicalYear } from '../../src/utils/ordo/index.js';
import { setCalendarDefinitions } from '../../src/utils/ordo/definitions.js';
import { optionDescriptor } from '../../src/utils/ordo/runtime.js';
import { readingReferencesForDay } from '../../src/utils/ordo/readingReferences.js';
import { buildReadingReferences } from '../liturgy/build-reading-references.mjs';
import { contentFor, openLiturgySource } from '../liturgy/lib/snapshot-content.mjs';
import { canonicalJson } from '../content/lib/app-content.mjs';
import { createHash } from 'node:crypto';
import { FIRST_VESPER_FIELDS, OFFICE_TEXT_FIELDS, TE_DEUM_FIELD } from '../../src/constants/officeFields.js';

export const PARITY_DIOCESES = Object.freeze(['minsk-mohilev', 'grodno', 'pinsk', 'vitebsk']);
// 2: final phase — Office/Mass split (`sources`, office of `officeOptions`),
//    `provisional` options, `books`, transfers with `computedDate`, notes file option.
export const PARITY_SCHEMA_VERSION = 2;

function parseArgs(argv) {
  const options = { snapshot: 'backups/firestore-snapshot', out: null, from: 2025, to: 2032, hours: true, notesFile: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--snapshot') options.snapshot = argv[++index];
    else if (arg === '--out') options.out = argv[++index];
    else if (arg === '--from') options.from = Number(argv[++index]);
    else if (arg === '--to') options.to = Number(argv[++index]);
    else if (arg === '--no-hours') options.hours = false;
    // The notes of a build not yet published (e.g. src/data/ordo/notes.json).
    else if (arg === '--notes-file') options.notesFile = argv[++index];
  }
  if (!options.out) throw new Error('Usage: build-flutter-parity-fixture.mjs --snapshot <dir> --out <file.json.gz>');
  return options;
}

const option = (item, day) => ({
  id: item.id,
  kind: item.kind,
  rank: item.rank,
  rankKind: item.rankKind,
  color: item.color || day.color,
  ...(item.colorAlternatives?.length ? { colorAlternatives: item.colorAlternatives } : {}),
  officeKind: item.officeKind || null,
  precedence: item.precedence,
  category: item.category || null,
  ...(item.dioceseId ? { dioceseId: item.dioceseId } : {}),
  ...(item.transferredFrom ? { transferredFrom: item.transferredFrom } : {}),
  ...(item.movedFrom ? { movedFrom: item.movedFrom } : {}),
  ...(item.demotedFrom ? { demotedFrom: item.demotedFrom } : {}),
  ...(item.provisional ? { provisional: true } : {}),
});

/** Hash of the Office text of an assembled document (what the reader sees). */
export function officeHash(day) {
  const fields = {};
  [...OFFICE_TEXT_FIELDS, ...FIRST_VESPER_FIELDS, TE_DEUM_FIELD].forEach((field) => {
    const value = day?.[field];
    if (value === undefined || value === null || value === '') return;
    fields[field] = value;
  });
  return createHash('sha256').update(canonicalJson(fields), 'utf8').digest('hex').slice(0, 16);
}

function hoursOf(content) {
  return content.dayOptions.map((item) => ({
    key: item.key,
    optionId: item.ordo?.optionId || null,
    source: item.source,
    properSource: item.ordo?.properSource || null,
    ...(item.ordo?.missingProper ? { missingProper: true } : {}),
    templates: (item.templates || []).map((template) => ({
      id: template.id,
      label: template.label,
      ...(template.choice ? { choice: template.choice } : {}),
      hash: officeHash(template.day),
      ...(template.day?._integrityErrors?.length ? { integrity: template.day._integrityErrors.map((error) => error.field) } : {}),
    })),
  }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const snapshot = await openFirestoreSnapshot(options.snapshot);
  const entries = async (name) => ((await snapshot.collectionEntries(name)) || []).map(({ id, data }) => storedDocument(id, data));
  const [celebrations, dioceseOverrides, yearOverrides, snapshotNotes, readings] = await Promise.all([
    entries('liturgicalCelebrations'), entries('liturgicalDioceseOverrides'), entries('liturgicalYearOverrides'),
    entries('liturgicalOrdoNotes'), entries('readings'),
  ]);
  const notes = options.notesFile ? JSON.parse(fs.readFileSync(options.notesFile, 'utf8')).notes : snapshotNotes;
  // The engine runs on the published (snapshot) definitions — the app's bundle.
  setCalendarDefinitions({ celebrations, dioceseOverrides, yearOverrides });
  const referenceIndex = buildReadingReferences(readings);
  const source = options.hours
    ? await openLiturgySource({ snapshotDir: path.resolve(options.snapshot), propers: 'snapshot', templates: 'snapshot' })
    : null;

  const days = {};
  let count = 0;
  const started = Date.now();
  for (const diocese of PARITY_DIOCESES) {
    days[diocese] = [];
    for (let year = options.from; year <= options.to; year += 1) {
      for (const day of generateLiturgicalYear(year, { country: 'BY', diocese, notes })) {
        // Legal Offices of the Hours (the Sunday on All Souls Sunday).
        const office = day.officeOptions.map((item) => {
          const descriptor = optionDescriptor(day, item);
          return {
            id: item.id,
            teDeum: descriptor.teDeum,
            compline: descriptor.compline,
            complineDay: descriptor.complineDay,
            vespers: descriptor.vespers.type,
            firstVespersByRight: descriptor.firstVespersByRight,
          };
        });
        const record = {
          date: day.date,
          period: day.period,
          periodPhase: day.periodPhase,
          week: day.week,
          dayOfWeek: day.dayOfWeek,
          psalterWeek: day.psalterWeek,
          cycle: [day.readingCycle.sunday, day.readingCycle.weekday],
          color: day.color,
          colorAlternatives: day.colorAlternatives,
          primary: option(day.primary, day),
          alternatives: day.alternatives.map((item) => option(item, day)),
          commemorations: day.commemorations.map((item) => ({ id: item.id, rank: item.rank })),
          suppressed: day.suppressed.map((item) => ({ id: item.id, reason: item.reason })),
          transfers: day.appliedRules.filter((rule) => rule.rule === 'transfer')
            .map((rule) => ({
              celebrationId: rule.celebrationId, from: rule.from, to: rule.to, rule: rule.transferRule,
              computedDate: rule.computedDate || rule.to,
            })),
          ...(day.sources.split ? { sources: { office: day.sources.office.optionId, mass: day.sources.mass.optionId } } : {}),
          ...(day.books ? { books: { lectionaryVolume: day.books.lectionaryVolume || null, hoursVolume: day.books.hoursVolume || null } } : {}),
          evening: {
            type: day.officeResolution.evening.vespers.type,
            celebrationId: day.officeResolution.evening.vespers.celebrationId || null,
            compline: day.officeResolution.evening.compline,
          },
          office,
          notes: day.ordoNotes.map((note) => note.id).sort(),
          readings: readingReferencesForDay(day, referenceIndex).map((item) => ({
            optionId: item.optionId,
            status: item.status,
            documents: item.documents.map((doc) => doc.id),
            ...(item.reference ? { reference: true } : {}),
          })),
        };
        if (source) record.hours = hoursOf(contentFor(source, day.date, { diocese }));
        days[diocese].push(record);
        count += 1;
      }
    }
  }
  const fixture = {
    schemaVersion: PARITY_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    snapshot: snapshot.manifest.exportedAt,
    years: [options.from, options.to],
    dioceses: PARITY_DIOCESES,
    days,
  };
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(fixture)), { level: 9 });
  gz.writeUInt32LE(0, 4);
  fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
  fs.writeFileSync(options.out, gz);
  console.log(JSON.stringify({
    out: options.out, days: count, bytes: gz.length, seconds: Math.round((Date.now() - started) / 1000),
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
