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
 * Effective year options: computed by the engine, overridden field by field
 * by a stored Firestore `yearOptions` document when one exists. Returns the
 * differing fields so callers can log every discrepancy.
 */
export function mergeYearOptions(year, stored = null) {
  const computed = buildYearOptions(Number(year));
  if (!stored) return { options: computed, discrepancies: [], source: 'computed' };
  const discrepancies = YEAR_OPTION_FIELDS
    .filter((field) => stored[field] !== undefined && stored[field] !== null && stored[field] !== '')
    .filter((field) => String(stored[field]) !== String(computed[field]))
    .map((field) => ({ field, computed: computed[field], stored: stored[field] }));
  const options = { ...computed };
  YEAR_OPTION_FIELDS.forEach((field) => {
    if (stored[field] !== undefined && stored[field] !== null && stored[field] !== '') options[field] = stored[field];
  });
  return { options, discrepancies, source: 'firestore' };
}
