import { LITURGICAL_RANK } from '../constants/liturgical.js';

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

function normalizeRank(day) {
  return String(day?._rank || day?._feastType || day?.rank || '')
    .trim()
    .toLocaleLowerCase('be-BY');
}

/** Solemnities use Sunday Compline; feasts use the actual weekday. */
export function usesSundayCompletorium(day) {
  if (day?._kind === 'office-for-dead') return true;
  return SOLEMNITY_RANKS.has(normalizeRank(day));
}

/**
 * Te Deum follows the rank/calendar rule rather than a content field:
 * - solemnities and feasts: always;
 * - Sundays: except Lent and Holy Week;
 * - memorials and weekdays: never.
 */
export function shouldShowTeDeum(day) {
  if (!day || day._kind === 'office-for-dead') return false;

  const rank = normalizeRank(day);
  if (MEMORIAL_RANKS.has(rank)) return false;
  if (SOLEMNITY_RANKS.has(rank) || FEAST_RANKS.has(rank)) return true;

  const isSunday = Number(day._dayOfWeek) === 1;
  const periodType = String(day._periodType || '').trim().toLowerCase();
  return isSunday && !TE_DEUM_EXCLUDED_SUNDAY_PERIODS.has(periodType);
}
