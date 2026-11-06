/**
 * Display Resolver → `dayOptions` (spec §12–13, stage 4).
 *
 * Cards are built ONLY from the legal Offices of the resolved day
 * (`primary` + `alternatives`). Documents that exist for the date but are
 * not a legal Office — a weekday under an obligatory memorial, a feast
 * impeded by a Sunday, another diocese's variant — are never cards. The
 * period day, Common variants and date documents stay component sources
 * (`templates` of the card that owns them, `itemsDays` for field fallback).
 *
 * Pure (no Firestore): the service passes the documents it fetched.
 */
import {
  LITURGICAL_OPTION_SOURCE,
  PLACE_LABEL_MAP,
  RANK_LABEL_MAP,
} from '../constants/liturgical.js';
import { formatLiturgicalPeriodTitle } from './liturgicalPeriodTitle.js';
import {
  getTemplateLabel,
  groupFixedCelebrationDays,
  isSeasonalDateDocumentId,
} from './liturgicalDayResolution.js';
import {
  claimedDayIds, officeDescriptorOf, optionDescriptor, selectFixedDocuments, summarizeOrdoDay,
} from './ordo/runtime.js';
import {
  isSparseDayDocument, OFFICE_TEXT_FIELDS, SPARSE_DAY_SCHEMA, SUNDAY_WEEK_1_TEMPLATE,
} from '../constants/officeFields.js';
import {
  CURRENT_DAY_CHOICE, assembleOffice, assemblyChoices, isBlank,
} from './ordo/officeAssembly.js';
import { getDayTemplateLabel } from './liturgicalDayResolution.js';
import { visualStamp } from './liturgicalVisual.js';

function buildPeriodTitle(context, date) {
  return formatLiturgicalPeriodTitle({
    periodType: context.periodType,
    periodWeek: context.periodWeek,
    dayOfWeek: context.dayOfWeek,
    date,
  });
}

export function buildDayTitle(day, context, date) {
  const hasCelebrationIdentity = day?._feast || day?._rank || day?._feastType;
  // Seasonal date documents were imported with headings from a particular
  // source year (for example a 21 December document may say "IV Sunday").
  // Their identity is the calendar date, so render the current calendar
  // context instead of leaking a stale weekday/title into another year.
  const isSeasonalCalendarDay = isSeasonalDateDocumentId(day?.id)
    && ['advent', 'christmas'].includes(day?._periodType);
  const isUntitledChristmasDay = day?._periodType === 'christmas' && !hasCelebrationIdentity;
  const isOfficeForDead = day?._kind === 'office-for-dead';
  const isPeriodDay = day?._periodType && !hasCelebrationIdentity && !isOfficeForDead;
  if (isPeriodDay || isSeasonalCalendarDay || isUntitledChristmasDay) {
    return buildPeriodTitle({
      ...context,
      periodType: day._periodType,
      periodWeek: day._periodWeekNumber ?? context.periodWeek,
      dayOfWeek: day._dayOfWeek ?? context.dayOfWeek,
    }, date);
  }
  if (day?._feastName) return day._feastName;
  return day?._title || day?._dayName || buildPeriodTitle(context, date);
}

function fixedSubtitle(day, count) {
  const chunks = [];
  if (day?._rank) chunks.push(RANK_LABEL_MAP[day._rank] || day._rank);
  const places = Array.isArray(day?._place) ? day._place : [day?._place];
  chunks.push(...places.filter(Boolean).map((place) => PLACE_LABEL_MAP[place] || place));
  if (count > 1) chunks.push(`${count} варыянты`);
  return chunks.length ? chunks.join(' · ') : 'Літургічны дзень';
}

const placesOf = (doc) => (Array.isArray(doc?._place) ? doc._place : [doc?._place]).filter(Boolean);

/** Temporal document of the date: seasonal date document, else the period day. */
function temporalDocument(daysResult) {
  return daysResult.seasonalException || daysResult.periodDays?.[0] || daysResult.periodFallback || null;
}

function dynamicDocuments(option, daysResult) {
  const code = String(option.feastCode || '').replace(/^feast-/, '');
  for (const [key, docs] of daysResult.dynamicDaysByFeast || new Map()) {
    if (String(key).replace(/^feast-/, '') === code && docs.length) return docs;
  }
  return [];
}

function templatesFromFixed(docs, diocese) {
  // Own diocesan documents first; every Common variant stays a template choice.
  const ordered = [...docs].sort((a, b) => Number(placesOf(b).includes(diocese)) - Number(placesOf(a).includes(diocese)));
  const groups = groupFixedCelebrationDays(ordered);
  return { day: groups[0]?.day || null, templates: groups.flatMap((group) => group.templates) };
}

const LEGACY_SUNDAY_WEEK_ONE_MARKERS = new Set([
  'from-first-week',
  'з нядзелі і тыдня',
  'з нядзелі i тыдня',
]);

function legacyOfficeMarker(value) {
  const raw = Array.isArray(value) && value.length === 1 ? value[0] : value;
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ').toLowerCase() : '';
}

/**
 * Compatibility for materialized feast documents that predate sparse Office
 * assembly.  Those documents stored instructions such as
 * ["з нядзелі І тыдня"] inside a text field.  Reuse the published
 * sunday-week-1 template instead of rendering/dropping the instruction.
 *
 * Sparse documents already carry _fieldRules and are resolved by
 * assembleOffice(), so they deliberately bypass this bridge.
 */
export function resolveLegacyTemplatePlaceholders(day, templates = new Map()) {
  if (!day || isSparseDayDocument(day)) return day;
  const getTemplate = (id) => (templates instanceof Map ? templates.get(id) : templates?.[id]) || null;
  const sundayWeek1 = getTemplate(SUNDAY_WEEK_1_TEMPLATE);
  if (!sundayWeek1) return day;

  let resolved = day;
  OFFICE_TEXT_FIELDS.forEach((field) => {
    if (!LEGACY_SUNDAY_WEEK_ONE_MARKERS.has(legacyOfficeMarker(day[field]))) return;
    const replacement = sundayWeek1[field];
    if (isBlank(replacement)) return;
    if (resolved === day) resolved = { ...day };
    resolved[field] = replacement;
  });
  return resolved;
}

export const CURRENT_DAY_LABEL = 'З дня';

/** Where the Office of a fixed celebration came from (`option.ordo.properSource`). */
export const PROPER_SOURCE = Object.freeze({
  PROPER_TEXTS: 'liturgicalProperTexts',
  LEGACY_DAYS: 'legacy-days',
  NONE: 'none',
});

/** Day of the temporal cycle that completes an assembled Office. */
function currentDayDocument(daysResult) {
  return daysResult.seasonalException || daysResult.seasonalDateDay
    || daysResult.periodFallback || daysResult.periodDays?.[0] || null;
}

/** Identity-only document of a celebration that has no `days` document yet. */
function scaffoldOf(option) {
  const date = option.daysRef?._date || '';
  return {
    id: option.daysRef?.dayIds?.[0] || [date.replace('.', '-'), option.id].filter(Boolean).join('-'),
    _schema: SPARSE_DAY_SCHEMA,
    _scaffold: true,
    _celebrationId: option.id,
    ...(date ? { _date: date } : {}),
    _rank: option.rank,
    ...(option.dioceseId ? { _place: option.dioceseId } : {}),
    _feastName: option.title,
    _templates: option.templates || [],
    ...(option.defaultTemplate ? { _defaultTemplate: option.defaultTemplate } : {}),
    _contentStatus: option.contentStatus || { hours: option.templates?.length ? 'common-only' : 'day-fallback' },
  };
}

/**
 * Legal assemblies of a sparse celebration as the card's `templates`:
 * the default first (its id is the document id, so plain links work), the
 * other choices as `<id>--<template>` (the ids of the former copies) and
 * `<id>--day` for «З дня».
 */
export function assembledTemplates({ proper, option, resolved, daysResult, templates }) {
  const office = officeDescriptorOf(resolved, option.id);
  const currentDay = currentDayDocument(daysResult);
  const context = {
    _periodType: currentDay?._periodType, _periodWeekNumber: currentDay?._periodWeekNumber, _dayOfWeek: currentDay?._dayOfWeek,
  };
  const choiceId = (choice) => `${proper.id}--${choice === CURRENT_DAY_CHOICE ? 'day' : choice}`;
  return assemblyChoices(proper, office).map((choice, index) => {
    const { day, missing } = assembleOffice({
      proper, office, templates, choice, currentDay, season: { period: resolved.period, periodPhase: resolved.periodPhase },
    });
    const id = index === 0 ? proper.id : choiceId(choice);
    return {
      id,
      dayIds: index === 0 ? [proper.id, choiceId(choice)] : [id],
      choice,
      label: choice === CURRENT_DAY_CHOICE ? CURRENT_DAY_LABEL : getDayTemplateLabel(choice),
      day: { ...context, ...day, id, ...(missing.length ? { _missingFields: missing } : {}) },
    };
  });
}

function contentHint(proper) {
  const status = proper?._contentStatus?.hours;
  if (status === 'common-only') return 'агульныя тэксты';
  if (status === 'day-fallback') return 'тэксты дня';
  return '';
}

/** May the Office for the Dead be offered as a votive Office today? */
export function allowsOfficeForDead(resolved) {
  // Only on ordinary weekdays (row 13; with optional memorials allowed) and
  // on All Souls itself. Never on Sundays, solemnities, feasts, privileged
  // weekdays or days with an obligatory memorial.
  const primary = resolved.primary;
  // All Souls on a Sunday: the Hours are of the Sunday (§11.1).
  if (resolved.sources?.split) return false;
  if (primary.rankKind === 'all-souls') return true;
  return primary.kind === 'temporal' && Number(primary.precedence) === 13;
}

/**
 * @param {object} params
 * @param {object} params.resolved     ResolvedLiturgicalDay (engine)
 * @param {object} params.daysResult   `fetchDaysForDate` result (+ `extraFixedDays`)
 * @param {object} params.context      legacy context (periodType/periodWeek/dayOfWeek)
 * @param {string} params.date         ISO date
 * @param {string} params.diocese
 * @returns {{ dayOptions: object[], unavailable: object[], ordo: object }}
 */
export function buildOrdoDayOptions({ resolved, daysResult, context, date, diocese, templates = new Map() }) {
  const properDocs = (daysResult.properDays || []).filter(isSparseDayDocument);
  const fixedDocs = [
    ...(daysResult.fixedDateDays || []),
    ...(daysResult.extraFixedDays || []),
  ].filter((doc) => !isSeasonalDateDocumentId(doc.id));
  const temporal = temporalDocument(daysResult);
  const options = [];
  const unavailable = [];

  // Legal Offices of the Hours (`officeOptions`: the Sunday on All Souls Sunday).
  (resolved.officeOptions || [resolved.primary, ...resolved.alternatives]).forEach((option) => {
    const ordo = optionDescriptor(resolved, option);
    const base = {
      contextPeriodType: context.periodType,
      ordo,
    };

    if (option.kind === 'temporal') {
      if (!temporal) { unavailable.push({ id: option.id, title: option.title, reason: 'no-days-document' }); return; }
      const seasonal = isSeasonalDateDocumentId(temporal.id);
      options.push({
        ...base,
        key: `${seasonal ? 'fixed' : 'period'}-${temporal.id}`,
        source: seasonal ? LITURGICAL_OPTION_SOURCE.FIXED : LITURGICAL_OPTION_SOURCE.PERIOD,
        title: buildDayTitle(temporal, context, date),
        ...(seasonal ? { titleIncludesWeekday: true } : {}),
        subtitle: seasonal ? fixedSubtitle(temporal, 1) : 'Літургічны дзень',
        day: temporal,
        templates: [{ id: temporal.id, label: 'Перыяд', day: temporal }],
        order: 1,
      });
      return;
    }

    if (option.kind === 'dynamic' || option.feastCode) {
      let docs = dynamicDocuments(option, daysResult);
      // Ash Wednesday, Palm Sunday, Easter, Pentecost ARE the temporal day:
      // without a dynamic document the period document carries the Office.
      if (!docs.length && option.temporal && temporal) docs = [temporal];
      // A movable memorial without its own document (Mary, Mother of the
      // Church) is assembled from its Common and the day, like a fixed one.
      if (!docs.length && !option.temporal && option.templates?.length && currentDayDocument(daysResult)) {
        unavailable.push({ id: option.id, title: option.title, reason: 'no-days-document', assembled: true });
        const proper = scaffoldOf(option);
        const variants = assembledTemplates({ proper, option, resolved, daysResult, templates });
        options.push({
          ...base,
          ordo: { ...ordo, missingProper: true, contentStatus: proper._contentStatus, properSource: PROPER_SOURCE.NONE },
          key: `dynamic-${option.id}`,
          source: LITURGICAL_OPTION_SOURCE.DYNAMIC,
          title: option.title,
          subtitle: [fixedSubtitle({ _rank: option.rank }, variants.length), contentHint(proper)].filter(Boolean).join(' · '),
          day: variants[0].day,
          templates: variants,
          order: 2,
        });
        return;
      }
      if (!docs.length) { unavailable.push({ id: option.id, title: option.title, reason: 'no-days-document' }); return; }
      options.push({
        ...base,
        key: `dynamic-${docs[0].id}`,
        source: LITURGICAL_OPTION_SOURCE.DYNAMIC,
        title: buildDayTitle(docs[0], context, date) || option.title,
        subtitle: 'Свята',
        day: docs[0],
        templates: docs.map((doc) => ({ id: doc.id, label: getTemplateLabel(doc), day: doc })),
        order: 2,
      });
      return;
    }

    // Proper source: `liturgicalProperTexts` first; fixed `days` documents
    // only when the celebration is not published there (transitional).
    const select = (list) => (option.daysRef?.source === 'fixed'
      ? selectFixedDocuments(option, list, { diocese, claimedIds: claimedDayIds(resolved, option.id) })
      : []);
    let docs = select(properDocs);
    let properSource = docs.length ? PROPER_SOURCE.PROPER_TEXTS : null;
    if (docs.length && option.id === 'our-lady-braslau') docs = select([...properDocs, ...fixedDocs]);
    if (!docs.length) {
      docs = select(fixedDocs);
      if (docs.length) properSource = PROPER_SOURCE.LEGACY_DAYS;
    }
    if (!docs.length && option.rankKind === 'all-souls' && daysResult.officeForDead) {
      docs = [daysResult.officeForDead];
      properSource = PROPER_SOURCE.LEGACY_DAYS;
    }

    // Sparse document, or no document at all: the celebration stays visible
    // and its Office is assembled (own texts → Common → the day).
    const sparse = docs.find(isSparseDayDocument);
    if (sparse || !docs.length) {
      const hasCurrentDay = Boolean(currentDayDocument(daysResult));
      // A votive memorial that lives only in a Common needs that Common.
      const needsCommon = option.daysRef?.source === 'template';
      if (!hasCurrentDay || (needsCommon && !templates.has(option.daysRef.template))) {
        unavailable.push({ id: option.id, title: option.title, reason: 'no-days-document' });
        return;
      }
      if (!sparse) unavailable.push({ id: option.id, title: option.title, reason: 'no-days-document', assembled: true });
      const proper = sparse || scaffoldOf(option);
      const variants = assembledTemplates({ proper, option, resolved, daysResult, templates });
      const day = variants[0].day;
      options.push({
        ...base,
        ordo: {
          ...ordo,
          ...(sparse ? {} : { missingProper: true }),
          contentStatus: proper._contentStatus || null,
          properSource: sparse ? properSource : PROPER_SOURCE.NONE,
        },
        key: `fixed-${option.id}`,
        source: LITURGICAL_OPTION_SOURCE.FIXED,
        title: option.title || buildDayTitle(day, context, date),
        subtitle: [fixedSubtitle({ _rank: option.rank, _place: proper._place }, variants.length), contentHint(proper)].filter(Boolean).join(' · '),
        day,
        templates: variants,
        order: 3,
      });
      return;
    }
    docs = docs.map((doc) => resolveLegacyTemplatePlaceholders(doc, templates));
    const { day, templates: documentTemplates } = templatesFromFixed(docs, diocese);
    options.push({
      ...base,
      ordo: { ...ordo, properSource },
      key: `fixed-${option.id}`,
      source: docs[0]?._kind === 'office-for-dead' ? LITURGICAL_OPTION_SOURCE.OFFICE_FOR_DEAD : LITURGICAL_OPTION_SOURCE.FIXED,
      title: buildDayTitle(day, context, date) || option.title,
      subtitle: fixedSubtitle(day, documentTemplates.length),
      day,
      templates: documentTemplates,
      order: 3,
    });
  });

  const officeForDeadUsed = options.some((option) => option.day?.id === daysResult.officeForDead?.id);
  if (daysResult.officeForDead && !officeForDeadUsed && allowsOfficeForDead(resolved)) {
    options.push({
      key: 'office-for-dead',
      source: LITURGICAL_OPTION_SOURCE.OFFICE_FOR_DEAD,
      title: daysResult.officeForDead._feastName || 'Афіцый за памерлых',
      subtitle: 'Афіцый за памерлых',
      day: daysResult.officeForDead,
      templates: [{ id: daysResult.officeForDead.id, label: 'Афіцый за памерлых', day: daysResult.officeForDead }],
      order: 99,
      contextPeriodType: context.periodType,
      ordo: {
        date: resolved.date,
        optionId: 'office-for-dead',
        role: 'votive',
        officeKind: 'office-for-dead',
        teDeum: false,
        compline: 'sunday-after-second-vespers',
        complineDay: 1,
        vespers: { type: 'own', date: resolved.date },
        commemorations: [],
      },
    });
  }

  return {
    dayOptions: options.map((option) => {
      // One colour for the card, its Office pages and its readings: the Ordo's.
      const stamp = visualStamp(option.ordo || {});
      const stamped = (day) => (day && Object.keys(stamp).length ? { ...day, ...stamp } : day);
      return {
        ...option,
        day: stamped(option.day),
        templates: (option.templates || []).map((template) => ({ ...template, day: stamped(template.day) })),
        dayId: option.day?.id || null,
        hasLiturgicalDay: Boolean(option.day),
        disabled: false,
      };
    }),
    unavailable,
    ordo: { ...summarizeOrdoDay(resolved), unavailable },
  };
}

/** The option (and its descriptor) that owns a `days` document id. */
export function findOptionByDayId(content, dayId) {
  // Old links on 8 September follow the single legal diocesan identity.
  if (/^08-09-(?:nativity-blessed-virgin-mary|our-lady-braslau-vitebsk)(?:--|$)/u.test(String(dayId))) {
    const current = (content?.dayOptions || []).find((option) => ['nativity-blessed-virgin-mary', 'our-lady-braslau'].includes(option.ordo?.optionId));
    if (current) return current;
  }
  return (content?.dayOptions || []).find((option) => option.dayId === dayId
    || option.templates?.some((template) => template.id === dayId || template.dayIds?.includes(dayId))) || null;
}

/** Prefer the legal Office in cached content assembled before itemsDays was fixed. */
export function findResolvedDayById(content, dayId) {
  const option = findOptionByDayId(content, dayId);
  const template = option?.templates?.find((item) => item.id === dayId || item.dayIds?.includes(dayId));
  return template?.day || option?.day || content?.itemsDays?.find((item) => item.id === dayId) || null;
}

/** Route lookup must see the same resolved document as the legal Office card. */
export function contentDayMap(allDays, dayOptions) {
  const dayMap = new Map(allDays.map((day) => [day.id, day]));
  dayOptions.forEach((option) => (option.templates || []).forEach((template) => {
    if (template.day) dayMap.set(template.id, template.day);
  }));
  return dayMap;
}
