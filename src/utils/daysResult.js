/**
 * Pure part of `fetchDaysForDate`: how the fetched `days` / Proper documents of
 * a date become the `daysResult` the Display Resolver reads.
 *
 * The service (`src/services/liturgicalDayService.js`) only fetches; the
 * offline audits (`scripts/liturgy/*`) feed the same functions from the local
 * snapshot, so both see exactly the same documents.
 */
import { isSparseDayDocument } from '../constants/officeFields.js';
import highPriestDaytime from '../data/liturgical/christ-high-priest-daytime-by.json' with { type: 'json' };
import {
  applySeasonalWeekdayAntiphons,
  getOrdinaryPsalterDayDocumentId,
  getPeriodPsalterDayDocumentId,
  hasMissingDaytimeFields,
  isChristmasDateExceptionExclusion,
  isSeasonalDateDocumentId,
  isSeasonalDateException,
  resolveChristmasDateAgainstPeriod,
  resolveAdventDateAgainstPeriod,
  resolveDateDayAgainstPeriod,
  resolveDayAgainstPeriod,
  resolvePeriodDayAgainstPsalter,
} from './liturgicalDayResolution.js';
import { ADVENT_VESPERS_PSALMS, applyReviewedAdventVespers } from './adventVespers.js';
import { OFFICE_CONTENT_FIELDS } from '../constants/officeFields.js';

const normalizedFeastCode = (code) => String(code || '').replace(/^feast-/, '');

/**
 * Canonical Belarusian daytime Proper from the supplied feast formulary.
 * This temporary bundled fallback is needed while the live Firestore feast
 * document is unverified/unpatched. No other Hours or feasts are modified.
 */
export function applyHighPriestDaytimeProper(doc, feastCode) {
  if (!doc || normalizedFeastCode(feastCode) !== 'christthehighpriest') return doc;
  const supplied = highPriestDaytime.fields;
  const staleRefs = Array.isArray(doc._fromDayFields)
    ? doc._fromDayFields.filter((field) => !Object.hasOwn(supplied, field))
    : null;
  return {
    ...doc,
    ...supplied,
    ...(staleRefs ? { _fromDayFields: staleRefs } : {}),
  };
}

/** Codes that make the whole date one movable feast (no fixed documents). */
export function exclusiveFeastCodeOf(dynamicFeastCodes = []) {
  return dynamicFeastCodes
    .map(normalizedFeastCode)
    .find((code) => code === 'holyfamily' || code === 'buptismofthelord') || null;
}

/** `DD.MM` and `D.M` spellings queried for the fixed documents of a date. */
export const fixedDateVariantsOf = (mDate) => [...new Set([mDate.format('DD.MM'), mDate.format('D.M')])];

/**
 * Id of the psalter day that completes a period document, or null when the
 * period document is complete (Advent always borrows its missing fields).
 */
export function periodPsalterFallbackId(resolved, periodType, periodWeekNumber, dayOfWeek) {
  if (!resolved || periodType === 'christmas') return null;
  if (periodType !== 'advent' && !hasMissingDaytimeFields(resolved)) return null;
  const fallbackId = periodType === 'ordinary'
    ? getPeriodPsalterDayDocumentId(periodType, periodWeekNumber, dayOfWeek)
    : getOrdinaryPsalterDayDocumentId(periodWeekNumber, dayOfWeek);
  return fallbackId && fallbackId !== resolved.id ? fallbackId : null;
}

export function applyPeriodPsalterFallback(resolved, psalterDay, periodType) {
  if (!resolved || !psalterDay) return resolved;
  const result = periodType === 'advent'
    ? resolveDayAgainstPeriod(resolved, psalterDay, { fillMissing: true })
    : resolvePeriodDayAgainstPsalter(resolved, psalterDay);
  if (periodType === 'advent') {
    result._fieldSources = { ...resolved._fieldSources };
    OFFICE_CONTENT_FIELDS.forEach((field) => {
      const own = resolved[field] !== undefined && resolved[field] !== null && resolved[field] !== '';
      result._fieldSources[field] ||= { document: own ? resolved.id : psalterDay.id, field };
    });
    if (Number(resolved._dayOfWeek) !== 1) {
      ADVENT_VESPERS_PSALMS.forEach((field) => {
        result[field] = psalterDay[field] ?? '';
        result._fieldSources[field] = { document: psalterDay.id, field };
      });
    }
  }
  return result;
}

/**
 * @param {object} p
 * @param {import('moment').Moment} p.mDate
 * @param {object} p.context            legacy period context
 * @param {string[]} p.dynamicFeastCodes
 * @param {object|null} p.periodDay     period document already completed from its psalter day
 * @param {object[]} p.fixedDocs        `days` documents of the date (`_date`)
 * @param {object|null} p.seasonalDay   `advent-DD-12` / `christmas-DD-MM` (`getSeasonalDateDocumentId`)
 * @param {object|null} p.officeForDead
 * @param {Array<[string, object[]]>} p.dynamicEntries
 * @param {object[]} p.extraFixedDocs   `days` documents of transferred celebrations
 * @param {object[]} p.properDocs       `liturgicalProperTexts` documents
 */
export function assembleDaysResult({
  mDate, context, dynamicFeastCodes = [], periodDay, fixedDocs = [], seasonalDay = null,
  officeForDead = null, dynamicEntries = [], extraFixedDocs = [], properDocs = [],
}) {
  const exclusiveFeastCode = exclusiveFeastCodeOf(dynamicFeastCodes);
  const exclusiveFixedDate = isChristmasDateExceptionExclusion(mDate);
  const withCalendarContext = (day, overrides = {}) => (day ? {
    ...day,
    _periodType: overrides.periodType || context.periodType || day._periodType,
    _periodWeekNumber: overrides.periodWeek ?? context.periodWeek ?? day._periodWeekNumber,
    _dayOfWeek: context.dayOfWeek ?? day._dayOfWeek,
  } : null);
  const resolvedPeriodDay = withCalendarContext(resolveDayAgainstPeriod(applyReviewedAdventVespers(periodDay), null));

  const hasSeasonalException = isSeasonalDateException(mDate, context.periodType) && Boolean(seasonalDay);
  // 25–28.12, 1.01, 6.01: the date document is not the Office (a fixed
  // document is), but it is the octave day a sparse Proper completes from.
  const seasonalDateDay = seasonalDay && !hasSeasonalException && !exclusiveFeastCode
    ? withCalendarContext(resolveChristmasDateAgainstPeriod(seasonalDay, resolvedPeriodDay), { periodType: 'christmas', periodWeek: context.periodWeek })
    : null;
  const seasonalPeriodType = mDate.month() === 11 && mDate.date() <= 24 ? 'advent' : 'christmas';
  const seasonal = hasSeasonalException
    ? withCalendarContext(
      context.periodType === 'christmas'
        ? applySeasonalWeekdayAntiphons(resolveChristmasDateAgainstPeriod(seasonalDay, resolvedPeriodDay), context.dayOfWeek)
        : resolveAdventDateAgainstPeriod(applyReviewedAdventVespers(seasonalDay), resolvedPeriodDay, context.dayOfWeek),
      { periodType: seasonalPeriodType, periodWeek: context.periodWeek },
    )
    : null;
  // A sparse feast document (`_schema: 2`) is assembled field by field by the
  // Office resolver (`officeAssembly.js`), not filled from the period day.
  const resolveFixed = (item) => withCalendarContext(
    isSparseDayDocument(item) ? item : resolveDateDayAgainstPeriod(item, resolvedPeriodDay),
  );
  const resolvedFixed = fixedDocs
    .filter((item) => item.id !== seasonalDay?.id && !isSeasonalDateDocumentId(item.id))
    .map(resolveFixed);
  if (seasonal) resolvedFixed.unshift(seasonal);

  const resolvedDynamicDays = new Map(dynamicEntries
    .filter(([code]) => !exclusiveFeastCode || normalizedFeastCode(code) === exclusiveFeastCode)
    .map(([code, docs]) => [
      code,
      docs.map((item) => {
        // Movable *feasts* use the weekday psalter for Daytime Prayer. Legacy
        // feast documents may contain empty strings that mask that psalter.
        // Do not apply this to solemnities (their psalmody is different), or
        // to the remaining hours of the feast.
        const properDay = applyHighPriestDaytimeProper(item, code);
        const rank = String(properDay?._rank || properDay?._feastType || '').toLowerCase();
        const isFeast = ['festum', 'feast'].includes(rank)
          || normalizedFeastCode(code) === 'christthehighpriest';
        return withCalendarContext(resolveDayAgainstPeriod(properDay, resolvedPeriodDay, {
          fillMissingDaytime: isFeast,
        }));
      }),
    ]));

  return {
    properDays: exclusiveFeastCode ? [] : properDocs.filter(isSparseDayDocument).map((item) => withCalendarContext(item)),
    extraFixedDays: extraFixedDocs.filter((item) => !isSeasonalDateDocumentId(item.id)).map(resolveFixed),
    periodDays: exclusiveFeastCode || exclusiveFixedDate || hasSeasonalException
      ? []
      : (resolvedPeriodDay ? [resolvedPeriodDay] : []),
    periodFallback: resolvedPeriodDay,
    fixedDateDays: exclusiveFeastCode ? [] : resolvedFixed,
    dynamicDaysByFeast: resolvedDynamicDays,
    seasonalException: exclusiveFeastCode ? null : seasonal,
    seasonalDateDay,
    exclusiveFeastCode,
    exclusiveFixedDate,
    officeForDead: officeForDead ? withCalendarContext(resolveDayAgainstPeriod(officeForDead, resolvedPeriodDay)) : null,
  };
}
