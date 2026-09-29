/**
 * Calendar resolver: collect every candidate of a date without discarding
 * anything. Candidates carry their precedence and the existing `days` /
 * `readings` identities; status is only informational at this step.
 */
import moment from '../moment-be.js';
import { formatLiturgicalPeriodTitle } from '../liturgicalPeriodTitle.js';
import {
  getOrdinaryPsalterDayDocumentId,
  getPeriodDayDocumentId,
  getPeriodPsalterDayDocumentId,
  getSeasonalDateExceptionId,
  isChristmasDateExceptionExclusion,
  isSeasonalDateException,
} from '../liturgicalDayResolution.js';
import { fixedDateKey } from './dates.js';
import { rankKind } from './precedence.js';
import { temporalPrecedence } from './season.js';

const SEASON_COLOR = Object.freeze({
  advent: 'violaceus', lent: 'violaceus', holyweek: 'violaceus', christmas: 'albus', easter: 'albus', ordinary: 'viridis',
});

export function temporalColor(season) {
  if (season.date === season.anchors.goodFriday) return 'ruber';
  if (season.date === season.anchors.holyThursday) return 'albus';
  return SEASON_COLOR[season.period] || 'viridis';
}

/** Gaudete and Laetare Sundays may use rose. */
export function temporalColorAlternatives(season) {
  const rose = season.isSunday && ((season.period === 'advent' && season.periodWeek === 3)
    || (season.period === 'lent' && season.periodWeek === 4));
  return rose ? ['rosaceus'] : [];
}

/** Existing `days` identities of the temporal day. */
export function temporalDaysRef(season) {
  const mDate = moment(season.date, 'YYYY-MM-DD');
  const { period, periodWeek, dayOfWeek } = season;
  // Same daytime/psalter fallback as liturgicalDayService.withPeriodPsalterFallback.
  let psalterDayId = null;
  if (period === 'ordinary') psalterDayId = getPeriodPsalterDayDocumentId(period, periodWeek, dayOfWeek);
  else if (period !== 'christmas') psalterDayId = getOrdinaryPsalterDayDocumentId(periodWeek, dayOfWeek);
  return {
    source: 'period',
    id: getPeriodDayDocumentId(period, periodWeek, dayOfWeek),
    _periodType: period,
    _periodWeekNumber: periodWeek,
    _dayOfWeek: dayOfWeek,
    seasonalDateId: getSeasonalDateExceptionId(mDate, period) || null,
    // For 25.12, 26.12 … the fixed-date document carries the whole day.
    fixedDateOnly: isChristmasDateExceptionExclusion(mDate),
    psalterDayId: psalterDayId || null,
  };
}

/** Existing `readings` identities of the temporal day (mirrors readingsService). */
export function temporalReadingsRef(season) {
  const mDate = moment(season.date, 'YYYY-MM-DD');
  const dateOnly = isSeasonalDateException(mDate, season.period) || isChristmasDateExceptionExclusion(mDate);
  if (dateOnly) return { _date: fixedDateKey(season.date), dateOnly: true };
  return {
    _periodType: season.period,
    _periodWeekNumber: Number(season.periodWeek) === 0 ? [0, null] : season.periodWeek,
    _dayOfWeek: season.dayOfWeek,
  };
}

function candidateKind(celebration) {
  if (celebration.layer === 'override') return 'override';
  if (celebration.layer === 'local') return 'local';
  if (celebration.daysRef?.source === 'dynamic') return 'dynamic';
  return 'fixed';
}

export function celebrationCandidate(placement, status = 'active') {
  const { celebration } = placement;
  return {
    id: celebration.id,
    kind: candidateKind(celebration),
    title: celebration.title,
    rank: celebration.rank,
    rankKind: rankKind(celebration.rank),
    category: celebration.category,
    layer: celebration.layer,
    ...(celebration.dioceseId ? { dioceseId: celebration.dioceseId } : {}),
    ...(celebration.properKind ? { properKind: celebration.properKind } : {}),
    ...(celebration.localRole ? { localRole: celebration.localRole } : {}),
    ...(celebration.feastCode ? { feastCode: celebration.feastCode } : {}),
    temporal: Boolean(celebration.temporal),
    precedence: placement.precedence,
    color: celebration.color || 'albus',
    daysRef: celebration.daysRef || null,
    ...(celebration.fallbackDaysRefs ? { fallbackDaysRefs: celebration.fallbackDaysRefs } : {}),
    readingsRef: celebration.readingsRef || null,
    rules: celebration.rules || {},
    layerTrail: celebration.layerTrail || [],
    ...(celebration.inheritedFrom ? { inheritedFrom: celebration.inheritedFrom } : {}),
    ...(placement.transferredFrom ? { transferredFrom: placement.transferredFrom, transferRule: placement.transferRule } : {}),
    ...(placement.transferredTo ? { transferredTo: placement.transferredTo } : {}),
    ...(placement.movedFrom ? { movedFrom: placement.movedFrom } : {}),
    ...(placement.yearOverride ? { yearOverride: placement.yearOverride } : {}),
    order: placement.order ?? 0,
    status,
  };
}

export function temporalCandidate(season) {
  const { period, periodWeek, dayOfWeek } = season;
  return {
    id: `temporal:${period}-w${periodWeek}-d${dayOfWeek}`,
    kind: 'temporal',
    title: formatLiturgicalPeriodTitle({ periodType: period, periodWeek, dayOfWeek, date: season.date }),
    rank: season.isSunday ? 'dominica' : 'feria',
    rankKind: season.isSunday ? 'sunday' : 'weekday',
    category: 'season',
    layer: 'universal',
    temporal: true,
    precedence: temporalPrecedence(season),
    color: temporalColor(season),
    colorAlternatives: temporalColorAlternatives(season),
    daysRef: temporalDaysRef(season),
    readingsRef: temporalReadingsRef(season),
    rules: {},
    layerTrail: ['universal'],
    order: -1,
    status: 'active',
  };
}

/** Optional memorial of the BVM on Saturdays of Ordinary Time (GNLYC 15). */
export function saturdayMaryCandidate(season) {
  if (season.period !== 'ordinary' || season.dayOfWeek !== 7) return null;
  return {
    id: 'saturday-blessed-virgin-mary',
    kind: 'votive-memorial',
    title: 'Успамін Найсв. Панны Марыі ў суботу',
    rank: 'memoria-ad-libitum',
    rankKind: 'optional-memorial',
    category: 'mary',
    layer: 'universal',
    temporal: false,
    precedence: 12,
    color: 'albus',
    daysRef: { source: 'template', template: 'blessed-virgin-mary' },
    readingsRef: { common: 'blessed-virgin-mary' },
    rules: { onlyWithoutObligatoryMemorial: true },
    layerTrail: ['universal'],
    order: 10000,
    status: 'active',
  };
}

/** All candidates of `iso` from the year plan. Nothing is dropped. */
export function collectCandidates(iso, plan) {
  const season = plan.seasonOf(iso);
  const list = [temporalCandidate(season)];
  (plan.byDate.get(iso) || []).forEach((placement) => {
    list.push(celebrationCandidate(placement, placement.transferredOut ? 'transferred' : 'active'));
  });
  (plan.removedByDate.get(iso) || []).forEach((item) => {
    list.push({ ...celebrationCandidate({ ...item, precedence: 99 }, 'removed'), removalReason: item.reason });
  });
  const saturday = saturdayMaryCandidate(season);
  if (saturday) list.push(saturday);
  return { season, candidates: list };
}

/**
 * Liturgical colours use the Latin rubrical names, like `_rank`
 * (`solemnitas`, `festum` …): albus, ruber, viridis, violaceus, rosaceus, niger.
 * UI colours stay in `LITURGICAL_THEME_MAP`.
 */
export const LITURGICAL_COLORS = Object.freeze(['albus', 'ruber', 'viridis', 'violaceus', 'rosaceus', 'niger']);
