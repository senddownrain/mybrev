/**
 * Year overrides (spec §20): one-year decisions of a published calendar that
 * no permanent rule can compute. Transfers that follow from the Table of
 * Liturgical Days (e.g. Annunciation 2027 → 5 April) are NOT listed here;
 * the engine computes them.
 *
 * Each entry follows `YearOverride` (src/utils/ordo/yearOverrides.js) and
 * cites the evidence item that proves it.
 */
export const YEAR_OVERRIDES = Object.freeze([
  {
    year: 2026,
    scope: 'diocese',
    dioceseId: 'minsk-mohilev',
    targetCelebrationId: 'sv-stanislaus-bishop-martyr',
    action: 'move',
    from: '2026-04-11',
    to: '2026-04-16',
    reason: 'St Stanislaus (11.04, Saturday in the Easter octave) kept on Thursday 16 April',
    evidence: ['minsk-mohilev:2026-04-16:c0'],
  },
  {
    year: 2027,
    scope: 'diocese',
    dioceseId: 'grodno',
    targetCelebrationId: 'sv-peter-damian',
    action: 'move',
    from: '2027-02-21',
    to: '2027-02-20',
    reason: 'Optional memorial anticipated from the II Sunday of Lent to Saturday',
    evidence: ['grodno:2027-02-20:c0'],
  },
  {
    year: 2027,
    scope: 'diocese',
    dioceseId: 'grodno',
    targetCelebrationId: 'holy-name-mary',
    action: 'move',
    from: '2027-09-12',
    to: '2027-09-11',
    reason: 'Optional memorial anticipated from Sunday to Saturday',
    evidence: ['grodno:2027-09-11:c0'],
  },
  {
    year: 2027,
    scope: 'diocese',
    dioceseId: 'grodno',
    targetCelebrationId: 'grodno-cathedral-dedication',
    action: 'move',
    from: '2027-12-04',
    to: '2027-12-06',
    reason: 'Dedication anniversary of the cathedral kept on Monday 6 December',
    evidence: ['grodno:2027-12-06:c0'],
  },
]);
