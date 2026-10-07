/**
 * Diocesan solemnities whose TRANSFERABLE rank (solemnity) is confirmed by a
 * published annual calendar (final phase §12, case A).
 *
 * A diocesan / patronal celebration is not assumed to be a solemnity because
 * it is a «patron»: the engine transfers an impeded diocesan solemnity only
 * when it is listed here with the evidence items (ids of
 * `src/data/ordo/evidence/<diocese>.json` celebrations printed with the rank
 * `solemnitas`). An unlisted one is impeded without transfer and reported for
 * review; an administrator can still move it with a manual Year Override.
 *
 * `tests/ordo-transfer-overrides.test.mjs` checks every item against the
 * evidence.
 */
export const DIOCESAN_SOLEMNITY_RANK_EVIDENCE = Object.freeze({
  'minsk-mohilev': Object.freeze({
    'our-lady-budslav': ['minsk-mohilev:2026-07-02:c0'],
  }),
  vitebsk: Object.freeze({
    'sv-josaphat': ['vitebsk:2026-11-12:c0'],
  }),
  pinsk: Object.freeze({
    'sv-andrei-bobola': ['pinsk:2026-05-16:c0'],
    'our-lady-lahishyn': ['pinsk:2026-08-22:c0'],
  }),
  grodno: Object.freeze({
    'our-lady-mother-mercy': ['grodno:2027-11-16:c0'],
  }),
});

/** Evidence ids that confirm the solemnity rank of a diocesan celebration, or []. */
export function rankEvidenceOf(dioceseId, celebrationId) {
  return [...(DIOCESAN_SOLEMNITY_RANK_EVIDENCE[dioceseId]?.[celebrationId] || [])];
}
