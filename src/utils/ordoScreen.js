/**
 * View model of the Ordo screen (`/ordo`, `/ordo/:date`).
 *
 * Pure: no Vue, Pinia or Firestore. The screen passes the diocese, the local
 * church (Settings) and — once the lazy chunk has loaded — the Ordo notes.
 * Everything liturgical comes from the engine (`resolveLiturgicalDate`);
 * this module only labels, groups and memoizes.
 */
import { generateLiturgicalYear, resolveLiturgicalDate } from './ordo/index.js';
import { addDays, isoWeekday, parseIso, toIsoDate } from './ordo/dates.js';
import { buildCalendarLayers } from './ordo/layers.js';
import { contextKey, getYearPlan } from './ordo/yearPlan.js';
import { celebrationCandidate, temporalCandidate } from './ordo/candidates.js';
import { officeKindOf } from './ordo/display.js';
import { buildOfficeDescriptor } from './ordo/office.js';
import { buildReadingsDescriptor } from './ordo/readings.js';
import {
  LITURGICAL_VESTMENT_COLORS, PERIOD_LABEL_MAP, PLACE_LABEL_MAP, RANK_LABEL_MAP,
} from '../constants/liturgical.js';
import { toRomanNumeral } from './liturgicalPeriodTitle.js';

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const ORDO_ROUTE_NAMES = Object.freeze(['Ordo', 'OrdoByDate']);

/**
 * `/ordo` is the month; a day is always `/ordo/YYYY-MM-DD` (today too).
 * Without a date the month of today is opened.
 */
export function ordoRouteFor(iso) {
  return iso ? { name: 'OrdoByDate', params: { date: iso } } : { name: 'Ordo' };
}

/** `?month=YYYY-MM` of the month route, or the month of `fallbackIso`. */
export function parseOrdoMonth(value, fallbackIso) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
  const month = match ? Number(match[2]) : 0;
  if (match && month >= 1 && month <= 12) return { year: Number(match[1]), month };
  const { year, month: fallbackMonth } = parseIso(fallbackIso);
  return { year, month: fallbackMonth };
}

export const ordoMonthKey = ({ year, month }) => `${year}-${String(month).padStart(2, '0')}`;

/** Route of a month; the current month needs no query. */
export function ordoMonthRoute(cursor, todayIso) {
  const key = ordoMonthKey(cursor);
  return todayIso && key === todayIso.slice(0, 7) ? { name: 'Ordo' } : { name: 'Ordo', query: { month: key } };
}

export function shiftOrdoMonth({ year, month }, delta) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** ISO date of the route parameter, or `fallback` for a missing/invalid one. */
export function parseOrdoRouteDate(param, fallback) {
  if (!param) return fallback;
  try {
    return toIsoDate(String(param));
  } catch {
    return fallback;
  }
}

export const shiftIsoDate = (iso, days) => addDays(iso, days);

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** Rubrical colours (engine: Latin names) → UI label, swatch and accent theme. */
export const ORDO_COLORS = LITURGICAL_VESTMENT_COLORS;

export function colorInfo(color) {
  return ORDO_COLORS[color] || ORDO_COLORS.viridis;
}

const OFFICE_KIND_LABELS = Object.freeze({
  solemnity: 'Урачыстасць',
  feast: 'Свята',
  memorial: 'Успамін',
  'optional-memorial': 'Неабавязковы ўспамін',
  sunday: 'Нядзеля',
  weekday: 'Будзень',
  'christmas-octave': 'Дзень Актавы Нараджэння Пана',
  'easter-octave': 'Дзень Велікоднай актавы',
  triduum: 'Пасхальнае Трыдуум',
  'all-souls': 'Успамін усіх памерлых вернікаў',
});

/** Rank label of a resolved option (engine rank, else its Office kind). */
export function rankLabel(option) {
  if (!option) return '';
  if (option.kind === 'temporal') return OFFICE_KIND_LABELS[option.officeKind] || OFFICE_KIND_LABELS[option.rankKind] || '';
  return RANK_LABEL_MAP[option.rank] || OFFICE_KIND_LABELS[option.officeKind] || '';
}

export const officeKindLabel = (kind) => OFFICE_KIND_LABELS[kind] || '';

/** Short badges for a resolved option: diocese, transfer. */
export function optionBadges(option) {
  if (!option) return [];
  const badges = [];
  if (option.dioceseId && PLACE_LABEL_MAP[option.dioceseId]) badges.push(PLACE_LABEL_MAP[option.dioceseId]);
  else if (option.layer === 'belarus') badges.push('Уласны каляндар Беларусі');
  if (option.transferredFrom) badges.push(`Перанесена з ${formatDayMonth(option.transferredFrom)}`);
  if (option.movedFrom) badges.push(`Перанесена з ${formatDayMonth(option.movedFrom)}`);
  if (option.provisional) badges.push('Часовае рашэнне: абодва варыянты');
  return badges;
}

const SUPPRESSION_LABELS = Object.freeze({
  transferred: 'перанесена',
  'merged-temporal': 'дзень перыяду супадае з празднаваннем',
  'weekday-under-memorial': 'будзень не з’яўляецца альтэрнатывай абавязковаму ўспаміну',
  outranked: 'саступае празднаванню з большым першынством',
  'impeded-omitted': 'у гэтым годзе прапускаецца (перашкода)',
  'impeded-without-transfer': 'перашкода без пераносу',
  'impeded-by-obligatory-memorial': 'саступае абавязковаму ўспаміну',
  'not-applicable': 'у гэты дзень не адзначаецца',
  'suppressed-by-layer': 'не адзначаецца ў гэтай дыяцэзіі',
  removed: 'выдалена',
});

/** Human reason why a candidate is not celebrated (engine `reason`). */
export function suppressionReason(item) {
  if (!item) return '';
  if (item.reason === 'transferred' && item.transferredTo) return `перанесена на ${formatDayMonth(item.transferredTo)}`;
  if (String(item.reason || '').startsWith('year-override')) return 'рашэнне на гэты год';
  return SUPPRESSION_LABELS[item.reason] || item.reason || '';
}

export function formatDayMonth(iso) {
  const { month, day } = parseIso(iso);
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`;
}

const WEEKDAY_SHORT = Object.freeze(['Пн', 'Аў', 'Ср', 'Чц', 'Пт', 'Сб', 'Нд']);
export const weekdayShort = (iso) => WEEKDAY_SHORT[isoWeekday(iso) - 1];

/** «Звычайны перыяд · XXVI тыдзень» */
export function periodLabel(day) {
  const period = PERIOD_LABEL_MAP[day.period] || '';
  if (day.period === 'holyweek') return period;
  if (day.period === 'christmas' && day.periodPhase === 'octave') return `${period} · Актава`;
  if (day.period === 'easter' && day.periodPhase === 'octave') return `${period} · Велікодная актава`;
  const week = toRomanNumeral(day.week);
  return week ? `${period} · ${week} тыдзень` : period;
}

export const psalterLabel = (day) => (toRomanNumeral(day.psalterWeek) ? `${toRomanNumeral(day.psalterWeek)} тыдзень псалтыра` : '');

/** «Лекцыянарый т. III · Літургія гадзінаў т. III» (§13.1), or ''. */
export function booksLabel(day) {
  const books = day?.books;
  if (!books) return '';
  return [
    books.lectionaryVolume ? `Лекцыянарый т. ${books.lectionaryVolume}` : '',
    books.hoursVolume ? `Літургія гадзінаў т. ${books.hoursVolume}` : '',
  ].filter(Boolean).join(' · ');
}

/** Lectionary cycles: Sunday A/B/C and weekday I/II. */
export function readingCycleLabel(day) {
  const cycle = day.readingCycle || {};
  const weekday = cycle.weekday ? toRomanNumeral(Number(cycle.weekday)) : '';
  return [cycle.sunday ? `Нядзельны цыкл ${cycle.sunday}` : '', weekday ? `будні год ${weekday}` : '']
    .filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------------
// Office and Mass summaries
// ---------------------------------------------------------------------------

const COMPLINE_LABELS = Object.freeze({
  'sunday-after-second-vespers': 'Камплета нядзельная (пасля II Нешпараў)',
  'sunday-after-first-vespers': 'Камплета нядзельная (пасля I Нешпараў)',
  'sunday-after-first-or-second-vespers': 'Камплета нядзельная (пасля I або II Нешпараў)',
  'current-weekday': 'Камплета з бягучага дня тыдня',
});

/**
 * Special liturgical directions of the day (spec §14–16): I Vespers, evening
 * Vespers, Te Deum, Compline, Vespers conflicts, transfers. Each item is
 * `{ id, label, value, tone }` — `tone: 'accent'` marks what differs from an
 * ordinary weekday.
 */
export function officeDirections(day) {
  const office = day.officeResolution;
  const primary = office.primary;
  const { evening, firstVespers } = office;
  const items = [];
  if (firstVespers.celebratedOnEve) {
    items.push({ id: 'first-vespers', label: 'I Нешпары', value: `Напярэдадні, ${formatDayMonth(firstVespers.eveDate)}`, tone: 'accent' });
  } else if (firstVespers.byRight && firstVespers.omittedBecause) {
    items.push({ id: 'first-vespers', label: 'I Нешпары', value: 'Не адмаўляюцца: напярэдадні мае першынство іншы дзень', tone: 'muted' });
  }
  items.push({ id: 'te-deum', label: 'Te Deum', value: primary.teDeum ? 'Гаворыцца ў Афіцыі чытанняў' : 'Не гаворыцца', tone: primary.teDeum ? 'accent' : 'muted' });
  if (evening.vespers.type === 'first') {
    items.push({ id: 'evening', label: 'Вечарам', value: `I Нешпары: ${evening.vespers.title}`, tone: 'accent' });
  } else if (evening.vespers.type === 'second') {
    items.push({ id: 'evening', label: 'Вечарам', value: 'II Нешпары', tone: 'accent' });
  } else {
    items.push({ id: 'evening', label: 'Вечарам', value: 'Нешпары дня', tone: 'muted' });
  }
  items.push({
    id: 'compline',
    label: 'Камплета',
    value: COMPLINE_LABELS[evening.compline] || evening.compline,
    tone: evening.compline === 'current-weekday' ? 'muted' : 'accent',
  });
  if (evening.conflict?.winner === 'today' && evening.omittedFirstVespers) {
    items.push({ id: 'vespers-conflict', label: 'Нешпары', value: 'Нешпары сённяшняга дня маюць першынство перад I Нешпарамі заўтрашняга', tone: 'muted' });
  }
  return items;
}

const READINGS_LOOKUP_LABELS = Object.freeze({
  weekday: 'чытанні дня',
  proper: 'уласныя чытанні',
  common: 'чытанні з агульнага',
});

/** Mass/readings summary of the primary celebration. */
export function massSummary(day) {
  const readings = day.readingResolution.primary;
  const lines = [];
  const purposes = [...new Set(readings.lookup.map((entry) => entry.purpose))];
  if (readings.allowedChoices.some((item) => item.component === 'readings')) {
    lines.push('Звычайна чытанні дня; можна ўзяць уласныя або з агульнага');
  } else if (purposes.length) {
    const text = purposes.map((purpose) => READINGS_LOOKUP_LABELS[purpose] || purpose).join(', калі няма — ');
    lines.push(text.charAt(0).toUpperCase() + text.slice(1));
  }
  if (readings.vigilLookup) lines.push('Ёсць чытанні Вігіліі');
  if (readings.variantsKind === 'reading-sets') lines.push(`Тры Імшы за памерлых: ${readings.variants.length} камплекты чытанняў на выбар`);
  else if (readings.variants?.length) lines.push('Імша Крыжма і Імша Вячэры Пана');
  if (day.sources?.split) lines.push(`Літургія гадзінаў — з дня: ${day.sources.office.title}`);
  if (day.commemorations.length) lines.push('Успамін (commemoratio): калекта можа быць уласная');
  const cycle = readings.cycle || {};
  const year = cycle.year ? (cycle.lectionary === 'weekday' ? toRomanNumeral(Number(cycle.year)) : cycle.year) : '';
  return {
    cycle: year ? `${cycle.lectionary === 'weekday' ? 'Будні лекцыянарый, год' : 'Лекцыянарый, год'} ${year}` : '',
    lines,
  };
}

// ---------------------------------------------------------------------------
// Ordo notes
// ---------------------------------------------------------------------------

/** Display order and labels of note categories (spec §27). */
export const NOTE_GROUPS = Object.freeze([
  { id: 'liturgical-rule', label: 'Літургічныя ўказанні', section: 'directions' },
  { id: 'mass', label: 'Імша', section: 'mass' },
  { id: 'office', label: 'Літургія гадзінаў', section: 'office' },
  { id: 'devotion', label: 'Набажэнствы', section: 'notes' },
  { id: 'blessing', label: 'Благаслаўленні', section: 'notes' },
  { id: 'procession', label: 'Працэсіі', section: 'notes' },
  { id: 'indulgence', label: 'Адпусты', section: 'notes' },
  { id: 'special-prayer-day', label: 'Асаблівыя дні малітвы', section: 'notes' },
  { id: 'pastoral-note', label: 'Дыяцэзіяльныя і душпастырскія заўвагі', section: 'notes' },
  { id: 'announcement', label: 'Аб’явы', section: 'notes' },
  { id: 'other', label: 'Іншае', section: 'notes' },
]);

const GROUP_BY_ID = new Map(NOTE_GROUPS.map((group, index) => [group.id, { ...group, order: index }]));

/** Selectors that repeat a note on every day of a period (period introductions). */
const PERIOD_SELECTORS = new Set(['period', 'period-phase']);

function noteYears(note) {
  return new Set((note.observed || []).flatMap((item) => item.dates || []).map((date) => Number(String(date).slice(0, 4))));
}

/**
 * Is the note meant for this year? Notes the parser classified as a
 * one-year instance (a suppression printed for 2026, «Ascension on 14 May»)
 * are only shown in the year they were observed.
 */
export function noteAppliesToYear(note, year) {
  if (note.classification !== 'YEAR_INSTANCE_ONLY' && !(note.yearMarkers || []).length) return true;
  const years = noteYears(note);
  return !years.size || years.has(Number(year));
}

const MONTHS_GENITIVE = Object.freeze([
  'студзеня', 'лютага', 'сакавіка', 'красавіка', 'мая', 'чэрвеня',
  'ліпеня', 'жніўня', 'верасня', 'кастрычніка', 'лістапада', 'снежня',
]);
const ANNOUNCED_DATE_RE = new RegExp(
  `(?:сёння|нядзел\\S*|панядзел\\S*|аўтор\\S*|серад\\S*|чацв\\S*|пятніц\\S*|субот\\S*),?\\s+(\\d{1,2})\\s+(${MONTHS_GENITIVE.join('|')})`,
  'giu',
);

/**
 * An announcement copied from one year («У сераду, 25 сакавіка, …»,
 * «Сёння, 4 студзеня, …») belongs only to the date it names.
 */
export function announcesOtherDate(text, iso) {
  const { month, day } = parseIso(iso);
  const matches = [...String(text || '').toLocaleLowerCase('be-BY').matchAll(ANNOUNCED_DATE_RE)];
  return matches.length > 0 && !matches.some((match) => Number(match[1]) === day
    && MONTHS_GENITIVE.indexOf(match[2]) + 1 === month);
}

function noteText(note, diocese) {
  const variant = (note.variants || []).find((item) => item.diocese === diocese);
  return String(variant?.text || note.text || '').trim();
}

function noteSource(note, diocese) {
  const observed = note.observed || [];
  const own = observed.find((item) => item.diocese === diocese) || observed[0];
  if (!own) return '';
  const years = [...new Set((own.dates || []).map((date) => String(date).slice(0, 4)))].sort();
  const place = PLACE_LABEL_MAP[own.diocese] || own.diocese;
  return [place, years.join(', ')].filter(Boolean).join(' · ');
}

/**
 * Group the notes selected by the engine for display.
 *
 * @returns {{ groups: { id, label, section, notes }[], periodNotes: object[], count: number }}
 *   `groups` follow `NOTE_GROUPS`; notes repeated for a whole period
 *   (`period`, `period-phase` selectors) are kept apart in `periodNotes`.
 */
export function groupOrdoNotes(notes = [], { date, diocese } = {}) {
  const year = date ? parseIso(date).year : null;
  const seen = new Set();
  const groups = new Map();
  const periodNotes = [];
  notes.forEach((note) => {
    if (year && !noteAppliesToYear(note, year)) return;
    const text = noteText(note, diocese);
    if (!text || (date && announcesOtherDate(text, date))) return;
    const key = `${note.category}|${text.toLocaleLowerCase('be-BY')}`;
    if (seen.has(key)) return;
    seen.add(key);
    const item = {
      id: note.id,
      text,
      category: GROUP_BY_ID.has(note.category) ? note.category : 'other',
      source: noteSource(note, diocese),
      scope: note.scope?.level || 'universal',
      needsReview: note.classification === 'NEEDS_REVIEW',
      tags: note.tags || [],
    };
    if (PERIOD_SELECTORS.has(note.selector?.type)) {
      periodNotes.push(item);
      return;
    }
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(item);
  });
  const ordered = [...groups.entries()]
    .map(([id, list]) => ({ ...GROUP_BY_ID.get(id), notes: list }))
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...group }) => group);
  return {
    groups: ordered,
    periodNotes,
    count: ordered.reduce((sum, group) => sum + group.notes.length, 0) + periodNotes.length,
  };
}

// ---------------------------------------------------------------------------
// Day and month
// ---------------------------------------------------------------------------

function engineContext({ diocese } = {}) {
  return { country: 'BY', diocese };
}

/** The resolved day for the screen (with the notes once they are loaded). */
export function resolveOrdoDay(iso, { diocese, notes = null } = {}) {
  return resolveLiturgicalDate(iso, { ...engineContext({ diocese }), ...(notes ? { notes } : {}) });
}

const yearCache = new Map();
const YEAR_CACHE_LIMIT = 6;

/**
 * Memoized `generateLiturgicalYear` (without notes) per year and context —
 * the month overview reads from it, so paging months never recomputes.
 */
export function getOrdoYear(year, { diocese } = {}) {
  const context = engineContext({ diocese });
  const key = `${year}|${contextKey(context)}`;
  if (yearCache.has(key)) return yearCache.get(key);
  const days = generateLiturgicalYear(Number(year), context);
  yearCache.set(key, days);
  if (yearCache.size > YEAR_CACHE_LIMIT) yearCache.delete(yearCache.keys().next().value);
  return days;
}

export const ordoYearCacheSize = () => yearCache.size;

/** A legal reference date for reading this exact diocesan definition. */
export function celebrationViewDate(optionId, year, { diocese, mode = 'oras' } = {}) {
  const context = engineContext({ diocese });
  const definition = buildCalendarLayers(context).celebrations.get(optionId);
  if (!definition || definition.suppressedBy) return '';
  const current = getYearPlan(year, context).celebrationDates.get(optionId);
  const anchor = current?.originalDate || current?.date || `${year}-07-01`;
  const fields = ['title', 'rank', 'color', 'daysRef', 'readingsRef', 'fallbackDaysRefs', 'templates', 'defaultTemplate', 'readingsReference'];
  const value = (item, field) => (field === 'templates' && !item[field]?.length ? null : item[field] ?? null);
  const sameDefinition = (option) => option.id === optionId && fields.every((field) => (
    JSON.stringify(value(option, field)) === JSON.stringify(value(definition, field))
    || (field === 'color' && !definition.color)
  ));
  // A Gregorian weekday cycle bounds the search. No extra option is ever
  // inserted into Ordo; a different title/rank/text variant cannot substitute.
  for (let distance = 0; distance <= 28; distance += 1) {
    const dates = (distance ? [year - distance, year + distance] : [year]).flatMap((candidateYear) => {
      const date = getYearPlan(candidateYear, context).celebrationDates.get(optionId)?.date;
      if (!date) return [];
      const day = resolveOrdoDay(date, { diocese });
      const options = mode === 'readings' ? [day.primary, ...day.alternatives] : day.officeOptions;
      return options.some(sameDefinition) ? [date] : [];
    });
    if (dates.length) return dates.sort((a, b) => Math.abs(Date.parse(a) - Date.parse(anchor)) - Math.abs(Date.parse(b) - Date.parse(anchor)) || a.localeCompare(b))[0];
  }
  return '';
}

/** Text-only context, requested explicitly by the feast reader. Never cached as Ordo. */
export function celebrationTextContext(date, optionId, { diocese } = {}) {
  const context = engineContext({ diocese });
  const definition = buildCalendarLayers(context).celebrations.get(optionId);
  if (!definition) throw new Error('Святкаванне не знойдзена ў календары гэтай дыяцэзіі.');
  const day = resolveOrdoDay(date, { diocese });
  const season = getYearPlan(parseIso(date).year, context).seasonOf(date);
  const temporal = temporalCandidate(season);
  const candidate = celebrationCandidate({ celebration: definition });
  const option = { ...candidate, officeKind: officeKindOf(candidate, season), role: 'primary' };
  const readings = buildReadingsDescriptor(option, season, temporal, { diocese });
  // A reference view must not present the impeded day's readings as the
  // missing proper readings of this celebration.
  readings.lookup = readings.lookup.filter((entry) => entry.purpose !== 'weekday');
  readings.allowedChoices = [];
  return {
    ...day, referenceOnly: true, primary: option, alternatives: [], officeOptions: [option],
    candidates: [temporal, ...day.candidates.filter((item) => item.kind !== 'temporal' && item.id !== optionId), option],
    commemorations: [],
    officeResolution: {
      ...day.officeResolution, primary: buildOfficeDescriptor(option, season, temporal), alternatives: [], commemorations: [],
      evening: { ...day.officeResolution.evening, vespers: { type: 'of-the-day', celebrationId: optionId, date, title: option.title } },
    },
    readingResolution: { primary: readings, alternatives: [], commemorations: [] },
  };
}

/** The requested temporal position, even when a saint occupies its civil date. */
export function periodTextContext(date, { diocese } = {}) {
  const day = resolveOrdoDay(date, { diocese });
  const season = getYearPlan(parseIso(date).year, engineContext({ diocese })).seasonOf(date);
  const temporal = temporalCandidate(season);
  const candidate = day.primary.temporal || (day.period === 'christmas' && day.primary.category === 'lord') ? day.primary : temporal;
  const option = { ...candidate, officeKind: officeKindOf(candidate, season), role: 'primary' };
  return {
    ...day, periodOnly: true, primary: option, alternatives: [], officeOptions: [option], commemorations: [],
    officeResolution: {
      ...day.officeResolution, primary: buildOfficeDescriptor(option, season, temporal), alternatives: [], commemorations: [],
      evening: { ...day.officeResolution.evening, vespers: { type: 'of-the-day', celebrationId: option.id, date, title: option.title } },
    },
    readingResolution: { primary: buildReadingsDescriptor(option, season, temporal, { diocese }), alternatives: [], commemorations: [] },
  };
}

/**
 * `/picker` «Па свяце»: definitions determine presence; Ordo supplies the
 * calendar status. Fixed dates stay nominal; routeDate is the actual date.
 * Different definitions or diocesan permissions must never merge into one row.
 */
export function yearCelebrations(year, dioceses) {
  const list = normalizeDioceseFilter(Array.isArray(dioceses) ? dioceses : [dioceses]);
  const entries = new Map();
  list.forEach((diocese) => {
    const context = engineContext({ diocese });
    const { celebrations } = buildCalendarLayers(context);
    const plan = getYearPlan(Number(year), context);
    const days = getOrdoYear(year, { diocese });
    const byDate = new Map(days.map((day) => [day.date, day]));
    const removed = new Map([...plan.removedByDate.values()].flat()
      .map((item) => [item.celebration.id, item]));
    celebrations.forEach((definition) => {
      if (!definition.id || !definition.title || !definition.date) return;
      const placement = plan.celebrationDates.get(definition.id) || removed.get(definition.id);
      const day = byDate.get(placement?.date);
      const routeDate = day?.date || '';
      const readingsAllowed = Boolean(day && [day.primary, ...day.alternatives].some((item) => item.id === definition.id));
      const hoursAllowed = Boolean(day?.officeOptions.some((item) => item.id === definition.id));
      const commemoration = day?.commemorations.find((item) => item.id === definition.id);
      const suppressed = day?.suppressed.find((item) => item.id === definition.id);
      const movable = definition.date.type !== 'fixed';
      const date = movable ? routeDate : `${year}-${String(definition.date.month).padStart(2, '0')}-${String(definition.date.day).padStart(2, '0')}`;
      const transferred = routeDate && placement?.originalDate && routeDate !== placement.originalDate;
      const statusLabel = [
        transferred ? `перанесена на ${formatDayMonth(routeDate)}` : '',
        commemoration ? 'памінанне' : '',
        suppressed ? (suppressed.reason === 'suppressed-by-layer'
          ? suppressionReason(suppressed) : 'не адзначаецца ў гэтым годзе') : '',
        !day ? 'дата не вызначана' : '',
      ].filter(Boolean).join(' · ');
      // Include text identities as well as visible fields. A local suppression
      // stays separate even when the inherited definition is otherwise equal.
      const key = JSON.stringify([
        definition.id, definition.date, definition.title, definition.rank, definition.color, definition.category,
        definition.daysRef, definition.readingsRef, definition.fallbackDaysRefs,
        definition.templates, definition.defaultTemplate, definition.readingsReference,
        date, routeDate, hoursAllowed, readingsAllowed, statusLabel,
      ]);
      const entry = entries.get(key) || {
        key, optionId: definition.id, date, routeDate, sourceDate: placement?.date || '', title: definition.title,
        rank: RANK_LABEL_MAP[definition.rank] || '', rankKey: definition.rank || '',
        movable, color: definition.color || '', category: definition.category || '', hoursAllowed, readingsAllowed, statusLabel,
        dioceses: [],
      };
      entry.dioceses.push(diocese);
      entries.set(key, entry);
    });
  });
  return [...entries.values()]
    .map((entry) => ({
      ...entry,
      badges: entry.dioceses.length === list.length ? [] : entry.dioceses.map((id) => DIOCESE_SHORT_LABELS[id] || id),
    }))
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.title.localeCompare(b.title, 'be'));
}

/**
 * Compact month overview: one row per day with the primary celebration,
 * its rank and colour, and how many legal alternatives it has.
 */
export function buildMonthOverview(year, month, options = {}) {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  return getOrdoYear(year, options)
    .filter((day) => day.date.startsWith(prefix))
    .map((day) => ({
      date: day.date,
      dayOfMonth: parseIso(day.date).day,
      weekday: weekdayShort(day.date),
      isSunday: Number(day.dayOfWeek) === 1,
      title: day.primary.title,
      rank: rankLabel(day.primary),
      officeKind: day.primary.officeKind,
      isCelebration: day.primary.kind !== 'temporal' || ['solemnity', 'triduum'].includes(day.primary.officeKind),
      color: day.color,
      colorLabel: colorInfo(day.color).label,
      alternatives: day.alternatives.length,
      commemorations: day.commemorations.length,
    }));
}

/**
 * Every non-temporal celebration of the calendar (with the diocesan layer),
 * ordered by date — the celebration picker of the Year Overrides admin.
 */
export function listCalendarCelebrations(diocese) {
  const { celebrations } = buildCalendarLayers({ country: 'BY', diocese });
  return [...celebrations.values()]
    .filter((item) => item.id && item.title && item.date && !item.temporal)
    .map((item) => {
      const fixed = item.date.type === 'fixed';
      return {
        value: item.id,
        title: item.title,
        subtitle: [
          fixed ? `${String(item.date.day).padStart(2, '0')}.${String(item.date.month).padStart(2, '0')}` : 'рухомае',
          RANK_LABEL_MAP[item.rank] || '',
        ].filter(Boolean).join(' · '),
        sortKey: fixed ? item.date.month * 100 + item.date.day : 10000,
      };
    })
    .sort((a, b) => a.sortKey - b.sortKey || a.title.localeCompare(b.title, 'be'))
    .map(({ sortKey: _sortKey, ...item }) => item);
}

// ---------------------------------------------------------------------------
// Several dioceses at once (display filter of the Ordo screen)
// ---------------------------------------------------------------------------

export const ORDO_FILTER_DIOCESES = Object.freeze(['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno']);

/** Short badge of a diocese in the month list. */
export const DIOCESE_SHORT_LABELS = Object.freeze({
  'minsk-mohilev': 'Мінск', vitebsk: 'Віцебск', pinsk: 'Пінск', grodno: 'Гродна',
});

/** Valid, ordered, non-empty list of dioceses for the display filter. */
export function normalizeDioceseFilter(value, fallback = 'minsk-mohilev') {
  const selected = new Set(Array.isArray(value) ? value : []);
  const list = ORDO_FILTER_DIOCESES.filter((id) => selected.has(id));
  return list.length ? list : [ORDO_FILTER_DIOCESES.includes(fallback) ? fallback : ORDO_FILTER_DIOCESES[0]];
}

const UNION_ROLES = Object.freeze(['primary', 'alternative', 'commemoration']);

function unionRows(days, dioceses) {
  const rows = new Map();
  dioceses.forEach((diocese, index) => {
    const day = days[index];
    const add = (item, role) => {
      const rank = rankLabel(item);
      // The same celebration with the same rank and role is one row.
      const key = `${role}|${item.id}|${item.rank || item.officeKind}|${item.color || ''}`;
      const row = rows.get(key) || {
        key, id: item.id, role, title: item.title, rank, rankKey: item.rank || '', color: item.color || day.color,
        category: item.category || '',
        isCelebration: item.kind !== 'temporal' || ['solemnity', 'triduum'].includes(item.officeKind),
        dioceses: [],
      };
      row.dioceses.push(diocese);
      rows.set(key, row);
    };
    add(day.primary, 'primary');
    day.alternatives.forEach((item) => add(item, 'alternative'));
    day.commemorations.forEach((item) => add(item, 'commemoration'));
  });
  return [...rows.values()]
    .map((row) => ({
      ...row,
      // Shared by every selected diocese: no badge.
      shared: row.dioceses.length === dioceses.length,
      badges: row.dioceses.length === dioceses.length ? [] : row.dioceses.map((id) => DIOCESE_SHORT_LABELS[id] || id),
    }))
    .sort((a, b) => UNION_ROLES.indexOf(a.role) - UNION_ROLES.indexOf(b.role));
}

/**
 * Hours of the date the Ordo shows (`/ordo/:date`), today on the month. A
 * diocese chosen only in the Ordo filter travels as `?diocese=` context.
 */
export function ordoHoursRoute({ date = '', filter = [], userDiocese = '' } = {}) {
  const diocese = filter.length && !filter.includes(userDiocese) ? filter[0] : '';
  const query = diocese ? { diocese } : {};
  if (!date) return Object.keys(query).length ? { name: 'Today', query } : { name: 'Today' };
  return { name: 'SelectedDay', params: { day: date }, query };
}

/** Distinct liturgical colours of the legal options of a day (no suppressed). */
export function legalColors(days) {
  const colors = [];
  (Array.isArray(days) ? days : [days]).forEach((day) => {
    [day.primary, ...day.alternatives].forEach((item) => {
      const color = item.color || day.color;
      if (color && !colors.includes(color)) colors.push(color);
    });
  });
  return colors;
}

/**
 * One resolved date for several dioceses: shared rows once, differences with
 * diocesan badges. Suppressed candidates are never rows.
 */
export function buildDayUnion(iso, dioceses) {
  const list = normalizeDioceseFilter(dioceses);
  const { year } = parseIso(iso);
  const days = list.map((diocese) => getOrdoYear(year, { diocese }).find((day) => day.date === iso));
  const rows = unionRows(days, list);
  return {
    date: iso,
    dioceses: list,
    rows,
    differs: rows.some((row) => !row.shared),
    colors: legalColors(days),
    days,
  };
}

/**
 * Month of the Ordo for the selected dioceses: every date with all the
 * legal variants that exist in at least one of them.
 */
export function buildMonthUnion(year, month, dioceses) {
  const list = normalizeDioceseFilter(dioceses);
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const years = list.map((diocese) => getOrdoYear(year, { diocese }).filter((day) => day.date.startsWith(prefix)));
  return (years[0] || []).map((first, index) => {
    const days = years.map((days) => days[index]);
    const rows = unionRows(days, list);
    return {
      date: first.date,
      dayOfMonth: parseIso(first.date).day,
      weekday: weekdayShort(first.date),
      isSunday: Number(first.dayOfWeek) === 1,
      rows,
      differs: rows.some((row) => !row.shared),
      colors: legalColors(days),
    };
  });
}
