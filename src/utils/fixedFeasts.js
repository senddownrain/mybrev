import {
  LITURGICAL_RANK,
  PLACE_CODE_MAP,
} from '../constants/liturgical.js';

const RANK_ALIASES = Object.freeze({
  урачыстасць: LITURGICAL_RANK.SOLEMNITY,
  solemnity: LITURGICAL_RANK.SOLEMNITY,
  solemnitas: LITURGICAL_RANK.SOLEMNITY,
  свята: LITURGICAL_RANK.FEAST,
  feast: LITURGICAL_RANK.FEAST,
  festum: LITURGICAL_RANK.FEAST,
  успамін: LITURGICAL_RANK.MEMORIAL,
  memorial: LITURGICAL_RANK.MEMORIAL,
  memoria: LITURGICAL_RANK.MEMORIAL,
  'memoria-ad-libitum': LITURGICAL_RANK.OPTIONAL_MEMORIAL,
  'успамін усіх памерлых': LITURGICAL_RANK.ALL_SOULS,
  'commemoratio-defunctorum': LITURGICAL_RANK.ALL_SOULS,
});

export const FIXED_DAY_REQUIRED_FIELDS = Object.freeze([
  '_date',
  '_rank',
  '_templates',
  '_title',
]);

export function normalizeFixedDate(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2})[.-](\d{1,2})$/);
  if (!match) return '';
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return '';
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`;
}

export function normalizeRank(value) {
  const key = String(value ?? '').trim().toLowerCase();
  if (!key) return LITURGICAL_RANK.OPTIONAL_MEMORIAL;
  return RANK_ALIASES[key] || '';
}

export function normalizePlace(value) {
  return normalizePlaces(value)[0] || '';
}

/**
 * _place можа быць адным кодам або масівам кодаў, калі адзін тэкст
 * выкарыстоўваецца ў некалькіх мясцовых календарах.
 */
export function normalizePlaces(value) {
  const values = Array.isArray(value) ? value : [value];
  const codes = values.flatMap((item) => {
    const key = String(item ?? '').trim().toLowerCase();
    if (!key) return [];
    if (Object.values(PLACE_CODE_MAP).includes(key)) return [key];

    return Object.entries(PLACE_CODE_MAP)
      .filter(([label]) => key.includes(label))
      .map(([, code]) => code);
  });
  return [...new Set(codes)].sort();
}

export function buildFixedComparisonKey({ _date, date, _rank, rank, _place, place }) {
  return [
    normalizeFixedDate(_date ?? date),
    normalizeRank(_rank ?? rank),
    normalizePlaces(_place ?? place).join(','),
  ].join('|');
}

export function buildFixedDayId(day, slug) {
  const date = normalizeFixedDate(day?._date ?? day?.date);
  const rank = normalizeRank(day?._rank ?? day?.rank);
  const place = normalizePlaces(day?._place ?? day?.place).join('-');
  const normalizedSlug = String(slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!date || !rank || !normalizedSlug) return '';
  return [date, rank, place, normalizedSlug].filter(Boolean).join('-');
}

export function normalizeFixedFeast(source) {
  const normalized = {
    ...source,
    _date: normalizeFixedDate(source?._date),
    _rank: normalizeRank(source?._rank),
    _templates: Array.isArray(source?._templates) ? source._templates : [],
    _title: String(source?._title ?? source?._feastName ?? '').trim(),
  };

  const places = normalizePlaces(source?._place);
  const comment = String(source?.comment ?? source?.feastComment ?? '').trim();
  if (places.length === 1) normalized._place = places[0];
  else if (places.length > 1) normalized._place = places;
  else delete normalized._place;
  if (comment) normalized.comment = comment;
  else delete normalized.comment;
  delete normalized._feastName;
  delete normalized.feastComment;
  return normalized;
}
