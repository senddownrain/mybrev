/**
 * Temporal cycle of a date: period, week, weekday, phase, psalter week and
 * lectionary cycles. Period keys and week numbering are exactly those of the
 * existing `computeLiturgicalContext`, so `days` period documents
 * (`<period>-w<week>-d<day>`) remain valid identities.
 */
import { calculatePsalterWeek } from '../liturgicalPsalter.js';
import {
  addDays, diffDays, isoFromParts, liturgicalDayOfWeek, nextSundayAfter, parseIso, sundayOnOrBefore,
} from './dates.js';
import { COUNTRY_RULES, computeYearAnchors } from './movableFeasts.js';

export const PERIOD_PHASES = Object.freeze({
  advent: ['advent-weekdays', 'dec17-24'],
  christmas: ['octave', 'before-epiphany', 'after-epiphany'],
  lent: ['ash-days', 'lent-weeks'],
  holyweek: ['palm-sunday', 'holy-week', 'triduum'],
  easter: ['octave', 'before-ascension', 'after-ascension', 'pentecost'],
  ordinary: ['before-lent', 'after-pentecost'],
});

/** Christmas week I begins on the first Sunday after 25 December (as in MyBrev). */
function christmasWeek(iso, christmas) {
  const firstSunday = nextSundayAfter(christmas);
  if (iso < firstSunday) return 1;
  return Math.floor(diffDays(iso, firstSunday) / 7) + 1;
}

function lectionaryCycles(iso, anchors) {
  const liturgicalYear = iso >= anchors.firstAdventSunday ? anchors.year + 1 : anchors.year;
  return {
    liturgicalYear,
    sunday: ['A', 'B', 'C'][(liturgicalYear - 1) % 3],
    weekday: liturgicalYear % 2 === 1 ? '1' : '2',
  };
}

/**
 * Lectionary cycles of the liturgical year containing `iso`:
 * `{ liturgicalYear, sunday: 'A'|'B'|'C', weekday: '1'|'2' }`.
 */
export function lectionaryCyclesFor(iso, countryRules = COUNTRY_RULES.BY) {
  return lectionaryCycles(iso, computeYearAnchors(parseIso(iso).year, countryRules));
}

/**
 * @param {string} iso
 * @param {object} [countryRules]
 * @returns {{
 *   date: string, period: string, periodWeek: number, dayOfWeek: number,
 *   periodPhase: string, psalterWeek: number|null, readingCycle: object,
 *   isSunday: boolean, anchors: object,
 * }}
 */
export function computeSeason(iso, countryRules = COUNTRY_RULES.BY, anchorCache = null) {
  const { year, month, day } = parseIso(iso);
  const getAnchors = (y) => {
    if (anchorCache) {
      if (!anchorCache.has(y)) anchorCache.set(y, computeYearAnchors(y, countryRules));
      return anchorCache.get(y);
    }
    return computeYearAnchors(y, countryRules);
  };
  const a = getAnchors(year);
  const weekday = liturgicalDayOfWeek(iso);
  const base = (period, periodWeek, dayOfWeek, periodPhase) => ({
    date: iso,
    period,
    periodWeek,
    dayOfWeek,
    periodPhase,
    isSunday: weekday === 1,
    psalterWeek: calculatePsalterWeek({ date: iso, periodType: period, periodWeek }),
    readingCycle: lectionaryCycles(iso, a),
    anchors: a,
  });

  // Advent: first Sunday of Advent up to 24 December.
  if (iso >= a.firstAdventSunday && iso < a.christmas) {
    const diff = diffDays(iso, a.firstAdventSunday);
    return base('advent', Math.floor(diff / 7) + 1, (diff % 7) + 1, month === 12 && day >= 17 ? 'dec17-24' : 'advent-weekdays');
  }

  // Christmas: 25 December to the Baptism of the Lord inclusive.
  const christmasStart = month === 12 ? a.christmas : isoFromParts(year - 1, 12, 25);
  const christmasEnd = month === 12 ? getAnchors(year + 1).baptismOfLord : a.baptismOfLord;
  if (iso >= christmasStart && iso <= christmasEnd) {
    const octaveEnd = addDays(christmasStart, 7);
    const epiphany = month === 12 ? getAnchors(year + 1).epiphany : a.epiphany;
    const phase = iso <= octaveEnd ? 'octave' : iso < epiphany ? 'before-epiphany' : 'after-epiphany';
    return base('christmas', christmasWeek(iso, christmasStart), weekday, phase);
  }

  // Lent and Holy Week.
  if (iso >= a.ashWednesday && iso < a.easterSunday) {
    if (iso < a.firstLentSunday) {
      return base('lent', 0, 7 + diffDays(iso, a.firstLentSunday) + 1, 'ash-days');
    }
    if (iso >= a.palmSunday) {
      const dayOfWeek = diffDays(iso, a.palmSunday) + 1;
      const phase = dayOfWeek === 1 ? 'palm-sunday' : iso >= a.holyThursday ? 'triduum' : 'holy-week';
      return base('holyweek', 1, dayOfWeek, phase);
    }
    const diff = diffDays(iso, a.firstLentSunday);
    return base('lent', Math.floor(diff / 7) + 1, (diff % 7) + 1, 'lent-weeks');
  }

  // Easter: Easter Sunday to Pentecost inclusive.
  if (iso >= a.easterSunday && iso <= a.pentecost) {
    const diff = diffDays(iso, a.easterSunday);
    let phase = 'before-ascension';
    if (diff <= 7) phase = 'octave';
    else if (iso === a.pentecost) phase = 'pentecost';
    else if (iso > a.ascension) phase = 'after-ascension';
    return base('easter', Math.floor(diff / 7) + 1, (diff % 7) + 1, phase);
  }

  // Ordinary Time before Lent: week I starts the Monday after the Baptism.
  if (iso > a.baptismOfLord && iso < a.ashWednesday) {
    const diff = diffDays(iso, a.baptismOfLord);
    return base('ordinary', Math.floor(diff / 7) + 1, weekday, 'before-lent');
  }

  // Ordinary Time after Pentecost, counted back from Christ the King (week 34).
  const weeksBefore = diffDays(a.christKing, sundayOnOrBefore(iso)) / 7;
  return base('ordinary', 34 - weeksBefore, weekday, 'after-pentecost');
}

/**
 * Row of the Table of Liturgical Days (GNLYC 59) occupied by the temporal day
 * itself, before any celebration is considered.
 */
export function temporalPrecedence(season) {
  const { period, periodPhase, isSunday, date, anchors } = season;
  if (date === anchors.goodFriday || date === anchors.holySaturday || date === anchors.easterSunday) return 1;
  if (period === 'holyweek') return 2; // Palm Sunday and Monday–Thursday of Holy Week.
  if (date === anchors.ashWednesday) return 2;
  if (period === 'easter' && periodPhase === 'octave') return 2;
  if (isSunday && (period === 'advent' || period === 'lent' || period === 'easter')) return 2;
  if (isSunday) return 6; // Sundays of Christmas and Ordinary Time.
  if (period === 'advent' && periodPhase === 'dec17-24') return 9;
  if (period === 'christmas' && periodPhase === 'octave') return 9;
  if (period === 'lent') return 9;
  return 13;
}

/** Temporal days on which even obligatory memorials become only commemorations. */
export function isPrivilegedWeekday(season) {
  return temporalPrecedence(season) === 9;
}

export function isTriduum(season) {
  const { date, anchors } = season;
  return date >= anchors.holyThursday && date <= anchors.easterSunday;
}
