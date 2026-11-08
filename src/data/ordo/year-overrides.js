/**
 * Year overrides (spec §20): one-year decisions of a published calendar that
 * no permanent rule can compute. Transfers that follow from the Table of
 * Liturgical Days (e.g. Annunciation 2027 → 5 April) are NOT listed here:
 * the engine computes them and `npm run ordo:materialize-transfers` writes
 * them to `liturgicalYearOverrides` as editable auto records (final phase §12).
 *
 * Each entry follows the canonical `YearOverride` (src/utils/ordo/yearOverrides.js:
 * `originalDate` / `effectiveDate`, `source`, `status`; `from` / `to` are
 * mirrors for older app builds) and cites the evidence item that proves it.
 */
export const YEAR_OVERRIDES = Object.freeze([
  {
    year: 2026,
    scope: 'diocese',
    dioceseId: 'minsk-mohilev',
    targetCelebrationId: 'sv-stanislaus-bishop-martyr',
    action: 'move',
    originalDate: '2026-04-11',
    effectiveDate: '2026-04-16',
    from: '2026-04-11',
    to: '2026-04-16',
    reason: 'St Stanislaus (11.04, Saturday in the Easter octave) kept on Thursday 16 April',
    source: 'manual',
    status: 'confirmed',
    enabled: false, // Owner decision 2026-11-06: retain reference, cancel manual move.
    evidence: ['minsk-mohilev:2026-04-16:c0'],
  },
  {
    year: 2027,
    scope: 'diocese',
    dioceseId: 'grodno',
    targetCelebrationId: 'sv-peter-damian',
    action: 'move',
    originalDate: '2027-02-21',
    effectiveDate: '2027-02-20',
    from: '2027-02-21',
    to: '2027-02-20',
    reason: 'Optional memorial anticipated from the II Sunday of Lent to Saturday',
    source: 'manual',
    status: 'confirmed',
    enabled: false, // Owner decision 2026-11-06: retain reference, cancel manual move.
    evidence: ['grodno:2027-02-20:c0'],
  },
  {
    year: 2027,
    scope: 'diocese',
    dioceseId: 'grodno',
    targetCelebrationId: 'holy-name-mary',
    action: 'move',
    originalDate: '2027-09-12',
    effectiveDate: '2027-09-11',
    from: '2027-09-12',
    to: '2027-09-11',
    reason: 'Optional memorial anticipated from Sunday to Saturday',
    source: 'manual',
    status: 'confirmed',
    enabled: false, // Owner decision 2026-11-06: retain reference, cancel manual move.
    evidence: ['grodno:2027-09-11:c0'],
  },
  {
    year: 2027,
    scope: 'diocese',
    dioceseId: 'grodno',
    targetCelebrationId: 'grodno-cathedral-dedication',
    action: 'move',
    originalDate: '2027-12-04',
    effectiveDate: '2027-12-06',
    from: '2027-12-04',
    to: '2027-12-06',
    reason: 'Dedication anniversary of the cathedral kept on Monday 6 December',
    source: 'manual',
    status: 'confirmed',
    enabled: false, // Owner decision 2026-11-06: retain reference, cancel manual move.
    evidence: ['grodno:2027-12-06:c0'],
  },
]);
