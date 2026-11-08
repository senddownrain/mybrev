/**
 * Stage 6b: published diocesan calendars (evidence) as the oracle for the
 * generated Ordo (`generateLiturgicalYear(year, { diocese })`).
 *
 * Alignment is by liturgical identity, not by naive civil dates:
 *  - celebrations by `identity.id` (db-feasts slug / movable code / period
 *    day id), transferred celebrations by where the engine placed them;
 *  - Vespers/Compline rubrics of a date belong to the EVENING of that date
 *    (I Vespers of the next liturgical day);
 *  - the psalter week against the week printed by the source.
 *
 * Statuses: MATCH, EXPECTED_DIOCESAN_DIFFERENCE, EXPECTED_YEAR_EXCEPTION,
 * SOURCE_MORE_DETAILED, PARSER_UNCERTAIN, GENERATOR_MISMATCH.
 */
import { generateLiturgicalYear, getYearPlan } from '../../../src/utils/ordo/index.js';
import approvedAnnualExpectations from './approved-annual-expectations.json' with { type: 'json' };
import { VALIDATION_EXPECTATIONS } from './validation-expectations.mjs';
import { BELARUS_LAYER, DIOCESAN_LAYERS } from '../../../src/data/ordo/layers.js';
import { YEAR_OVERRIDES } from '../../../src/data/ordo/year-overrides.js';

/**
 * Evidence item → engine id for celebrations the parser could not map
 * because they exist only in the data layers / year overrides (their
 * evidence lists the item ids).
 */
const LAYER_EVIDENCE = new Map([
  ...BELARUS_LAYER.modify,
  ...Object.values(DIOCESAN_LAYERS).flatMap((layer) => [...layer.add, ...layer.modify]),
  ...YEAR_OVERRIDES.map((item) => ({ id: item.targetCelebrationId, evidence: item.evidence })),
].flatMap((entry) => (entry.evidence || []).map((itemId) => [itemId, entry.id])));

function withLayerIdentity(celebration) {
  if (celebration.identity?.id || !LAYER_EVIDENCE.has(celebration.id)) return celebration;
  return { ...celebration, identity: { kind: 'fixed', id: LAYER_EVIDENCE.get(celebration.id), confidence: 'high', viaLayer: true } };
}

export const STATUSES = Object.freeze([
  'MATCH', 'EXPECTED_DIOCESAN_DIFFERENCE', 'EXPECTED_YEAR_EXCEPTION', 'SOURCE_MORE_DETAILED', 'PARSER_UNCERTAIN',
  'GENERATOR_MISMATCH',
]);
const SEVERITY = Object.fromEntries(STATUSES.map((status, index) => [status, index]));

export const CHECKS = Object.freeze([
  'period', 'week', 'psalterWeek', 'primary', 'rank', 'color', 'alternatives', 'suppressed', 'transfer',
  'firstVespers', 'secondVespers', 'compline', 'officeType', 'teDeum', 'notes',
]);

const COLOR = Object.freeze({
  white: 'albus', red: 'ruber', green: 'viridis', violet: 'violaceus', rose: 'rosaceus', black: 'niger',
});

/** Parser identity ids that name the same engine celebration. */
const ENGINE_ID_ALIASES = Object.freeze({
  'bvm-saturday': 'saturday-blessed-virgin-mary',
  'naradzhenne-pana': 'nativity-lord',
  // Vitebsk keeps 8 September as Our Lady of Braslau (engine: the diocesan
  // form of the Nativity of the BVM, same identity).
  'our-lady-braslau': 'nativity-blessed-virgin-mary',
});

const bare = (code) => String(code || '').replace(/^feast-/, '');

/** Ids an engine candidate answers to (engine id, movable code, parser alias). */
function idsOf(item) {
  if (!item) return new Set();
  const ids = new Set([item.id]);
  if (item.feastCode) ids.add(bare(item.feastCode));
  if (item.kind === 'temporal') {
    ids.add(item.daysRef?.id);
    if (item.daysRef?.seasonalDateId) ids.add(item.daysRef.seasonalDateId);
  }
  return ids;
}

function sourceId(celebration) {
  const identity = celebration?.identity;
  if (!identity) return null;
  if (identity.kind === 'period') return identity.periodDayId || identity.id;
  return ENGINE_ID_ALIASES[identity.id] || identity.id;
}

function matchesItem(item, celebration) {
  const identity = celebration?.identity;
  if (!identity || !item) return false;
  if (identity.kind === 'period') {
    return item.kind === 'temporal' || Boolean(item.temporal);
  }
  const ids = idsOf(item);
  return ids.has(sourceId(celebration)) || ids.has(identity.id);
}

const worst = (statuses) => statuses.reduce((acc, status) => (SEVERITY[status] > SEVERITY[acc] ? status : acc), 'MATCH');

function result(status, detail = null, extra = {}) {
  return { status, ...(detail ? { detail } : {}), ...extra };
}

const SUNDAY_RANK = new Set(['sunday', 'dominica']);

function rankMatches(sourceRank, engineItem) {
  if (!sourceRank) return true;
  if (SUNDAY_RANK.has(sourceRank)) return engineItem.rank === 'dominica' || engineItem.officeKind === 'sunday';
  if (engineItem.rank === 'dies-liturgicus') return true;
  if (sourceRank === 'solemnitas' && engineItem.officeKind === 'solemnity') return true;
  return sourceRank === engineItem.rank;
}

/** Source `officeFrom` → engine officeKind values that agree with it. */
const OFFICE_FROM = Object.freeze({
  // "Office of the day" also covers the Triduum and octave days.
  weekday: ['weekday', 'christmas-octave', 'easter-octave', 'triduum'],
  // All Souls is printed as "Успамін усіх памерлых … з успаміну".
  memorial: ['memorial', 'optional-memorial', 'all-souls'],
  // A solemnity/feast of the Lord on Sunday is printed as the Sunday Office.
  sunday: ['sunday', 'solemnity', 'feast'],
  feast: ['feast', 'christmas-octave'],
  solemnity: ['solemnity', 'easter-octave', 'all-souls'],
  octave: ['easter-octave', 'christmas-octave', 'solemnity', 'sunday'],
  proper: ['triduum', 'solemnity', 'weekday', 'easter-octave', 'christmas-octave', 'sunday'],
  // Grodno "Аф. буд. звыч. перыяду": the weekday Office. (Grodno "Аф. звыч."
  // alone is used for weekdays, memorials and even feasts → not mapped.)
  'выч перыяду': ['weekday'],
});

/**
 * Normalize the parser's `officeFrom` (a word taken from "Літургія гадзінаў
 * з …"): ordinal Sundays → sunday, Holy Week days → weekday, "з успаміну" /
 * "аднаго з (успамінаў)" / "агульны пра …" → memorial, Triduum rubrics → proper.
 * Grodno "Аф. звыч." ("выч") only says "the usual Office" → not comparable.
 */
export function normalizeOfficeFrom(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text || text === 'выч') return null;
  if (OFFICE_FROM[text]) return text;
  if (/папяльцов|вялікага|панядзел/u.test(text)) return 'weekday';
  if (/нядзел|велікоднай/u.test(text)) return 'sunday';
  if (/успамін|аднаго з|агульны/u.test(text)) return 'memorial';
  if (/нешпары чытае|ютрань/u.test(text)) return 'proper';
  return text;
}

/** Te Deum as the source's Office type implies it (GILH 68). */
function teDeumOfOfficeFrom(officeFrom, generated) {
  const { period, periodPhase } = generated;
  if (['solemnity', 'feast', 'octave'].includes(officeFrom)) return true;
  if (officeFrom === 'sunday') return period !== 'lent' && period !== 'holyweek';
  // "Office of the day" inside an octave does not tell whether Te Deum is said.
  if (periodPhase === 'octave' || period === 'holyweek') return null;
  if (['memorial', 'weekday', 'выч перыяду'].includes(officeFrom)) return false;
  return null;
}

function expectationFor(diocese, date, check) {
  return [...approvedAnnualExpectations, ...VALIDATION_EXPECTATIONS].find((item) => item.diocese === diocese
    && (item.date === date || (item.dates || []).includes(date) || (item.mmdd && date.slice(5) === item.mmdd))
    && (!item.checks || item.checks.includes(check)));
}

/**
 * Compare one published day with the generated day.
 * @param {object} context  `{ diocese, source, next, plan, differences, noteIndex }`
 */
export function compareDay(sourceDay, generated, context) {
  const { diocese } = context;
  const checks = {};
  const celebrations = (sourceDay.celebrations || []).map(withLayerIdentity);
  const primarySource = celebrations.find((item) => item.role === 'primary') || null;
  const alternativeSource = celebrations.filter((item) => item.role !== 'primary');
  const flags = sourceDay.office?.flags || {};

  // --- Temporal cycle -------------------------------------------------------
  const periodIdentity = celebrations.find((item) => item.identity?.kind === 'period')?.identity;
  const alignment = sourceDay.liturgical;
  const temporal = generated.candidates.find((item) => item.kind === 'temporal');
  if (periodIdentity) {
    const sourcePeriod = String(periodIdentity.periodDayId || '').split('-w')[0];
    checks.period = sourcePeriod === generated.period ? result('MATCH')
      : result('GENERATOR_MISMATCH', `source ${periodIdentity.periodDayId}, engine ${temporal.daysRef.id}`);
    checks.week = periodIdentity.periodDayId === temporal.daysRef.id ? result('MATCH')
      : result('GENERATOR_MISMATCH', `source ${periodIdentity.periodDayId}, engine ${temporal.daysRef.id}`);
  } else {
    // No period title printed: the alignment of MyBrev's legacy calendar code.
    checks.period = alignment.periodType === generated.period ? result('MATCH')
      : result('GENERATOR_MISMATCH', `legacy ${alignment.periodType}, engine ${generated.period}`);
    checks.week = Number(alignment.periodWeek) === Number(generated.week) ? result('MATCH')
      : result('GENERATOR_MISMATCH', `legacy w${alignment.periodWeek}, engine w${generated.week}`);
  }
  // Proper Offices (solemnities, Triduum, Easter octave, Baptism) have their
  // own psalmody: a printed psalter week is not comparable there.
  const properOffice = ['solemnity', 'triduum', 'easter-octave'].includes(generated.primary.officeKind)
    || generated.primary.id === 'baptism-of-the-lord';
  if (alignment.sourcePsalterWeek && !properOffice) {
    checks.psalterWeek = Number(alignment.sourcePsalterWeek) === Number(generated.psalterWeek) ? result('MATCH')
      : result('GENERATOR_MISMATCH', `source ${alignment.sourcePsalterWeek}, engine ${generated.psalterWeek}`);
  }

  // --- Primary / rank / colour ---------------------------------------------
  const engineCelebrated = [generated.primary, ...generated.alternatives, ...generated.commemorations];
  if (primarySource) {
    const identity = primarySource.identity;
    if (!identity || identity.confidence === 'low') {
      checks.primary = result('PARSER_UNCERTAIN', `unmapped primary "${primarySource.title}"`);
    } else if (matchesItem(generated.primary, primarySource)) {
      checks.primary = result('MATCH');
      const rankOk = rankMatches(primarySource.rank, generated.primary);
      checks.rank = rankOk ? result('MATCH')
        // "панядзелак" contains "нядзел": a Sunday rank on a weekday is the parser's.
        : SUNDAY_RANK.has(primarySource.rank) && !generated.candidates.find((item) => item.kind === 'temporal')?.rank?.startsWith('dom')
          ? result('PARSER_UNCERTAIN', `source rank sunday on a weekday ("${primarySource.title}")`)
          : result('GENERATOR_MISMATCH', `source ${primarySource.rank}, engine ${generated.primary.rank}`);
    } else if (context.nextGenerated && matchesItem(context.nextGenerated.primary, primarySource)
      && ['solemnity'].includes(context.nextGenerated.primary.officeKind)) {
      // The source opens tomorrow's solemnity with its vigil / I Vespers
      // (24 December → Christmas): same liturgical day, printed on the eve.
      checks.primary = result('MATCH', `vigil of ${context.nextGenerated.primary.id}`);
    } else if (engineCelebrated.some((item) => matchesItem(item, primarySource))) {
      checks.primary = result('GENERATOR_MISMATCH', `source primary ${sourceId(primarySource)} is only an alternative/commemoration (engine primary ${generated.primary.id})`);
    } else {
      const where = context.plan.celebrationDates.get(sourceId(primarySource))?.date;
      checks.primary = result('GENERATOR_MISMATCH', `source ${sourceId(primarySource)}, engine ${generated.primary.id}${where ? ` (engine places it on ${where})` : ''}`);
    }
  } else if (!celebrations.length || alternativeSource.every((item) => item.rank === 'memoria-ad-libitum')) {
    // Nothing (or only optional memorials) printed: the weekday is the Office.
    checks.primary = generated.primary.kind === 'temporal' ? result('MATCH')
      : result('GENERATOR_MISMATCH', `source prints no obligatory celebration, engine ${generated.primary.id}`);
  }

  const sourceColors = (sourceDay.colors?.length ? sourceDay.colors : [sourceDay.color]).filter(Boolean).map((item) => COLOR[item] || item);
  if (sourceColors.length) {
    const engineColors = new Set([generated.color, ...(generated.colorAlternatives || []),
      ...generated.alternatives.map((item) => item.color), ...generated.commemorations.map((item) => item.color)]);
    checks.color = sourceColors.some((color) => engineColors.has(color)) ? result('MATCH')
      : result('GENERATOR_MISMATCH', `source ${sourceColors.join('/')}, engine ${generated.color}`);
  }

  // --- Alternatives ---------------------------------------------------------
  const engineOptional = [...generated.alternatives, ...generated.commemorations];
  const missing = alternativeSource.filter((item) => !engineOptional.some((candidate) => matchesItem(candidate, item))
    && !matchesItem(generated.primary, item));
  const extra = engineOptional.filter((candidate) => !alternativeSource.some((item) => matchesItem(candidate, item))
    && !(primarySource && matchesItem(candidate, primarySource)));
  const altStatuses = [];
  const altDetails = [];
  missing.forEach((item) => {
    if (!item.identity) { altStatuses.push('SOURCE_MORE_DETAILED'); altDetails.push(`source-only "${item.title}"`); return; }
    if (sourceId(item) === 'saturday-blessed-virgin-mary' && ['pinsk', 'grodno'].includes(diocese)) {
      // Pinsk and Grodno also print the Saturday BVM outside Ordinary Time and
      // next to obligatory memorials (GNLYC 15 grants it only in OT without one).
      altStatuses.push('EXPECTED_DIOCESAN_DIFFERENCE'); altDetails.push(`${diocese} prints the Saturday BVM more widely`);
      return;
    }
    const inEngine = generated.candidates.find((candidate) => matchesItem(candidate, item));
    if (inEngine && inEngine.status !== 'active') {
      altStatuses.push('GENERATOR_MISMATCH'); altDetails.push(`${sourceId(item)} ${inEngine.status} in engine`);
    } else if (inEngine) {
      altStatuses.push('GENERATOR_MISMATCH'); altDetails.push(`${sourceId(item)} suppressed by engine`);
    } else if (item.identity.confidence !== 'high' || item.identity.dateMismatch) {
      altStatuses.push('PARSER_UNCERTAIN'); altDetails.push(`${sourceId(item)} (${item.identity.confidence})`);
    } else {
      altStatuses.push('GENERATOR_MISMATCH'); altDetails.push(`${sourceId(item)} missing in engine`);
    }
  });
  extra.forEach((candidate) => {
    const entry = context.differences.get(candidate.id);
    const printed = entry?.byDiocese?.[diocese]?.status;
    if (candidate.id === 'saturday-blessed-virgin-mary') {
      altStatuses.push('SOURCE_MORE_DETAILED'); altDetails.push('engine offers Saturday BVM; source silent');
    } else if (printed === 'absent' || printed === undefined) {
      altStatuses.push('EXPECTED_DIOCESAN_DIFFERENCE'); altDetails.push(`${candidate.id} never printed by ${diocese}`);
    } else {
      altStatuses.push('GENERATOR_MISMATCH'); altDetails.push(`engine-only ${candidate.id}`);
    }
  });
  if (alternativeSource.length || engineOptional.length) {
    checks.alternatives = result(worst(altStatuses), altDetails.join('; ') || null);
  }

  // --- Suppressed / transfers ----------------------------------------------
  const suppressedNotes = (sourceDay.notes || []).filter((note) => note.tags?.includes('suppressed')
    && /прапуска\p{L}*\s+(?:свята|урачыстасць|ўспамін|успамін)/iu.test(note.text));
  if (suppressedNotes.length) {
    const engineSuppressed = generated.suppressed.filter((item) => item.kind !== 'temporal' && item.reason !== 'not-applicable');
    checks.suppressed = engineSuppressed.length ? result('MATCH')
      // The source names an omitted celebration the engine does not know
      // for this diocese (it only appears in the "omitted" note).
      : result('SOURCE_MORE_DETAILED', `source omits: ${suppressedNotes[0].text.slice(0, 80)}`);
  }
  celebrations.filter((item) => item.identity?.transferredFrom).forEach((item) => {
    const placed = engineCelebrated.some((candidate) => matchesItem(candidate, item));
    checks.transfer = placed ? result('MATCH')
      : result('GENERATOR_MISMATCH', `${sourceId(item)} from ${item.identity.transferredFrom} not placed here`);
  });

  // --- Evening: I/II Vespers, Compline --------------------------------------
  const { evening } = generated.officeResolution;
  if (flags.firstVespersOf) {
    checks.firstVespers = evening.vespers.type === 'first' ? result('MATCH')
      : result('GENERATOR_MISMATCH', `source I Vespers of "${flags.firstVespersOf}", engine ${evening.vespers.type}${evening.conflict ? ` (${evening.conflict.today} vs ${evening.conflict.tomorrow})` : ''}`);
  }
  // With I Vespers of tomorrow printed too, "ІІ Нешпары" comes from the Compline
  // phrase ("Камплета пасля ІІ Нешпараў нядзелі"): not a II Vespers rubric.
  if (flags.secondVespers && !flags.firstVespersOf) {
    const feastVespers = evening.vespers.type === 'of-the-day' && generated.primary.officeKind === 'feast';
    checks.secondVespers = evening.vespers.type === 'second' || feastVespers
      ? result('MATCH', feastVespers ? 'Vespers of a feast (printed as II Vespers)' : null)
      : result('GENERATOR_MISMATCH', `source II Vespers, engine ${evening.vespers.type}`);
  }
  if (flags.compline === 'sunday') {
    checks.compline = String(evening.compline).startsWith('sunday') ? result('MATCH')
      : result('GENERATOR_MISMATCH', `source Sunday Compline, engine ${evening.compline}`);
  }

  // --- Office type / Te Deum ------------------------------------------------
  const officeFrom = normalizeOfficeFrom(flags.officeFrom);
  if (officeFrom) {
    const allowed = OFFICE_FROM[officeFrom];
    const kinds = [generated.primary, ...generated.alternatives].map((item) => item.officeKind);
    const cathedral = officeFrom === 'solemnity' && generated.primary.properKind === 'cathedral-dedication';
    checks.officeType = !allowed ? result('PARSER_UNCERTAIN', `unparsed "${officeFrom}"`)
      : kinds.some((kind) => allowed.includes(kind)) ? result('MATCH')
        : cathedral ? result('EXPECTED_DIOCESAN_DIFFERENCE', 'solemnity in the cathedral, feast in the diocese')
          : officeFrom === 'memorial' && !celebrations.length ? result('PARSER_UNCERTAIN', 'memorial Office printed without a parsed celebration')
            : result('GENERATOR_MISMATCH', `source ${officeFrom}, engine ${kinds.join('/')}`);
    const expectedTeDeum = teDeumOfOfficeFrom(officeFrom, generated);
    if (expectedTeDeum !== null && allowed) {
      const offices = [generated.officeResolution.primary, ...generated.officeResolution.alternatives];
      checks.teDeum = offices.some((office) => office.teDeum === expectedTeDeum) ? result('MATCH')
        : result('GENERATOR_MISMATCH', `source ${officeFrom} implies Te Deum ${expectedTeDeum}`);
    }
  }

  // --- Ordo notes -----------------------------------------------------------
  // Notes printed for tomorrow's celebration on the eve (tag `tomorrow`)
  // belong to the next liturgical day. Parish-title lists are not part of the
  // runtime Ordo (no own-church level), so only indexed notes are expected.
  const noteIds = (sourceDay.notes || []).map((note) => note.noteId)
    .filter((id) => id && context.noteIndex.has(id));
  if (noteIds.length) {
    const returned = new Set([
      ...generated.ordoNotes.map((note) => note.id),
      // Volume markers are selected as `books` metadata (§13.1).
      ...(generated.books?.noteIds || []),
      ...(sourceDay.notes || []).some((note) => note.tags?.includes('tomorrow'))
        ? (context.nextGenerated?.ordoNotes || []).map((note) => note.id) : [],
    ]);
    const lost = noteIds.filter((id) => !returned.has(id));
    const lostEntries = lost.map((id) => context.noteIndex.get(id)).filter(Boolean);
    checks.notes = !lost.length ? result('MATCH', null, { count: noteIds.length })
      : result(lostEntries.every((note) => note.classification === 'NEEDS_REVIEW') ? 'PARSER_UNCERTAIN' : 'GENERATOR_MISMATCH',
        `${lost.length}/${noteIds.length} notes not selected: ${lost.slice(0, 3).join(', ')}`);
  }

  // Investigated expectations replace the automatic status (with a reason).
  Object.entries(checks).forEach(([check, value]) => {
    if (value.status === 'MATCH') return;
    const expected = expectationFor(diocese, sourceDay.date, check);
    if (expected) {
      checks[check] = {
        ...value, status: expected.status, reason: expected.reason, reviewed: true,
        ...(expected.approvedDecision ? { approvedDecision: true } : {}),
        ...(expected.sourceError ? { sourceError: true } : {}),
      };
    }
  });

  const status = worst(Object.values(checks).map((item) => item.status));
  return {
    date: sourceDay.date,
    status,
    // A GENERATOR_MISMATCH day whose mismatches were all investigated.
    reviewed: status === 'GENERATOR_MISMATCH'
      && Object.values(checks).every((item) => item.status !== 'GENERATOR_MISMATCH' || item.reviewed),
    checks,
    source: { primary: primarySource ? sourceId(primarySource) || primarySource.title : null, officeFrom: officeFrom || null },
    engine: { primary: generated.primary.id, officeKind: generated.primary.officeKind, evening: evening.vespers.type },
  };
}

/**
 * Validate one diocese: every non-preview evidence day against the
 * generated calendar of its civil year.
 */
export function validateDiocese(source, { differences, notes }) {
  const diocese = source.source.diocese;
  const context = { diocese, notes };
  const years = new Map();
  const generatedDay = (iso) => {
    const year = Number(iso.slice(0, 4));
    if (!years.has(year)) {
      years.set(year, new Map(generateLiturgicalYear(year, context).map((day) => [day.date, day])));
    }
    return years.get(year).get(iso);
  };
  const differenceIndex = new Map((differences.entries || []).map((entry) => [
    ENGINE_ID_ALIASES[entry.celebrationId] || entry.celebrationId, entry,
  ]));
  const noteIndex = new Map(notes.map((note) => [note.id, note]));
  const nextIso = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const days = source.days.filter((day) => !day.preview).map((day) => compareDay(day, generatedDay(day.date), {
    diocese,
    nextGenerated: generatedDay(nextIso(day.date)),
    plan: getYearPlan(Number(day.date.slice(0, 4)), context),
    differences: differenceIndex,
    noteIndex,
  }));
  return { diocese, coverage: source.source.coverage, days, summary: summarize(days) };
}

export function summarize(days) {
  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  days.forEach((day) => { byStatus[day.status] += 1; });
  const byCheck = {};
  CHECKS.forEach((check) => {
    const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
    days.forEach((day) => { if (day.checks[check]) counts[day.checks[check].status] += 1; });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const approved = days.filter((day) => day.checks[check]?.approvedDecision).length;
    byCheck[check] = { total, ...counts, matchRate: total ? counts.MATCH / total : null,
      approvedDecisionRate: total ? (counts.MATCH + approved) / total : null };
  });
  const total = days.length;
  const explained = total - byStatus.GENERATOR_MISMATCH;
  const reviewedMismatches = days.filter((day) => day.reviewed).length;
  return {
    days: total,
    byStatus,
    reviewedMismatches,
    unreviewedMismatches: byStatus.GENERATOR_MISMATCH - reviewedMismatches,
    matchRate: total ? byStatus.MATCH / total : 0,
    approvedDecisionRate: total ? days.filter((day) => day.status === 'MATCH' || (day.status !== 'GENERATOR_MISMATCH' && Object.values(day.checks).some((check) => check.approvedDecision))).length / total : 0,
    // MATCH + every explained difference (all statuses but GENERATOR_MISMATCH).
    explainedRate: total ? explained / total : 0,
    byCheck,
  };
}
