/**
 * Year Overrides admin helpers: what the engine computes for a year and what
 * a manual override would change. Pure (no Firestore, Pinia or Vue).
 */
import { generateLiturgicalYear, getYearPlan } from './index.js';
import { getCalendarDefinitions } from './definitions.js';
import { normalizeDioceseId } from './layers.js';
import { isTransferOverride, normalizeYearOverride, validateYearOverride } from './yearOverrides.js';
import { computedTransfers } from './transferOverrides.js';

export const PREVIEW_DIOCESES = Object.freeze(['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno']);

const pick = (item) => ({ id: item.id, title: item.title, rank: item.rank, color: item.color });

/** Comparable summary of a resolved day. */
export function summarizeDay(day) {
  return {
    date: day.date,
    primary: pick(day.primary),
    alternatives: day.alternatives.map(pick),
    commemorations: day.commemorations.map(pick),
    suppressed: day.suppressed.filter((item) => item.kind !== 'temporal').map((item) => ({ ...pick(item), reason: item.reason })),
  };
}

const signature = (summary) => JSON.stringify([
  summary.primary.id, summary.primary.rank, summary.primary.color,
  summary.alternatives.map((item) => [item.id, item.rank, item.color]),
  summary.commemorations.map((item) => item.id),
  summary.suppressed.map((item) => [item.id, item.reason]),
]);

/** Dioceses an override affects. */
export function diocesesOfOverride(override) {
  return override?.scope === 'diocese' ? [normalizeDioceseId(override.dioceseId)].filter(Boolean) : [...PREVIEW_DIOCESES];
}

/** Stored overrides other than the one being edited. */
function storedOverridesExcept(id) {
  return getCalendarDefinitions().yearOverrides.filter((item) => item.enabled !== false && (!id || item.id !== id));
}

/**
 * «Было па разліку → стане пасля override».
 *
 * @param {object} override  the draft (with `id` when an existing one is edited)
 * @returns {{ errors: string[], changes: { diocese, date, before, after }[] }}
 */
export function previewYearOverride(override, { country = 'BY' } = {}) {
  const errors = validateYearOverride(override);
  if (errors.length) return { errors, changes: [] };
  const others = storedOverridesExcept(override.id);
  const changes = [];
  diocesesOfOverride(override).forEach((diocese) => {
    const base = { country, diocese, dataYearOverrides: false };
    const before = generateLiturgicalYear(override.year, { ...base, yearOverrides: others });
    const after = generateLiturgicalYear(override.year, {
      ...base, yearOverrides: override.enabled === false ? others : [...others, override],
    });
    before.forEach((day, index) => {
      const a = summarizeDay(day);
      const b = summarizeDay(after[index]);
      if (signature(a) !== signature(b)) changes.push({ diocese, date: day.date, before: a, after: b });
    });
  });
  return { errors: [], changes };
}

/**
 * Transfers of the year: what the algorithm computes and, when it is
 * materialized, the stored Year Override that holds it (auto or manual).
 * `{ celebrationId, title, rank, from, to, computedDate, rule, transferCase,
 *    record: null | { id, source, status, effectiveDate, enabled } }`
 */
export function automaticTransfers(year, context = {}) {
  const plan = getYearPlan(Number(year), { country: 'BY', ...context });
  const stored = getCalendarDefinitions().yearOverrides.map(normalizeYearOverride)
    .filter((item) => Number(item.year) === Number(year) && isTransferOverride(item));
  const diocese = normalizeDioceseId(context.diocese);
  const recordOf = (celebrationId, from) => stored.find((item) => item.targetCelebrationId === celebrationId
    && (!item.originalDate || item.originalDate === from)
    && (item.scope !== 'diocese' || normalizeDioceseId(item.dioceseId) === diocese)) || null;
  return computedTransfers(Number(year), { diocese: context.diocese }).map((item) => {
    const record = recordOf(item.celebrationId, item.from);
    const effective = plan.transfers.find((transfer) => transfer.celebrationId === item.celebrationId && transfer.from === item.from);
    return {
      ...item,
      to: effective?.to || item.to,
      title: plan.celebrations.get(item.celebrationId)?.title || item.title,
      rank: plan.celebrations.get(item.celebrationId)?.rank || '',
      record: record ? {
        id: record.id, source: record.source, status: record.status, effectiveDate: record.effectiveDate, enabled: record.enabled !== false,
      } : null,
    };
  });
}

/** Days on which a celebration gave way to another one (collisions). */
export function yearCollisions(year, context = {}) {
  return generateLiturgicalYear(Number(year), { country: 'BY', ...context })
    .map(summarizeDay)
    .filter((day) => day.suppressed.some((item) => item.reason !== 'transferred' && item.reason !== 'not-applicable'))
    .map((day) => ({
      date: day.date,
      primary: day.primary,
      suppressed: day.suppressed.filter((item) => item.reason !== 'transferred' && item.reason !== 'not-applicable'),
    }));
}

/** Stored overrides of a year (manual and materialized transfers, every scope), enabled or not; canonical form. */
export function storedYearOverrides(year) {
  return getCalendarDefinitions().yearOverrides
    .filter((item) => Number(item.year) === Number(year))
    .map(normalizeYearOverride);
}
