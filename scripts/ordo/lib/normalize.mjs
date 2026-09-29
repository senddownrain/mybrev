/**
 * Turn one raw adapter output into normalized evidence.
 *
 * Everything that is liturgical interpretation happens here (not in the
 * Python adapters): calendar alignment, identity mapping, Mass/Office flags,
 * evidence classification and the first (per-day) selector guess.
 */
import { alignDate, celebrationDate, daysBetween, parseIsoDate } from './calendar.mjs';
import { periodIdentity, resolveCelebration } from './identity.mjs';
import { clean, fold, ordinal, yearSpecificMarkers } from './text.mjs';

export const CLASSIFICATION = Object.freeze({
  CONFIRMED: 'CONFIRMED_PERMANENT_RULE',
  LIKELY: 'LIKELY_PERMANENT_RULE',
  DIOCESAN: 'DIOCESAN_PROPER',
  YEAR: 'YEAR_INSTANCE_ONLY',
  DISPLAY: 'DISPLAY_NOTE',
  REVIEW: 'NEEDS_REVIEW',
});

export const DISPLAY_CATEGORIES = new Set([
  'devotion', 'blessing', 'procession', 'indulgence', 'special-prayer-day', 'pastoral-note', 'announcement', 'local-church',
]);

const MONTHS = { студзень: 1, люты: 2, сакавік: 3, красавік: 4, май: 5, чэрвень: 6, ліпень: 7, жнівень: 8, верасень: 9, кастрычнік: 10, лістапад: 11, снежань: 12 };
const RANK_ORDER = { solemnitas: 4, festum: 3, memoria: 2, 'memoria-ad-libitum': 1 };

// --- Mass / Office descriptors ------------------------------------------------

export function officeFlags(text) {
  const value = clean(text);
  const flags = {};
  const first = value.match(/(?:^|[\s.,;])(?:1-я|І|I)\s+Нешп(?:ары|\.)?\s+(?:з|са|і)\s*([^.;]*)/i);
  if (first) flags.firstVespersOf = clean(first[1]).replace(/\s+i\s+І\s+Кампл.*$/i, '') || 'next-day';
  else if (/(?:^|[\s.,;])(?:1-я|І|I)\s+Нешп/i.test(value)) flags.firstVespersOf = 'next-day';
  if (/(?:ІІ|II|2-я)\s+Нешп/i.test(value)) flags.secondVespers = true;
  if (/Кампл\S*\s+(?:пасля\s+)?(?:(?:І|ІІ|I|II|1-х|2-х)\s+(?:або\s+(?:І|ІІ)\s+)?Нешпар\S*\s+)?(?:на\s+)?нядз|Камплета\s+[–-]\s+як\s+пасля/i.test(value)
    || /(?:І|ІІ|I|II)\s+Кампл\.\s+нядз/i.test(value)) flags.compline = 'sunday';
  const from = value.match(/(?:Літургія гадзінаў|ЛГ:|Афіцый|Аф\.)\s*(?:уласная|уласны)?\s*(?:з|са)?\s*([^\s.,;]+(?:\s+[^\s.,;]+)?)/i);
  if (from) {
    const word = fold(from[1]);
    if (/^(?:будня|дня|буд)/.test(word)) flags.officeFrom = 'weekday';
    else if (/^(?:успам|усп)/.test(word)) flags.officeFrom = 'memorial';
    else if (/^(?:урач)/.test(word)) flags.officeFrom = 'solemnity';
    else if (/^(?:свята|святоч)/.test(word)) flags.officeFrom = 'feast';
    else if (/^(?:нядз)/.test(word)) flags.officeFrom = 'sunday';
    else if (/^(?:актав)/.test(word)) flags.officeFrom = 'octave';
    else if (/^(?:уласн|уласны)/.test(word)) flags.officeFrom = 'proper';
    else flags.officeFrom = word;
  }
  if (/або\s+з\s+(?:успам|усп|аднаго)|альбо\s+з\s+(?:успам|усп|аднаго)|або\s+з\s+аднаго/i.test(value)) flags.optionalMemorialAllowed = true;
  if (/Te Deum|Цябе,\s*Бога/i.test(value)) flags.teDeumMentioned = true;
  return flags;
}

export function massFlags(text) {
  const value = clean(text);
  const flags = {};
  if (/(?:^|[\s,])(?:Хвала|Gl)(?:[\s,.]|$)/.test(value)) flags.gloria = true;
  if (/(?:^|[\s,])(?:Веру|Cr)(?:[\s,.]|$)/.test(value)) flags.credo = true;
  if (/ЗЖІ|ЗУІП|ЗУІЖ|ЗІЖ|Забаронен\S*[^.]*(?:за памерлых|пахавальн|Імшы)/i.test(value)) flags.restrictions = true;
  if (/прэфацыя\s+ўласная|прэф\.\s*уласн/i.test(value)) flags.properPreface = true;
  return flags;
}

// --- helpers --------------------------------------------------------------------

function rankFromHeader(celebration, align, identity) {
  if (celebration.rank) return celebration.rank;
  if (identity && identity.kind !== 'period') return null;
  const text = fold(celebration.title);
  if (/урачыстасць|урач\./.test(text)) return 'solemnitas';
  if (/(?:^|\s)свята(?:\s|$)/.test(text)) return 'festum';
  if (align.isoWeekday === 7 || /нядзел/.test(text)) return 'sunday';
  return null;
}

function classifyCelebration(celebration, identity, rank, diocese, properSet) {
  if (!identity) return CLASSIFICATION.REVIEW;
  if (identity.kind === 'period' || identity.kind === 'votive') return CLASSIFICATION.CONFIRMED;
  if (identity.kind === 'dynamic') return identity.dateMismatch ? CLASSIFICATION.REVIEW : CLASSIFICATION.CONFIRMED;
  const key = `${identity.id}`;
  if (properSet.has(key) || identity.mybrevDiocesanRank) return CLASSIFICATION.DIOCESAN;
  if (identity.transferredFrom) return CLASSIFICATION.YEAR;
  if (!rank || !identity.mybrevRank) return identity.confidence === 'low' ? CLASSIFICATION.REVIEW : CLASSIFICATION.CONFIRMED;
  if (rank === identity.mybrevRank) return CLASSIFICATION.CONFIRMED;
  // An obligatory memorial printed as "Або:/Дазволена:" in Lent or 17–24 Dec
  // is the commemoratio rule, not a rank change.
  if (celebration.role !== 'primary' && identity.mybrevRank === 'memoria' && rank === 'memoria-ad-libitum') return CLASSIFICATION.CONFIRMED;
  if (/дыяцэз|катэдр|апекун/i.test(celebration.title)) return CLASSIFICATION.DIOCESAN;
  return CLASSIFICATION.REVIEW;
}

const NOVENA = /(\S+)\s+дзень\s+навэн+ы\s+(?:да|перад|аб)\s+(.+?)(?:[.;]|$)/i;
const NOVENA_TARGETS = [
  [/духа\s+святога|спасланн/i, { kind: 'dynamic', id: 'pentecost' }],
  [/божай\s+міласэрнасці/i, { kind: 'dynamic', id: 'divinemercy' }],
  [/беззаганн\S*\s+зачацц/i, { kind: 'fixed', id: 'immaculate-conception', mmdd: '12-08' }],
  [/нараджэнн\S*\s+пана|божага\s+нараджэння/i, { kind: 'fixed', id: 'nativity-of-the-lord', mmdd: '12-25' }],
  [/унебаўзяцц|унебаузяцц/i, { kind: 'fixed', id: 'assumption-bvm', mmdd: '08-15' }],
  [/будслаўск|будслауск/i, { kind: 'fixed', id: 'our-lady-budslav', mmdd: '07-02' }],
];

// Customs that follow a movable celebration even when a saint occupies the day.
const MOVABLE_HINTS = [
  [/вянк\S*\s+і\s+зёлак|актавы\s+божага\s+цела|актавы\s+цела\s+і\s+крыві/i, 'corpuschristi'],
  [/страў\s+на\s+велікодны|велікодн\S*\s+стол|благаслаўленн\S*\s+страў/i, 'eastersunday'],
  [/пальмаў|пальмы|пальмов/i, 'palmsunday'],
  [/папялц|попелам|пасыпанн\S*\s+галоў/i, 'ash'],
];

const FIRST_WEEKDAY_TAGS = {
  'first-thursday': 4, 'first-friday': 5, 'first-saturday': 6, 'first-sunday': 7,
};

function catalogId(catalog, mmdd, fallback) {
  const entry = catalog.find((item) => item.mmdd === mmdd && !item.place && item.rank === 'solemnitas')
    || catalog.find((item) => item.mmdd === mmdd && !item.place);
  return entry ? entry.id : fallback;
}

/**
 * First per-day selector guess; `notes.mjs` later collapses repeated
 * occurrences into period / recurring selectors.
 */
export function daySelector(note, day, catalog) {
  const text = note.text;
  const align = day.liturgical;
  const date = parseIsoDate(day.date);
  const markers = yearSpecificMarkers(text);
  const firstTag = note.tags.find((tag) => FIRST_WEEKDAY_TAGS[tag]);
  if (firstTag) {
    const weekday = FIRST_WEEKDAY_TAGS[firstTag];
    const isFirst = align.isoWeekday === weekday && date.getUTCDate() <= 7;
    return { selector: { type: 'nth-weekday-of-month', isoWeekday: weekday, nth: 1 }, basis: isFirst ? 'recurring-pattern' : 'recurring-pattern-mismatch', markers };
  }
  const novena = text.match(NOVENA);
  if (novena && ordinal(novena[1])) {
    const target = NOVENA_TARGETS.find(([pattern]) => pattern.test(novena[2]));
    if (target) {
      const identity = { ...target[1] };
      if (identity.kind === 'fixed') identity.id = catalogId(catalog, identity.mmdd, identity.id);
      let targetDate = celebrationDate(identity, date.getUTCFullYear());
      if (targetDate && targetDate < day.date) targetDate = celebrationDate(identity, date.getUTCFullYear() + 1);
      if (targetDate) {
        return {
          selector: { type: 'relative', celebrationId: identity.id, offsetDays: daysBetween(parseIsoDate(targetDate), date) },
          basis: 'novena', markers, novenaDay: ordinal(novena[1]),
        };
      }
    }
  }
  if (markers.length) return { selector: { type: 'exact-date', date: day.date }, basis: 'year-specific', markers };
  const hint = MOVABLE_HINTS.find(([pattern]) => pattern.test(text));
  if (hint) {
    const anchor = celebrationDate({ kind: 'dynamic', id: hint[1] }, date.getUTCFullYear());
    const offset = anchor ? daysBetween(parseIsoDate(anchor), date) : null;
    if (offset !== null && Math.abs(offset) <= 14) {
      return { selector: offset === 0 ? { type: 'celebration', celebrationId: hint[1] } : { type: 'relative', celebrationId: hint[1], offsetDays: offset }, basis: 'movable-custom', markers };
    }
  }
  if (/фацімскі\s+дзень|13-ы\s+дзень\s+месяца/i.test(text)) {
    // Pinsk prints the Fatima day on the 13th of every month, not only May–October.
    return { selector: { type: 'day-of-month', day: 13 }, basis: 'recurring-pattern', markers };
  }
  const primary = day.celebrations.find((c) => c.role === 'primary' && c.identity && c.identity.kind !== 'period');
  if (align.dynamic.length) {
    return { selector: { type: 'celebration', celebrationId: align.dynamic[0] }, basis: 'movable-celebration', markers };
  }
  if (align.periodType === 'holyweek' || (align.periodType === 'easter' && align.periodWeek === 1) || (align.periodType === 'lent' && align.periodWeek === 0)) {
    return { selector: { type: 'relative', celebrationId: 'eastersunday', offsetDays: align.easterOffset }, basis: 'paschal-cycle', markers };
  }
  if (primary && primary.identity.kind === 'fixed' && primary.rankNormalized !== 'memoria-ad-libitum') {
    return { selector: { type: 'celebration', celebrationId: primary.identity.id }, basis: 'fixed-celebration', markers };
  }
  if (primary && primary.identity.kind === 'dynamic') {
    return { selector: { type: 'celebration', celebrationId: primary.identity.id }, basis: 'movable-celebration', markers };
  }
  if (align.periodPhase === 'dec17-24' || align.periodPhase === 'octave' && align.periodType === 'christmas' || align.seasonalDateId) {
    const [month, dayOfMonth] = align.mmdd.split('-').map(Number);
    return { selector: { type: 'fixed-date', month, day: dayOfMonth }, basis: 'calendar-date-season', markers };
  }
  return {
    selector: { type: 'period-day', period: align.periodType, week: align.periodWeek, dayOfWeek: align.dayOfWeek },
    basis: 'period-day', markers,
  };
}

// --- main -----------------------------------------------------------------------

export function normalizeSource(raw, { catalog, properSet }) {
  const diocese = raw.source.diocese;
  const counters = { note: 0, rule: 0, announcement: 0 };
  const days = raw.days.map((rawDay) => {
    const liturgical = alignDate(rawDay.date);
    const day = {
      date: rawDay.date,
      liturgical: { ...liturgical, sourcePsalterWeek: rawDay.psalterWeek ?? null },
      header: rawDay.header,
      color: rawDay.color || null,
      ...(rawDay.colors?.length > 1 ? { colors: rawDay.colors } : {}),
      ...(rawDay.colorText ? { colorText: rawDay.colorText } : {}),
      ...(rawDay.proPopulo ? { proPopulo: true } : {}),
      ...(rawDay.preview ? { preview: true } : {}),
      evidence: rawDay.evidence,
      celebrations: [],
      readings: [],
      mass: [],
      office: { lines: [], flags: {} },
      notes: [],
    };
    rawDay.celebrations.forEach((celebration, index) => {
      const identity = resolveCelebration(celebration.title, liturgical, catalog, diocese)
        || (celebration.role === 'primary' && /нядзел|будзень|дзень/i.test(celebration.title) ? periodIdentity(liturgical) : null);
      const rank = rankFromHeader(celebration, liturgical, identity);
      day.celebrations.push({
        id: `${diocese}:${rawDay.date}:c${index}`,
        title: celebration.title,
        role: celebration.role,
        rank: rank || null,
        ...(celebration.color ? { color: celebration.color } : {}),
        identity,
        classification: classifyCelebration(celebration, identity, rank, diocese, properSet),
        evidence: celebration.evidence,
      });
    });
    day.celebrations.forEach((c) => { c.rankNormalized = c.rank; });
    rawDay.readings.forEach((reading) => day.readings.push({ text: reading.text, ...(reading.for ? { for: reading.for } : {}), evidence: reading.evidence }));
    rawDay.lines.forEach((line) => {
      if (line.descriptor === 'mass' && !line.extractedFrom) {
        day.mass.push({ text: line.text, flags: massFlags(line.text), ...(line.for ? { for: line.for } : {}), classification: CLASSIFICATION.YEAR, evidence: line.evidence });
        // Vitebsk writes the Office into the Mass paragraph ("… Афіцый з дня.").
        const office = officeFlags(line.text);
        if (Object.keys(office).length) Object.assign(day.office.flags, office);
        return;
      }
      if (line.descriptor === 'office' && !line.extractedFrom) {
        day.office.lines.push({ text: line.text, ...(line.for ? { for: line.for } : {}), evidence: line.evidence });
        Object.assign(day.office.flags, officeFlags(line.text));
        return;
      }
      counters.note += 1;
      day.notes.push({
        id: `${diocese}:${rawDay.date}:n${day.notes.length}`,
        text: line.text,
        category: line.category,
        tags: line.tags,
        ...(line.extractedFrom ? { extractedFrom: line.extractedFrom } : {}),
        ...(line.layout ? { layout: line.layout } : {}),
        ...(line.for ? { for: line.for } : {}),
        evidence: line.evidence,
      });
    });
    (rawDay.tomorrowLocal || []).forEach((local) => {
      if (!local.text) return;
      day.notes.push({
        id: `${diocese}:${rawDay.date}:n${day.notes.length}`,
        text: local.text, category: 'local-church', tags: ['titular', 'tomorrow'],
        targetDate: local.targetDate, evidence: local.evidence,
      });
    });
    day.office.classification = CLASSIFICATION.YEAR;
    if (!day.office.lines.length && !Object.keys(day.office.flags).length) delete day.office;
    return day;
  });

  const rules = [];
  raw.sections.forEach((section) => {
    let month = null;
    section.items.forEach((item) => {
      if (item.category === 'month-marker') {
        month = MONTHS[fold(item.text)] || null;
        return;
      }
      rules.push({
        id: `${diocese}:rule:${rules.length}`,
        section: section.title,
        scopeHint: section.scopeHint || null,
        ...(section.anchorDate ? { anchorDate: section.anchorDate } : {}),
        ...(month ? { month } : {}),
        text: item.text,
        category: item.category,
        tags: item.tags,
        classification: classifyRule(section, item),
        evidence: item.evidence,
      });
    });
  });

  const announcements = raw.announcements.map((item, index) => ({
    id: `${diocese}:ann:${index}`,
    anchorDate: item.anchorDate,
    targetDate: item.targetDate,
    text: item.text,
    category: item.category,
    tags: item.tags,
    classification: CLASSIFICATION.YEAR,
    evidence: item.evidence,
  }));

  return { diocese, days, rules, announcements };
}

function classifyRule(section, item) {
  const title = fold(section.title);
  const text = item.text;
  if (yearSpecificMarkers(text).some((marker) => marker.startsWith('year:') || marker === 'this-year' || marker === 'jubilee')) return CLASSIFICATION.YEAR;
  if (section.scopeHint === 'diocesan-proper' || section.scopeHint === 'diocesan-lectionary') return CLASSIFICATION.DIOCESAN;
  if (section.scopeHint === 'blessings-appendix') return CLASSIFICATION.DISPLAY;
  if (/рухомыя/.test(title)) return CLASSIFICATION.YEAR;
  if (/першынств|табліца|парадак|агульныя нормы|літургія гадзінау|нядзеля|дні пакаяння|супадзенне|імшы за памерлых|целебрацыя еухарыстыі|ватыуных/.test(title)) return CLASSIFICATION.CONFIRMED;
  if (/звычаі|набаженствы на працягу|апекуны|за парафіянау/.test(title)) return CLASSIFICATION.LIKELY;
  if (DISPLAY_CATEGORIES.has(item.category)) return CLASSIFICATION.DISPLAY;
  return CLASSIFICATION.LIKELY;
}

export function rankValue(rank) {
  return RANK_ORDER[rank] || 0;
}
