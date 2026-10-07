/**
 * Hours texts imported from checked-in lh.catholic.by source pages
 * (`patchs/sources/lh-catholic-by/*.html`, read by `lh-catholic-by.mjs`).
 * Pure plan builders; `scripts/liturgy/import-hours-sources.mjs` writes.
 *
 * A field is taken only from an hour whose source identity is the page's
 * own day: an evening that already belongs to tomorrow's I Vespers is never
 * a source (`extractPageFields` keeps it apart).
 */
import fs from 'node:fs';
import path from 'node:path';
import { extractPageFields, parseLhPage, plain } from './lh-catholic-by.mjs';
import { OFFICE_CONTENT_FIELDS, TE_DEUM_FIELD } from '../../../src/constants/officeFields.js';

export const LH_SOURCE_DIR = path.join('patchs', 'sources', 'lh-catholic-by');

const VESPER_FIELDS = ['vesperHymn', 'vesperAnt1', 'vesperAnt2', 'vesperAnt3', 'vesperPs1', 'vesperPs2', 'vesperPs3',
  'vesperR', 'vesperAntMag', 'vesperInter', 'vesperPr'];
const DAYTIME_DEAD = [1, 2, 3].flatMap((n) => [`sext${n}Hymn`, `sext${n}Ps1`, `sext${n}Ps2`, `sext${n}Ps3`]);

/**
 * Proper / Common source files (patchs/feasts). `map`: target field ← page
 * field (default: the same field).
 */
export const PROPER_IMPORTS = Object.freeze([
  {
    task: '7.3', files: ['patchs/feasts/14-02-sv-cyril-methodius.json'], page: '2026-02-14.html',
    map: { vesperHymn: 'laudesHymn' },
    basis: 'Vespers hymn = the Lauds hymn «Браты, абраныя Богам…» (owner verified in a clean year; on 14.02.2026 the evening is I Vespers of Sunday)',
  },
  {
    task: '5.17',
    files: ['patchs/feasts/16-05-sv-andrei-bobola.json', 'patchs/feasts/16-05-sv-andrei-bobola-minsk-mohilev.json', 'patchs/feasts/16-05-sv-andrei-bobola-pinsk.json'],
    page: '2025-05-16.html',
    fields: ['officeOfReadingsHymn', 'officeOfReadingsR1', 'officeOfReadingsR2', 'laudesHymn', 'laudesAntBen', 'laudesPr', 'vesperHymn', 'vesperAntMag', 'vesperPr'],
    basis: 'St Andrew Bobola, full Belarusian source 16.05.2025: own R1/R2 with responsories, own hymns',
  },
  {
    task: '9.1', files: ['patchs/feasts/common-texts/office-for-dead.json'], page: '2026-11-02.html',
    fields: ['laudesPs3', ...DAYTIME_DEAD],
    basis: 'All Faithful Departed 02.11.2026: Daytime Prayer of the Office for the Dead (hymn, Ps 70, 85, 86); Lauds Ps 146 without the repeated antiphon',
  },
]);

/** Temporal `days` documents (Firestore `days/{id}`). */
export const TEMPORAL_IMPORTS = Object.freeze([
  { task: '8.1', id: 'ordinary-w21-d3', page: '2026-08-25.html', fields: ['officeOfReadingsR1', 'officeOfReadingsR2'] },
  { task: '8.1', id: 'ordinary-w21-d4', page: '2023-08-30.html', fields: ['officeOfReadingsR1', 'officeOfReadingsR2'] },
  {
    task: '8.2', id: 'lent-w5-d1', page: '2026-03-22.html', fields: 'all',
    create: { _periodType: 'lent', _periodWeekNumber: 5, _dayOfWeek: 1, _dayName: 'V нядзеля Вялікага посту' },
  },
  {
    // The 07.06.2023 page (imported earlier) carries I Vespers of Corpus
    // Christi in its evening; the clean 06.06.2018 page and the eight
    // psalter-equivalent documents (w1/5/13/17/21/25/29/33-d4) agree.
    task: '10', id: 'ordinary-w9-d4', page: '2018-06-06.html', fields: VESPER_FIELDS, replace: true,
    confirmations: ['lh.catholic.by 06.06.2018 (clean Wednesday, IX week)', 'psalter week I Wednesday: ordinary-w{1,5,13,17,21,25,29,33}-d4 + lh.catholic.by 30.08.2023'],
  },
]);

const cache = new Map();
export function pageFields(page, root = process.cwd()) {
  const key = path.join(root, LH_SOURCE_DIR, page);
  if (!cache.has(key)) cache.set(key, extractPageFields(parseLhPage(fs.readFileSync(key, 'utf8'))));
  return cache.get(key);
}

const same = (a, b) => plain(Array.isArray(a) ? a.join(' ') : a) === plain(Array.isArray(b) ? b.join(' ') : b);

/** Changes of the patchs/feasts sources: [{ file, field, value, from, task }]. */
export function planProperImports(root = process.cwd()) {
  const changes = [];
  PROPER_IMPORTS.forEach((item) => {
    const { fields } = pageFields(item.page, root);
    const map = item.map || Object.fromEntries(item.fields.map((field) => [field, field]));
    item.files.forEach((file) => {
      const doc = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
      Object.entries(map).forEach(([target, from]) => {
        const value = fields[from];
        if (!value) throw new Error(`${item.page}: no ${from}`);
        if (doc[target] === value) return;
        changes.push({ file, field: target, value, from: doc[target] ?? null, textChanged: !same(doc[target], value), task: item.task, page: item.page });
      });
    });
  });
  return changes;
}

/** Write the planned changes into the source files (key order kept, new keys appended). */
export function writeProperImports(changes, root = process.cwd()) {
  const byFile = new Map();
  changes.forEach((change) => byFile.set(change.file, [...(byFile.get(change.file) || []), change]));
  byFile.forEach((list, file) => {
    const full = path.join(root, file);
    const doc = JSON.parse(fs.readFileSync(full, 'utf8'));
    list.forEach(({ field, value }) => { doc[field] = value; });
    fs.writeFileSync(full, `${JSON.stringify(doc, null, 2)}\n`);
  });
  return [...byFile.keys()];
}

/**
 * Plan of the temporal `days` imports against the current documents.
 * @returns {{ id, action: 'create'|'update'|'unchanged', fields: object, previous: object, task }[]}
 */
export function planTemporalImports(days, root = process.cwd()) {
  const byId = new Map(days.map((doc) => [doc.id, doc]));
  return TEMPORAL_IMPORTS.map((item) => {
    const { fields: source, identity } = pageFields(item.page, root);
    const names = item.fields === 'all'
      ? OFFICE_CONTENT_FIELDS.filter((field) => source[field] !== undefined)
      : item.fields;
    const fields = {};
    names.forEach((field) => {
      if (field === TE_DEUM_FIELD) { fields[field] = source[field] ? true : ''; return; }
      if (!source[field]) throw new Error(`${item.page}: no ${field} for ${item.id}`);
      fields[field] = source[field];
    });
    const current = byId.get(item.id) || null;
    const previous = Object.fromEntries(names.map((field) => [field, current?.[field] ?? null]));
    if (!current) {
      if (!item.create) throw new Error(`days/${item.id} missing and not creatable`);
      return {
        id: item.id, task: item.task, page: item.page, action: 'create', identity: identity.title,
        fields: { ...item.create, ...fields, checked: false, _source: { kind: 'lh.catholic.by', page: item.page } }, previous,
      };
    }
    // Only empty fields are filled — unless the import replaces a known
    // wrong value (`replace`), always with the previous value in the plan.
    const changed = Object.fromEntries(Object.entries(fields).filter(([field, value]) => {
      const before = current[field];
      if (same(before, value)) return false;
      return item.replace || !plain(Array.isArray(before) ? before.join(' ') : before);
    }));
    const skipped = names.filter((field) => !(field in changed) && !same(current[field], fields[field]));
    return {
      id: item.id, task: item.task, page: item.page, identity: identity.title,
      action: Object.keys(changed).length ? 'update' : 'unchanged', fields: changed, previous, skipped,
      ...(item.confirmations ? { confirmations: item.confirmations } : {}),
    };
  });
}

/** `days` with the planned temporal imports applied (audit target state). */
export function withTemporalImports(days, root = process.cwd()) {
  const plan = planTemporalImports(days, root);
  const result = days.map((doc) => {
    const item = plan.find((entry) => entry.id === doc.id && entry.action === 'update');
    return item ? { ...doc, ...item.fields } : doc;
  });
  plan.filter((entry) => entry.action === 'create').forEach((entry) => result.push({ id: entry.id, ...entry.fields }));
  return result;
}
