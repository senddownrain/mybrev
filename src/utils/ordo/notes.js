/**
 * Ordo notes: selector evaluation (spec §6–8).
 *
 * OrdoNote {
 *   id, scope: { level: 'universal'|'belarus'|'diocese'|'local', dioceseId?, localChurchId? },
 *   selector, category, title?, text?, displayOnly?, effect?, source?,
 *   validFrom?: 'YYYY-MM-DD', validUntil?: 'YYYY-MM-DD'
 * }
 *
 * Selectors:
 *   { type: 'fixed-date', month, day }
 *   { type: 'celebration', celebrationId, role?: 'primary'|'celebrated'|'any' }
 *   { type: 'period', period }
 *   { type: 'period-phase', period, phase }
 *   { type: 'period-day', period, week?, dayOfWeek? }          (dayOfWeek: 1 = Sunday)
 *   { type: 'relative' | 'relative-to-celebration', celebrationId, offsetDays }
 *   { type: 'nth-weekday-of-month', weekday, nth, month? }      (weekday: ISO 1 = Mon … 7 = Sun; nth: 1..5 or -1 = last)
 *   { type: 'exact-date', date }
 *   { type: 'all' | 'any', selectors: [...] }, { type: 'not', selector }
 *
 * Only display notes are returned here; structured `effect`s must be encoded
 * as layer rules or year overrides to influence resolution.
 */
import { addDays, isoWeekday, parseIso } from './dates.js';
import { normalizeDioceseId } from './layers.js';

export const ORDO_NOTE_CATEGORIES = Object.freeze([
  'liturgical-rule', 'mass', 'office', 'devotion', 'blessing', 'procession', 'indulgence',
  'special-prayer-day', 'pastoral-note', 'announcement', 'other',
]);

function nthWeekdayMatches(iso, selector) {
  const { month, day } = parseIso(iso);
  if (selector.month && Number(selector.month) !== month) return false;
  if (isoWeekday(iso) !== Number(selector.weekday)) return false;
  const nth = Number(selector.nth);
  if (nth === -1) return parseIso(addDays(iso, 7)).month !== month;
  return Math.ceil(day / 7) === nth;
}

function celebrationIds(day, role = 'celebrated') {
  const ids = new Set();
  const add = (item) => {
    if (!item) return;
    ids.add(item.id);
    if (item.feastCode) ids.add(item.feastCode);
  };
  add(day.primary);
  if (role === 'celebrated' || role === 'any') {
    day.alternatives.forEach(add);
    day.commemorations.forEach(add);
  }
  if (role === 'any') day.suppressed.forEach(add);
  return ids;
}

/**
 * @param {object} selector
 * @param {object} day  `{ date, period, periodPhase, week, dayOfWeek, primary, alternatives, commemorations, suppressed }`
 * @param {(celebrationId: string) => string|string[]|null} dateOfCelebration  final (post-transfer) date(s)
 */
export function matchesSelector(selector, day, dateOfCelebration = () => null) {
  if (!selector) return false;
  switch (selector.type) {
    case 'fixed-date': {
      const { month, day: dom } = parseIso(day.date);
      return Number(selector.month) === month && Number(selector.day) === dom;
    }
    case 'exact-date':
      return selector.date === day.date;
    case 'celebration':
      return celebrationIds(day, selector.role).has(selector.celebrationId);
    case 'period':
      return selector.period === day.period;
    case 'period-phase':
      return selector.period === day.period && selector.phase === day.periodPhase;
    case 'period-day':
      return selector.period === day.period
        && (selector.week === undefined || Number(selector.week) === Number(day.week))
        && (selector.dayOfWeek === undefined || Number(selector.dayOfWeek) === Number(day.dayOfWeek));
    case 'relative':
    case 'relative-to-celebration': {
      const found = dateOfCelebration(selector.celebrationId);
      const dates = Array.isArray(found) ? found : [found].filter(Boolean);
      return dates.some((date) => addDays(date, Number(selector.offsetDays) || 0) === day.date);
    }
    case 'nth-weekday-of-month':
      return nthWeekdayMatches(day.date, selector);
    case 'all':
      return (selector.selectors || []).every((item) => matchesSelector(item, day, dateOfCelebration));
    case 'any':
      return (selector.selectors || []).some((item) => matchesSelector(item, day, dateOfCelebration));
    case 'not':
      return !matchesSelector(selector.selector, day, dateOfCelebration);
    default:
      return false;
  }
}

export function noteInScope(note, context = {}) {
  const scope = note.scope || { level: 'universal' };
  const country = String(context.country || 'BY').toUpperCase();
  switch (scope.level) {
    case 'universal':
      return true;
    case 'belarus':
      return country === 'BY';
    case 'diocese':
      return Boolean(context.diocese) && normalizeDioceseId(scope.dioceseId) === normalizeDioceseId(context.diocese);
    case 'local':
      return Boolean(context.localChurch)
        && (!scope.localChurchId || scope.localChurchId === context.localChurch.id);
    default:
      return false;
  }
}

/** Return the notes that apply to the resolved day, with the matching reason. */
export function selectOrdoNotes(notes = [], day, { context = {}, dateOfCelebration } = {}) {
  return notes
    .filter((note) => noteInScope(note, context))
    .filter((note) => (!note.validFrom || day.date >= note.validFrom) && (!note.validUntil || day.date <= note.validUntil))
    .filter((note) => matchesSelector(note.selector, day, dateOfCelebration))
    .map((note) => ({ ...note, displayOnly: note.displayOnly ?? !note.effect }));
}
