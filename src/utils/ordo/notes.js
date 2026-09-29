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
 *   { type: 'nth-weekday-of-month', weekday|isoWeekday, nth, month? } (ISO 1 = Mon … 7 = Sun; nth: 1..5 or -1 = last)
 *   { type: 'day-of-month', day, months? }
 *   { type: 'period', period, dayOfWeek? }
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

/**
 * Parser (stage 2) identities that differ from engine ids. Movable codes
 * (`ash`, `eastersunday` …) match through the candidate's `feastCode`.
 */
export const NOTE_CELEBRATION_ALIASES = Object.freeze({
  'naradzhenne-pana': 'nativity-lord',
});

function nthWeekdayMatches(iso, selector) {
  const { month, day } = parseIso(iso);
  if (selector.month && Number(selector.month) !== month) return false;
  if (isoWeekday(iso) !== Number(selector.weekday ?? selector.isoWeekday)) return false;
  const nth = Number(selector.nth);
  if (nth === -1) return parseIso(addDays(iso, 7)).month !== month;
  return Math.ceil(day / 7) === nth;
}

/**
 * Period phases: the engine's names plus the stage 2 parser vocabulary
 * (`before-dec17`, `after-octave`, `ash-wednesday-week`, `holy-thursday`,
 * `triduum` = Friday/Saturday, `holy-week` = Palm Sunday–Wednesday).
 */
function phaseMatches(phase, day) {
  if (phase === day.periodPhase) return true;
  const dow = Number(day.dayOfWeek);
  switch (`${day.period}:${phase}`) {
    case 'advent:before-dec17': return day.periodPhase === 'advent-weekdays';
    case 'christmas:after-octave': return day.periodPhase !== 'octave';
    case 'lent:ash-wednesday-week': return day.periodPhase === 'ash-days';
    case 'holyweek:holy-week': return dow <= 4 && day.periodPhase !== 'triduum';
    case 'holyweek:holy-thursday': return dow === 5;
    case 'holyweek:triduum': return day.periodPhase === 'triduum' && dow >= 6;
    case 'easter:after-octave': return day.periodPhase !== 'octave';
    default: return false;
  }
}

function celebrationIds(day, role = 'celebrated') {
  const ids = new Set();
  const add = (item) => {
    if (!item) return;
    ids.add(item.id);
    if (item.feastCode) {
      ids.add(item.feastCode);
      ids.add(String(item.feastCode).replace(/^feast-/, ''));
    }
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
    case 'celebration': {
      const id = NOTE_CELEBRATION_ALIASES[selector.celebrationId] || selector.celebrationId;
      return celebrationIds(day, selector.role).has(id);
    }
    case 'period':
      return selector.period === day.period
        && (selector.dayOfWeek === undefined || Number(selector.dayOfWeek) === Number(day.dayOfWeek));
    case 'day-of-month': {
      const { month, day: dom } = parseIso(day.date);
      return Number(selector.day) === dom
        && (!selector.months?.length || selector.months.map(Number).includes(month));
    }
    case 'period-phase':
      return selector.period === day.period && phaseMatches(selector.phase, day);
    case 'period-day':
      return selector.period === day.period
        && (selector.week === undefined || Number(selector.week) === Number(day.week))
        && (selector.dayOfWeek === undefined || Number(selector.dayOfWeek) === Number(day.dayOfWeek));
    case 'relative':
    case 'relative-to-celebration': {
      const id = NOTE_CELEBRATION_ALIASES[selector.celebrationId] || selector.celebrationId;
      const found = dateOfCelebration(id);
      const dates = Array.isArray(found) ? found : [found].filter(Boolean);
      const from = Number(selector.offsetDays) || 0;
      const through = selector.throughOffsetDays === undefined ? from : Number(selector.throughOffsetDays);
      return dates.some((date) => {
        for (let offset = Math.min(from, through); offset <= Math.max(from, through); offset += 1) {
          if (addDays(date, offset) === day.date) return true;
        }
        return false;
      });
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
      return Boolean(context.diocese) && [scope.dioceseId, ...(scope.dioceseIds || [])]
        .some((id) => id && normalizeDioceseId(id) === normalizeDioceseId(context.diocese));
    case 'local':
      if (scope.localChurchId) return Boolean(context.localChurch) && scope.localChurchId === context.localChurch.id;
      // Parish-level notes printed by a diocesan calendar ("titular solemnity
      // in X, Y") are shown to the whole diocese as display notes — also when
      // the user has a local church (they name other parishes of the diocese).
      return !scope.localChurchId && Boolean(context.diocese) && (scope.dioceseIds || [scope.dioceseId])
        .some((id) => id && normalizeDioceseId(id) === normalizeDioceseId(context.diocese));
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
