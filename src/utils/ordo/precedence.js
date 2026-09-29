/**
 * Table of Liturgical Days according to their order of precedence
 * (GNLYC 59; reproduced in the Belarusian diocesan calendars, "АС, 59").
 *
 *  1 Paschal Triduum
 *  2 Christmas, Epiphany, Ascension, Pentecost; Sundays of Advent, Lent,
 *    Easter; Ash Wednesday; Holy Week Mon–Thu; days of the Easter octave
 *  3 Solemnities of the General Calendar; All Souls
 *  4 Proper solemnities (patron of the place, dedication/title of own church …)
 *  5 Feasts of the Lord in the General Calendar
 *  6 Sundays of Christmas and Ordinary Time
 *  7 Feasts of the BVM and saints in the General Calendar
 *  8 Proper feasts (diocesan patron, cathedral dedication, national patron …)
 *  9 Advent weekdays 17–24 Dec; days of the Christmas octave; Lent weekdays
 * 10 Obligatory memorials of the General Calendar
 * 11 Proper obligatory memorials
 * 12 Optional memorials
 * 13 Other weekdays
 */
import { LITURGICAL_RANK } from '../../constants/liturgical.js';

export const RANK_KIND = Object.freeze({
  [LITURGICAL_RANK.SOLEMNITY]: 'solemnity',
  [LITURGICAL_RANK.FEAST]: 'feast',
  [LITURGICAL_RANK.MEMORIAL]: 'memorial',
  [LITURGICAL_RANK.OPTIONAL_MEMORIAL]: 'optional-memorial',
  'commemoratio-defunctorum': 'all-souls',
  'dies-liturgicus': 'liturgical-day',
});

export function rankKind(rank) {
  return RANK_KIND[rank] || 'optional-memorial';
}

export function isProper(celebration) {
  return celebration.layer && celebration.layer !== 'universal';
}

/** Row of the Table for a (non-temporal) celebration. */
export function celebrationPrecedence(celebration) {
  if (Number.isInteger(celebration.precedence)) return celebration.precedence;
  const kind = rankKind(celebration.rank);
  const proper = isProper(celebration);
  if (kind === 'all-souls') return 3;
  if (kind === 'solemnity') return proper ? 4 : 3;
  if (kind === 'feast') {
    if (celebration.category === 'lord' && !proper) return 5;
    return proper ? 8 : 7;
  }
  if (kind === 'memorial') return proper ? 11 : 10;
  return 12;
}

const CATEGORY_ORDER = Object.freeze({ lord: 0, season: 0, mary: 1, dead: 2, dedication: 2, saint: 3 });
const LAYER_ORDER = Object.freeze({ local: 0, diocese: 1, belarus: 2, universal: 3, override: 0 });

/**
 * Stable ordering of candidates: Table row, then Lord > BVM > saints within
 * the same row, then the more specific layer, then original order.
 */
export function compareCandidates(a, b) {
  return a.precedence - b.precedence
    || (CATEGORY_ORDER[a.category] ?? 4) - (CATEGORY_ORDER[b.category] ?? 4)
    || (LAYER_ORDER[a.layer] ?? 4) - (LAYER_ORDER[b.layer] ?? 4)
    || (a.order ?? 0) - (b.order ?? 0);
}

/** Rows 1–8: days that impede a transferred solemnity and exclude memorials. */
export function isImpedingPrecedence(precedence) {
  return precedence <= 8;
}
