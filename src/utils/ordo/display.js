/**
 * Precedence + display resolver: PRIMARY, legal ALTERNATIVES,
 * COMMEMORATIONS and SUPPRESSED candidates.
 *
 * - A weekday is never an alternative to an obligatory memorial, a feast or
 *   a solemnity (its psalter/readings may still be used as component sources).
 * - Optional memorials are alternatives to an ordinary weekday.
 * - On privileged weekdays (17–24 Dec, Christmas octave, Lent weekdays) every
 *   memorial is only a commemoratio.
 * - On Sundays, solemnities, feasts, Ash Wednesday, Holy Week and the Easter
 *   octave memorials are omitted.
 */
import { compareCandidates } from './precedence.js';

const OBLIGATORY_MEMORIAL = (candidate) => candidate.rankKind === 'memorial';
const ANY_MEMORIAL = (candidate) => candidate.rankKind === 'memorial' || candidate.rankKind === 'optional-memorial';

/** Jesus Christ, the High and Eternal Priest (national feast, Thursday after Pentecost). */
export const CHRIST_HIGH_PRIEST_ID = 'christ-the-high-priest';

/**
 * Office kind of the chosen celebration, used by Office/Readings resolution.
 */
export function officeKindOf(candidate, season) {
  const { anchors, date } = season;
  if (candidate.kind === 'temporal' || candidate.temporal) {
    if (date === anchors.easterSunday) return 'solemnity';
    if (date >= anchors.holyThursday && date <= anchors.holySaturday) return 'triduum';
    if (candidate.id === 'pentecost') return 'solemnity';
    if (season.period === 'easter' && season.periodPhase === 'octave' && !season.isSunday) return 'easter-octave';
    if (season.isSunday) return 'sunday';
    if (season.period === 'christmas' && season.periodPhase === 'octave') return 'christmas-octave';
    return 'weekday';
  }
  if (candidate.rankKind === 'all-souls') return 'all-souls';
  if (candidate.rankKind === 'solemnity') return 'solemnity';
  if (candidate.rankKind === 'feast') return 'feast';
  if (candidate.rankKind === 'memorial') return 'memorial';
  return 'optional-memorial';
}

function suppress(candidate, reason, extra = {}) {
  return { ...candidate, role: 'suppressed', reason, ...extra };
}

export function resolveDisplay(candidates, season) {
  const appliedRules = [];
  const suppressed = [];
  const alternatives = [];
  const commemorations = [];

  candidates.filter((item) => item.status === 'transferred').forEach((item) => {
    suppressed.push(suppress(item, 'transferred', { transferredTo: item.transferredTo }));
  });
  candidates.filter((item) => item.status === 'removed').forEach((item) => {
    suppressed.push(suppress(item, item.removalReason || 'removed'));
  });

  const active = candidates.filter((item) => item.status === 'active');
  const temporal = active.find((item) => item.kind === 'temporal');
  let celebrations = active.filter((item) => item.kind !== 'temporal').sort(compareCandidates);

  const obligatory = celebrations.filter(OBLIGATORY_MEMORIAL);
  const motherChurch = obligatory.find((item) => item.id === 'mary-mother-church');
  const heartCollision = obligatory.length > 1 && obligatory.some((item) => item.id === 'immaculate-heart');
  if (motherChurch) {
    celebrations = celebrations.filter((item) => {
      if (item !== motherChurch && ANY_MEMORIAL(item)) {
        suppressed.push(suppress(item, 'mother-church-prevails'));
        return false;
      }
      return true;
    });
    appliedRules.push({ rule: 'mother-church-prevails', basis: 'CDW 24.03.2018' });
  } else if (heartCollision) {
    celebrations = celebrations.map((item) => OBLIGATORY_MEMORIAL(item)
      ? { ...item, rank: 'memoria-ad-libitum', rankKind: 'optional-memorial', precedence: 12 } : item);
    appliedRules.push({ rule: 'immaculate-heart-both-optional', basis: '2671/98/L', ids: obligatory.map((item) => item.id) });
  }

  // Optional memorials are never the primary office.
  const contender = celebrations.find((item) => item.rankKind !== 'optional-memorial' && item.id !== 'saturday-blessed-virgin-mary');
  const temporalCelebration = celebrations.find((item) => item.temporal);
  let primary;
  if (temporalCelebration) {
    primary = temporalCelebration;
  } else if (contender && contender.precedence < temporal.precedence) {
    primary = contender;
  } else {
    primary = temporal;
  }

  let officePrimary = null;
  if (primary !== temporal) {
    if (primary.temporal) {
      suppressed.push(suppress(temporal, 'merged-temporal', { mergedInto: primary.id }));
    } else if (primary.rankKind === 'memorial') {
      suppressed.push(suppress(temporal, 'weekday-under-memorial'));
      appliedRules.push({ rule: 'weekday-not-alternative-to-obligatory-memorial' });
    } else if (primary.rankKind === 'all-souls' && season.isSunday) {
      // Product rule (§11.1): All Souls on a Sunday — the Mass (and readings)
      // are of All Souls, the Liturgy of the Hours is of the Sunday. The
      // Sunday is not suppressed: it is the Office source of the day.
      officePrimary = temporal;
      appliedRules.push({ rule: 'all-souls-sunday-split', office: temporal.id, mass: primary.id, basis: 'product-decision' });
    } else {
      suppressed.push(suppress(temporal, 'outranked'));
      if (season.isSunday && temporal.precedence === 6 && primary.rankKind === 'feast') {
        appliedRules.push({ rule: 'feast-of-the-lord-replaces-sunday', id: primary.id });
      }
    }
  }

  const primaryIsPrivilegedWeekday = primary === temporal && temporal.precedence === 9;
  const primaryIsOrdinaryWeekday = primary === temporal && temporal.precedence === 13;
  const hasObligatoryMemorial = celebrations.some(OBLIGATORY_MEMORIAL);

  celebrations.forEach((candidate) => {
    if (candidate === primary) return;
    if (candidate.id === 'saturday-blessed-virgin-mary') {
      if (primaryIsOrdinaryWeekday && !hasObligatoryMemorial && !heartCollision) {
        alternatives.push({ ...candidate, role: 'alternative' });
        appliedRules.push({ rule: 'saturday-memorial-of-mary' });
      } else {
        suppressed.push(suppress(candidate, 'not-applicable'));
      }
      return;
    }
    if (candidate.rankKind === 'solemnity' || candidate.rankKind === 'all-souls') {
      suppressed.push(suppress(candidate, candidate.impededWithoutTransfer ? 'impeded-without-transfer' : 'outranked'));
      return;
    }
    if (candidate.rankKind === 'feast') {
      suppressed.push(suppress(candidate, 'impeded-omitted'));
      appliedRules.push({ rule: 'impeded-feast-omitted', id: candidate.id });
      return;
    }
    if (!ANY_MEMORIAL(candidate)) {
      suppressed.push(suppress(candidate, 'outranked'));
      return;
    }
    if (primaryIsPrivilegedWeekday) {
      commemorations.push({ ...candidate, role: 'commemoration', mode: 'commemoratio', optional: true });
      appliedRules.push({ rule: 'memorial-as-commemoration', id: candidate.id, season: season.periodPhase });
      return;
    }
    if (primaryIsOrdinaryWeekday) {
      alternatives.push({ ...candidate, role: 'alternative' });
      return;
    }
    if (primary.rankKind === 'memorial') {
      if (OBLIGATORY_MEMORIAL(candidate) && (candidate.precedence === primary.precedence)) {
        alternatives.push({ ...candidate, role: 'alternative' });
        appliedRules.push({ rule: 'concurrent-obligatory-memorials-choice', id: candidate.id });
      } else {
        suppressed.push(suppress(candidate, 'impeded-by-obligatory-memorial'));
      }
      return;
    }
    suppressed.push(suppress(candidate, 'impeded-omitted'));
  });

  const resolvedPrimary = { ...primary, role: 'primary', officeKind: officeKindOf(primary, season) };
  return {
    primary: resolvedPrimary,
    // Office (Hours) source of the day: the primary celebration, except where
    // a rule splits the Office from the Mass (All Souls on a Sunday).
    officePrimary: officePrimary
      ? { ...officePrimary, role: 'primary', officeKind: officeKindOf(officePrimary, season), officeOnly: true }
      : resolvedPrimary,
    alternatives: alternatives.map((item) => ({ ...item, officeKind: officeKindOf(item, season) })),
    commemorations,
    suppressed,
    appliedRules,
  };
}
