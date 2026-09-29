/**
 * Pure movable-date rules of the (Belarusian) Roman calendar.
 *
 * MyBrev currently reads Easter, Ash Wednesday, Pentecost, Advent and the
 * Ordinary Time week split from the Firestore `yearOptions` collection. These
 * helpers compute the same values from the permanent rules so that any year
 * can be generated without a stored document. No Firestore/Pinia/moment.
 *
 * Dates are exchanged as ISO strings (YYYY-MM-DD) and computed in UTC.
 */

const DAY_MS = 86_400_000;

function utc(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

export function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function parseIsoDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return utc(Number(match[1]), Number(match[2]), Number(match[3]));
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

/** Gregorian Easter Sunday (anonymous Gregorian algorithm). */
export function computeEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

/** First Sunday of Advent: the fourth Sunday before 25 December. */
export function computeFirstAdventSunday(year) {
  const christmas = utc(year, 12, 25);
  const back = isoWeekday(christmas) === 7 ? 7 : isoWeekday(christmas);
  return addDays(christmas, -back - 21);
}

/** Holy Family: Sunday within the Christmas octave, else 30 December. */
export function computeHolyFamily(year) {
  const christmas = utc(year, 12, 25);
  if (isoWeekday(christmas) === 7) return utc(year, 12, 30);
  return addDays(christmas, 7 - isoWeekday(christmas));
}

/** Baptism of the Lord: Sunday after 6 January (Epiphany is kept on 6.01 in Belarus). */
export function computeBaptismOfLord(year) {
  const epiphany = utc(year, 1, 6);
  return addDays(epiphany, isoWeekday(epiphany) === 7 ? 7 : 7 - isoWeekday(epiphany));
}

/**
 * All movable celebrations of a civil year, keyed like
 * `calendarStore.dynamicDatesForYear()` / FEAST_NAME_MAP.
 */
export function getMovableFeastDates(year) {
  const easter = computeEasterSunday(year);
  const pentecost = addDays(easter, 49);
  const firstAdvent = computeFirstAdventSunday(year);
  const sacredHeart = addDays(pentecost, 19);
  const dates = {
    baptismOfLord: computeBaptismOfLord(year),
    ashWednesday: addDays(easter, -46),
    palmSunday: addDays(easter, -7),
    easterSunday: easter,
    ascension: addDays(easter, 39),
    pentecost,
    maryMotherChurch: addDays(pentecost, 1),
    christTheHighPriest: addDays(pentecost, 4),
    holyTrinity: addDays(pentecost, 7),
    corpusChristi: addDays(pentecost, 11),
    sacredHeartOfJesus: sacredHeart,
    immaculateHeartOfMary: addDays(sacredHeart, 1),
    christKing: addDays(firstAdvent, -7),
    firstAdventSunday: firstAdvent,
    holyFamily: computeHolyFamily(year),
  };
  return Object.fromEntries(Object.entries(dates).map(([key, value]) => [key, toIsoDate(value)]));
}

/**
 * Year options in the shape stored in Firestore `yearOptions`, derived from
 * the permanent rules. `ordintaryWeeks1` is the last Ordinary week before
 * Lent, `ordintaryWeeks2` the Ordinary week resumed after Pentecost.
 */
export function buildYearOptions(year) {
  const dates = getMovableFeastDates(year);
  const baptism = parseIsoDate(dates.baptismOfLord);
  const ash = parseIsoDate(dates.ashWednesday);
  const pentecost = parseIsoDate(dates.pentecost);
  const firstAdvent = parseIsoDate(dates.firstAdventSunday);
  const weeksBeforeLent = daysBetween(baptism, addDays(ash, -3)) / 7 + 1;
  const resumedWeek = 34 - daysBetween(pentecost, addDays(firstAdvent, -7)) / 7;
  return {
    year,
    easterSunday: dates.easterSunday,
    pentecost: dates.pentecost,
    firstAdventSunday: dates.firstAdventSunday,
    ashWednesday: dates.ashWednesday,
    holyFamily: dates.holyFamily,
    baptismOfLord: dates.baptismOfLord,
    ascension: dates.ascension,
    corpusChristi: dates.corpusChristi,
    ordintaryStart1: toIsoDate(addDays(baptism, 1)),
    ordintaryWeeks1: weeksBeforeLent,
    ordintaryWeeks2: resumedWeek,
  };
}

/** Sunday lectionary cycle (A/B/C) of the liturgical year containing `date`. */
export function sundayCycleFor(date) {
  const current = parseIsoDate(date) || date;
  const year = current.getUTCFullYear();
  const liturgicalYear = current >= computeFirstAdventSunday(year) ? year + 1 : year;
  return ['C', 'A', 'B'][liturgicalYear % 3];
}

/** Weekday lectionary cycle (1/2) of the liturgical year containing `date`. */
export function weekdayCycleFor(date) {
  const current = parseIsoDate(date) || date;
  const year = current.getUTCFullYear();
  const liturgicalYear = current >= computeFirstAdventSunday(year) ? year + 1 : year;
  return liturgicalYear % 2 === 0 ? 2 : 1;
}
