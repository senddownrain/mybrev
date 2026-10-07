/**
 * MyBrev generative Ordo engine — public API (pure, no Firestore/Pinia).
 *
 *   resolveLiturgicalDate(date, { country: 'BY', diocese, yearOverrides, notes })
 *     → ResolvedLiturgicalDay
 *   generateLiturgicalYear(year, context) → ResolvedLiturgicalDay[]
 *
 * Pipeline: year plan (permanent rules + layers + year overrides + transfers)
 *   → candidates → precedence/display → Office & Readings descriptors
 *   → Ordo notes.
 */
import { addDays, daysOfYear, parseIso, toIsoDate } from './dates.js';
import { collectCandidates } from './candidates.js';
import { resolveDisplay } from './display.js';
import {
  buildCommemorationDescriptor, buildOfficeDescriptor, hasFirstVespersByRight, resolveEvening,
} from './office.js';
import { buildCommemorationReadings, buildReadingsDescriptor } from './readings.js';
import { selectOrdoNotes } from './notes.js';
import { getYearPlan } from './yearPlan.js';
import { normalizeDioceseId } from './layers.js';

function resolveCore(iso, context, cache) {
  if (cache?.has(iso)) return cache.get(iso);
  const plan = getYearPlan(parseIso(iso).year, context);
  const { season, candidates } = collectCandidates(iso, plan);
  const display = resolveDisplay(candidates, season);
  const core = { iso, plan, season, candidates, display };
  cache?.set(iso, core);
  return core;
}

function stripCandidate(candidate) {
  const { order: _order, status, ...rest } = candidate;
  return { ...rest, status };
}

function sourceOf(candidate) {
  return {
    optionId: candidate.id,
    celebrationId: candidate.kind === 'temporal' ? null : candidate.id,
    kind: candidate.kind,
    officeKind: candidate.officeKind,
    title: candidate.title,
  };
}

function transferRulesFor(iso, plan) {
  return plan.transfers
    .filter((item) => item.from === iso || item.to === iso)
    .map(({ rule, ...item }) => ({ rule: 'transfer', transferRule: rule, ...item }));
}

function layerSummary(plan, involvedIds) {
  return plan.appliedLayers.map((layer) => ({
    id: layer.id,
    level: layer.level,
    added: layer.added.length,
    modified: layer.modified.length,
    affecting: [...layer.added, ...layer.modified].filter((id) => involvedIds.has(id)),
    ...(layer.warnings.length ? { warnings: layer.warnings } : {}),
  }));
}

/** Selector ids that name a day of the temporal cycle rather than a celebration. */
const ANCHOR_ALIASES = Object.freeze({
  divinemercy: 'divineMercySunday',
  eastersunday: 'easterSunday',
  'easter-sunday': 'easterSunday',
  holythursday: 'holyThursday',
  goodfriday: 'goodFriday',
  holysaturday: 'holySaturday',
});

function dateOfCelebrationFactory(iso, context) {
  const { year } = parseIso(iso);
  return (celebrationId) => [year - 1, year, year + 1].flatMap((y) => {
    const plan = getYearPlan(y, context);
    const direct = plan.celebrationDates.get(celebrationId);
    if (direct) return [direct.date];
    if (ANCHOR_ALIASES[celebrationId]) return [plan.anchors[ANCHOR_ALIASES[celebrationId]]];
    const byCode = [...plan.celebrations.values()].find((item) => item.feastCode === celebrationId
      || String(item.feastCode || '').replace(/^feast-/, '') === celebrationId);
    const entry = byCode ? plan.celebrationDates.get(byCode.id) : null;
    return entry ? [entry.date] : [];
  });
}

/**
 * @param {string|Date|import('moment').Moment} date
 * @param {{ country?: string, diocese?: string, yearOverrides?: object[],
 *   notes?: object[], dioceseLayer?: object }} [context]
 */
export function resolveLiturgicalDate(date, context = {}, cache = null) {
  const iso = toIsoDate(date);
  const planContext = { ...context };
  delete planContext.notes;
  const today = resolveCore(iso, planContext, cache);
  const tomorrow = resolveCore(addDays(iso, 1), planContext, cache);
  const yesterday = resolveCore(addDays(iso, -1), planContext, cache);
  const { season, display, plan } = today;
  const temporal = today.candidates.find((item) => item.kind === 'temporal');

  const evening = resolveEvening(today, tomorrow);
  const eve = resolveEvening(yesterday, today);
  const firstVespers = {
    byRight: hasFirstVespersByRight(display.officePrimary, season),
    celebratedOnEve: eve.vespers.type === 'first' && eve.vespers.celebrationId === display.officePrimary.id,
    eveDate: yesterday.season.date,
    ...(eve.omittedFirstVespers === display.officePrimary.id ? { omittedBecause: eve.conflict } : {}),
  };

  const options = [display.primary, ...display.alternatives];
  // Office and Mass may come from different sources on one date (§11.1).
  const officeSplit = display.officePrimary.id !== display.primary.id;
  const officeOptions = officeSplit ? [display.officePrimary] : options;
  const officeResolution = {
    primary: buildOfficeDescriptor(display.officePrimary, season, temporal),
    alternatives: officeSplit ? [] : display.alternatives.map((item) => buildOfficeDescriptor(item, season, temporal)),
    commemorations: display.commemorations.map(buildCommemorationDescriptor),
    firstVespers,
    evening,
  };
  const readingResolution = {
    primary: buildReadingsDescriptor(display.primary, season, temporal),
    alternatives: display.alternatives.map((item) => buildReadingsDescriptor(item, season, temporal)),
    commemorations: display.commemorations.map((item) => buildCommemorationReadings(item, temporal)),
  };

  const involvedIds = new Set(today.candidates.map((item) => item.id));
  const appliedRules = [
    ...transferRulesFor(iso, plan),
    ...display.appliedRules,
    ...today.candidates.filter((item) => item.yearOverride).map((item) => ({ rule: 'year-override', id: item.id, ...item.yearOverride })),
    ...today.candidates.filter((item) => item.inheritedFrom && item.status === 'active').map((item) => ({
      rule: 'layer-modification', id: item.id, layerTrail: item.layerTrail, from: item.inheritedFrom,
    })),
    ...(evening.conflict ? [{ rule: 'vespers-conflict', ...evening.conflict }] : []),
  ];

  const day = {
    date: iso,
    context: {
      country: String(context.country || 'BY').toUpperCase(),
      diocese: normalizeDioceseId(context.diocese) || null,
    },
    period: season.period,
    periodPhase: season.periodPhase,
    week: season.periodWeek,
    dayOfWeek: season.dayOfWeek,
    psalterWeek: season.psalterWeek,
    readingCycle: season.readingCycle,
    color: display.primary.color,
    colorAlternatives: display.primary.colorAlternatives || [],
    candidates: today.candidates.map(stripCandidate),
    primary: stripCandidate(display.primary),
    alternatives: display.alternatives.map(stripCandidate),
    commemorations: display.commemorations.map(stripCandidate),
    suppressed: display.suppressed.map(stripCandidate),
    options: options.map((item) => ({ id: item.id, title: item.title, officeKind: item.officeKind, role: item.role })),
    // Legal Offices of the Liturgy of the Hours (= `options` unless split).
    officeOptions: officeOptions.map(stripCandidate),
    sources: {
      office: sourceOf(display.officePrimary),
      mass: sourceOf(display.primary),
      split: officeSplit,
    },
    officeResolution,
    readingResolution,
    ordoNotes: [],
    appliedRules,
    appliedLayers: layerSummary(plan, involvedIds),
  };

  const notes = [...(plan.layerNotes || []), ...(context.notes || [])];
  day.ordoNotes = selectOrdoNotes(notes, day, {
    context: planContext,
    dateOfCelebration: dateOfCelebrationFactory(iso, planContext),
  });
  return day;
}

/** Resolve every date of a civil year. */
export function generateLiturgicalYear(year, context = {}) {
  const cache = new Map();
  return daysOfYear(year).map((iso) => resolveLiturgicalDate(iso, context, cache));
}

export { computeEasterSunday, computeYearAnchors, toYearOptions, MOVABLE_CELEBRATIONS } from './movableFeasts.js';
export { computeSeason, temporalPrecedence } from './season.js';
export { celebrationPrecedence } from './precedence.js';
export { selectOrdoNotes, matchesSelector } from './notes.js';
export { validateYearOverride } from './yearOverrides.js';
export { getYearPlan } from './yearPlan.js';
