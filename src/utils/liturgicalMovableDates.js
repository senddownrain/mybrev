/**
 * Movable-date helpers with a `Date`-based API (stage 2 parser scripts, legacy
 * callers). This module holds NO rules of its own: every date comes from the
 * single source of truth in `src/utils/ordo/movableFeasts.js` (computus,
 * anchors, `yearOptions`) and `src/utils/ordo/season.js` (lectionary cycles).
 *
 * Dates are exchanged as ISO strings (YYYY-MM-DD) or UTC `Date` objects.
 */
import {
  COUNTRY_RULES,
  computeBaptismOfLord as computeBaptismOfLordIso,
  computeEasterSunday as computeEasterSundayIso,
  computeFirstAdventSunday as computeFirstAdventSundayIso,
  computeHolyFamily as computeHolyFamilyIso,
  computeYearAnchors,
  toYearOptions,
} from './ordo/movableFeasts.js';
import { lectionaryCyclesFor } from './ordo/season.js';

const DAY_MS = 86_400_000;

export function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function parseIsoDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function daysBetween(from, to) {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date) {
  return date.getUTCDay() === 0 ? 7 : date.getUTCDay();
}

/** Gregorian Easter Sunday as a UTC `Date`. */
export function computeEasterSunday(year) {
  return parseIsoDate(computeEasterSundayIso(year));
}

/** First Sunday of Advent as a UTC `Date`. */
export function computeFirstAdventSunday(year) {
  return parseIsoDate(computeFirstAdventSundayIso(year));
}

/** Holy Family as a UTC `Date`. */
export function computeHolyFamily(year) {
  return parseIsoDate(computeHolyFamilyIso(year));
}

/** Baptism of the Lord (Belarus: Epiphany fixed on 6.01) as a UTC `Date`. */
export function computeBaptismOfLord(year) {
  return parseIsoDate(computeBaptismOfLordIso(year, COUNTRY_RULES.BY));
}

/**
 * All movable celebrations of a civil year, keyed like
 * `calendarStore.dynamicDatesForYear()` / FEAST_NAME_MAP.
 */
export function getMovableFeastDates(year) {
  const a = computeYearAnchors(year, COUNTRY_RULES.BY);
  return {
    baptismOfLord: a.baptismOfLord,
    ashWednesday: a.ashWednesday,
    palmSunday: a.palmSunday,
    easterSunday: a.easterSunday,
    ascension: a.ascension,
    pentecost: a.pentecost,
    maryMotherChurch: a.maryMotherChurch,
    christTheHighPriest: a.christTheHighPriest,
    holyTrinity: a.trinity,
    corpusChristi: a.corpusChristi,
    sacredHeartOfJesus: a.sacredHeart,
    immaculateHeartOfMary: a.immaculateHeart,
    christKing: a.christKing,
    firstAdventSunday: a.firstAdventSunday,
    holyFamily: a.holyFamily,
  };
}

/** Year options in the shape stored in Firestore `yearOptions`. */
export function buildYearOptions(year) {
  return toYearOptions(year, COUNTRY_RULES.BY);
}

const isoOf = (date) => (date instanceof Date ? toIsoDate(date) : String(date));

/** Sunday lectionary cycle (A/B/C) of the liturgical year containing `date`. */
export function sundayCycleFor(date) {
  return lectionaryCyclesFor(isoOf(date)).sunday;
}

/** Weekday lectionary cycle (1/2) of the liturgical year containing `date`. */
export function weekdayCycleFor(date) {
  return Number(lectionaryCyclesFor(isoOf(date)).weekday);
}

const YEAR_OPTION_FIELDS = Object.freeze([
  'easterSunday', 'pentecost', 'firstAdventSunday', 'ashWednesday', 'holyFamily', 'baptismOfLord',
  'ascension', 'corpusChristi', 'ordintaryStart1', 'ordintaryWeeks1', 'ordintaryWeeks2',
]);

/**
 * Audit of a legacy Firestore `yearOptions` document. The effective options
 * are ALWAYS the computed ones: a stored document can no longer override the
 * calendar, it is only compared so that a discrepancy can be reported.
 * One-year exceptions belong to `liturgicalYearOverrides`.
 */
export function compareStoredYearOptions(year, stored = null) {
  const options = buildYearOptions(Number(year));
  if (!stored) return { options, discrepancies: [], source: 'computed' };
  const discrepancies = YEAR_OPTION_FIELDS
    .filter((field) => stored[field] !== undefined && stored[field] !== null && stored[field] !== '')
    .filter((field) => String(stored[field]) !== String(options[field]))
    .map((field) => ({ field, computed: options[field], stored: stored[field] }));
  return { options, discrepancies, source: 'computed' };
}

/** Years the app offers in pickers. Any year of the range can be generated. */
export const ORDO_MIN_YEAR = 1970;
export const ORDO_MAX_YEAR = 2199;

export function isSupportedOrdoYear(year) {
  return Number.isInteger(Number(year)) && Number(year) >= ORDO_MIN_YEAR && Number(year) <= ORDO_MAX_YEAR;
}

/** Descending list of years around `currentYear` (no stored document needed). */
export function getGeneratableYears(currentYear = new Date().getFullYear(), { past = 6, future = 10 } = {}) {
  const from = Math.max(ORDO_MIN_YEAR, Number(currentYear) - past);
  const to = Math.min(ORDO_MAX_YEAR, Number(currentYear) + future);
  return Array.from({ length: to - from + 1 }, (_, index) => to - index);
}
