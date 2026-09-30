/**
 * Runtime bridge between the Ordo engine and the existing Hours/Readings
 * services (stages 4–5). Pure: no Firestore, Pinia or Vue.
 *
 * One `ResolvedLiturgicalDay` per (date, diocese) is computed here and shared
 * by `liturgicalContentService` (Hours `dayOptions`) and `readingsService`
 * (readings lookup), so both always work on the same liturgical identity.
 */
import { resolveLiturgicalDate } from './index.js';
import { toIsoDate } from './dates.js';
import { normalizeDioceseId } from './layers.js';
import { readingTitleSimilarity } from '../parsedReadingsIdentity.js';
import { withoutObsoleteDocuments } from '../liturgicalDayResolution.js';
import { isSparseDayDocument } from '../../constants/officeFields.js';

export const DEFAULT_DIOCESE = 'minsk-mohilev';

const runtimeCache = new Map();
const RUNTIME_CACHE_LIMIT = 120;

/** Resolved day for the runtime (memoized per date and diocese). */
export function resolveRuntimeDay(date, { diocese = DEFAULT_DIOCESE } = {}) {
  const dioceseId = normalizeDioceseId(diocese) || DEFAULT_DIOCESE;
  const iso = toIsoDate(typeof date === 'string' ? date.slice(0, 10) : date);
  const key = `${iso}|${dioceseId}`;
  if (runtimeCache.has(key)) return runtimeCache.get(key);
  const day = resolveLiturgicalDate(iso, { country: 'BY', diocese: dioceseId });
  runtimeCache.set(key, day);
  if (runtimeCache.size > RUNTIME_CACHE_LIMIT) runtimeCache.delete(runtimeCache.keys().next().value);
  return day;
}

/** `computeLiturgicalContext` shape of the resolved day. */
export function legacyContextOf(day) {
  const dynamic = [day.primary, ...day.alternatives].find((item) => item.feastCode);
  return {
    periodType: day.period,
    periodWeek: day.week,
    dayOfWeek: day.dayOfWeek,
    _feast: dynamic?.feastCode || null,
  };
}

/** `feast-*` codes whose `days`/`readings` documents a legal option needs. */
export function dynamicFeastCodesOf(day) {
  return [...new Set([day.primary, ...day.alternatives]
    .map((item) => item.feastCode)
    .filter(Boolean))];
}

/**
 * `DD.MM` keys of fixed documents needed besides the civil date (a
 * transferred solemnity keeps the `days` document of its own date).
 */
export function extraFixedDatesOf(day, civilDateKey) {
  return [...new Set([day.primary, ...day.alternatives, ...day.commemorations]
    .map((item) => item.daysRef?._date)
    .filter((value) => value && value !== civilDateKey))];
}

const COMPLINE_DAY = Object.freeze({
  'sunday-after-second-vespers': 1,
  'sunday-after-first-or-second-vespers': 1,
  // Compline after I Vespers of Sunday is the Saturday text (Ps 4, 134).
  'sunday-after-first-vespers': 7,
});

/** `completoriums` weekday (1 = Sunday … 7) for a Compline descriptor. */
export function complineWeekday(compline, dayOfWeek) {
  return COMPLINE_DAY[compline] || Number(dayOfWeek);
}

/** Full Office descriptor (with `hours`) of a legal option. */
export function officeDescriptorOf(day, optionId) {
  return officeOf(day, optionId);
}

function officeOf(day, optionId) {
  const { officeResolution } = day;
  return [officeResolution.primary, ...officeResolution.alternatives]
    .find((item) => item.optionId === optionId) || null;
}

/**
 * Descriptor flags the Hours components read instead of ad-hoc rank checks.
 * `evening` is the evening of the civil date: II Vespers / Vespers of the
 * chosen Office, or I Vespers of tomorrow when tomorrow wins (GNLYC 61).
 */
export function optionDescriptor(day, option) {
  const office = officeOf(day, option.id);
  const { evening } = day.officeResolution;
  const tomorrowWins = evening.vespers.type === 'first';
  const compline = tomorrowWins ? evening.compline : (office?.compline || 'current-weekday');
  return {
    date: day.date,
    diocese: day.context.diocese,
    optionId: option.id,
    celebrationId: option.kind === 'temporal' ? null : option.id,
    role: option.role,
    title: option.title,
    rank: option.rank,
    kind: option.kind,
    officeKind: option.officeKind,
    color: option.color || day.color,
    teDeum: Boolean(office?.teDeum),
    compline,
    complineDay: complineWeekday(compline, day.dayOfWeek),
    firstVespersByRight: Boolean(office?.firstVespers?.byRight),
    vespers: tomorrowWins
      ? { ...evening.vespers }
      : {
        type: option.role === 'primary' ? evening.vespers.type : 'of-the-day',
        celebrationId: option.kind === 'temporal' ? null : option.id,
        date: day.date,
        title: option.title,
      },
    ...(option.contentStatus ? { contentStatus: option.contentStatus } : {}),
    sourceFallbacks: office?.sourceFallbacks || [],
    allowedChoices: office?.allowedChoices || [],
    commemorations: option.role === 'primary'
      ? day.commemorations.map((item) => ({ id: item.id, title: item.title, rank: item.rank }))
      : [],
  };
}

/** Compact, cacheable summary of the resolved day for the content payload. */
export function summarizeOrdoDay(day) {
  return {
    date: day.date,
    diocese: day.context.diocese,
    period: day.period,
    periodPhase: day.periodPhase,
    week: day.week,
    dayOfWeek: day.dayOfWeek,
    psalterWeek: day.psalterWeek,
    readingCycle: day.readingCycle,
    color: day.color,
    primary: { id: day.primary.id, title: day.primary.title, officeKind: day.primary.officeKind, rank: day.primary.rank },
    options: day.options.map((item) => ({ ...item })),
    commemorations: day.commemorations.map((item) => ({ id: item.id, title: item.title })),
    suppressed: day.suppressed.map((item) => ({ id: item.id, title: item.title, reason: item.reason })),
    evening: day.officeResolution.evening,
    firstVespers: day.officeResolution.firstVespers,
  };
}

const placesOf = (doc) => (Array.isArray(doc?._place) ? doc._place : [doc?._place]).filter(Boolean);

/**
 * `days` documents that carry a fixed celebration option. Preference:
 * the diocese's own documents (`daysRef.dayIds`), then the universal
 * documents (`fallbackDaysRefs`), then a date + title match. Documents of
 * other dioceses are never returned.
 */
export function selectFixedDocuments(option, allDocs, { diocese, claimedIds = new Set() } = {}) {
  const docs = withoutObsoleteDocuments(allDocs);
  const ref = option.daysRef || {};
  // After the data migration the sparse document and the per-template
  // copies it replaces can coexist: the sparse one is the celebration.
  const preferSparse = (list) => (list.some(isSparseDayDocument) ? list.filter(isSparseDayDocument).slice(0, 1) : list);
  const byIds = (ids) => preferSparse(docs.filter((doc) => ids?.includes(doc.id)));
  const own = byIds(ref.dayIds);
  if (own.length) return own;
  for (const fallback of option.fallbackDaysRefs || []) {
    const found = byIds(fallback.dayIds);
    if (found.length) return found;
  }
  // Title fallback only among documents no other candidate of the day owns.
  const sameDate = docs.filter((doc) => doc._date === ref._date && !claimedIds.has(doc.id)
    && (!placesOf(doc).length || placesOf(doc).includes(diocese)));
  const scored = sameDate
    .map((doc) => ({ doc, score: readingTitleSimilarity(doc._feastName || doc._title || '', option.title) }))
    .filter((item) => item.score >= 0.6)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return [];
  const best = scored[0].score;
  const matches = scored.filter((item) => item.score >= best - 0.001).map((item) => item.doc);
  const diocesan = matches.filter((doc) => placesOf(doc).includes(diocese));
  return diocesan.length ? diocesan : matches;
}

/** `days` ids owned by the candidates of a day (except `exceptId`). */
export function claimedDayIds(day, exceptId = null) {
  return new Set(day.candidates
    .filter((item) => item.id !== exceptId)
    .flatMap((item) => [item.daysRef, ...(item.fallbackDaysRefs || [])])
    .flatMap((ref) => ref?.dayIds || []));
}

/** Does a `days` document id belong to a resolved option? */
export function optionOwnsDayId(option, dayId) {
  if (!dayId) return false;
  const ref = option.daysRef || {};
  if (option.kind === 'temporal') {
    return [ref.id, ref.seasonalDateId, ref.psalterDayId].includes(dayId);
  }
  return Boolean(ref.dayIds?.includes(dayId)
    || (option.fallbackDaysRefs || []).some((fallback) => fallback.dayIds?.includes(dayId)));
}

// ---------------------------------------------------------------------------
// Readings (stage 5)
// ---------------------------------------------------------------------------

/**
 * Readings plan of the resolved day: which option the user is on, the
 * lectionary cycles and the ordered `readings` lookups per legal option.
 * `readingsService` executes the plan; it has no priority logic of its own.
 */
export function planReadings(day, { dayId = '', dayIdToOption = null } = {}) {
  const options = [day.primary, ...day.alternatives];
  const selected = (dayIdToOption && options.find((item) => item.id === dayIdToOption))
    || options.find((item) => optionOwnsDayId(item, dayId))
    || day.primary;
  const resolutions = [day.readingResolution.primary, ...day.readingResolution.alternatives];
  const isSunday = Number(day.dayOfWeek) === 1;
  return {
    date: day.date,
    diocese: day.context.diocese,
    selectedOptionId: selected.id,
    primaryOptionId: day.primary.id,
    cycle: isSunday ? day.readingCycle.sunday : day.readingCycle.weekday,
    sundayCycle: day.readingCycle.sunday,
    dayOfWeek: day.dayOfWeek,
    options: options.map((option, index) => ({
      optionId: option.id,
      title: option.title,
      role: option.role,
      kind: option.kind,
      daysRef: option.daysRef || null,
      readingsRef: option.readingsRef || null,
      lookup: (resolutions[index]?.lookup || []).filter((entry) => entry.purpose !== 'common'),
      allowedChoices: resolutions[index]?.allowedChoices || [],
    })),
    commemorations: day.readingResolution.commemorations,
  };
}

/**
 * Readings documents of one lookup entry, selected from the documents
 * fetched for the date. Proper documents of a fixed date are narrowed to the
 * option by `_dayIds` or by title, because one date can carry several saints.
 */
export function selectReadingDocuments(entry, option, docs) {
  const where = entry.where || {};
  if (where._feast) {
    const code = String(where._feast).replace(/^feast-/, '');
    return docs.filter((doc) => String(doc._feast || '').replace(/^feast-/, '') === code);
  }
  if (where._periodType) {
    const weeks = Array.isArray(where._periodWeekNumber) ? where._periodWeekNumber : [where._periodWeekNumber];
    return docs.filter((doc) => !doc._date && !doc._feast
      && doc._periodType === where._periodType
      && weeks.some((week) => (week === null ? doc._periodWeekNumber === null || doc._periodWeekNumber === undefined
        : Number(doc._periodWeekNumber) === Number(week)))
      && Number(doc._dayOfWeek) === Number(where._dayOfWeek));
  }
  if (where._date) {
    const sameDate = docs.filter((doc) => doc._date === where._date);
    if (entry.purpose === 'weekday' || where.dateOnly) return sameDate;
    const ids = [...(option.daysRef?.dayIds || []), ...(option.fallbackDaysRefs || []).flatMap((ref) => ref.dayIds || [])];
    const linked = sameDate.filter((doc) => [doc._dayId, ...(doc._dayIds || [])].some((id) => ids.includes(id)));
    if (linked.length) return linked;
    const scored = sameDate
      .map((doc) => ({ doc, score: readingTitleSimilarity(doc.title || '', option.title) }))
      .sort((a, b) => b.score - a.score);
    if (scored.length && scored[0].score >= 0.4) {
      const best = scored[0].score;
      return scored.filter((item) => item.score >= best - 0.001).map((item) => item.doc);
    }
    // Untitled legacy documents: only safe when the date carries one saint.
    return sameDate.every((doc) => !doc.title) ? sameDate : [];
  }
  return [];
}
