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
  claimedDayIds, optionDescriptor, selectFixedDocuments, summarizeOrdoDay,
} from './ordo/runtime.js';

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

/** May the Office for the Dead be offered as a votive Office today? */
export function allowsOfficeForDead(resolved) {
  // Only on ordinary weekdays (row 13; with optional memorials allowed) and
  // on All Souls itself. Never on Sundays, solemnities, feasts, privileged
  // weekdays or days with an obligatory memorial.
  const primary = resolved.primary;
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
export function buildOrdoDayOptions({ resolved, daysResult, context, date, diocese }) {
  const fixedDocs = [
    ...(daysResult.fixedDateDays || []),
    ...(daysResult.extraFixedDays || []),
  ].filter((doc) => !isSeasonalDateDocumentId(doc.id));
  const temporal = temporalDocument(daysResult);
  const options = [];
  const unavailable = [];

  [resolved.primary, ...resolved.alternatives].forEach((option) => {
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

    let docs = option.daysRef?.source === 'fixed'
      ? selectFixedDocuments(option, fixedDocs, { diocese, claimedIds: claimedDayIds(resolved, option.id) })
      : [];
    if (!docs.length && option.rankKind === 'all-souls' && daysResult.officeForDead) docs = [daysResult.officeForDead];
    if (!docs.length) {
      unavailable.push({ id: option.id, title: option.title, reason: 'no-days-document' });
      if (option.role !== 'primary' || !temporal) return;
      // The primary Office must stay reachable: its texts fall back to the
      // current day (memorial psalmody is of the day anyway).
      options.push({
        ...base,
        ordo: { ...ordo, missingProper: true },
        key: `fixed-${option.id}`,
        source: LITURGICAL_OPTION_SOURCE.FIXED,
        title: option.title,
        subtitle: [RANK_LABEL_MAP[option.rank] || '', 'тэксты дня'].filter(Boolean).join(' · '),
        day: temporal,
        templates: [{ id: temporal.id, label: 'Перыяд', day: temporal }],
        order: 3,
      });
      return;
    }
    const { day, templates } = templatesFromFixed(docs, diocese);
    options.push({
      ...base,
      key: `fixed-${option.id}`,
      source: docs[0]?._kind === 'office-for-dead' ? LITURGICAL_OPTION_SOURCE.OFFICE_FOR_DEAD : LITURGICAL_OPTION_SOURCE.FIXED,
      title: buildDayTitle(day, context, date) || option.title,
      subtitle: fixedSubtitle(day, templates.length),
      day,
      templates,
      order: 3,
    });
  });

  const officeForDeadUsed = options.some((option) => option.day?.id === daysResult.officeForDead?.id);
  if (daysResult.officeForDead && !officeForDeadUsed && allowsOfficeForDead(resolved)) {
    options.push({
      key: 'office-for-dead',
      source: LITURGICAL_OPTION_SOURCE.OFFICE_FOR_DEAD,
      title: daysResult.officeForDead._feastName || 'Афіцый за памерлых',
      subtitle: 'Памінальны афіцый',
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
    dayOptions: options.map((option) => ({
      ...option,
      dayId: option.day?.id || null,
      hasLiturgicalDay: Boolean(option.day),
      disabled: false,
    })),
    unavailable,
    ordo: { ...summarizeOrdoDay(resolved), unavailable },
  };
}

/** The option (and its descriptor) that owns a `days` document id. */
export function findOptionByDayId(content, dayId) {
  return (content?.dayOptions || []).find((option) => option.dayId === dayId
    || option.templates?.some((template) => template.id === dayId || template.dayIds?.includes(dayId))) || null;
}
