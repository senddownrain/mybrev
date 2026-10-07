/**
 * One-year decisions (`liturgicalYearOverrides`).
 *
 * Canonical YearOverride (final phase §12):
 * {
 *   id?, year, scope: 'universal'|'belarus'|'diocese', dioceseId?,
 *   targetCelebrationId?, action: 'move'|'suppress'|'add'|'replace'|'changeRank'|'changeColor'|'changeRule',
 *   originalDate?   occurrence the decision applies to (ISO; legacy `from`)
 *   computedDate?   what the transfer algorithm computed (auto-transfer provenance)
 *   effectiveDate?  the date that is used (ISO; legacy `to`) — move / add
 *   rank?, color?, celebration?, rule?,
 *   reason?, sourceNote?  (free-text citation: decree, annual calendar …)
 *   source: 'auto-transfer'|'manual', status: 'needs-review'|'confirmed', enabled?
 * }
 *
 * Legacy documents (`from` / `to`, a free-text `source`) are normalized by
 * `normalizeYearOverride`; writers store the canonical fields and mirror
 * `from` / `to` only for application builds that predate this schema.
 *
 * Order: universal permanent rules → Belarus proper → diocesan proper →
 * global (universal, belarus) year overrides → diocesan year overrides.
 * Transfers are computed by `transfers.js`; a transfer override (`source:
 * 'auto-transfer'`, or any `move` that carries `computedDate`) is the
 * materialized, editable record of such a transfer and is applied by the
 * transfer step, not here (see `transferOverrides.js`).
 */
import { normalizeDioceseId } from './layers.js';

export const YEAR_OVERRIDE_ACTIONS = Object.freeze(['move', 'suppress', 'add', 'replace', 'changeRank', 'changeColor', 'changeRule']);
export const YEAR_OVERRIDE_SOURCES = Object.freeze(['auto-transfer', 'manual']);
export const YEAR_OVERRIDE_STATUSES = Object.freeze(['needs-review', 'confirmed']);
const COLORS = Object.freeze(['albus', 'ruber', 'viridis', 'violaceus', 'rosaceus', 'niger']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SCOPE_ORDER = Object.freeze({ universal: 0, belarus: 1, diocese: 2 });
const isIso = (value) => ISO_DATE.test(String(value || ''));

/**
 * Canonical form of a stored or drafted override. Pure; never mutates.
 *  - `originalDate` ← `from`, `effectiveDate` ← `to` (move / add);
 *  - a free-text legacy `source` becomes `sourceNote`;
 *  - `source` / `status` get their defaults (manual + confirmed, or
 *    auto-transfer + needs-review);
 *  - `from` / `to` are kept as mirrors of the canonical dates.
 */
export function normalizeYearOverride(override) {
  if (!override || typeof override !== 'object') return override;
  const result = { ...override };
  const usesTarget = override.action === 'move' || override.action === 'add';
  const originalDate = override.originalDate ?? override.from;
  const effectiveDate = usesTarget ? (override.effectiveDate ?? override.to) : override.effectiveDate;
  if (originalDate) result.originalDate = originalDate;
  if (effectiveDate) result.effectiveDate = effectiveDate;
  if (originalDate) result.from = originalDate;
  if (usesTarget && effectiveDate) result.to = effectiveDate;
  if (override.source && !YEAR_OVERRIDE_SOURCES.includes(override.source)) {
    if (!override.sourceNote) result.sourceNote = override.source;
    result.source = 'manual';
  }
  if (!result.source) result.source = 'manual';
  if (!YEAR_OVERRIDE_STATUSES.includes(result.status)) {
    result.status = result.source === 'auto-transfer' ? 'needs-review' : 'confirmed';
  }
  return result;
}

/** Materialized record of a computed transfer (auto or manually corrected). */
export function isTransferOverride(override) {
  return override?.action === 'move' && (override.source === 'auto-transfer' || Boolean(override.computedDate));
}

export function validateYearOverride(raw) {
  const override = normalizeYearOverride(raw);
  const errors = [];
  if (!Number.isInteger(Number(override?.year)) || override?.year === '' || override?.year === null) errors.push('year must be an integer');
  if (!(override?.scope in SCOPE_ORDER)) errors.push('scope must be universal, belarus or diocese');
  if (override?.scope === 'diocese' && !override.dioceseId) errors.push('dioceseId is required for diocese scope');
  if (!YEAR_OVERRIDE_ACTIONS.includes(override?.action)) errors.push(`unknown action ${override?.action}`);
  if (override?.action !== 'add' && !override?.targetCelebrationId) errors.push('targetCelebrationId is required');
  if (override?.action === 'move' && !isIso(override.effectiveDate)) errors.push('move requires ISO `to`');
  if (override?.action === 'add' && (!override.celebration?.id || !isIso(override.effectiveDate))) {
    errors.push('add requires `celebration.id` and ISO `to`');
  }
  if (override?.action === 'changeRank' && !(override.rank || override.to)) errors.push('changeRank requires `rank`');
  if (override?.action === 'changeColor' && !COLORS.includes(override.color)) errors.push('changeColor requires a liturgical `color`');
  if (override?.action === 'replace' && !override.celebration) errors.push('replace requires `celebration` changes');
  if (override?.computedDate && !isIso(override.computedDate)) errors.push('computedDate must be an ISO date');
  if (override?.originalDate && !isIso(override.originalDate)) errors.push('originalDate must be an ISO date');
  if (override && !YEAR_OVERRIDE_SOURCES.includes(override.source)) errors.push(`unknown source ${override.source}`);
  if (override && !YEAR_OVERRIDE_STATUSES.includes(override.status)) errors.push(`unknown status ${override.status}`);
  if (override?.source === 'auto-transfer' && override.action !== 'move') errors.push('auto-transfer overrides must be moves');
  ['originalDate', 'effectiveDate'].forEach((field) => {
    const value = override?.[field];
    if (value && isIso(value) && Number(String(value).slice(0, 4)) !== Number(override.year)
      && override.action !== 'changeRank') errors.push(`\`${field === 'originalDate' ? 'from' : 'to'}\` must be a date of ${override.year}`);
  });
  return errors;
}

/** Overrides relevant for a year and context, in application order. */
export function selectYearOverrides(overrides = [], year, context = {}) {
  const country = String(context.country || 'BY').toUpperCase();
  const diocese = normalizeDioceseId(context.diocese);
  return overrides
    .map((override, index) => ({ override, index }))
    .filter(({ override }) => Number(override.year) === Number(year) && override.enabled !== false)
    .filter(({ override }) => override.scope !== 'belarus' || country === 'BY')
    .filter(({ override }) => override.scope !== 'diocese' || normalizeDioceseId(override.dioceseId) === diocese)
    .sort((a, b) => SCOPE_ORDER[a.override.scope] - SCOPE_ORDER[b.override.scope] || a.index - b.index)
    .map(({ override }) => normalizeYearOverride(override));
}

/**
 * Apply overrides to a year placement list `[{ celebration, date }]`.
 * Returns the new placements plus the audit records.
 */
export function applyYearOverrides(placements, rawOverrides, { celebrations } = {}) {
  let result = [...placements];
  const applied = [];
  const removed = [];
  rawOverrides.map(normalizeYearOverride).forEach((override) => {
    const errors = validateYearOverride(override);
    if (errors.length) {
      applied.push({ override, status: 'invalid', errors });
      return;
    }
    const matches = (placement) => placement.celebration.id === override.targetCelebrationId
      && (!override.originalDate || placement.date === override.originalDate);
    const tag = {
      yearOverride: {
        action: override.action, scope: override.scope, reason: override.reason || '', source: override.source, status: override.status,
        ...(override.id ? { overrideId: override.id } : {}),
      },
    };
    switch (override.action) {
      case 'move':
        result = result.map((placement) => (matches(placement)
          ? { ...placement, date: override.effectiveDate, movedFrom: placement.date, ...tag, noAutoTransfer: true }
          : placement));
        break;
      case 'suppress':
        result.filter(matches).forEach((placement) => removed.push({ ...placement, reason: 'suppressed-by-year-override', override }));
        result = result.filter((placement) => !matches(placement));
        break;
      case 'add': {
        const celebration = { layer: 'override', ...override.celebration };
        result.push({ celebration, date: override.effectiveDate, ...tag });
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
      case 'changeColor':
        result = result.map((placement) => (matches(placement)
          ? { ...placement, celebration: { ...placement.celebration, color: override.color, colorAlternatives: undefined }, ...tag }
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
