/** Read source documents, never assemble an Office on an imaginary civil date. */
import { OFFICE_TEXT_FIELDS, FIRST_VESPER_FIELDS, OFFICE_FIELD_SLOTS, isSparseDayDocument } from '../constants/officeFields.js';
import { isFromDayReference } from '../constants/days.js';
import { getDayTemplateLabel, withoutObsoleteDocuments } from './liturgicalDayResolution.js';
import { selectReadingDocuments } from './ordo/runtime.js';
import { seasonalVariantKeys, materializeCommonForSeason } from './ordo/commonSeasons.js';
import { describeFieldRule } from './ordo/fieldRules.js';
import { PERIOD_LABEL_MAP } from '../constants/liturgical.js';

const HOUR = { invitatory: 'Запрашэнне', officeOfReadings: 'Афіцый чытанняў', lauds: 'Ютрань', daytime: 'Малая гадзіна', vespers: 'Нешпары' };
const PART = { antiphon: 'Антыфона', hymn: 'Гімн', antiphons: 'Антыфона', psalmody: 'Псальм', versicle: 'Верш', reading1: 'Першае чытанне', reading2: 'Другое чытанне', reading: 'Чытанне', prayer: 'Малітва', canticleAntiphon: 'Антыфона да песні', intercessions: 'Просьбы' };
const FIELDS = [...OFFICE_TEXT_FIELDS, ...FIRST_VESPER_FIELDS];
const nonempty = (value) => (typeof value === 'string' && value.trim() && !isFromDayReference(value)
  && !/^\[?from-(?:first-week|own-texts)\]?$/.test(value.replace(/<[^>]*>/g, '').trim())) || (Array.isArray(value) && value.some(nonempty));
const textOf = (value) => Array.isArray(value) ? value.filter(nonempty).join('\n\n') : value;
function fieldLabel(field) {
  const slot = OFFICE_FIELD_SLOTS[field] || OFFICE_FIELD_SLOTS[field.replace('vesper1', 'vesper')];
  const suffix = /(?:Ant|Ps)(\d)$/.exec(field)?.[1];
  return `${field.startsWith('vesper1') ? 'I Нешпары' : HOUR[slot?.[0]] || 'Тэкст'} · ${PART[slot?.[1]] || 'Тэкст'}${suffix ? ` ${suffix}` : ''}${/^sext[123]/.test(field) ? ` (${field[4]})` : ''}`;
}

export function previewSource(document, collection, kind, label) {
  return { id: document.id, collection, kind, label,
    fields: FIELDS.filter((field) => nonempty(document[field])).map((field) => ({ key: field, label: fieldLabel(field), text: textOf(document[field]) })),
    instructions: Object.entries(document._fieldRules || {}).filter(([, rule]) => !rule.omit)
      .map(([field, rule]) => ({ key: field, label: fieldLabel(field), text: rule.ref
        ? `Тое самае, што ${(Array.isArray(rule.ref) ? rule.ref : [rule.ref]).map(fieldLabel).join(' / ')}`
        : rule.source === 'template' ? `З агульных тэкстаў «${getDayTemplateLabel(rule.template)}»` : describeFieldRule(rule) })),
  };
}

/** reader: { document(collection,id), query(collection,where) }; injectable offline. */
export async function loadCatalogPreview(entry, reader, { diocese } = {}) {
  const sources = [], missing = [], errors = [];
  const safe = async (key, action, fallback) => {
    try { return await action(); } catch { errors.push(key); return fallback; }
  };
  const readDoc = (collection, id) => safe(`${collection}/${id}`, () => reader.document(collection, id), null);
  const readQuery = (collection, where) => safe(collection, () => reader.query(collection, where), []);
  let proper = [];
  const references = [entry.daysRef, ...(entry.fallbackDaysRefs || [])].filter(Boolean);
  for (const ref of references) {
    const ids = ref.dayIds || (ref.id ? [ref.id] : []);
    const found = [];
    for (const id of ids) {
      const sparse = entry.kind === 'feast' ? await readDoc('liturgicalProperTexts', id) : null;
      const document = sparse || await readDoc('days', id);
      if (!document || document._obsolete) continue;
      const source = { document, collection: sparse ? 'liturgicalProperTexts' : 'days' };
      if (isSparseDayDocument(document)) { found.splice(0, found.length, source); break; }
      found.push(source);
    }
    proper = found;
    if (proper.length) break;
    missing.push(...ids);
    if (ref._feast) proper = withoutObsoleteDocuments(await readQuery('days', { _feast: ref._feast }))
      .map((document) => ({ document, collection: 'days' }));
    if (proper.length) break;
  }
  // Some Christmas dated sources live in the fixed Proper (25/26/27/28 Dec,
  // 1/6 Jan), not in christmas-DD-MM. Select only the matching temporal source.
  if (!proper.length && entry.kind === 'period' && entry.specialDateKey && entry.fixedSourceRefs?.length) {
    for (const ref of entry.fixedSourceRefs) {
      const result = await Promise.all((ref.dayIds || []).map(async (id) => {
        const sparse = await readDoc('liturgicalProperTexts', id);
        const doc = sparse || await readDoc('days', id);
        return doc && !doc._obsolete ? { document: doc, collection: sparse ? 'liturgicalProperTexts' : 'days' } : null;
      }));
      proper.push(...result.filter(Boolean));
    }
  }
  for (const { document, collection } of proper) sources.push(previewSource(document, collection, 'proper', entry.kind === 'period' ? 'Тэксты дня перыяду' : 'Уласныя тэксты'));
  const templateIds = [...new Set([...(entry.templates || []), ...proper.flatMap(({ document }) => document._templates || [])])].filter((id) => id !== 'current-day');
  const templates = await Promise.all(templateIds.map((id) => readDoc('liturgicalTemplates', id)));
  templates.forEach((document, index) => {
    if (!document) { missing.push(templateIds[index]); return; }
    sources.push(previewSource({ ...document, id: templateIds[index] }, 'liturgicalTemplates', 'common', `Агульныя тэксты · ${getDayTemplateLabel(templateIds[index])}`));
    for (const season of seasonalVariantKeys(document)) sources.push(previewSource(
      { ...materializeCommonForSeason(document, season), id: `${templateIds[index]}:${season}` },
      'liturgicalTemplates', 'common', `${getDayTemplateLabel(templateIds[index])} · ${PERIOD_LABEL_MAP[season]}`,
    ));
  });
  const ref = entry.readingsRef;
  let readings = [];
  if (ref) {
    const field = ref._feast ? '_feast' : ref._date ? '_date' : ref._periodType ? '_periodType' : null;
    if (field) {
      const docs = withoutObsoleteDocuments(await readQuery('readings', { [field]: ref[field] }));
      readings = selectReadingDocuments({ purpose: entry.kind === 'period' ? 'weekday' : 'proper', where: ref }, entry, docs)
        .filter((doc) => !doc._place?.length || (Array.isArray(doc._place) ? doc._place.includes(diocese) : doc._place === diocese));
    }
  }
  const own = sources.some((source) => source.kind === 'proper' && source.fields.length);
  const common = sources.some((source) => source.kind === 'common' && source.fields.length);
  return { entryId: entry.id, sources, readings, missing: [...new Set(missing)], errors: [...new Set(errors)],
    availability: own && common ? 'proper-and-common' : own ? 'proper-only' : common ? 'common-only' : 'none',
    status: own || common || readings.length ? 'available-sources' : 'no-content',
  };
}
