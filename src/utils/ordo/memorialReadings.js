/**
 * Readings of memorials (obligatory and optional): ONE rule for the web and
 * the Flutter app.
 *
 *   default            the weekday readings (GIRM 357; Lectionary Introduction,
 *                      OLM 83: readings of the day are used on memorials);
 *   proper-prescribed  the Lectionary assigns PROPER readings (not merely
 *                      «specially chosen») to the memorial: they replace the
 *                      weekday readings. Only where the Lectionary says so:
 *                      this list is closed and source-confirmed;
 *   alternatives       the memorial's own readings and the Common are legal
 *                      alternatives where allowed (never forced, never lost).
 *
 * Sources: Ordo Lectionum Missae, Praenotanda 83; GIRM 355, 357; the Proper of
 * Saints of the Roman Lectionary as tabulated in the US Lectionary 2002 (proper
 * vs «specially chosen, not proper»: https://www.catholic-resources.org/Lectionary/2002USL-Sanctoral.htm);
 * USCCB calendar notes («exceptions: memorials with proper readings, usually
 * only the Gospel»). Each entry was checked against the Catholic.by page of the
 * Belarusian Lectionary (same citations).
 *
 * A prescription can concern only one part (`parts`): the Lectionary assigns
 * the Gospel (or the first reading) and the rest may come from the weekday or
 * from the Proper of Saints. The app opens the memorial's own set, which
 * contains the prescribed part; the weekday group stays a selectable
 * alternative (a «mixed» weekday + proper Gospel view is an owner option).
 */
export const PRESCRIBED_PROPER_MEMORIALS = Object.freeze({
  'holy-name-of-jesus': { date: '03.01', parts: ['reading1', 'gospel'], rank: 'optional-memorial', note: 'Lk 2, 21-24' },
  'sv-timothy-titus': { date: '26.01', parts: ['reading1'], rank: 'memorial', note: '2 Tim 1, 1-8 / Tit 1, 1-5' },
  'sv-joseph-worker': { date: '01.05', parts: ['gospel'], rank: 'optional-memorial', note: 'Mt 13, 54-58' },
  'sv-barnabas': { date: '11.06', parts: ['reading1'], rank: 'memorial', note: 'Dz 11, 21b-26; 13, 1-3' },
  'sv-martha': { date: '29.07', parts: ['gospel'], rank: 'memorial', note: 'Jn 11, 19-27 / Lk 10, 38-42' },
  'beheading-john-baptist': { date: '29.08', parts: ['gospel'], rank: 'memorial', note: 'Mk 6, 17-29' },
  'our-lady-sorrows': { date: '15.09', parts: ['gospel', 'sequence'], rank: 'memorial', note: 'Jn 19, 25-27 / Lk 2, 33-35' },
  'holy-guardian-angels': { date: '02.10', parts: ['gospel'], rank: 'memorial', note: 'Mt 18, 1-5. 10' },
  'dedication-basilicas-peter-paul': { date: '18.11', parts: ['reading1', 'gospel'], rank: 'optional-memorial', note: 'Dz 28, 11-16. 30-31; Mt 14, 22-33' },
  'mary-mother-church': { date: 'Monday after Pentecost', parts: ['reading1', 'gospel'], rank: 'memorial', note: 'Hen 3, 9-15. 20 / Jn 19, 25-34' },
  'immaculate-heart': { date: 'Saturday after the 2nd Sunday after Pentecost', parts: ['gospel'], rank: 'optional-memorial', note: 'Lk 2, 41-51' },
});

export const MEMORIAL_KINDS = Object.freeze(['memorial', 'optional-memorial']);

/** `{ mode, parts }` for a memorial option; non-memorials have no rule. */
export function memorialReadingsRule(optionId, officeKind, diocese = '') {
  if (!MEMORIAL_KINDS.includes(officeKind)) return null;
  const entry = PRESCRIBED_PROPER_MEMORIALS[optionId];
  const prescribed = entry && (!entry.dioceses || entry.dioceses.includes(diocese)) ? entry : null;
  return prescribed
    ? { mode: 'proper-prescribed', defaultPurpose: 'proper', parts: [...prescribed.parts] }
    : { mode: 'weekday-default', defaultPurpose: 'weekday', parts: [] };
}
