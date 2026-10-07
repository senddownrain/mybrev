/**
 * Year plan: layered celebrations placed on dates of one civil year, with
 * year overrides and permanent transfer rules applied. Resolution of a
 * single date reads from this plan, so transfers are consistent for the
 * whole year and for both Hours and Readings.
 */
import { addDays, isoFromParts, isoWeekday } from './dates.js';
import { buildCalendarLayers, normalizeDioceseId } from './layers.js';
import { computeYearAnchors, getCountryRules } from './movableFeasts.js';
import { celebrationPrecedence } from './precedence.js';
import { computeSeason, temporalPrecedence } from './season.js';
import { resolveTransfers } from './transfers.js';
import { applyYearOverrides, isTransferOverride, selectYearOverrides } from './yearOverrides.js';
import { getCalendarDefinitions, getDefinitionsEpoch } from './definitions.js';

function isValidFixed(year, month, day) {
  const iso = isoFromParts(year, month, day);
  return iso === `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function placeCelebration(celebration, year, anchors) {
  if (celebration.date?.type === 'fixed') {
    const { month, day } = celebration.date;
    return isValidFixed(year, month, day) ? isoFromParts(year, month, day) : null;
  }
  if (celebration.date?.type === 'movable') {
    const anchor = anchors[celebration.date.anchor];
    return anchor ? addDays(anchor, Number(celebration.date.offsetDays) || 0) : null;
  }
  if (celebration.date?.type === 'last-weekday-of-month') {
    // e.g. last Sunday of October: step back from the last day of the month.
    const { month, isoWeekday: weekday } = celebration.date;
    let iso = addDays(isoFromParts(year, month + 1, 1), -1);
    while (isoWeekday(iso) !== Number(weekday)) iso = addDays(iso, -1);
    return iso;
  }
  return null;
}

/**
 * Transfer overrides the algorithm no longer produces: a confirmed (manual)
 * one is still the administrator's decision and is applied as a plain move;
 * an auto one awaiting review is stale and only reported.
 */
function applyUnusedTransferOverrides(byDate, unused) {
  const applied = [];
  const stale = [];
  unused.forEach((override) => {
    if (override.status !== 'confirmed') {
      stale.push(override);
      return;
    }
    const list = byDate.get(override.originalDate) || [];
    const index = list.findIndex((item) => item.celebration.id === override.targetCelebrationId && !item.transferredOut);
    if (index < 0 || !override.effectiveDate || override.effectiveDate === override.originalDate) {
      stale.push(override);
      return;
    }
    const [placement] = list.splice(index, 1);
    const moved = {
      ...placement,
      date: override.effectiveDate,
      movedFrom: override.originalDate,
      noAutoTransfer: true,
      yearOverride: {
        action: 'move', scope: override.scope, reason: override.reason || '', source: override.source, status: override.status,
        ...(override.id ? { overrideId: override.id } : {}),
      },
    };
    if (!byDate.has(override.effectiveDate)) byDate.set(override.effectiveDate, []);
    byDate.get(override.effectiveDate).push(moved);
    applied.push({ override, status: 'applied', as: 'move' });
  });
  return { applied, stale };
}

export function contextKey(context = {}) {
  return JSON.stringify({
    country: String(context.country || 'BY').toUpperCase(),
    diocese: normalizeDioceseId(context.diocese),
    yearOverrides: context.yearOverrides || [],
    dioceseLayer: context.dioceseLayer || null,
    dataYearOverrides: context.dataYearOverrides !== false,
    ignoreTransferOverrides: Boolean(context.ignoreTransferOverrides),
    definitions: getDefinitionsEpoch(),
  });
}

export function buildYearPlan(year, context = {}) {
  const countryRules = getCountryRules(context.country);
  const anchorCache = new Map();
  const anchors = computeYearAnchors(year, countryRules);
  anchorCache.set(year, anchors);
  const seasonCache = new Map();
  const seasonOf = (iso) => {
    if (!seasonCache.has(iso)) seasonCache.set(iso, computeSeason(iso, countryRules, anchorCache));
    return seasonCache.get(iso);
  };

  const { celebrations, appliedLayers, layerNotes } = buildCalendarLayers(context);
  const removed = [];
  let placements = [];
  let order = 0;
  celebrations.forEach((celebration) => {
    const date = placeCelebration(celebration, year, anchors);
    if (!date) return;
    const placement = { celebration, date, originalDate: date, order: order++ };
    if (celebration.suppressedBy) removed.push({ ...placement, reason: 'suppressed-by-layer' });
    else placements.push(placement);
  });

  // Stored one-year decisions (`liturgicalYearOverrides`) first, then the
  // caller's overrides (admin preview, tests).
  const dataOverrides = context.dataYearOverrides === false
    ? [] : getCalendarDefinitions().yearOverrides.filter((override) => override.enabled !== false);
  const selected = selectYearOverrides([...dataOverrides, ...(context.yearOverrides || [])], year, context);
  // Materialized transfers are applied by the transfer step (they keep the
  // computed date); `ignoreTransferOverrides` gives the pure algorithm.
  const transferOverrides = context.ignoreTransferOverrides ? [] : selected.filter(isTransferOverride);
  const overrides = selected.filter((override) => !isTransferOverride(override));
  const overrideResult = applyYearOverrides(placements, overrides, { celebrations });
  placements = overrideResult.placements;
  removed.push(...overrideResult.removed);

  const byDate = new Map();
  placements.forEach((placement) => {
    const item = { ...placement, precedence: celebrationPrecedence(placement.celebration) };
    if (!byDate.has(item.date)) byDate.set(item.date, []);
    byDate.get(item.date).push(item);
  });

  const transfers = resolveTransfers(byDate, seasonOf, temporalPrecedence, { overrides: transferOverrides });
  const { applied: lateMoves, stale: staleTransferOverrides } = applyUnusedTransferOverrides(
    byDate, transferOverrides.filter((override) => !transfers.usedOverrides.has(override)),
  );

  const removedByDate = new Map();
  removed.forEach((item) => {
    if (!removedByDate.has(item.date)) removedByDate.set(item.date, []);
    removedByDate.get(item.date).push(item);
  });

  const celebrationDates = new Map();
  byDate.forEach((list, iso) => list.forEach((item) => {
    if (item.transferredOut) return;
    celebrationDates.set(item.celebration.id, { date: iso, originalDate: item.originalDate });
  }));

  return {
    year,
    context,
    countryRules,
    anchors,
    anchorCache,
    seasonOf,
    celebrations,
    appliedLayers,
    layerNotes,
    byDate,
    removedByDate,
    transfers,
    appliedOverrides: [...overrideResult.applied, ...lateMoves],
    staleTransferOverrides,
    celebrationDates,
  };
}

const planCache = new Map();
const PLAN_CACHE_LIMIT = 24;

/** Memoized plan per (year, context). Plans are immutable once built. */
export function getYearPlan(year, context = {}) {
  const key = `${year}|${contextKey(context)}`;
  if (planCache.has(key)) return planCache.get(key);
  const plan = buildYearPlan(year, context);
  planCache.set(key, plan);
  if (planCache.size > PLAN_CACHE_LIMIT) planCache.delete(planCache.keys().next().value);
  return plan;
}
