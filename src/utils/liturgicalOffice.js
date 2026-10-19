import { LITURGICAL_RANK } from '../constants/liturgical.js';
import { isChristmasOctaveDate } from './liturgicalPeriodTitle.js';

const SOLEMNITY_RANKS = new Set([
  LITURGICAL_RANK.SOLEMNITY,
  'solemnity',
  'урачыстасць',
  'ўрачыстасць',
  'торжество',
]);

const FEAST_RANKS = new Set([
  LITURGICAL_RANK.FEAST,
  'feast',
  'свята',
  'праздник',
]);

const MEMORIAL_RANKS = new Set([
  LITURGICAL_RANK.MEMORIAL,
  LITURGICAL_RANK.OPTIONAL_MEMORIAL,
  'memorial',
  'memoria-optional',
  'успамін',
]);

const TE_DEUM_EXCLUDED_SUNDAY_PERIODS = new Set(['lent', 'holyweek']);

const normalizePeriodType = (day) => String(day?._periodType || '')
  .trim()
  .toLowerCase();

const normalizeFeastCode = (day) => String(day?._feast || '')
  .trim()
  .toLowerCase()
  .replace(/^feast-/, '');

function normalizeRank(day) {
  return String(day?._rank || day?._feastType || day?.rank || '')
    .trim()
    .toLocaleLowerCase('be-BY');
}

/**
 * Weekday (1 = Sunday … 7 = Saturday) of the `completoriums` text for the
 * selected Office. With an Ordo descriptor (`day._ordo`) this is the engine's
 * decision: Sunday Compline after II Vespers (solemnities, Sundays, Triduum,
 * Easter octave) → 1; after I Vespers of tomorrow's Sunday/solemnity → 7
 * (Ps 4, 134); otherwise the current weekday. Without a descriptor the legacy
 * rank rule applies.
 */
export function getCompletoriumWeekday(day, dayOfWeek) {
  if (day?._ordo?.complineDay) return Number(day._ordo.complineDay);
  return usesSundayCompletorium(day) ? 1 : Number(dayOfWeek);
}

/**
 * Legacy rank rule (days without an Ordo descriptor, e.g. the admin editor):
 * solemnities use Sunday Compline; feasts use the actual weekday.
 */
export function usesSundayCompletorium(day) {
  if (day?._ordo?.complineDay) return Number(day._ordo.complineDay) === 1;
  if (day?._kind === 'office-for-dead') return true;
  return SOLEMNITY_RANKS.has(normalizeRank(day));
}

/**
 * Te Deum: the Ordo descriptor flag (`day._ordo.teDeum`) when present.
 * Legacy fallback — the rank/calendar rule rather than a content field:
 * - solemnities and feasts: always;
 * - every day in the Christmas and Easter octaves;
 * - Sundays: except Lent and Holy Week;
 * - memorials and weekdays outside those octaves: never.
 */
export function shouldShowTeDeum(day) {
  if (!day || day._kind === 'office-for-dead') return false;
  // The selected local Common formulary has festive Hours without changing
  // the memorial's rank or the calendar's Office descriptor.
  if (day._assembly?.festiveCommon) return Boolean(day.officeOfReadingsTeDeum);
  // The Ordo descriptor decides by the Office actually celebrated.
  if (typeof day._ordo?.teDeum === 'boolean') return day._ordo.teDeum;

  const periodType = normalizePeriodType(day);
  const periodWeek = Number(day._periodWeekNumber);
  const dayOfWeek = Number(day._dayOfWeek);
  const feastCode = normalizeFeastCode(day);

  // The Office follows special Proper-of-Seasons rubrics during the Paschal
  // Triduum. Palm Sunday is likewise a Sunday of Lent, even if a legacy
  // document happens to carry a feast rank.
  const isPaschalTriduum = periodType === 'holyweek' && dayOfWeek >= 5;
  if (isPaschalTriduum || feastCode === 'palmsunday') return false;

  const rank = normalizeRank(day);
  if (MEMORIAL_RANKS.has(rank)) return false;
  if (SOLEMNITY_RANKS.has(rank) || FEAST_RANKS.has(rank)) return true;

  const hasCalendarDate = Boolean(day._calendarDate);
  const isWithinChristmasOctave = periodType === 'christmas'
    && (hasCalendarDate ? isChristmasOctaveDate(day._calendarDate) : periodWeek === 1);
  const isWithinEasterOctave = periodType === 'easter' && periodWeek === 1;
  if (isWithinChristmasOctave || isWithinEasterOctave) return true;

  const isSunday = dayOfWeek === 1;
  return isSunday && !TE_DEUM_EXCLUDED_SUNDAY_PERIODS.has(periodType);
}
