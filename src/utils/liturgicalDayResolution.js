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
  const keys = new Set([
    ...Object.keys(periodDay || {}),
    ...Object.keys(day || {}),
    ...fromDayFields,
  ]);
  keys.forEach((field) => {
    const value = day?.[field];
    if (fromDayFields.has(field)) {
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

export function getTemplateLabel(day) {
  const template = day?._currentVersion
    || (Array.isArray(day?._templates) && day._templates.length === 1 ? day._templates[0] : '')
    || String(day?.id || '').split('--').pop()
    || 'default';
  return getDayTemplateLabel(template);
}
