/**
 * Semantic guards of the Ordo note generalization.
 *
 * A selector derived from where a note was printed must still mean what the
 * text says:
 *
 *   explicit date   «– у чацвер, 1 кастрычніка, — …», «01.I.2028», «… 2027 года»
 *                   → the printed day(s) of that year only (year instance);
 *   month in text   «Чэрвеньскае набажэнства», «маёвыя набажэнствы»
 *                   → never outside that civil month;
 *   coverage        a period / weekday generalization needs the note on most of
 *                   the matching days of the source; a sparse set (four June
 *                   Sundays) is not «every Sunday in Ordinary Time»: it is
 *                   narrowed to the observed months, else kept as observed dates;
 *   first Thu/Fri/Sat of the month
 *                   one canonical Belarus-level rule each (app normalization),
 *                   not a Pinsk-2026 artifact; the bare diocesan copies go;
 *   low confidence  a generalized selector seen once is not published: it is
 *                   listed for review.
 */
import { alignDate } from './calendar.mjs';
import { fold } from './text.mjs';

const MONTHS_GENITIVE = {
  студзеня: 1, лютага: 2, сакавіка: 3, красавіка: 4, мая: 5, чэрвеня: 6, ліпеня: 7, жніуня: 8, верасня: 9,
  кастрычніка: 10, лістапада: 11, снежня: 12,
};
const FOLDED_GENITIVE = Object.fromEntries(Object.entries(MONTHS_GENITIVE).map(([word, month]) => [fold(word), month]));
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
const MONTH_ADJECTIVES = [
  [/студзеньск/, 1], [/лютаўск|лютауск/, 2], [/сакавіцк/, 3], [/красавіцк/, 4], [/травеньск|маёв|маев|майск/, 5],
  [/чэрвеньск|черв[еэ]ньск/, 6], [/ліпеньск/, 7], [/жнівеньск/, 8], [/вераснёўск|вераснеуск|верасеньск/, 9],
  [/кастрычніцк/, 10], [/лістападаўск|лістападауск/, 11], [/снежаньск/, 12],
];
// A weekday — or «сёння» («Сёння, 28 снежня, — …») — next to a printed date makes it that day.
const WEEKDAY_WORDS = /(?:^|[^а-яіў])(?:у |ў )?(?:нядзел[юяі]|панядзел[ак]+|аўтор[ак]+|аутор[ак]+|серад[уаы]|чацвер|пятніц[уаы]|субот[уаы]|сёння|сення)(?=[^а-яіў]|$)/u;

/** Civil month/day pairs (and year, when printed) a text names explicitly. */
export function explicitDates(text) {
  const value = fold(text).replace(/[‐-―]/g, '-');
  const found = [];
  const named = new RegExp(`(\\d{1,2})\\s+(${Object.keys(FOLDED_GENITIVE).join('|')})(?:\\s+(\\d{4}))?`, 'gu');
  for (const match of value.matchAll(named)) {
    found.push({ day: Number(match[1]), month: FOLDED_GENITIVE[match[2]], year: match[3] ? Number(match[3]) : null });
  }
  // Roman months («01.I.2028»): Latin letters, before folding turns i into і.
  const roman = String(text || '').toLowerCase().replace(/і/g, 'i');
  for (const match of roman.matchAll(/(\d{1,2})\.(xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)\.(\d{4})/gu)) {
    const month = ROMAN[match[2]];
    if (month) found.push({ day: Number(match[1]), month, year: Number(match[3]) });
  }
  const year = value.match(/(?:^|\D)(20\d{2})\s*(?:года|г\.)/u);
  return { dates: found, year: year ? Number(year[1]) : null, weekday: WEEKDAY_WORDS.test(value) };
}

/** Civil month a text is bound to («Чэрвеньскае набажэнства»), or null. */
export function monthOfText(text) {
  const value = fold(text);
  const hit = MONTH_ADJECTIVES.find(([pattern]) => pattern.test(value));
  return hit ? hit[1] : null;
}

const GENERALIZED = new Set(['period', 'period-day', 'period-phase', 'nth-weekday-of-month', 'day-of-month']);
const FIRST_OF_MONTH = [
  { isoWeekday: 4, word: /чацвер/u, text: 'Першы чацвер месяца.' },
  { isoWeekday: 5, word: /пятніц/u, text: 'Першая пятніца месяца.' },
  { isoWeekday: 6, word: /субот/u, text: 'Першая субота месяца.' },
];
/** «І чацвер месяца.», «Першая пятніца месяца» — the bare pastoral mark. */
export function bareFirstWeekdayMark(text) {
  const value = fold(text).replace(/[.;:]+$/u, '').trim();
  const match = value.match(/^(?:і|i|1|першы|першая)\s+(чацвер|пятніца|субота)\s+месяца$/u);
  return match ? FIRST_OF_MONTH.find((item) => item.word.test(match[1])) : null;
}

/** Weekday (ISO) of a first-of-month mark mentioned anywhere in a text. */
export function mentionedFirstWeekday(text) {
  const value = fold(text);
  const match = value.match(/(?:^|[^а-яі])(?:і|i|1|першы|першая)\s+(чацвер|пятніца|субота)\s+месяца/u);
  return match ? FIRST_OF_MONTH.find((item) => item.word.test(match[1]))?.isoWeekday || null : null;
}

/** Does a simple selector match an aligned date (generation-time check)? */
function matchesAligned(selector, align) {
  const date = new Date(`${align.date}T00:00:00Z`);
  switch (selector.type) {
    case 'period': return align.periodType === selector.period
      && (selector.dayOfWeek === undefined || Number(selector.dayOfWeek) === Number(align.dayOfWeek));
    case 'period-day': return align.periodType === selector.period
      && (selector.week === undefined || Number(selector.week) === Number(align.periodWeek))
      && (selector.dayOfWeek === undefined || Number(selector.dayOfWeek) === Number(align.dayOfWeek));
    case 'period-phase': return align.periodType === selector.period && align.periodPhase === selector.phase;
    case 'nth-weekday-of-month': return align.isoWeekday === Number(selector.isoWeekday ?? selector.weekday)
      && Math.ceil(date.getUTCDate() / 7) === Number(selector.nth);
    case 'day-of-month': return date.getUTCDate() === Number(selector.day);
    default: return false;
  }
}

function* datesOf(coverage) {
  for (let t = Date.parse(`${coverage.from}T00:00:00Z`); t <= Date.parse(`${coverage.to}T00:00:00Z`); t += 86_400_000) {
    yield new Date(t).toISOString().slice(0, 10);
  }
}

const alignCache = new Map();
const aligned = (iso) => { if (!alignCache.has(iso)) alignCache.set(iso, alignDate(iso)); return alignCache.get(iso); };
const monthOf = (iso) => Number(iso.slice(5, 7));

/** Share of the matching days of the coverage on which the note was printed. */
export function coverageDensity(selector, observedDates, coverage, months = null) {
  let matching = 0;
  for (const iso of datesOf(coverage)) {
    if (months && !months.includes(monthOf(iso))) continue;
    if (matchesAligned(selector, aligned(iso))) matching += 1;
  }
  const observed = observedDates.filter((iso) => (!months || months.includes(monthOf(iso))) && matchesAligned(selector, aligned(iso))).length;
  return matching ? observed / matching : 0;
}

/** One year-instance note per printed day, with the text printed that day. */
function splitByDate(entry, occurrences) {
  const byDate = new Map();
  occurrences.filter((item) => item.date).forEach((item) => {
    const list = byDate.get(item.date) || [];
    list.push(item);
    byDate.set(item.date, list);
  });
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => {
    const dioceses = [...new Set(items.map((item) => item.diocese))].sort();
    const { variants, ...rest } = entry;
    void variants;
    return {
      ...rest,
      scope: dioceses.length > 1 ? { level: 'belarus', dioceseIds: dioceses } : { level: 'diocese', dioceseId: dioceses[0] },
      selector: { type: 'exact-date', date },
      text: items[0].text,
      basis: 'year-specific',
      classification: 'YEAR_INSTANCE_ONLY',
      confidence: 'year-instance',
      occurrences: items.length,
      observed: dioceses.map((diocese) => ({ diocese, dates: [date], itemIds: items.filter((item) => item.diocese === diocese).map((item) => item.itemId), evidence: items.find((item) => item.diocese === diocese).evidence })),
    };
  });
}

/** A section heading or fragment parsed as a rule («VIII ЗВЫЧАЙНЫ ТЫДЗЕНЬ», «(пасля …)»). */
export function isHeadingOrFragment(text) {
  const value = String(text || '').trim();
  const folded = fold(value);
  if (/^[ivxlcі]+\s+звычайны\s+тыдзень\.?$/u.test(folded)) return true;
  if (/^\(.{0,40}\)$/u.test(value)) return true;
  return value.length <= 40 && value === value.toLocaleUpperCase('be') && /[А-ЯЁІЎ]{4}/u.test(value) && !/[.!?]$/.test(value);
}

const withMonths = (selector, months) => ({ type: 'all', selectors: [selector, { type: 'months', months }] });
const exactDates = (dates) => (dates.length === 1
  ? { type: 'exact-date', date: dates[0] }
  : { type: 'any', selectors: dates.map((date) => ({ type: 'exact-date', date })) });

/**
 * Guard one generalized note.
 * @param {object} entry        note being built (selector, text, scope, …)
 * @param {object[]} occurrences  every printed occurrence ({ date, diocese, origin })
 * @param {Map<string,{from,to}>} coverage  per-diocese source coverage
 * @returns {{ entry: object|null, guard: string|null, review?: string }}
 */
export function guardNote(entry, occurrences, coverage) {
  const dates = [...new Set(occurrences.map((item) => item.date).filter(Boolean))].sort();
  const fromSection = occurrences.every((item) => item.origin === 'section');
  if (isHeadingOrFragment(entry.text)) return { entry: null, guard: 'heading', review: 'section heading or fragment, not a note' };
  // General notes of the front matter carry an explicit, reviewed selector
  // (scripts/ordo/lib/general-notes.mjs): a date in their text describes a
  // rule («з 17 па 31 снежня»), it is not a year instance. Missal page
  // numbers inside a real paragraph are kept; a bare page reference is not.
  if (entry.basis === 'general-notes') {
    const withoutPages = String(entry.text).replace(/\(?[^()]{0,20}\bсс?\.\s?\d+[^()]{0,12}\)?/gu, '').trim();
    if (withoutPages.length < 25) return { entry: null, guard: 'page-reference', review: 'refers to a page of the printed calendar' };
    return { entry, guard: null };
  }
  // «гл.: с. 24», «(с. 35)»: a page of the printed calendar is not a note for the app.
  if (/(?:^|[\s(:])с\.\s?\d+/u.test(entry.text) && entry.text.length < 160) {
    return { entry: null, guard: 'page-reference', review: 'refers to a page of the printed calendar' };
  }
  const selector = entry.selector;
  const explicit = explicitDates(entry.text);

  // 1. A printed date is that day of that year — with ITS OWN text: similar
  //    dated notes merged across days are split back, one per printed day.
  const dated = explicit.dates.length
    && (explicit.weekday || explicit.year || explicit.dates.some((item) => item.year) || GENERALIZED.has(selector.type));
  if (dated && selector.type !== 'exact-date') {
    if (!dates.length) return { entry: null, guard: 'explicit-date', review: 'dated text without an observed date' };
    return { entries: splitByDate(entry, occurrences), guard: 'explicit-date → year instance per printed day' };
  }

  // 2. A month-bound text never leaves its month — when it was printed in
  //    that month («Чэрвеньскае набажэнства»). Printed elsewhere, the month is
  //    the subject («Аб’явіць расклад майскіх набажэнстваў» in April).
  const textMonth = monthOfText(entry.text);
  const month = textMonth && dates.length && dates.every((iso) => monthOf(iso) === textMonth) ? textMonth : null;
  let guarded = entry;
  let guard = null;
  if (month && !['exact-date', 'fixed-date'].includes(selector.type)) {
    guarded = { ...entry, selector: withMonths(selector, [month]) };
    guard = `month ${month} from text`;
  }

  // 3. Sparse occurrences do not make a period-wide rule.
  if (!fromSection && GENERALIZED.has(selector.type) && dates.length) {
    const byDiocese = [...new Set(occurrences.map((item) => item.diocese))];
    const densities = byDiocese.map((diocese) => {
      const own = occurrences.filter((item) => item.diocese === diocese).map((item) => item.date).filter(Boolean);
      return coverage.get(diocese) ? coverageDensity(selector, own, coverage.get(diocese), month ? [month] : null) : 1;
    });
    const density = Math.max(...densities);
    if (density < 0.5) {
      const observedMonths = [...new Set(dates.map(monthOf))].sort((a, b) => a - b);
      const inMonths = Math.max(...byDiocese.map((diocese) => {
        const own = occurrences.filter((item) => item.diocese === diocese).map((item) => item.date).filter(Boolean);
        return coverage.get(diocese) ? coverageDensity(selector, own, coverage.get(diocese), observedMonths) : 1;
      }));
      if (inMonths >= 0.5 && observedMonths.length <= 3) {
        guarded = { ...guarded, selector: withMonths(selector, observedMonths), basis: `${entry.basis}+observed-months` };
        guard = [guard, `coverage ${density.toFixed(2)} → months ${observedMonths.join(',')}`].filter(Boolean).join('; ');
      } else if (dates.length >= 2) {
        guarded = { ...guarded, selector: exactDates(dates), basis: 'observed-dates', classification: 'YEAR_INSTANCE_ONLY', confidence: 'year-instance' };
        guard = [guard, `coverage ${density.toFixed(2)} → observed dates`].filter(Boolean).join('; ');
      } else {
        return { entry: null, guard: 'coverage', review: `generalized from one occurrence (coverage ${density.toFixed(2)})` };
      }
    }
  }
  return { entry: guarded, guard };
}

/** Canonical Belarus-level notes of the first Thursday / Friday / Saturday of the month. */
export function canonicalFirstWeekdayNotes(observedDioceses) {
  return FIRST_OF_MONTH.map((item) => ({
    scope: { level: 'belarus', dioceseIds: ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'] },
    selector: { type: 'nth-weekday-of-month', isoWeekday: item.isoWeekday, nth: 1 },
    category: 'devotion',
    tags: ['devotion', ['first-thursday', 'first-friday', 'first-saturday'][item.isoWeekday - 4]],
    text: item.text,
    basis: 'app-normalization',
    displayOnly: true,
    classification: 'CONFIRMED_PERMANENT_RULE',
    confidence: 'app-normalization',
    provenance: {
      kind: 'app-normalization',
      rule: 'recurring pastoral mark shown in every diocese; printed in the diocesan calendars as «І …/Першы … месяца»',
      observedIn: observedDioceses[item.isoWeekday] || [],
    },
  }));
}
