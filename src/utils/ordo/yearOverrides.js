/**
 * Rare decisions valid for one year only (spec §20).
 *
 * YearOverride {
 *   year, scope: 'universal'|'belarus'|'diocese', dioceseId?,
 *   targetCelebrationId?, action: 'move'|'suppress'|'add'|'replace'|'changeRank'|'changeRule',
 *   from?, to?, rank?, celebration?, rule?, reason?, source?
 * }
 *
 * Order: universal permanent rules → Belarus proper → diocesan proper →
 * global (universal, belarus) year overrides → diocesan year overrides. A transfer that follows from a permanent rule is computed by
 * `transfers.js` and must NOT be written as an override.
 */
import { normalizeDioceseId } from './layers.js';

export const YEAR_OVERRIDE_ACTIONS = Object.freeze(['move', 'suppress', 'add', 'replace', 'changeRank', 'changeRule']);
const SCOPE_ORDER = Object.freeze({ universal: 0, belarus: 1, diocese: 2 });

export function validateYearOverride(override) {
  const errors = [];
  if (!Number.isInteger(override?.year)) errors.push('year must be an integer');
  if (!(override?.scope in SCOPE_ORDER)) errors.push('scope must be universal, belarus or diocese');
  if (override?.scope === 'diocese' && !override.dioceseId) errors.push('dioceseId is required for diocese scope');
  if (!YEAR_OVERRIDE_ACTIONS.includes(override?.action)) errors.push(`unknown action ${override?.action}`);
  if (override?.action !== 'add' && !override?.targetCelebrationId) errors.push('targetCelebrationId is required');
  if (override?.action === 'move' && !/^\d{4}-\d{2}-\d{2}$/.test(String(override.to || ''))) errors.push('move requires ISO `to`');
  if (override?.action === 'add' && (!override.celebration?.id || !/^\d{4}-\d{2}-\d{2}$/.test(String(override.to || '')))) {
    errors.push('add requires `celebration.id` and ISO `to`');
  }
  if (override?.action === 'changeRank' && !(override.rank || override.to)) errors.push('changeRank requires `rank`');
  return errors;
}

/** Overrides relevant for a year and context, in application order. */
export function selectYearOverrides(overrides = [], year, context = {}) {
  const country = String(context.country || 'BY').toUpperCase();
  const diocese = normalizeDioceseId(context.diocese);
  return overrides
    .map((override, index) => ({ override, index }))
    .filter(({ override }) => override.year === year)
    .filter(({ override }) => override.scope !== 'belarus' || country === 'BY')
    .filter(({ override }) => override.scope !== 'diocese' || normalizeDioceseId(override.dioceseId) === diocese)
    .sort((a, b) => SCOPE_ORDER[a.override.scope] - SCOPE_ORDER[b.override.scope] || a.index - b.index)
    .map(({ override }) => override);
}

/**
 * Apply overrides to a year placement list `[{ celebration, date }]`.
 * Returns the new placements plus the audit records.
 */
export function applyYearOverrides(placements, overrides, { celebrations } = {}) {
  let result = [...placements];
  const applied = [];
  const removed = [];
  overrides.forEach((override) => {
    const errors = validateYearOverride(override);
    if (errors.length) {
      applied.push({ override, status: 'invalid', errors });
      return;
    }
    const matches = (placement) => placement.celebration.id === override.targetCelebrationId
      && (!override.from || placement.date === override.from);
    const tag = { yearOverride: { action: override.action, scope: override.scope, reason: override.reason || '' } };
    switch (override.action) {
      case 'move':
        result = result.map((placement) => (matches(placement)
          ? { ...placement, date: override.to, movedFrom: placement.date, ...tag, noAutoTransfer: true }
          : placement));
        break;
      case 'suppress':
        result.filter(matches).forEach((placement) => removed.push({ ...placement, reason: 'suppressed-by-year-override', override }));
        result = result.filter((placement) => !matches(placement));
        break;
      case 'add': {
        const celebration = { layer: 'override', ...override.celebration };
        result.push({ celebration, date: override.to, ...tag });
        break;
      }
      case 'replace':
        result = result.map((placement) => (matches(placement)
          ? {
            ...placement,
            celebration: { ...placement.celebration, ...override.celebration, id: placement.celebration.id, replacedByOverride: true },
            ...tag,
          }
          : placement));
        break;
      case 'changeRank':
        result = result.map((placement) => (matches(placement)
          ? {
            ...placement,
            celebration: { ...placement.celebration, rank: override.rank || override.to, precedence: undefined },
            ...tag,
          }
          : placement));
        break;
      case 'changeRule':
        result = result.map((placement) => (matches(placement)
          ? {
            ...placement,
            celebration: {
              ...placement.celebration,
              rules: { ...(placement.celebration.rules || {}), ...(override.rule || {}) },
            },
            ...tag,
          }
          : placement));
        break;
      default:
        break;
    }
    applied.push({ override, status: 'applied' });
    if (celebrations && override.action === 'add') celebrations.set(override.celebration.id, override.celebration);
  });
  return { placements: result, applied, removed };
}
