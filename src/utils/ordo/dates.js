/**
 * Pure calendar-date helpers for the Ordo engine.
 *
 * Dates are ISO strings (`YYYY-MM-DD`) interpreted as civil dates. All
 * arithmetic uses UTC so results never depend on the host time zone.
 */

const DAY_MS = 86400000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isoFromParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10);
}

/**
 * Normalize supported inputs (ISO string, `DD-MM-YYYY`, Date, moment) to an
 * ISO date string. Throws on invalid input so callers never resolve garbage.
 */
export function toIsoDate(value) {
  if (value && typeof value === 'object' && typeof value.format === 'function' && typeof value.isValid === 'function') {
    if (!value.isValid()) throw new TypeError('Invalid moment date');
    return value.format('YYYY-MM-DD');
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError('Invalid Date');
    return isoFromParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  const text = String(value ?? '').trim();
  const iso = text.match(ISO_RE);
  const route = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : route ? [Number(route[3]), Number(route[2]), Number(route[1])] : [];
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new TypeError(`Invalid liturgical date: ${text}`);
  }
  const normalized = isoFromParts(year, month, day);
  if (normalized !== `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`) {
    throw new TypeError(`Invalid liturgical date: ${text}`);
  }
  return normalized;
}

export function parseIso(iso) {
  const match = String(iso).match(ISO_RE);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function toUtc(iso) {
  const { year, month, day } = parseIso(iso);
  return Date.UTC(year, month - 1, day);
}

export function addDays(iso, days) {
  return new Date(toUtc(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `b` to `a` (`a - b`). */
export function diffDays(a, b) {
  return Math.round((toUtc(a) - toUtc(b)) / DAY_MS);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(iso) {
  const day = new Date(toUtc(iso)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** MyBrev liturgical weekday: 1 = Sunday … 7 = Saturday. */
export function liturgicalDayOfWeek(iso) {
  return (isoWeekday(iso) % 7) + 1;
}

export function isSunday(iso) {
  return isoWeekday(iso) === 7;
}

/** `DD.MM`, the key used by fixed `days`/`readings` documents. */
export function fixedDateKey(iso) {
  const { month, day } = parseIso(iso);
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`;
}

/** First Sunday strictly after `iso`. */
export function nextSundayAfter(iso) {
  return addDays(iso, 7 - (isoWeekday(iso) % 7));
}

/** The Sunday on or before `iso`. */
export function sundayOnOrBefore(iso) {
  return addDays(iso, -(isoWeekday(iso) % 7));
}

export function daysOfYear(year) {
  const result = [];
  for (let iso = isoFromParts(year, 1, 1); iso.startsWith(`${year}-`); iso = addDays(iso, 1)) {
    result.push(iso);
  }
  return result;
}

export function isBetween(iso, start, end) {
  return iso >= start && iso <= end;
}
