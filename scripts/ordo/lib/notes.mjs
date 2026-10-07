/**
 * Generalize per-day Ordo notes into selector-based entries (notes.json).
 *
 * 1. Every note gets a per-day selector guess (`daySelector`).
 * 2. Repeated notes inside one source collapse into recurring / period
 *    selectors; a single example never becomes an eternal rule silently —
 *    its `confidence` stays `single-occurrence`.
 * 3. Equivalent notes of different dioceses merge (same selector + category
 *    + similar text), which raises the scope to `belarus`.
 */
import { alignDate, celebrationDate, daysBetween, parseIsoDate } from './calendar.mjs';
import { CLASSIFICATION, DISPLAY_CATEGORIES, daySelector } from './normalize.mjs';
import { resolveCelebration } from './identity.mjs';
import { clean, fingerprint, fold, jaccard, wordSet } from './text.mjs';
import { bareFirstWeekdayMark, canonicalFirstWeekdayNotes, guardNote, mentionedFirstWeekday } from './note-guards.mjs';
import { booksText, extractBooks } from './books.mjs';

/**
 * Split the Lectionary / Hours volume markers off a note (§13.1): returns the
 * candidate(s) to keep — a `books` candidate and/or the note without them.
 */
function splitBooks(candidate) {
  if (candidate.category === 'local-church') return [candidate];
  const { books, remainder } = extractBooks(candidate.text);
  if (!books) return [candidate];
  const text = booksText(books);
  const list = [{ ...candidate, category: 'books', books, text, fp: fingerprint(text), classificationHint: undefined }];
  if (remainder) list.push({ ...candidate, text: remainder, fp: fingerprint(remainder) });
  return list;
}

export const DIOCESE_ORDER = ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'];
const RULE_PERIODS = new Set(['advent', 'christmas', 'lent', 'holyweek', 'triduum', 'easter', 'ordinary']);

export function selectorKey(selector) {
  if (!selector) return 'none';
  return [selector.type, ...Object.keys(selector).filter((k) => k !== 'type').sort().map((k) => `${k}=${JSON.stringify(selector[k])}`)].join('|');
}

/** Parish titles and local solemnities: everything `local-church` except plain cathedral notes. */
export function isParishNote(category, tags = []) {
  if (category !== 'local-church') return false;
  return !(tags.includes('cathedral') && !tags.includes('titular'));
}

function effectFor(note) {
  const tags = new Set(note.tags || []);
  if (tags.has('no-obligation')) return { type: 'holy-day-of-obligation', value: false };
  if (tags.has('holy-day-of-obligation')) return { type: 'holy-day-of-obligation', value: true };
  if (tags.has('abstinence-dispensation')) return { type: 'abstinence-dispensation' };
  if (tags.has('penance')) return { type: 'penance-day' };
  if (tags.has('suppressed')) {
    const match = clean(note.text).match(/(?:прапускаецца|прапускаюцца|няма\s+(?:ўспаміну|успаміну|свята))\s+(.+?)\.?$/i);
    return { type: 'suppressed-celebration', ...(match ? { celebrationTitle: match[1] } : {}), explainedBy: 'precedence' };
  }
  if (tags.has('transfer')) return { type: 'transfer' };
  return null;
}

function collapse(occurrences) {
  const keys = new Set(occurrences.map((o) => selectorKey(o.selector)));
  if (keys.size === 1) return [{ selector: occurrences[0].selector, basis: occurrences[0].basis, occurrences }];
  if (occurrences.every((o) => o.selector.type === 'exact-date')) {
    return occurrences.map((o) => ({ selector: o.selector, basis: o.basis, occurrences: [o] }));
  }
  const dates = occurrences.map((o) => parseIsoDate(o.date));
  if (occurrences.length >= 3) {
    const dom = new Set(dates.map((d) => d.getUTCDate()));
    const months = new Set(dates.map((d) => d.getUTCMonth()));
    if (dom.size === 1 && months.size >= 3) {
      return [{ selector: { type: 'day-of-month', day: dates[0].getUTCDate() }, basis: 'recurring-pattern', occurrences }];
    }
    const weekdays = new Set(dates.map((d) => d.getUTCDay()));
    const nths = new Set(dates.map((d) => Math.ceil(d.getUTCDate() / 7)));
    if (weekdays.size === 1 && nths.size === 1 && months.size >= 3) {
      const iso = dates[0].getUTCDay() || 7;
      return [{ selector: { type: 'nth-weekday-of-month', isoWeekday: iso, nth: [...nths][0] }, basis: 'recurring-pattern', occurrences }];
    }
  }
  const periodDays = occurrences.filter((o) => o.selector.type === 'period-day');
  if (periodDays.length >= 3 && periodDays.length < occurrences.length) {
    // e.g. a Lent-Sunday devotion printed on Lent Sundays I–V and on Palm
    // Sunday: the period-day part generalizes, the rest stays specific.
    const byPeriodDow = new Map();
    periodDays.forEach((o) => {
      const key = `${o.selector.period}|${o.selector.dayOfWeek}`;
      if (!byPeriodDow.has(key)) byPeriodDow.set(key, []);
      byPeriodDow.get(key).push(o);
    });
    const [dominant] = [...byPeriodDow.values()].sort((a, b) => b.length - a.length);
    if (dominant.length >= 3) {
      const rest = occurrences.filter((o) => !dominant.includes(o));
      return [
        { selector: { type: 'period', period: dominant[0].selector.period, dayOfWeek: dominant[0].selector.dayOfWeek }, basis: 'period-weekday', occurrences: dominant },
        ...collapse(rest),
      ];
    }
  }
  if (periodDays.length === occurrences.length && occurrences.length >= 2) {
    const periods = new Set(periodDays.map((o) => o.selector.period));
    const dows = new Set(periodDays.map((o) => o.selector.dayOfWeek));
    if (periods.size === 1 && dows.size === 1) {
      return [{ selector: { type: 'period', period: periodDays[0].selector.period, dayOfWeek: periodDays[0].selector.dayOfWeek }, basis: 'period-weekday', occurrences }];
    }
    if (periods.size === 1 && occurrences.length >= 4) {
      return [{ selector: { type: 'period', period: periodDays[0].selector.period }, basis: 'period', occurrences }];
    }
  }
  const phases = new Set(occurrences.map((o) => `${o.align.periodType}:${o.align.periodPhase}`));
  if (phases.size === 1 && occurrences[0].align.periodPhase && occurrences.length >= 3) {
    return [{ selector: { type: 'period-phase', period: occurrences[0].align.periodType, phase: occurrences[0].align.periodPhase }, basis: 'period-phase', occurrences }];
  }
  // Consecutive days (e.g. "Тыдзень малітваў … 18–25 студзеня") stay a
  // fixed-date range only when all dates are in the same month span.
  const groups = new Map();
  occurrences.forEach((o) => {
    const key = selectorKey(o.selector);
    if (!groups.has(key)) groups.set(key, { selector: o.selector, basis: o.basis, occurrences: [] });
    groups.get(key).occurrences.push(o);
  });
  return [...groups.values()];
}

function classify(entry) {
  if (entry.selector.type === 'exact-date') return CLASSIFICATION.YEAR;
  if (entry.basis === 'recurring-pattern-mismatch') return CLASSIFICATION.REVIEW;
  if (entry.effect && ['suppressed-celebration', 'transfer'].includes(entry.effect.type)) return CLASSIFICATION.YEAR;
  if (DISPLAY_CATEGORIES.has(entry.category)) return CLASSIFICATION.DISPLAY;
  if (entry.dioceses.length >= 2) return CLASSIFICATION.CONFIRMED;
  if (entry.category === 'other' && !['celebration', 'relative', 'period', 'period-phase'].includes(entry.selector.type)) return CLASSIFICATION.REVIEW;
  return CLASSIFICATION.LIKELY;
}

function confidence(entry) {
  if (entry.selector.type === 'exact-date') return 'year-instance';
  if (entry.dioceses.length >= 2) return 'confirmed-across-sources';
  if (entry.occurrences >= 2) return 'repeated-in-source';
  return 'single-occurrence';
}

function blessingSelector(text, catalog) {
  const value = fold(text);
  const dated = value.match(/(\d{1,2})\s+(студзеня|лютага|сакавіка|красавіка|мая|чэрвеня|ліпеня|жніуня|верасня|кастрычніка|лістапада|снежня)/);
  const months = { студзеня: 1, лютага: 2, сакавіка: 3, красавіка: 4, мая: 5, чэрвеня: 6, ліпеня: 7, жніуня: 8, верасня: 9, кастрычніка: 10, лістапада: 11, снежня: 12 };
  if (/чацвер\s+пасля\s+урачыстасці\s+цела/.test(value)) return { type: 'relative', celebrationId: 'corpuschristi', offsetDays: 7 };
  if (/велікодны\s+стол|страу/.test(value)) return { type: 'relative', celebrationId: 'eastersunday', offsetDays: -1 };
  const occasions = [
    [/абяулення/, '01-06'], [/блажея/, '02-03'], [/агаты/, '02-05'], [/крыштафа/, '07-25'],
    [/унебаузяцц/, '08-15'], [/нарадження\s+найсвяцейшай|нарадження\s+нпм/, '09-08'], [/яна\s+евангеліста/, '12-27'],
    [/стефана/, '12-26'], [/ахвяравання\s+пана|грамнічн/, '02-02'],
  ];
  let mmdd = null;
  if (dated) mmdd = `${String(months[dated[2]]).padStart(2, '0')}-${dated[1].padStart(2, '0')}`;
  if (!mmdd) mmdd = occasions.find(([pattern]) => pattern.test(value))?.[1] || null;
  if (!mmdd) return null;
  const align = alignDate(`2026-${mmdd}`);
  const identity = resolveCelebration(text.replace(/^благаслаўленне[^,]*?(?=\s(?:ва?|у|ў)\s)/i, ''), align, catalog, null);
  const entry = identity?.kind === 'fixed' ? identity : null;
  const fallback = catalog.find((item) => item.mmdd === mmdd && !item.place && ['solemnitas', 'festum'].includes(item.rank))
    || catalog.find((item) => item.mmdd === mmdd && !item.place);
  const id = entry?.id || fallback?.id;
  return id ? { type: 'celebration', celebrationId: id } : { type: 'fixed-date', month: Number(mmdd.slice(0, 2)), day: Number(mmdd.slice(3)) };
}

export function buildNotes(sources, catalog) {
  const perDiocese = [];
  sources.forEach((source) => {
    const dayMap = new Map(source.days.map((day) => [day.date, day]));
    const candidates = [];
    const push = (note, day, origin) => {
      const guess = daySelector(note, day, catalog);
      candidates.push(...splitBooks({
        diocese: source.diocese, itemId: note.id, date: day.date, align: day.liturgical,
        text: note.text, category: note.category, tags: note.tags || [], evidence: note.evidence,
        origin, ...guess, fp: fingerprint(note.text),
      }));
      note.selector = guess.selector;
    };
    source.days.forEach((day) => {
      day.notes.forEach((note) => {
        if (note.text.length < 6) return;
        const targetDay = note.targetDate ? (dayMap.get(note.targetDate) || syntheticDay(note.targetDate)) : day;
        push(note, targetDay, note.targetDate ? 'next-day-note' : 'day');
      });
    });
    source.announcements.forEach((item) => {
      if (!item.targetDate || item.category === 'other') return;
      const day = dayMap.get(item.targetDate) || syntheticDay(item.targetDate);
      push(item, day, 'announcement');
    });
    source.rules.forEach((rule) => {
      let selector = null;
      let basis = 'section';
      if (rule.scopeHint === 'blessings-appendix') {
        selector = blessingSelector(rule.text, catalog);
        basis = 'blessing-rite-heading';
      } else if (rule.anchorDate && !RULE_PERIODS.has(rule.scopeHint) && rule.scopeHint !== 'period-phase') {
        const day = dayMap.get(rule.anchorDate) || syntheticDay(rule.anchorDate);
        selector = daySelector({ text: rule.text, tags: rule.tags }, day, catalog).selector;
        basis = 'rubric-section';
      } else if (RULE_PERIODS.has(rule.scopeHint)) {
        selector = rule.scopeHint === 'triduum'
          ? { type: 'period-phase', period: 'holyweek', phase: 'triduum' }
          : { type: 'period', period: rule.scopeHint };
        basis = 'period-section';
      } else if (rule.scopeHint === 'period-phase') {
        const title = fold(rule.section);
        if (/адвент/.test(title)) selector = { type: 'period-phase', period: 'advent', phase: /першая/.test(title) ? 'before-dec17' : 'dec17-24' };
        else if (/нарадження/.test(title)) selector = { type: 'period-phase', period: 'christmas', phase: /першая/.test(title) ? 'octave' : 'after-octave' };
        else if (/звычайнага/.test(title)) selector = { type: 'period-phase', period: 'ordinary', phase: /першая/.test(title) ? 'before-lent' : 'after-pentecost' };
        else if (/унебаушесц/.test(title)) selector = { type: 'period-phase', period: 'easter', phase: 'after-ascension' };
        basis = 'period-section';
      }
      if (!selector) return;
      rule.selector = selector;
      candidates.push(...splitBooks({
        diocese: source.diocese, itemId: rule.id, date: rule.anchorDate || null, align: null,
        text: rule.text, category: rule.scopeHint === 'blessings-appendix' ? 'blessing' : (rule.category === 'other' ? 'liturgical-rule' : rule.category),
        tags: rule.tags || [], evidence: rule.evidence, origin: 'section', selector, basis, markers: [], fp: fingerprint(rule.text),
        classificationHint: rule.classification,
      }));
    });
    // General notes of the front matter (Grodno, Pinsk; §13): explicit selectors.
    (source.generalNotes || []).forEach((note) => {
      candidates.push(...splitBooks({
        diocese: source.diocese, itemId: note.itemIds[0], memberIds: note.itemIds, date: null, align: null,
        text: note.text, category: note.category, tags: note.tags || [], evidence: note.evidence, origin: 'section',
        selector: note.selector, basis: 'general-notes', section: note.section, markers: [], fp: fingerprint(note.text),
        classificationHint: note.classification || 'LIKELY_PERMANENT_RULE',
      }));
    });
    // Collapse repeated notes of one source.
    const byFingerprint = new Map();
    candidates.forEach((c) => {
      const key = `${c.category}|${c.fp}`;
      if (!byFingerprint.has(key)) byFingerprint.set(key, []);
      byFingerprint.get(key).push(c);
    });
    byFingerprint.forEach((group) => {
      const sectionOnes = group.filter((c) => c.origin === 'section');
      const dayOnes = group.filter((c) => c.origin !== 'section');
      const collapsed = [
        ...sectionOnes.map((c) => ({ selector: c.selector, basis: c.basis, occurrences: [c] })),
        ...(dayOnes.length ? collapse(dayOnes) : []),
      ];
      collapsed.forEach((entry) => perDiocese.push({ diocese: dayOnes[0]?.diocese || sectionOnes[0].diocese, ...entry }));
    });
  });

  // Merge across dioceses.
  const buckets = new Map();
  perDiocese.forEach((entry) => {
    const first = entry.occurrences[0];
    const key = `${selectorKey(entry.selector)}|${first.category}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ ...entry, words: wordSet(first.text) });
  });
  const merged = [];
  [...buckets.keys()].sort().forEach((key) => {
    const clusters = [];
    buckets.get(key)
      .sort((a, b) => DIOCESE_ORDER.indexOf(a.diocese) - DIOCESE_ORDER.indexOf(b.diocese) || a.occurrences[0].text.localeCompare(b.occurrences[0].text))
      .forEach((entry) => {
        // Volume metadata merges only when the volumes are the same.
        const cluster = clusters.find((c) => (entry.occurrences[0].category === 'books'
          ? c.entries[0].occurrences[0].text === entry.occurrences[0].text
          : jaccard(c.words, entry.words) >= 0.35));
        if (cluster) cluster.entries.push(entry);
        else clusters.push({ words: entry.words, entries: [entry] });
      });
    clusters.forEach((cluster) => merged.push(cluster.entries));
  });

  // A novena printed day by day ("Трэці дзень навэнны да …") is one note
  // with a relative range, not nine unrelated notes.
  const novenas = new Map();
  const grouped = [];
  merged.forEach((entries) => {
    const selector = entries[0].selector;
    const lead = entries[0].occurrences[0];
    if (selector.type === 'relative' && lead.tags.includes('novena') && entries[0].basis === 'novena') {
      const dioceses = [...new Set(entries.map((e) => e.diocese))].sort().join(',');
      const key = `${selector.celebrationId}|${lead.category}|${dioceses}`;
      if (!novenas.has(key)) {
        const bucket = [];
        novenas.set(key, bucket);
        grouped.push(bucket);
      }
      novenas.get(key).push(...entries);
      return;
    }
    grouped.push(entries);
  });
  grouped.forEach((entries) => {
    const offsets = entries.map((e) => e.selector.offsetDays).filter((v) => Number.isInteger(v));
    if (entries[0].basis === 'novena' && new Set(offsets).size > 1) {
      const range = { type: 'relative', celebrationId: entries[0].selector.celebrationId, offsetDays: Math.min(...offsets), throughOffsetDays: Math.max(...offsets) };
      entries.forEach((e) => { e.selector = range; });
    }
  });

  // Coverage of every source: a recurring selector is checked against it.
  const coverage = new Map(sources.map((source) => {
    const days = source.days.map((day) => day.date).sort();
    return [source.diocese, { from: days[0], to: days.at(-1) }];
  }));
  const review = [];
  const firstWeekdayDioceses = { 4: new Set(), 5: new Set(), 6: new Set() };
  const built = grouped.map((entries) => {
    const lead = entries[0].occurrences[0];
    const dioceses = [...new Set(entries.map((e) => e.diocese))].sort((a, b) => DIOCESE_ORDER.indexOf(a) - DIOCESE_ORDER.indexOf(b));
    const occurrences = entries.flatMap((e) => e.occurrences);
    const tags = [...new Set(occurrences.flatMap((o) => o.tags))].sort();
    const texts = [...new Map(occurrences.map((o) => [`${o.diocese}|${fingerprint(o.text)}`, { diocese: o.diocese, text: o.text }])).values()];
    const markers = [...new Set(occurrences.flatMap((o) => o.markers || []))];
    const entry = {
      id: '',
      scope: dioceses.length >= 2 ? { level: 'belarus', dioceseIds: dioceses } : { level: 'diocese', dioceseId: dioceses[0] },
      selector: entries[0].selector,
      // A cathedral note is diocesan; parish lists are dropped below.
      category: isParishNote(lead.category, tags) || lead.category !== 'local-church' ? lead.category : 'liturgical-rule',
      tags,
      text: lead.text,
      ...(lead.books ? { books: lead.books } : {}),
      ...(texts.length > 1 && !lead.books ? { variants: texts.slice(1, 6) } : {}),
      effect: effectFor(lead),
      basis: entries[0].basis,
      ...(markers.length ? { yearMarkers: markers } : {}),
      dioceses,
      occurrences: occurrences.length,
    };
    if (!entry.effect) delete entry.effect;
    entry.displayOnly = DISPLAY_CATEGORIES.has(entry.category) && !entry.effect;
    entry.classification = lead.classificationHint && lead.origin === 'section' && dioceses.length < 2
      ? (lead.classificationHint === CLASSIFICATION.YEAR ? CLASSIFICATION.YEAR : classify({ ...entry }))
      : classify({ ...entry });
    if (lead.classificationHint === CLASSIFICATION.REVIEW && lead.basis === 'general-notes') entry.classification = CLASSIFICATION.REVIEW;
    if (lead.basis === 'general-notes') entry.provenance = { kind: 'general-notes', section: lead.section || null };
    entry.confidence = confidence(entry);
    // Where the calendars print the first-of-month marks (provenance of the canonical rules).
    texts.forEach((item) => {
      const weekday = mentionedFirstWeekday(item.text);
      if (weekday) firstWeekdayDioceses[weekday].add(item.diocese);
    });
    // The bare «І чацвер месяца» mark becomes one canonical Belarus rule.
    const mark = bareFirstWeekdayMark(entry.text) && texts.every((item) => bareFirstWeekdayMark(item.text));
    if (mark) {
      dioceses.forEach((diocese) => firstWeekdayDioceses[bareFirstWeekdayMark(entry.text).isoWeekday].add(diocese));
      return { replaced: 'canonical-first-weekday', occurrences, entry };
    }
    const guarded = guardNote(entry, occurrences, coverage);
    if (guarded.entries) {
      return { split: guarded.entries.map((item) => ({ ...item, guard: guarded.guard })), occurrences, entry };
    }
    if (!guarded.entry) {
      review.push({ text: entry.text, selector: entry.selector, scope: entry.scope, reason: guarded.review, dates: [...new Set(occurrences.map((o) => o.date).filter(Boolean))].sort().slice(0, 12) });
      return { replaced: 'review', occurrences, entry };
    }
    Object.assign(entry, guarded.entry);
    if (guarded.guard) entry.guard = guarded.guard;
    entry.observed = dioceses.map((diocese) => {
      const own = occurrences.filter((o) => o.diocese === diocese);
      return {
        diocese,
        dates: [...new Set(own.map((o) => o.date).filter(Boolean))].sort().slice(0, 12),
        itemIds: own.map((o) => o.itemId).slice(0, 12),
        evidence: own[0].evidence,
      };
    });
    delete entry.dioceses;
    return { entry, occurrences };
  });
  const canonical = canonicalFirstWeekdayNotes(Object.fromEntries(Object.entries(firstWeekdayDioceses).map(([key, set]) => [key, [...set].sort()])));
  const notes = [
    ...built.filter((item) => !item.replaced).flatMap((item) => item.split || [item.entry]),
    ...canonical.map((entry) => ({ id: '', ...entry })),
  ];
  notes.forEach((entry, index) => { entry.id = `ordo-note-${String(index + 1).padStart(4, '0')}`; });
  // Evidence items point at the published note (the canonical rule for the bare marks).
  const canonicalOf = (text) => notes.find((note) => note.basis === 'app-normalization'
    && note.selector.isoWeekday === bareFirstWeekdayMark(text)?.isoWeekday);
  built.forEach((item) => {
    if (item.split) {
      item.occurrences.forEach((o) => { o.noteId = item.split.find((note) => note.selector.date === o.date)?.id; });
      return;
    }
    const published = item.replaced === 'canonical-first-weekday' ? canonicalOf(item.entry.text) : (item.replaced ? null : item.entry);
    item.occurrences.forEach((o) => { o.noteId = published?.id; });
  });
  // Parish-level lists ("titular solemnity in X, Y") stay in the evidence
  // only: the runtime Ordo has no parish / own-church level.
  const parish = notes.filter((note) => isParishNote(note.category, note.tags));
  return {
    notes: notes.filter((note) => !isParishNote(note.category, note.tags)),
    allNotes: notes,
    review,
    excludedParishNotes: parish.length,
    candidates: perDiocese.flatMap((e) => e.occurrences)
      .flatMap((o) => (o.memberIds || [o.itemId]).map((itemId) => ({ ...o, itemId }))),
  };
}

function syntheticDay(date) {
  return { date, liturgical: alignDate(date), celebrations: [] };
}

export { celebrationDate, daysBetween };
