/**
 * Default choice among the reading groups of one date on the Readings screen
 * (no explicit `readingId` / `dayId` / `option` in the route).
 *
 * A date that has a morning/day Mass and a separate evening or vigil Mass
 * (24.12 with the Christmas vigil Mass, Holy Thursday with the Mass of the
 * Lord's Supper, the Saturday before Pentecost with the vigil Mass) opens the
 * evening one. Documents with structured sets decide inside their sets
 * (`defaultSetId`); this rule covers legacy separate documents.
 */
export const EVENING_VARIANTS = Object.freeze(['christmas-vigil', 'pentecost-vigil', 'evening-mass']);

const isEveningGroup = (group) => (group?.documents || []).some((document) => (
  EVENING_VARIANTS.includes(String(document?._variant || '').toLowerCase())
  || document?._massReadingsRef?.set === 'vigil'
  || document?._massReadingsRef?.set === 'evening'));

export function preferredReadingGroup(groups = []) {
  if (groups.length > 1) {
    const evening = groups.find(isEveningGroup);
    if (evening) return evening;
  }
  return groups[0] || null;
}
