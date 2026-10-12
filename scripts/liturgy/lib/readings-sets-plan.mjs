/**
 * Final readings phase: which Catholic.by page gives which Mass reading set
 * of which `readings` document, and the pure migration that builds the new
 * documents (structured `massReadings` + flat legacy projection).
 *
 * Rules (docs/readings-mass-sets.md):
 *   - a document with sets gets `massReadings` (schema 1); its flat fields are
 *     the projection of `flatSet` (old apps keep reading them), or none when
 *     the document only gathers sets of legacy documents (`flatSet: null`);
 *   - a legacy document covered by a canonical one gets `_massReadingsRef`
 *     and, with `flat: true`, its flat fields re-projected from the set;
 *   - reference-only sets keep citations only (no invented text);
 *   - unknown fields of the original documents are kept.
 */
import { parseLectionaryPage, validateParsedPage, PARSER_ID } from './lectionary-parser.mjs';
import {
  MASS_READINGS_SCHEMA, projectSetToLegacy, validateMassReadings, defaultSetId,
} from '../../../src/utils/massReadingSets.js';
import { lectionaryPage } from './lectionary-pages.mjs';

/** Display label of a source heading: «Імша ў вігілію» → «Св. Імша ў вігілію». */
export function setLabelOf(sourceLabel, fallback = '') {
  const value = String(sourceLabel || '').trim().replace(/\.$/, '');
  if (!value) return fallback;
  const sentence = value === value.toUpperCase() ? value.charAt(0) + value.slice(1).toLocaleLowerCase('be') : value;
  return /^Імша(\s|$)/u.test(sentence) ? `Св. ${sentence}` : sentence;
}

/** Reference-only sets confirmed by the owner (sections 5.5, 5.6): citations only. */
export const REFERENCE_SETS = Object.freeze({
  'cathedral-dedication': {
    id: 'mass',
    label: 'Св. Імша',
    referenceOnly: true,
    note: 'Агульны набор чытанняў гадавіны пасвячэння катэдральнага касцёла ва ўсіх дыяцэзіях.',
    source: { kind: 'owner-confirmed', note: 'MyBrev final phase spec §5.5' },
    sections: [
      { kind: 'reading', role: 'reading1', bible: 'Нм 8, 2–4а. 5–6. 8–10' },
      { kind: 'psalm', role: 'psalm', bible: 'Пс 119 (118), 129–130. 132–133. 135. 144' },
      { kind: 'reading', role: 'reading2', bible: 'Эф 2, 19–22' },
      { kind: 'gospel', role: 'gospel', bible: 'Мц 16, 13–19' },
    ],
  },
  'our-lady-lahishyn-trakai': {
    id: 'mass',
    label: 'Св. Імша',
    referenceOnly: true,
    source: { kind: 'owner-confirmed', note: 'MyBrev final phase spec §5.6' },
    sections: [
      { kind: 'reading', role: 'reading1', bible: 'Саф 3, 14–18', alternatives: [{ bible: 'Рым 12, 9–16аb' }] },
      { kind: 'gospel', role: 'gospel', bible: 'Лк 1, 39–59' },
    ],
  },
});

/**
 * Celebrations of this phase.
 *   doc        canonical document (existing, or `create` for a new one)
 *   sets       [{ page, index, id, context?, default?, label? }] or `reference`
 *   flatSet    set projected into the canonical flat fields (null: none)
 *   linked     legacy documents covered by the canonical one
 */
export const READING_SET_CELEBRATIONS = Object.freeze([
  {
    key: 'assumption', doc: '15-08-assumption-blessed-virgin-mary', flatSet: 'day',
    sets: [{ page: 'assumption', index: 0, id: 'vigil', context: 'vigil' }, { page: 'assumption', index: 1, id: 'day', context: 'day', default: true }],
  },
  {
    key: 'peter-paul', doc: '29-06-sv-peter-paul-apostles', flatSet: 'day',
    sets: [{ page: 'peter-paul', index: 0, id: 'vigil', context: 'vigil' }, { page: 'peter-paul', index: 1, id: 'day', context: 'day', default: true }],
  },
  {
    // Found by the full Lectionary audit (2026-10-12): the page has the same two Masses as 15.08 and 29.06.
    key: 'nativity-john-baptist', doc: '24-06-nativity-john-baptist', flatSet: 'day',
    sets: [{ page: 'nativity-john-baptist', index: 0, id: 'vigil', context: 'vigil' }, { page: 'nativity-john-baptist', index: 1, id: 'day', context: 'day', default: true }],
  },
  { key: 'bonaventure', doc: '15-07-sv-bonaventure', flatSet: 'mass', sets: [{ page: 'bonaventure', index: 0, id: 'mass' }] },
  { key: 'clare', doc: '11-08-sv-clare', flatSet: 'mass', sets: [{ page: 'clare', index: 0, id: 'mass' }] },
  {
    key: 'andrew-bobola', doc: '16-05-sv-andrei-bobola', flatSet: 'mass', sets: [{ page: 'andrew-bobola', index: 0, id: 'mass' }],
    linked: [{ doc: '16-05-sv-andrei-bobola-pinsk', set: 'mass', flat: true }],
  },
  {
    key: 'all-souls', doc: '02-11-all-faithful-departed', flatSet: 'first',
    sets: [
      { page: 'all-souls', index: 0, id: 'first', default: true },
      { page: 'all-souls', index: 1, id: 'second' },
      { page: 'all-souls', index: 2, id: 'third' },
    ],
  },
  { key: 'minsk-cathedral-dedication', doc: '16-03-minsk-mohilev-cathedral-dedication', flatSet: 'mass', sets: [{ page: 'minsk-cathedral-dedication', index: 0, id: 'mass' }] },
  { key: 'grodno-cathedral-dedication', doc: '04-12-grodno-cathedral-dedication', flatSet: 'mass', reference: 'cathedral-dedication' },
  { key: 'vitebsk-cathedral-dedication', doc: '10-10-vitebsk-cathedral-dedication', flatSet: 'mass', reference: 'cathedral-dedication' },
  {
    key: 'pinsk-cathedral-dedication', doc: '01-05-pinsk-cathedral-dedication', flatSet: 'mass', reference: 'cathedral-dedication',
    create: { _date: '01.05', _dayId: '01-05-dedication-pinsk-cathedral-diocese', _place: 'pinsk', _rank: 'festum', title: 'Гадавіна пасвячэння катэдральнага касцёла', year: null },
  },
  {
    key: 'our-lady-lahishyn', doc: '22-08-our-lady-lahishyn-pinsk', flatSet: 'mass', reference: 'our-lady-lahishyn-trakai',
    create: { _date: '22.08', _dayId: '22-08-our-lady-lahishyn-pinsk', _place: 'pinsk', _rank: 'solemnitas', title: 'Найсв. Панны Марыі Лагішынскай, апякункі Пінскай дыяцэзіі', year: null },
  },
  {
    key: 'our-lady-trakai', doc: '05-07-our-lady-trakai-grodno', flatSet: 'mass', reference: 'our-lady-lahishyn-trakai',
    create: { _date: '05.07', _dayId: '05-07-our-lady-trakai-grodno', _place: 'grodno', _rank: 'festum', title: 'Найсв. Панны Марыі Тракельскай', year: null },
  },
  {
    key: 'palm-sunday', doc: 'feast-palmsunday', flatSet: null,
    create: { _feast: 'feast-palmsunday', title: 'Пальмовая нядзеля або Нядзеля Мукі Пана', year: null },
    sets: [
      { page: 'palm-sunday', index: 0, id: 'procession', context: 'procession' },
      { page: 'palm-sunday', index: 1, id: 'mass', context: 'mass', default: true },
    ],
    linked: [
      { doc: 'feast-palmsunday--A', set: 'mass', cycle: 'A', flat: true },
      { doc: 'feast-palmsunday--B', set: 'mass', cycle: 'B', flat: true },
      { doc: 'feast-palmsunday--C', set: 'mass', cycle: 'C', flat: true },
      // Legacy mix of the Mass readings and the procession Gospel (year A): kept as it is.
      { doc: 'feast-palmsunday--procession', set: 'procession', flat: false },
    ],
  },
  {
    key: 'holy-thursday', doc: 'holyweek-w1-d5', flatSet: 'chrism',
    sets: [
      { page: 'holy-thursday-chrism', index: 0, id: 'chrism', context: 'chrism', label: 'Св. Імша Хрызма' },
      { page: 'holy-thursday-evening', index: 0, id: 'evening', context: 'evening', default: true, label: 'Св. Імша Вячэры Пана' },
    ],
    linked: [{ doc: 'holyweek-w1-d5--evening-mass', set: 'evening', flat: true }],
  },
  { key: 'good-friday', doc: 'holyweek-w1-d6', flatSet: 'passion', sets: [{ page: 'good-friday', index: 0, id: 'passion', label: 'Вялікая пятніца Мукі Пана' }] },
  {
    key: 'easter-vigil', doc: 'holyweek-w1-d7--vigil', flatSet: null,
    create: { _periodType: 'holyweek', _periodWeekNumber: 1, _dayOfWeek: 7, _variant: 'vigil', title: 'Пасхальная вігілія ў святую ноч', year: null },
    sets: [{ page: 'easter-vigil', index: 0, id: 'vigil', context: 'vigil', label: 'Пасхальная вігілія' }],
    linked: [
      { doc: 'holyweek-w1-d7--A-vigil', set: 'vigil', cycle: 'A', flat: true },
      { doc: 'holyweek-w1-d7--B-vigil', set: 'vigil', cycle: 'B', flat: true },
      { doc: 'holyweek-w1-d7--C-vigil', set: 'vigil', cycle: 'C', flat: true },
    ],
  },
  { key: 'easter-sunday', doc: 'feast-eastersunday', flatSet: 'day', sets: [{ page: 'easter-sunday', index: 0, id: 'day', context: 'day', label: 'Св. Імша ўдзень' }] },
  {
    key: 'pentecost-saturday', doc: 'easter-w7-d7', flatSet: null,
    create: { _periodType: 'easter', _periodWeekNumber: 7, _dayOfWeek: 7, title: 'Субота VII Велікоднага тыдня', year: null },
    sets: [
      { page: 'easter-saturday-w7', index: 0, id: 'morning', context: 'morning' },
      { page: 'pentecost-vigil', index: 0, id: 'vigil', context: 'vigil', default: true },
    ],
    linked: [{ doc: 'easter-w7-d7--pentecost-vigil', set: 'vigil', flat: true }],
  },
  { key: 'pentecost', doc: 'feast-pentecost', flatSet: 'day', sets: [{ page: 'pentecost', index: 0, id: 'day', context: 'day' }] },
  {
    key: 'ascension', doc: 'feast-ascension', flatSet: null,
    create: { _feast: 'feast-ascension', title: 'Урачыстасць Унебаўшэсця Пана', year: null },
    sets: [{ page: 'ascension', index: 0, id: 'mass', label: 'Св. Імша' }],
    linked: [
      { doc: 'feast-ascension--A', set: 'mass', cycle: 'A', flat: true },
      { doc: 'feast-ascension--B', set: 'mass', cycle: 'B', flat: true },
      { doc: 'feast-ascension--C', set: 'mass', cycle: 'C', flat: true },
    ],
  },
  {
    key: 'christmas-eve', doc: 'advent-24-12', flatSet: 'morning',
    sets: [
      { page: 'christmas-eve-morning', index: 0, id: 'morning', context: 'morning', label: 'Ранішняя Св. Імша' },
      { page: 'christmas-vigil', index: 0, id: 'vigil', context: 'vigil', default: true },
    ],
    linked: [{ doc: 'advent-24-12--christmas-vigil', set: 'vigil', flat: true }],
  },
  {
    key: 'christmas', doc: '25-12-naradzhenne-pana', flatSet: 'day',
    sets: [
      { page: 'christmas', index: 0, id: 'night', context: 'night' },
      { page: 'christmas', index: 1, id: 'dawn', context: 'dawn' },
      { page: 'christmas', index: 2, id: 'day', context: 'day', default: true },
    ],
  },
]);

/** Flat fields a projection owns (removed before re-projecting). */
export const FLAT_FIELDS = Object.freeze([
  'reading1', 'reading2', 'reading3', 'reading4', 'reading5', 'reading6', 'reading7', 'epistle',
  'psalm', 'psalm1', 'psalm2', 'psalm3', 'psalm4', 'psalm5', 'psalm6', 'psalm7',
  'alleluia', 'sequence', 'gospel', 'sectionsFound',
]);

/** `<!-- source: … -->` / `<!-- fetched: … -->` header of a fixture. */
export function fixtureProvenance(html) {
  return {
    url: /<!--\s*source:\s*(\S+)\s*-->/.exec(html)?.[1] || '',
    fetchedAt: /<!--\s*fetched:\s*(\S+)\s*-->/.exec(html)?.[1] || '',
  };
}

const clean = (value) => JSON.parse(JSON.stringify(value));

function stripEmpty(section) {
  // `conclusion: ''` is meaningful (no «Гэта слова Божае» after that reading).
  return Object.fromEntries(Object.entries(section).filter(([key, value]) => value !== undefined && value !== null
    && !(typeof value === 'string' && value === '' && key !== 'conclusion')
    && !(Array.isArray(value) && !value.length)));
}

/** Parsed sets of every page (`pages`: key → fixture HTML). */
export function parsePages(pages) {
  const parsed = {};
  for (const [key, html] of Object.entries(pages)) {
    const page = parseLectionaryPage(html);
    parsed[key] = { ...page, errors: validateParsedPage(page), provenance: fixtureProvenance(html) || {} };
    if (!parsed[key].provenance.url) parsed[key].provenance.url = lectionaryPage(key)?.url || '';
  }
  return parsed;
}

function buildSet(spec, parsed) {
  const page = parsed[spec.page];
  if (!page) throw new Error(`No fixture for page ${spec.page}`);
  const source = page.sets[spec.index];
  if (!source) throw new Error(`${spec.page}: no set #${spec.index}`);
  const set = {
    id: spec.id,
    label: spec.label || setLabelOf(source.sourceLabel, 'Св. Імша'),
    ...(source.sourceLabel ? { sourceLabel: source.sourceLabel } : {}),
    ...(spec.context ? { context: spec.context } : {}),
    ...(spec.default ? { default: true } : {}),
    ...(source.note ? { note: source.note } : {}),
    source: { url: page.provenance.url, parser: PARSER_ID, ...(page.provenance.fetchedAt ? { fetchedAt: page.provenance.fetchedAt } : {}) },
    sections: source.sections.map((section) => stripEmpty({ ...section, label: undefined })),
  };
  return clean(set);
}

export function buildCelebrationSets(celebration, parsed) {
  if (celebration.reference) {
    const reference = REFERENCE_SETS[celebration.reference];
    return [clean(reference)];
  }
  return celebration.sets.map((spec) => buildSet(spec, parsed));
}

function withoutFlat(data) {
  const copy = { ...data };
  FLAT_FIELDS.forEach((field) => delete copy[field]);
  return copy;
}

function project(data, set, cycle) {
  const flat = projectSetToLegacy(set, cycle);
  const sectionsFound = Object.keys(flat).filter((key) => key !== 'sequence');
  return { ...withoutFlat(data), ...flat, ...(set.referenceOnly ? {} : { sectionsFound }) };
}

const citationsOf = (data) => Object.fromEntries(FLAT_FIELDS.filter((key) => data?.[key]?.bible).map((key) => [key, data[key].bible]));

/** What changed in a document, for the human plan. */
export function describeChange(before, after) {
  const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].filter((key) => key !== 'updatedAt');
  const changed = keys.filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]));
  return {
    changedFields: changed.sort(),
    citationsBefore: citationsOf(before),
    citationsAfter: citationsOf(after),
  };
}

/**
 * @param {{ docs: Map<string, object>, pages: Record<string, string> }} input
 *   docs: id → current data (snapshot or live); pages: page key → fixture HTML
 */
export function buildReadingsSetsMigration({ docs, pages, celebrations = READING_SET_CELEBRATIONS }) {
  const parsed = parsePages(pages);
  const changes = [];
  const warnings = [];
  const coverage = [];
  for (const celebration of celebrations) {
    const sets = buildCelebrationSets(celebration, parsed);
    const massReadings = { schema: MASS_READINGS_SCHEMA, flatSet: celebration.flatSet || null, sets };
    const errors = validateMassReadings(massReadings);
    if (errors.length) throw new Error(`${celebration.key}: ${errors.join('; ')}`);
    const original = docs.get(celebration.doc);
    if (!original && !celebration.create) {
      warnings.push(`${celebration.key}: document ${celebration.doc} not found; skipped`);
      continue;
    }
    const base = original || celebration.create;
    const flatSet = celebration.flatSet ? sets.find((set) => set.id === celebration.flatSet) : null;
    if (celebration.flatSet && !flatSet) throw new Error(`${celebration.key}: no set ${celebration.flatSet}`);
    const pageUrl = sets.find((set) => set.source?.url)?.source.url;
    let after = flatSet ? project(base, flatSet, flatSet.cycle || '') : withoutFlat(base);
    after = { ...after, massReadings, ...(pageUrl && !after._sourceUrl ? { _sourceUrl: pageUrl } : {}) };
    if (original && !original.massReadings && original._sourceUrl && pageUrl && original._sourceUrl !== pageUrl) {
      after._sourceUrl = pageUrl;
      after._previousSourceUrl = original._sourceUrl;
    }
    changes.push({ id: celebration.doc, celebration: celebration.key, action: original ? 'update' : 'create', role: 'canonical', before: original || null, after, ...describeChange(original, after) });
    for (const link of celebration.linked || []) {
      const legacy = docs.get(link.doc);
      if (!legacy) { warnings.push(`${celebration.key}: linked document ${link.doc} not found`); continue; }
      const set = sets.find((item) => item.id === link.set);
      const ref = { doc: celebration.doc, set: link.set, ...(link.cycle ? { cycle: link.cycle } : {}), projected: Boolean(link.flat) };
      const linkedAfter = { ...(link.flat ? project(legacy, set, link.cycle || '') : legacy), _massReadingsRef: ref };
      changes.push({ id: link.doc, celebration: celebration.key, action: 'update', role: 'linked', before: legacy, after: linkedAfter, ...describeChange(legacy, linkedAfter) });
    }
    coverage.push({
      celebration: celebration.key,
      document: celebration.doc,
      sets: sets.map((set) => ({
        id: set.id, label: set.label, context: set.context || null, default: set.id === defaultSetId(sets),
        referenceOnly: Boolean(set.referenceOnly), source: set.source?.url || set.source?.note || '',
        sections: set.sections.map((section) => `${section.kind}${section.role && section.role !== section.kind ? `:${section.role}` : ''}${section.cycle ? `/${section.cycle}` : ''}${section.passion ? '+roles' : ''}`),
      })),
      linked: (celebration.linked || []).map((link) => link.doc),
    });
  }
  const pageReport = Object.fromEntries(Object.entries(parsed).map(([key, page]) => [key, {
    url: page.provenance.url,
    fetchedAt: page.provenance.fetchedAt,
    sets: page.sets.map((set) => ({ sourceLabel: set.sourceLabel, sections: set.sections.length })),
    errors: page.errors,
    warnings: page.warnings,
  }]));
  return { changes, warnings, coverage, pages: pageReport };
}
