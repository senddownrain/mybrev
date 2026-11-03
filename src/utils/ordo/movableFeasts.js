/**
 * Permanent rules for the temporal cycle and movable celebrations.
 *
 * Nothing here is stored per year: every date is computed from Easter, the
 * first Sunday of Advent, Christmas and Epiphany. Celebration ids reuse the
 * existing dynamic-feast identities (`FEAST_NAME_MAP` keys and `feast-*`
 * codes), so the resolved day can be joined with `days`/`readings` directly.
 */
import { FEAST_NAME_MAP } from '../../constants/liturgicalFeastsMap.js';
import { LITURGICAL_RANK } from '../../constants/liturgical.js';
import {
  addDays, diffDays, isoFromParts, isoWeekday, nextSundayAfter,
} from './dates.js';

/** Gregorian computus (Meeus/Jones/Butcher). */
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
  return isoFromParts(year, month, day);
}

/** First Sunday of Advent: the Sunday falling on or after 27 November. */
export function computeFirstAdventSunday(year) {
  const nov27 = isoFromParts(year, 11, 27);
  return addDays(nov27, (7 - isoWeekday(nov27)) % 7);
}

/**
 * Holy Family: the Sunday within the Christmas octave, or 30 December when
 * there is none (Christmas itself on Sunday).
 */
export function computeHolyFamily(year) {
  const christmas = isoFromParts(year, 12, 25);
  if (isoWeekday(christmas) === 7) return isoFromParts(year, 12, 30);
  return nextSundayAfter(christmas);
}

/**
 * Baptism of the Lord. With Epiphany fixed on 6 January (Belarus), it is the
 * Sunday after 6 January. Where Epiphany is moved to the Sunday 2–8 January,
 * a 7 or 8 January Epiphany pushes the Baptism to the following Monday.
 */
export function computeBaptismOfLord(year, { epiphany = 'fixed' } = {}) {
  if (epiphany === 'sunday') {
    const epiphanySunday = computeEpiphany(year, { epiphany });
    return epiphanySunday >= isoFromParts(year, 1, 7)
      ? addDays(epiphanySunday, 1)
      : nextSundayAfter(epiphanySunday);
  }
  return nextSundayAfter(isoFromParts(year, 1, 6));
}

export function computeEpiphany(year, { epiphany = 'fixed' } = {}) {
  if (epiphany === 'sunday') {
    const jan2 = isoFromParts(year, 1, 2);
    return addDays(jan2, (7 - isoWeekday(jan2)) % 7);
  }
  return isoFromParts(year, 1, 6);
}

/**
 * Country rules for movable celebrations. Belarus keeps Epiphany on 6 January,
 * Ascension on Thursday (e.g. Minsk/Vitebsk 2026: 14 May) and Corpus Christi on
 * Thursday, and adds the feast of Christ the High Priest.
 */
export const COUNTRY_RULES = Object.freeze({
  universal: Object.freeze({
    epiphany: 'fixed', ascension: 'thursday', corpusChristi: 'thursday', christTheHighPriest: false,
  }),
  BY: Object.freeze({
    epiphany: 'fixed', ascension: 'thursday', corpusChristi: 'thursday', christTheHighPriest: true,
  }),
});

export function getCountryRules(country = 'BY') {
  return COUNTRY_RULES[String(country || 'BY').toUpperCase()] || COUNTRY_RULES.BY;
}

/**
 * All year anchors needed by the season and celebration rules. Dates that
 * belong to the Christmas season crossing into the year (`baptismOfLord`,
 * `epiphany`) refer to January of `year`; `holyFamily` refers to December.
 */
export function computeYearAnchors(year, countryRules = COUNTRY_RULES.BY) {
  const easterSunday = computeEasterSunday(year);
  const pentecost = addDays(easterSunday, 49);
  const trinity = addDays(pentecost, 7);
  const firstAdventSunday = computeFirstAdventSunday(year);
  const sacredHeart = addDays(pentecost, 19);
  const baptismOfLord = computeBaptismOfLord(year, countryRules);
  const ashWednesday = addDays(easterSunday, -46);
  return {
    year,
    epiphany: computeEpiphany(year, countryRules),
    baptismOfLord,
    ashWednesday,
    firstLentSunday: addDays(ashWednesday, 4),
    palmSunday: addDays(easterSunday, -7),
    holyThursday: addDays(easterSunday, -3),
    goodFriday: addDays(easterSunday, -2),
    holySaturday: addDays(easterSunday, -1),
    easterSunday,
    divineMercySunday: addDays(easterSunday, 7),
    ascension: countryRules.ascension === 'sunday' ? addDays(easterSunday, 42) : addDays(easterSunday, 39),
    pentecost,
    maryMotherChurch: addDays(pentecost, 1),
    christTheHighPriest: addDays(pentecost, 4),
    trinity,
    corpusChristi: countryRules.corpusChristi === 'sunday' ? addDays(trinity, 7) : addDays(trinity, 4),
    sacredHeart,
    immaculateHeart: addDays(sacredHeart, 1),
    christKing: addDays(firstAdventSunday, -7),
    firstAdventSunday,
    christmas: isoFromParts(year, 12, 25),
    holyFamily: computeHolyFamily(year),
  };
}

/**
 * Ordinary Time week numbers, in the same shape as the Firestore
 * `yearOptions` document consumed by `computeLiturgicalContext`.
 */
export function toYearOptions(year, countryRules = COUNTRY_RULES.BY) {
  const a = computeYearAnchors(year, countryRules);
  const sundayBeforeAsh = addDays(a.ashWednesday, -3);
  return {
    year,
    easterSunday: a.easterSunday,
    pentecost: a.pentecost,
    firstAdventSunday: a.firstAdventSunday,
    ashWednesday: a.ashWednesday,
    holyFamily: a.holyFamily,
    baptismOfLord: a.baptismOfLord,
    ascension: a.ascension,
    corpusChristi: a.corpusChristi,
    ordintaryStart1: addDays(a.baptismOfLord, 1),
    ordintaryWeeks1: Math.floor(diffDays(sundayBeforeAsh, a.baptismOfLord) / 7) + 1,
    ordintaryWeeks2: 34 - diffDays(a.christKing, a.pentecost) / 7,
  };
}

const feast = (key) => ({ feastKey: key, feastCode: FEAST_NAME_MAP[key] });

/**
 * Movable celebrations. `temporal: true` marks a celebration that *is* the day
 * of the temporal cycle (Ash Wednesday, Palm Sunday …): the period day is its
 * content base and not a competing candidate. `precedence` pins the row of the
 * Table of Liturgical Days when it is not derivable from rank alone.
 */
export const MOVABLE_CELEBRATIONS = Object.freeze([
  {
    id: 'ash-wednesday', ...feast('ashWednesday'), title: 'Папяльцовая серада',
    rank: 'dies-liturgicus', category: 'season', temporal: true, precedence: 2,
    anchor: 'ashWednesday', color: 'violaceus',
  },
  {
    id: 'palm-sunday', ...feast('palmSunday'), title: 'Пальмовая нядзеля Мукі Пана',
    rank: 'dies-liturgicus', category: 'season', temporal: true, precedence: 2,
    anchor: 'palmSunday', color: 'ruber',
  },
  {
    id: 'easter-sunday', ...feast('easterSunday'), title: 'Нядзеля Уваскрасення Пана',
    rank: LITURGICAL_RANK.SOLEMNITY, category: 'lord', temporal: true, precedence: 1,
    anchor: 'easterSunday', color: 'albus', firstVespers: false,
  },
  {
    id: 'ascension', ...feast('ascension'), title: 'Унебаўшэсце Пана',
    rank: LITURGICAL_RANK.SOLEMNITY, category: 'lord', precedence: 2, anchor: 'ascension', color: 'albus',
  },
  {
    id: 'pentecost', ...feast('pentecost'), title: 'Спасланне Духа Святога',
    rank: LITURGICAL_RANK.SOLEMNITY, category: 'lord', temporal: true, precedence: 2,
    anchor: 'pentecost', color: 'ruber',
  },
  {
    // No own `days` document: the Office is assembled from the Common of the
    // BVM and the day (`buildOrdoDayOptions`), like a fixed memorial.
    id: 'mary-mother-church', ...feast('maryMotherChurch'), title: 'Найсв. Панны Марыі, Маці Касцёла',
    rank: LITURGICAL_RANK.MEMORIAL, category: 'mary', anchor: 'maryMotherChurch', color: 'albus',
    templates: ['blessed-virgin-mary'], defaultTemplate: 'blessed-virgin-mary',
    // With another obligatory memorial both are legal choices, Marian first (§11.3).
    rules: { concurrentObligatoryMemorials: 'legal-choice' },
  },
  {
    id: 'trinity', ...feast('holyTrinity'), title: 'Найсвяцейшая Тройца',
    rank: LITURGICAL_RANK.SOLEMNITY, category: 'lord', anchor: 'trinity', color: 'albus',
  },
  {
    id: 'corpus-christi', ...feast('corpusChristi'), title: 'Найсвяцейшае Цела і Кроў Хрыста',
    rank: LITURGICAL_RANK.SOLEMNITY, category: 'lord', anchor: 'corpusChristi', color: 'albus',
  },
  {
    id: 'sacred-heart', ...feast('sacredHeartOfJesus'), title: 'Найсвяцейшае Сэрца Пана Езуса',
    rank: LITURGICAL_RANK.SOLEMNITY, category: 'lord', anchor: 'sacredHeart', color: 'albus',
  },
  {
    // With another obligatory memorial: exactly two memorial choices, no weekday (§11.2).
    id: 'immaculate-heart', ...feast('immaculateHeartOfMary'), title: 'Беззаганнае Сэрца Найсв. Панны Марыі',
    rank: LITURGICAL_RANK.MEMORIAL, category: 'mary', anchor: 'immaculateHeart', color: 'albus',
    templates: ['blessed-virgin-mary'], defaultTemplate: 'blessed-virgin-mary',
    rules: { concurrentObligatoryMemorials: 'legal-choice' },
  },
  {
    id: 'christ-the-high-priest', ...feast('christTheHighPriest'),
    title: 'Езус Хрыстус, Найвышэйшы і Вечны Святар', rank: LITURGICAL_RANK.FEAST, category: 'lord',
    anchor: 'christTheHighPriest', layer: 'belarus', color: 'albus', countryRule: 'christTheHighPriest',
  },
  {
    id: 'christ-king', ...feast('christKing'), title: 'Езус Хрыстус, Валадар Сусвету',
    rank: LITURGICAL_RANK.SOLEMNITY, category: 'lord', anchor: 'christKing', color: 'albus',
  },
  {
    id: 'holy-family', ...feast('holyFamily'), title: 'Святая Сям’я: Езус, Марыя і Юзаф',
    rank: LITURGICAL_RANK.FEAST, category: 'lord', anchor: 'holyFamily', color: 'albus',
  },
  {
    id: 'baptism-of-the-lord', ...feast('baptismOfLord'), title: 'Хрост Пана',
    rank: LITURGICAL_RANK.FEAST, category: 'lord', anchor: 'baptismOfLord', color: 'albus',
  },
].map((item) => Object.freeze({ layer: 'universal', ...item })));

export function getMovableCelebration(id) {
  return MOVABLE_CELEBRATIONS.find((item) => item.id === id || item.feastCode === id || item.feastKey === id) || null;
}

/** Date of every movable celebration applicable under the country rules. */
export function computeMovableDates(year, countryRules = COUNTRY_RULES.BY) {
  const anchors = computeYearAnchors(year, countryRules);
  return MOVABLE_CELEBRATIONS
    .filter((item) => !item.countryRule || countryRules[item.countryRule])
    .map((item) => ({ celebration: item, date: anchors[item.anchor] }));
}
