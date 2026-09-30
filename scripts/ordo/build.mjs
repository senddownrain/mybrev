#!/usr/bin/env node
/**
 * Build the committed Ordo evidence from the raw adapter output.
 *
 *   python3 scripts/ordo/extract.py      # .ordo-sources/*  -> .ordo-sources/scratch/raw/*.json
 *   node scripts/ordo/build.mjs          # raw              -> src/data/ordo/*
 *
 * `npm run ordo:extract` runs both. Output is deterministic (no timestamps).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadFixedCatalog } from './lib/identity.mjs';
import { CLASSIFICATION, normalizeSource } from './lib/normalize.mjs';
import { DIOCESE_ORDER, buildNotes } from './lib/notes.mjs';

const NOTES_REVISION = 1;
import { buildDifferences, properIds } from './lib/differences.mjs';
import { alignDate } from './lib/calendar.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW_DIR = path.join(ROOT, '.ordo-sources', 'scratch', 'raw');
const OUT_DIR = process.env.ORDO_OUT_DIR ? path.resolve(process.env.ORDO_OUT_DIR) : path.join(ROOT, 'src', 'data', 'ordo');
const SCHEMA_VERSION = 1;

/** JSON with one array element per line: compact, diff-friendly, deterministic. */
export function stringifyCompact(value, depth = 0) {
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    if (depth >= 1) return JSON.stringify(value);
    return `[\n${value.map((item) => JSON.stringify(item)).join(',\n')}\n]`;
  }
  if (value && typeof value === 'object' && depth === 0) {
    const entries = Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${stringifyCompact(item, Array.isArray(item) ? 0 : 1)}`);
    return `{\n${entries.join(',\n')}\n}`;
  }
  return JSON.stringify(value);
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${stringifyCompact(value)}\n`, 'utf8');
}

function countBy(list, key) {
  const result = {};
  list.forEach((item) => {
    const value = typeof key === 'function' ? key(item) : item[key];
    result[value] = (result[value] || 0) + 1;
  });
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function missingDays(days) {
  const dates = days.filter((d) => !d.preview).map((d) => d.date);
  const set = new Set(dates);
  const gaps = [];
  if (!dates.length) return gaps;
  for (let t = Date.parse(`${dates[0]}T00:00:00Z`); t <= Date.parse(`${dates.at(-1)}T00:00:00Z`); t += 86_400_000) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (!set.has(iso)) gaps.push(iso);
  }
  return gaps;
}

function main() {
  if (!fs.existsSync(RAW_DIR)) {
    console.error(`Raw adapter output not found in ${path.relative(ROOT, RAW_DIR)}. Run: python3 scripts/ordo/extract.py`);
    process.exit(1);
  }
  const catalog = loadFixedCatalog(ROOT);
  const raws = DIOCESE_ORDER
    .map((diocese) => path.join(RAW_DIR, `${diocese}.json`))
    .filter((file) => fs.existsSync(file))
    .map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));

  // Diocesan proper sets need the rules first (Vitebsk proper calendar list).
  const firstPass = raws.map((raw) => normalizeSource(raw, { catalog, properSet: new Set() }));
  const properSets = Object.fromEntries(firstPass.map((source) => [source.diocese, properIds(source.rules, catalog, source.diocese)]));
  const sources = raws.map((raw) => normalizeSource(raw, { catalog, properSet: properSets[raw.source.diocese] }));
  sources.forEach((source) => properIds(source.rules, catalog, source.diocese));

  const { notes, allNotes, excludedParishNotes, candidates } = buildNotes(sources, catalog);
  const noteByItem = new Map(candidates.map((c) => [c.itemId, c.noteId]));
  const differences = buildDifferences(sources, catalog, properSets);

  const unresolved = { schemaVersion: SCHEMA_VERSION, fragments: [], missingDays: [], unmappedCelebrations: [], reviewItems: [] };
  const unmapped = new Map();

  sources.forEach((source, index) => {
    const raw = raws[index];
    const diocese = source.diocese;
    source.days.forEach((day) => day.notes.forEach((note) => {
      if (noteByItem.has(note.id)) note.noteId = noteByItem.get(note.id);
      note.classification = allNotes.find((n) => n.id === note.noteId)?.classification || CLASSIFICATION.REVIEW;
    }));
    source.announcements.forEach((item) => { if (noteByItem.has(item.id)) item.noteId = noteByItem.get(item.id); });
    source.rules.forEach((item) => { if (noteByItem.has(item.id)) item.noteId = noteByItem.get(item.id); });

    source.days.forEach((day) => day.celebrations.forEach((c) => {
      delete c.rankNormalized;
      if (c.identity) return;
      const key = `${diocese}|${c.title}`;
      if (!unmapped.has(key)) unmapped.set(key, { diocese, title: c.title, rank: c.rank, role: c.role, dates: [], itemIds: [], evidence: c.evidence });
      const entry = unmapped.get(key);
      entry.dates.push(day.date);
      entry.itemIds.push(c.id);
    }));
    raw.unresolved.forEach((item) => unresolved.fragments.push({ diocese, ...item }));
    missingDays(source.days).forEach((date) => unresolved.missingDays.push({ diocese, date, liturgical: alignDate(date).periodDayId }));
    source.days.forEach((day) => day.celebrations
      .filter((c) => c.classification === CLASSIFICATION.REVIEW && c.identity)
      .forEach((c) => unresolved.reviewItems.push({
        diocese, itemId: c.id, date: day.date, title: c.title, rank: c.rank,
        identity: c.identity.id, mybrevRank: c.identity.mybrevRank || null, reason: c.identity.dateMismatch ? 'movable-date-mismatch' : 'rank-differs-from-mybrev',
      })));

    const itemsCount = source.days.reduce((sum, d) => sum + d.celebrations.length + d.readings.length + d.mass.length + (d.office ? 1 : 0) + d.notes.length, 0);
    const classificationCounts = countBy([
      ...source.days.flatMap((d) => [...d.celebrations, ...d.notes, ...d.mass, ...(d.office ? [d.office] : [])]),
      ...source.rules, ...source.announcements,
    ], 'classification');
    const evidence = {
      schemaVersion: SCHEMA_VERSION,
      source: raw.source,
      stats: {
        days: source.days.length,
        previewDays: source.days.filter((d) => d.preview).length,
        items: itemsCount + source.rules.length + source.announcements.length,
        celebrations: source.days.reduce((s, d) => s + d.celebrations.length, 0),
        readings: source.days.reduce((s, d) => s + d.readings.length, 0),
        massDescriptors: source.days.reduce((s, d) => s + d.mass.length, 0),
        officeDescriptors: source.days.filter((d) => d.office).length,
        notes: source.days.reduce((s, d) => s + d.notes.length, 0),
        rules: source.rules.length,
        announcements: source.announcements.length,
        noteCategories: countBy(source.days.flatMap((d) => d.notes), 'category'),
        classification: classificationCounts,
        excluded: countBy(raw.excluded, 'category'),
        skipped: countBy(raw.skipped, 'reason'),
        unresolved: raw.unresolved.length,
      },
      days: source.days,
      rules: source.rules,
      announcements: source.announcements,
      excluded: raw.excluded.map((item) => ({ category: item.category, ...item.evidence })),
    };
    write(path.join(OUT_DIR, 'evidence', `${diocese}.json`), evidence);
  });

  unresolved.unmappedCelebrations = [...unmapped.values()]
    .map((entry) => ({ ...entry, dates: entry.dates.slice(0, 6), itemIds: entry.itemIds.slice(0, 6), occurrences: entry.dates.length }))
    .sort((a, b) => DIOCESE_ORDER.indexOf(a.diocese) - DIOCESE_ORDER.indexOf(b.diocese) || a.title.localeCompare(b.title));
  unresolved.summary = {
    fragments: countBy(unresolved.fragments, 'reason'),
    missingDays: unresolved.missingDays.length,
    unmappedCelebrations: countBy(unresolved.unmappedCelebrations, 'diocese'),
    reviewItems: countBy(unresolved.reviewItems, 'reason'),
  };

  write(path.join(OUT_DIR, 'notes.json'), {
    schemaVersion: SCHEMA_VERSION,
    // Publication number of `liturgicalOrdoNotes`; raise it when the notes change.
    revision: NOTES_REVISION,
    sources: raws.map((raw) => ({ diocese: raw.source.diocese, file: raw.source.file, coverage: raw.source.coverage })),
    summary: {
      notes: notes.length,
      excludedParishNotes,
      byClassification: countBy(notes, 'classification'),
      byCategory: countBy(notes, 'category'),
      bySelector: countBy(notes, (n) => n.selector.type),
      byScope: countBy(notes, (n) => n.scope.level),
      byConfidence: countBy(notes, 'confidence'),
    },
    notes,
  });
  write(path.join(OUT_DIR, 'diocesan-differences.json'), { schemaVersion: SCHEMA_VERSION, ...differences });
  write(path.join(OUT_DIR, 'unresolved.json'), unresolved);

  console.log(`catalog: ${catalog.length} fixed identities`);
  sources.forEach((source) => console.log(`${source.diocese}: ${source.days.length} days, ${source.rules.length} rules, ${source.announcements.length} announcements`));
  console.log(`notes: ${notes.length}`, countBy(notes, 'classification'));
  console.log('differences:', differences.summary);
  console.log('unresolved:', unresolved.summary);
}

main();
