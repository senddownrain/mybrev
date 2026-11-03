/**
 * Pure part of `fetchDaysForDate`: how the fetched `days` / Proper documents of
 * a date become the `daysResult` the Display Resolver reads.
 *
 * The service (`src/services/liturgicalDayService.js`) only fetches; the
 * offline audits (`scripts/liturgy/*`) feed the same functions from the local
 * snapshot, so both see exactly the same documents.
 */
import { isSparseDayDocument } from '../constants/officeFields.js';
import {
  applySeasonalWeekdayAntiphons,
  getOrdinaryPsalterDayDocumentId,
  getPeriodPsalterDayDocumentId,
  hasMissingDaytimeFields,
  isChristmasDateExceptionExclusion,
  isSeasonalDateDocumentId,
  isSeasonalDateException,
  resolveChristmasDateAgainstPeriod,
  resolveDateDayAgainstPeriod,
  resolveDayAgainstPeriod,
  resolvePeriodDayAgainstPsalter,
} from './liturgicalDayResolution.js';

const normalizedFeastCode = (code) => String(code || '').replace(/^feast-/, '');

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
  return periodType === 'advent'
    ? resolveDayAgainstPeriod(resolved, psalterDay, { fillMissing: true })
    : resolvePeriodDayAgainstPsalter(resolved, psalterDay);
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
  const resolvedPeriodDay = withCalendarContext(resolveDayAgainstPeriod(periodDay, null));

  const hasSeasonalException = isSeasonalDateException(mDate, context.periodType) && Boolean(seasonalDay);
  // 25–28.12, 1.01, 6.01: the date document is not the Office (a fixed
  // document is), but it is the octave day a sparse Proper completes from.
  const seasonalDateDay = seasonalDay && !hasSeasonalException && !exclusiveFeastCode
    ? withCalendarContext(resolveChristmasDateAgainstPeriod(seasonalDay, resolvedPeriodDay), { periodType: 'christmas', periodWeek: context.periodWeek })
    : null;
  const seasonalPeriodType = mDate.month() === 11 && mDate.date() <= 24 ? 'advent' : 'christmas';
  const seasonal = hasSeasonalException
    ? applySeasonalWeekdayAntiphons(
      withCalendarContext(
        context.periodType === 'christmas'
          ? resolveChristmasDateAgainstPeriod(seasonalDay, resolvedPeriodDay)
          : resolveDayAgainstPeriod(seasonalDay, resolvedPeriodDay, { fillMissing: true }),
        { periodType: seasonalPeriodType, periodWeek: context.periodWeek },
      ),
      context.dayOfWeek,
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

  const movableEntries = dynamicEntries
    .filter(([code]) => !exclusiveFeastCode || normalizedFeastCode(code) === exclusiveFeastCode);
  // Keep the original sparse/legacy Proper fields for rubric-aware assembly.
  // The legacy resolved map stays unchanged for solemnities and feasts.
  const rawDynamicDaysByFeast = new Map(movableEntries);
  const resolvedDynamicDays = new Map(movableEntries
    .map(([code, docs]) => [
      code,
      docs.map((item) => withCalendarContext(resolveDayAgainstPeriod(item, resolvedPeriodDay))),
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
    rawDynamicDaysByFeast,
    seasonalException: exclusiveFeastCode ? null : seasonal,
    seasonalDateDay,
    exclusiveFeastCode,
    exclusiveFixedDate,
    officeForDead: officeForDead ? withCalendarContext(resolveDayAgainstPeriod(officeForDead, resolvedPeriodDay)) : null,
  };
}
