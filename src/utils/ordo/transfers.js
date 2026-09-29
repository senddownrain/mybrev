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
 *
 * These are algorithms, never year overrides.
 */
import { addDays } from './dates.js';
import { celebrationPrecedence, compareCandidates, isImpedingPrecedence, rankKind } from './precedence.js';

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

/**
 * @param {Map<string, object[]>} byDate   placements grouped by ISO date (mutated)
 * @param {(iso: string) => object} seasonOf
 * @param {(season: object) => number} basePrecedenceOf
 * @returns {object[]} transfer records
 */
export function resolveTransfers(byDate, seasonOf, basePrecedenceOf) {
  const transfers = [];
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
      const special = SPECIAL_TRANSFER_RULES
        .find((rule) => rule.celebrationId === placement.celebration.id && rule.applies(season));
      let target = special ? special.target(season.anchors) : nextFreeDay(iso, placement);
      if (special && !isFree(target, placement)) target = nextFreeDay(target, placement);
      if (!target) return;
      placement.transferredOut = true;
      placement.transferredTo = target;
      const moved = {
        ...placement,
        transferredOut: false,
        transferredTo: undefined,
        date: target,
        transferredFrom: iso,
        transferRule: special ? special.id : (beatenByBase ? 'impeded-by-day' : 'impeded-by-celebration'),
      };
      if (!byDate.has(target)) byDate.set(target, []);
      byDate.get(target).push(moved);
      transfers.push({
        celebrationId: placement.celebration.id, from: iso, to: target, rule: moved.transferRule,
      });
    });
  });
  return transfers;
}

export function withPrecedence(placement) {
  return { ...placement, precedence: celebrationPrecedence(placement.celebration) };
}
