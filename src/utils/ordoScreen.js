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
import { contextKey } from './ordo/yearPlan.js';
import {
  LITURGICAL_VESTMENT_COLORS, PERIOD_LABEL_MAP, PLACE_LABEL_MAP, RANK_LABEL_MAP,
} from '../constants/liturgical.js';
import { toRomanNumeral } from './liturgicalPeriodTitle.js';

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const ORDO_ROUTE_NAMES = Object.freeze(['Ordo', 'OrdoByDate']);

/** Route of a date: today is `/ordo`, any other date `/ordo/YYYY-MM-DD`. */
export function ordoRouteFor(iso, today) {
  return !iso || iso === today ? { name: 'Ordo' } : { name: 'OrdoByDate', params: { date: iso } };
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

const LOCAL_ROLE_LABELS = Object.freeze({
  'title-own-church': 'Тытул уласнага касцёла',
  'principal-patron-place': 'Галоўны апякун месца',
  'dedication-own-church': 'Гадавіна пасвячэння касцёла',
});

/** Short badges for a resolved option: local role, diocese, transfer. */
export function optionBadges(option) {
  if (!option) return [];
  const badges = [];
  if (option.localRole && LOCAL_ROLE_LABELS[option.localRole]) badges.push(LOCAL_ROLE_LABELS[option.localRole]);
  if (option.dioceseId && PLACE_LABEL_MAP[option.dioceseId]) badges.push(PLACE_LABEL_MAP[option.dioceseId]);
  else if (option.layer === 'belarus') badges.push('Уласны каляндар Беларусі');
  if (option.transferredFrom) badges.push(`Перанесена з ${formatDayMonth(option.transferredFrom)}`);
  if (option.movedFrom) badges.push(`Перанесена з ${formatDayMonth(option.movedFrom)}`);
  if (option.demotedFrom) badges.push('Абодва ўспаміны неабавязковыя');
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
  if (readings.variants?.length) lines.push('Імша Крыжма і Імша Вячэры Пана');
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
  { id: 'office', label: 'Літургія гадзін', section: 'office' },
  { id: 'devotion', label: 'Набажэнствы', section: 'notes' },
  { id: 'blessing', label: 'Благаслаўленні', section: 'notes' },
  { id: 'procession', label: 'Працэсіі', section: 'notes' },
  { id: 'indulgence', label: 'Адпусты', section: 'notes' },
  { id: 'special-prayer-day', label: 'Асаблівыя дні малітвы', section: 'notes' },
  { id: 'local-church', label: 'Тытулы парафій і мясцовыя ўрачыстасці', section: 'notes' },
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

function engineContext({ diocese, localChurch } = {}) {
  return { country: 'BY', diocese, ...(localChurch ? { localChurch } : {}) };
}

/** The resolved day for the screen (with the notes once they are loaded). */
export function resolveOrdoDay(iso, { diocese, localChurch = null, notes = null } = {}) {
  return resolveLiturgicalDate(iso, { ...engineContext({ diocese, localChurch }), ...(notes ? { notes } : {}) });
}

const yearCache = new Map();
const YEAR_CACHE_LIMIT = 6;

/**
 * Memoized `generateLiturgicalYear` (without notes) per year and context —
 * the month overview reads from it, so paging months never recomputes.
 */
export function getOrdoYear(year, { diocese, localChurch = null } = {}) {
  const context = engineContext({ diocese, localChurch });
  const key = `${year}|${contextKey(context)}`;
  if (yearCache.has(key)) return yearCache.get(key);
  const days = generateLiturgicalYear(Number(year), context);
  yearCache.set(key, days);
  if (yearCache.size > YEAR_CACHE_LIMIT) yearCache.delete(yearCache.keys().next().value);
  return days;
}

export const ordoYearCacheSize = () => yearCache.size;

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
      local: Boolean(day.primary.localRole),
    }));
}

/**
 * Celebrations a church can take as its title: every non-temporal
 * celebration of the calendar (with the diocesan layer), ordered by date.
 */
export function listTitleCelebrations(diocese) {
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
