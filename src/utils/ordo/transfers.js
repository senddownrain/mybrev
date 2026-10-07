/**
 * Permanent transfer rules (GNLYC 5, 60; Belarusian calendars "АС, 5/60").
 *
 * - A solemnity impeded by a day of higher precedence is transferred to the
 *   nearest following day that is not one of rows 1–8 of the Table.
 * - A solemnity on a Sunday of Advent, Lent or Easter goes to the Monday,
 *   unless the Monday is itself impeded (then the general rule applies).
 * - Annunciation in Holy Week or the Easter octave → Monday after the Second
 *   Sunday of Easter.
 * - St Joseph in Holy Week → anticipated to the Saturday before Palm Sunday
 *   (CDW, Notitiae 2008).
 * - Feasts and memorials that are impeded are not transferred: they are
 *   omitted (or become a commemoration, see `resolveDay.js`).
 * - A diocesan solemnity is transferred only when its solemnity rank is
 *   confirmed by a published calendar (`transfer-rank-evidence.js`).
 *
 * The algorithm computes every transfer. Its result is materialized as an
 * editable Year Override (`transferOverrides.js`); a stored transfer override
 * keeps the computed date as `computedDate` and its `effectiveDate` decides
 * where the celebration is kept (auto: = computed; manual: the user's date).
 */
import { addDays } from './dates.js';
import { celebrationPrecedence, compareCandidates, isImpedingPrecedence, rankKind } from './precedence.js';
import { rankEvidenceOf } from '../../data/ordo/transfer-rank-evidence.js';

export const SPECIAL_TRANSFER_RULES = Object.freeze([
  {
    celebrationId: 'annunciation-lord',
    id: 'annunciation-after-easter-octave',
    applies: (season) => season.period === 'holyweek'
      || (season.period === 'easter' && season.periodPhase === 'octave'),
    target: (anchors) => addDays(anchors.divineMercySunday, 1),
  },
  {
    celebrationId: 'sv-joseph',
    id: 'joseph-anticipated-before-palm-sunday',
    applies: (season) => season.period === 'holyweek',
    target: (anchors) => addDays(anchors.palmSunday, -1),
  },
]);

/** Placement → the shape `compareCandidates` expects. */
function comparable(placement) {
  return {
    precedence: placement.precedence,
    category: placement.celebration.category,
    layer: placement.celebration.layer,
    order: placement.order,
  };
}

const comparePlacements = (a, b) => compareCandidates(comparable(a), comparable(b));

function isSolemnity(celebration) {
  return rankKind(celebration.rank) === 'solemnity';
}

/** Diocesan solemnity whose transferable rank no published calendar confirms. */
export function unconfirmedDiocesanSolemnity(celebration) {
  if (celebration.layer !== 'diocese' || !celebration.dioceseId) return false;
  return !rankEvidenceOf(celebration.dioceseId, celebration.id).length;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The stored transfer override of a placement impeded on `iso`, if any. */
function overrideFor(overrides, placement, iso) {
  return overrides.find((item) => item.targetCelebrationId === placement.celebration.id
    && (!item.originalDate || item.originalDate === iso)) || null;
}

/**
 * @param {Map<string, object[]>} byDate   placements grouped by ISO date (mutated)
 * @param {(iso: string) => object} seasonOf
 * @param {(season: object) => number} basePrecedenceOf
 * @param {{ overrides?: object[] }} [options]  normalized transfer overrides of the year
 * @returns {object[]} transfer records `{ celebrationId, from, to, computedDate, rule, override? }`
 *   (`transfers.usedOverrides` lists the overrides that were applied)
 */
export function resolveTransfers(byDate, seasonOf, basePrecedenceOf, { overrides = [] } = {}) {
  const transfers = [];
  const usedOverrides = new Set();
  const strongestOn = (iso, exclude) => {
    const list = (byDate.get(iso) || []).filter((item) => item !== exclude && !item.transferredOut);
    return list.reduce((best, item) => (best === null || item.precedence < best ? item.precedence : best), null);
  };
  const isFree = (iso, placement) => {
    const season = seasonOf(iso);
    if (isImpedingPrecedence(basePrecedenceOf(season))) return false;
    const strongest = strongestOn(iso, placement);
    return strongest === null || !isImpedingPrecedence(strongest);
  };
  const nextFreeDay = (iso, placement) => {
    for (let offset = 1; offset <= 90; offset += 1) {
      const candidate = addDays(iso, offset);
      if (isFree(candidate, placement)) return candidate;
    }
    return null;
  };

  const dates = [...byDate.keys()].sort();
  dates.forEach((iso) => {
    const season = seasonOf(iso);
    const base = basePrecedenceOf(season);
    const list = (byDate.get(iso) || []).filter((item) => !item.transferredOut);
    const solemnities = list
      .filter((item) => isSolemnity(item.celebration) && !item.celebration.temporal && item.precedence >= 3)
      .sort(comparePlacements);
    solemnities.forEach((placement) => {
      const others = list.filter((item) => item !== placement && !item.transferredOut && !item.celebration.temporal);
      const beatenByBase = base < placement.precedence;
      const beatenByOther = others.some((item) => comparePlacements(item, placement) < 0);
      if (!beatenByBase && !beatenByOther) return;
      if (placement.noAutoTransfer) {
        placement.impededWithoutTransfer = true;
        return;
      }
      if (unconfirmedDiocesanSolemnity(placement.celebration)) {
        placement.impededWithoutTransfer = true;
        placement.transferBlocked = 'rank-not-source-confirmed';
        return;
      }
      const special = SPECIAL_TRANSFER_RULES
        .find((rule) => rule.celebrationId === placement.celebration.id && rule.applies(season));
      let computed = special ? special.target(season.anchors) : nextFreeDay(iso, placement);
      if (special && !isFree(computed, placement)) computed = nextFreeDay(computed, placement);
      const override = overrideFor(overrides, placement, iso);
      let target = computed;
      if (override) {
        usedOverrides.add(override);
        if (ISO.test(String(override.effectiveDate || ''))) target = override.effectiveDate;
      }
      if (!target) return;
      if (target === iso) {
        // A Year Override keeps the impeded celebration where it is (no transfer).
        placement.impededWithoutTransfer = true;
        return;
      }
      const rule = special ? special.id : (beatenByBase ? 'impeded-by-day' : 'impeded-by-celebration');
      const provenance = override ? {
        ...(override.id ? { id: override.id } : {}), source: override.source, status: override.status,
      } : null;
      placement.transferredOut = true;
      placement.transferredTo = target;
      const moved = {
        ...placement,
        transferredOut: false,
        transferredTo: undefined,
        date: target,
        transferredFrom: iso,
        transferRule: rule,
        ...(provenance ? { transferOverride: { ...provenance, computedDate: computed } } : {}),
      };
      if (!byDate.has(target)) byDate.set(target, []);
      byDate.get(target).push(moved);
      transfers.push({
        celebrationId: placement.celebration.id,
        from: iso,
        to: target,
        computedDate: computed,
        rule,
        ...(provenance ? { override: provenance } : {}),
      });
    });
  });
  Object.defineProperty(transfers, 'usedOverrides', { value: usedOverrides, enumerable: false });
  return transfers;
}

export function withPrecedence(placement) {
  return { ...placement, precedence: celebrationPrecedence(placement.celebration) };
}
