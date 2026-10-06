#!/usr/bin/env node
/**
 * Firestore ↔ bundled / generated drift (read-only, local snapshot).
 *
 *   liturgicalProperTexts      ↔ patchs/db-feasts
 *   liturgicalTemplates        ↔ patchs/db-templates
 *   liturgicalCelebrations     ↔ src/data/ordo/calendar-definitions.json
 *   liturgicalDioceseOverrides ↔ src/data/ordo/calendar-definitions.json
 *   liturgicalOrdoNotes        ↔ src/data/ordo/notes.json
 *   liturgicalCalendarMeta     ↔ bundled revisions
 *
 * Bookkeeping fields written by the imports (`importedAt`, `updatedAt`) are
 * ignored. A drift means: republish, or regenerate from Firestore — the
 * report says which side is newer when it can (revisions).
 *
 *   node scripts/liturgy/audit-drift.mjs [--snapshot dir]
 *
 * Output: reports/liturgy/firestore-drift.json
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { snapshotDirectory } from './lib/snapshot-content.mjs';
import { buildTargets } from '../ordo/import-calendar.mjs';

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, 'reports', 'liturgy', 'firestore-drift.json');
const IGNORED = new Set(['importedAt', 'updatedAt', 'publishedAt', 'id', '_id']);

/** Stable comparison form (sorted keys, no bookkeeping fields, timestamps dropped). */
export function comparable(value) {
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === 'object') {
    if (value.__firestoreType) return null;
    return Object.fromEntries(Object.keys(value).filter((key) => !IGNORED.has(key)).sort()
      .map((key) => [key, comparable(value[key])]).filter(([, item]) => item !== null && item !== undefined));
  }
  return value;
}

/** Ids only in Firestore, only bundled, and present in both but different. */
export function compareSets(live = [], bundled = []) {
  const liveById = new Map(live.map((doc) => [doc.id, doc]));
  const bundledById = new Map(bundled.map((doc) => [doc.id, doc]));
  const onlyLive = [...liveById.keys()].filter((id) => !bundledById.has(id)).sort();
  const onlyBundled = [...bundledById.keys()].filter((id) => !liveById.has(id)).sort();
  const different = [...bundledById.keys()].filter((id) => liveById.has(id)
    && JSON.stringify(comparable(liveById.get(id))) !== JSON.stringify(comparable(bundledById.get(id)))).sort();
  return { live: live.length, bundled: bundled.length, onlyLive, onlyBundled, different, inSync: !onlyLive.length && !onlyBundled.length && !different.length };
}

const readDir = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((name) => name.endsWith('.json')).map((name) => {
  const { _id, ...data } = JSON.parse(fs.readFileSync(path.join(ROOT, dir, name), 'utf8'));
  return { id: _id || name.replace(/\.json$/, ''), ...data };
});

async function main() {
  const snapshot = await openFirestoreSnapshot(snapshotDirectory());
  const read = async (name) => (await snapshot.collection(name)) || [];
  const definitions = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'ordo', 'calendar-definitions.json'), 'utf8'));
  const notes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'ordo', 'notes.json'), 'utf8'));
  const [meta] = await read('liturgicalCalendarMeta');
  // The calendar collections in the form the import publishes them.
  const targets = buildTargets({ definitions, notes });
  const published = (list) => list.map(({ id, data }) => ({ id, ...data }));
  const report = {
    generatedAt: new Date().toISOString(),
    snapshot: snapshot.manifest.exportedAt,
    collections: {
      liturgicalProperTexts: compareSets(await read('liturgicalProperTexts'), readDir('patchs/db-feasts')),
      liturgicalTemplates: compareSets(await read('liturgicalTemplates'), readDir('patchs/db-templates')),
      liturgicalCelebrations: compareSets(await read('liturgicalCelebrations'), published(targets.celebrations)),
      liturgicalDioceseOverrides: compareSets(await read('liturgicalDioceseOverrides'), published(targets.dioceseOverrides)),
      liturgicalOrdoNotes: compareSets(await read('liturgicalOrdoNotes'), published(targets.notes)),
    },
    revisions: {
      calendar: { firestore: meta?.revision ?? null, bundled: definitions.revision },
      notes: { firestore: meta?.notesRevision ?? null, bundled: notes.revision },
      properTexts: { firestore: meta?.properTextsRevision ?? null },
      templates: { firestore: meta?.templatesRevision ?? null },
    },
  };
  report.summary = Object.fromEntries(Object.entries(report.collections).map(([name, item]) => [name, item.inSync
    ? 'in sync'
    : `onlyFirestore ${item.onlyLive.length}, onlyBundled ${item.onlyBundled.length}, different ${item.different.length}`]));
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 1)}\n`);
  console.log(JSON.stringify({ output: path.relative(ROOT, OUTPUT), ...report.summary, revisions: report.revisions }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
