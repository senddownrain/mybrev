/**
 * Liturgical alignment of a civil date using MyBrev's own calendar code.
 *
 * `computeLiturgicalContext` normally receives Firestore `yearOptions`; here
 * the options come from the pure movable-date rules, so the evidence can be
 * aligned for any year without network access.
 */
import moment from '../../../src/utils/moment-be.js';
import {
  computeLiturgicalContext,
  getDynamicFeastCodesForDate,
} from '../../../src/utils/liturgicalCalendar.js';
import { calculatePsalterWeek } from '../../../src/utils/liturgicalPsalter.js';
import {
  getPeriodDayDocumentId,
  getSeasonalDateExceptionId,
} from '../../../src/utils/liturgicalDayResolution.js';
import {
  addDays,
  buildYearOptions,
  daysBetween,
  getMovableFeastDates,
  isoWeekday,
  parseIsoDate,
  sundayCycleFor,
  toIsoDate,
  weekdayCycleFor,
} from '../../../src/utils/liturgicalMovableDates.js';

const cache = new Map();

function yearData(year) {
  if (!cache.has(year)) {
    const iso = getMovableFeastDates(year);
    const dynamicDates = Object.fromEntries(Object.entries(iso).map(([key, value]) => [key, moment(value, 'YYYY-MM-DD')]));
    cache.set(year, { iso, dynamicDates, options: buildYearOptions(year) });
  }
  return cache.get(year);
}

export function movableDates(year) {
  return yearData(year).iso;
}

/** Period phase where the rules change inside a period. */
function periodPhase(date, context) {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (context.periodType === 'advent') return month === 12 && day >= 17 ? 'dec17-24' : 'before-dec17';
  if (context.periodType === 'christmas') {
    if ((month === 12 && day >= 25) || (month === 1 && day === 1)) return 'octave';
    return 'after-octave';
  }
  if (context.periodType === 'lent' && context.periodWeek === 0) return 'ash-wednesday-week';
  if (context.periodType === 'holyweek') {
    if (context.dayOfWeek === 5) return 'holy-thursday';
    return context.dayOfWeek >= 6 ? 'triduum' : 'holy-week';
  }
  if (context.periodType === 'easter') {
    if (context.periodWeek === 1) return 'octave';
    return 'after-octave';
  }
  return null;
}

export function alignDate(isoDate) {
  const date = parseIsoDate(isoDate);
  const year = date.getUTCFullYear();
  const current = yearData(year);
  const next = yearData(year + 1);
  const mDate = moment(isoDate, 'YYYY-MM-DD');
  const context = computeLiturgicalContext(mDate, current.options, next.options, current.dynamicDates);
  const dynamic = getDynamicFeastCodesForDate(mDate, current.dynamicDates).map((code) => code.replace(/^feast-/, ''));
  const easter = parseIsoDate(current.iso.easterSunday);
  const easterOffset = daysBetween(easter, date);
  const psalterWeek = calculatePsalterWeek({ date: mDate, periodType: context.periodType, periodWeek: context.periodWeek });
  return {
    date: isoDate,
    isoWeekday: isoWeekday(date),
    mmdd: isoDate.slice(5),
    periodType: context.periodType,
    periodWeek: context.periodWeek,
    dayOfWeek: context.dayOfWeek,
    periodPhase: periodPhase(date, context),
    psalterWeek,
    sundayCycle: sundayCycleFor(isoDate),
    weekdayCycle: weekdayCycleFor(isoDate),
    dynamic,
    easterOffset: Math.abs(easterOffset) <= 70 ? easterOffset : null,
    periodDayId: getPeriodDayDocumentId(context.periodType, context.periodWeek, context.dayOfWeek) || null,
    seasonalDateId: getSeasonalDateExceptionId(mDate, context.periodType),
  };
}

/** Date of a celebration identity in a given civil year. */
export function celebrationDate(identity, year) {
  if (!identity) return null;
  if (identity.kind === 'fixed' && identity.mmdd) return `${year}-${identity.mmdd}`;
  if (identity.kind === 'dynamic') {
    const dates = movableDates(year);
    const key = DYNAMIC_KEY_BY_CODE[identity.id];
    if (key && dates[key]) return dates[key];
    if (identity.id === 'divinemercy') return toIsoDate(addDays(parseIsoDate(dates.easterSunday), 7));
  }
  return null;
}

export const DYNAMIC_KEY_BY_CODE = Object.freeze({
  holyfamily: 'holyFamily',
  buptismofthelord: 'baptismOfLord',
  trinity: 'holyTrinity',
  christking: 'christKing',
  heartofjesus: 'sacredHeartOfJesus',
  heartofmary: 'immaculateHeartOfMary',
  christthehighpriest: 'christTheHighPriest',
  ash: 'ashWednesday',
  eastersunday: 'easterSunday',
  pentecost: 'pentecost',
  marymotherchurch: 'maryMotherChurch',
  palmsunday: 'palmSunday',
  corpuschristi: 'corpusChristi',
  ascension: 'ascension',
});

export { daysBetween, parseIsoDate, addDays, toIsoDate };
