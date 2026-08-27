import { isFromDayReference } from '../constants/days.js';
import { getDayTemplateLabel } from '../constants/dayTemplates.js';

const WEEKDAY_FIELD = Object.freeze({
  1: 'sunday',
  2: 'monday',
  3: 'tuesday',
  4: 'wednesday',
  5: 'thursday',
  6: 'friday',
  7: 'saturday',
});

const IDENTITY_FIELDS = new Set([
  'id', '_date', '_feast', '_feastName', '_rank', '_place', '_templates',
  '_currentVersion', '_periodType', '_periodWeekNumber', '_dayOfWeek', '_fromDayFields',
]);

const CHRISTMAS_DATE_EXCEPTION_EXCLUSIONS = new Set([
  '25.12',
  '26.12',
  '27.12',
  '28.12',
  '01.01',
  '06.01',
]);

const DAYTIME_SUFFIXES = Object.freeze([
  'Hymn', 'Ant1', 'Ant2', 'Ant3', 'Ps1', 'Ps2', 'Ps3', 'R', 'Pr',
]);
const DAYTIME_FIELDS = Object.freeze([1, 2, 3].flatMap((hour) => (
  DAYTIME_SUFFIXES.map((suffix) => `sext${hour}${suffix}`)
)));

export function isChristmasDateExceptionExclusion(mDate) {
  return CHRISTMAS_DATE_EXCEPTION_EXCLUSIONS.has(mDate.format('DD.MM'));
}

export function isSeasonalDateDocumentId(value) {
  return /^(?:advent|christmas)-\d{2}-\d{2}$/.test(String(value || ''));
}

/**
 * Canonical ID of a regular period day in `fixedDays`.
 *
 * Period documents are normally found through their selector fields. The ID
 * is a fallback for legacy imports that stored a selector in another type.
 */
export function getPeriodDayDocumentId(periodType, periodWeekNumber, dayOfWeek) {
  const period = String(periodType || '').trim();
  const week = Number(periodWeekNumber);
  const day = Number(dayOfWeek);
  if (!period || !Number.isInteger(week) || week < 0 || !Number.isInteger(day) || day < 1 || day > 7) {
    return '';
  }
  return `${period}-w${week}-d${day}`;
}

/** Canonical `dayTemplates` ID for a period week in the four-week psalter. */
export function getPeriodDayTemplateDocumentId(periodType, periodWeekNumber, dayOfWeek) {
  const period = String(periodType || '').trim();
  const week = Number(periodWeekNumber);
  const day = Number(dayOfWeek);
  if (!period || !Number.isInteger(week) || week < 1 || !Number.isInteger(day) || day < 1 || day > 7) {
    return '';
  }
  const psalmWeek = ((week - 1) % 4) + 1;
  return `${period}-psalmweek-${psalmWeek}-day-${day}`;
}

/** Canonical period document carrying the same slot in the four-week psalter. */
export function getPeriodPsalterDayDocumentId(periodType, periodWeekNumber, dayOfWeek) {
  const week = Number(periodWeekNumber);
  if (!Number.isInteger(week) || week < 1) return '';
  return getPeriodDayDocumentId(periodType, ((week - 1) % 4) + 1, dayOfWeek);
}

/** A complete Ordinary Time document representing a four-week psalter slot. */
export function getOrdinaryPsalterDayDocumentId(periodWeekNumber, dayOfWeek) {
  const week = Number(periodWeekNumber);
  const day = Number(dayOfWeek);
  if (!Number.isInteger(week) || week < 1 || !Number.isInteger(day) || day < 1 || day > 7) {
    return '';
  }
  const psalterWeek = ((week - 1) % 4) + 1;
  // Ordinary week I has no regular Sunday office in the stored calendar.
  // Week V is the next occurrence of exactly the same psalter week.
  const sourceWeek = psalterWeek === 1 && day === 1 ? 5 : psalterWeek;
  return getPeriodDayDocumentId('ordinary', sourceWeek, day);
}

export function isSeasonalDateException(mDate, periodType = null) {
  const month = mDate.month() + 1;
  const day = mDate.date();
  const isAdventException = month === 12 && day >= 17 && day <= 24;
  const isChristmasException = (month === 12 && day >= 25) || (month === 1 && day <= 12);
  const matchesAdvent = isAdventException && (!periodType || periodType === 'advent');
  const matchesChristmas = isChristmasException
    && (!periodType || periodType === 'christmas')
    && !isChristmasDateExceptionExclusion(mDate);
  return matchesAdvent || matchesChristmas;
}

export function getSeasonalDateExceptionId(mDate, periodType = null) {
  if (!isSeasonalDateException(mDate, periodType)) return null;
  const month = mDate.month() + 1;
  const prefix = month === 12 && mDate.date() <= 24 ? 'advent' : 'christmas';
  return `${prefix}-${String(mDate.date()).padStart(2, '0')}-${String(month).padStart(2, '0')}`;
}

function isMissing(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function singleAntiphonFallbackExclusions(day) {
  const excluded = new Set();
  const isEmptyOrFallback = (value) => isMissing(value) || isFromDayReference(value);
  const prefixes = new Set(Object.keys(day || {}).flatMap((field) => {
    const match = field.match(/^(.*)Ant[123]$/);
    return match ? [match[1]] : [];
  }));

  prefixes.forEach((prefix) => {
    const ant1 = day?.[`${prefix}Ant1`];
    const ant2 = day?.[`${prefix}Ant2`];
    const ant3 = day?.[`${prefix}Ant3`];
    if (!isMissing(ant1)
      && !isFromDayReference(ant1)
      && isEmptyOrFallback(ant2)
      && isEmptyOrFallback(ant3)) {
      excluded.add(`${prefix}Ant2`);
      excluded.add(`${prefix}Ant3`);
    }
  });

  // Daytime prayers may store one antiphon once under Terce (`sext1`) and
  // share it with Sext and None. Keep those later hours empty so the runtime
  // resolver continues to use the common antiphon.
  if (excluded.has('sext1Ant2') && excluded.has('sext1Ant3')) {
    [2, 3].forEach((hour) => {
      const fields = [1, 2, 3].map((index) => `sext${hour}Ant${index}`);
      if (fields.every((field) => isEmptyOrFallback(day?.[field]))) {
        fields.forEach((field) => excluded.add(field));
      }
    });
  }

  return excluded;
}

/**
 * The three daytime hours may omit fields that are shared with Terce
 * (`sext1`). Resolve each field independently so an hour can still keep its
 * own hymn, reading, or prayer while inheriting only the missing values.
 */
export function getDaytimeHourField(day, hour, suffix) {
  const value = day?.[`sext${hour}${suffix}`];
  if (!isMissing(value) && !isFromDayReference(value)) return value;
  const fallback = day?.[`sext1${suffix}`];
  return isMissing(fallback) || isFromDayReference(fallback) ? '' : fallback;
}

export function hasMissingDaytimeFields(day) {
  return DAYTIME_FIELDS.some((field) => isMissing(day?.[field]) || isFromDayReference(day?.[field]));
}

/** Fill missing daytime-hour texts from the matching four-week psalter day. */
export function resolvePeriodDayAgainstPsalter(day, psalterDay) {
  if (!day || !psalterDay) return day;
  const resolved = { ...day };
  DAYTIME_FIELDS.forEach((field) => {
    if (!isMissing(day[field]) && !isFromDayReference(day[field])) return;
    const fallback = psalterDay[field];
    resolved[field] = isMissing(fallback) || isFromDayReference(fallback) ? '' : fallback;
  });
  return resolved;
}

/** A single antiphon surrounds the complete group of three psalms. */
export function hasSingleAntiphonPsalmody({ ant1, ant2, ant3, ps1, ps2, ps3 }) {
  return !isMissing(ant1)
    && isMissing(ant2)
    && isMissing(ant3)
    && !isMissing(ps1)
    && !isMissing(ps2)
    && !isMissing(ps3);
}

/** Resolve explicit from-day references and optional seasonal gaps. */
export function resolveDayAgainstPeriod(day, periodDay, { fillMissing = false } = {}) {
  if (!day && !periodDay) return null;

  const resolved = { ...(periodDay || {}), ...(day || {}) };
  const fromDayFields = new Set(
    Array.isArray(day?._fromDayFields) ? day._fromDayFields : [],
  );
  Object.entries(day || {}).forEach(([field, value]) => {
    if (isFromDayReference(value)) fromDayFields.add(field);
  });
  const antiphonFallbackExclusions = fillMissing
    ? singleAntiphonFallbackExclusions(day)
    : new Set();
  const keys = new Set([
    ...Object.keys(periodDay || {}),
    ...Object.keys(day || {}),
    ...fromDayFields,
  ]);
  keys.forEach((field) => {
    const value = day?.[field];
    if (antiphonFallbackExclusions.has(field)) {
      resolved[field] = '';
      fromDayFields.delete(field);
    } else if (fromDayFields.has(field)) {
      const fallback = IDENTITY_FIELDS.has(field) ? '' : periodDay?.[field];
      resolved[field] = isFromDayReference(fallback) ? '' : (fallback ?? '');
    } else if (!IDENTITY_FIELDS.has(field) && fillMissing && isMissing(value)) {
      const fallback = periodDay?.[field];
      resolved[field] = isFromDayReference(fallback) ? '' : (fallback ?? '');
    }
  });

  // The assembled day is the runtime boundary: no unresolved marker may
  // reach a component, even when there is no matching period day or the
  // period document itself contains a stale reference.
  Object.keys(resolved).forEach((field) => {
    if (isFromDayReference(resolved[field])) resolved[field] = '';
  });
  if (fromDayFields.size) resolved._fromDayFields = [...fromDayFields];
  else delete resolved._fromDayFields;
  return resolved;
}

/** Date documents inherit every missing non-identity field from the period day. */
export function resolveDateDayAgainstPeriod(day, periodDay) {
  return resolveDayAgainstPeriod(day, periodDay, { fillMissing: true });
}

/**
 * The second Sunday after Christmas is a proper Sunday office.  Its few
 * `from-day` fields come from the matching dated Christmas document, while
 * all other proper Sunday fields must win over that weekday document.
 */
export function resolveChristmasDateAgainstPeriod(dateDay, periodDay) {
  if (periodDay?.id === 'christmas-w2-d1') {
    return resolveDayAgainstPeriod(periodDay, dateDay, { fillMissing: true });
  }
  return resolveDateDayAgainstPeriod(dateDay, periodDay);
}

function splitAntiphons(html) {
  if (!html) return [];
  const paragraphs = String(html).match(/<p(?:\s[^>]*)?>[\s\S]*?<\/p>/gi) || [];
  return paragraphs.slice(0, 3);
}

/**
 * Dec 17–24 documents keep the three Lauds/Vespers antiphons under weekday
 * field names. Expand the current weekday into the regular rendering fields.
 */
export function applySeasonalWeekdayAntiphons(day, dayOfWeek) {
  if (!day) return day;
  const value = day[WEEKDAY_FIELD[Number(dayOfWeek)]];
  const antiphons = splitAntiphons(value);
  if (antiphons.length < 3) return day;
  const resolved = { ...day };
  ['laudes', 'vesper'].forEach((office) => {
    antiphons.forEach((antiphon, index) => {
      resolved[`${office}Ant${index + 1}`] = antiphon;
    });
  });
  return resolved;
}

export function getFixedCelebrationKey(day) {
  return [
    day?._date,
    String(day?._feastName || day?._title || '').trim().toLowerCase(),
    String(day?._rank || day?._feastType || '').trim().toLowerCase(),
  ].join('|');
}

function normalizedTemplateReferences(day) {
  return [...new Set((Array.isArray(day?._templates) ? day._templates : [])
    .map((template) => String(template || '').trim())
    .filter(Boolean))].sort();
}

/** Stable identity of the common-text template represented by a fixed day. */
export function getFixedDayTemplateKey(day) {
  const currentVersion = String(day?._currentVersion || '').trim();
  if (currentVersion) return `template:${currentVersion}`;

  const references = normalizedTemplateReferences(day);
  if (references.length === 1) return `template:${references[0]}`;
  if (references.length) return `templates:${references.join('|')}`;

  // Without explicit template metadata, separate documents may contain
  // genuinely different own texts. Do not merge them only because their IDs
  // happen to have similar suffixes.
  return `document:${String(day?.id || '')}`;
}

function mergedPlaces(days) {
  return [...new Set(days.flatMap((day) => (
    Array.isArray(day?._place) ? day._place : [day?._place]
  )).map((place) => String(place || '').trim()).filter(Boolean))].sort();
}

function withMergedPlaces(day, days) {
  const result = { ...day };
  const places = mergedPlaces(days);
  if (places.length === 1) [result._place] = places;
  else if (places.length > 1) result._place = places;
  else delete result._place;
  return result;
}

/**
 * Group fixed celebrations by rank, then expose one selector per actual
 * common-text template. Diocese-specific copies remain addressable through
 * `dayIds`, but do not create duplicate template buttons.
 */
export function groupFixedCelebrationDays(days = []) {
  const celebrations = new Map();
  days.forEach((day) => {
    const key = getFixedCelebrationKey(day);
    const group = celebrations.get(key) || [];
    group.push(day);
    celebrations.set(key, group);
  });

  return [...celebrations.values()].map((variants) => {
    const templates = new Map();
    variants.forEach((variant) => {
      const key = getFixedDayTemplateKey(variant);
      const group = templates.get(key) || [];
      group.push(variant);
      templates.set(key, group);
    });

    return {
      day: withMergedPlaces(variants[0], variants),
      templates: [...templates.values()].map((templateVariants) => {
        const day = withMergedPlaces(templateVariants[0], templateVariants);
        return {
          id: day.id,
          dayIds: [...new Set(templateVariants.map((item) => item.id).filter(Boolean))],
          label: getTemplateLabel(day),
          day,
        };
      }),
    };
  });
}

export function getTemplateLabel(day) {
  const template = day?._currentVersion
    || (Array.isArray(day?._templates) && day._templates.length === 1 ? day._templates[0] : '')
    || String(day?.id || '').split('--').pop()
    || 'default';
  return getDayTemplateLabel(template);
}
