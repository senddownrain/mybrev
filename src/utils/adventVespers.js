import reviewed from '../data/liturgical/advent-vespers-by.json' with { type: 'json' };

/** Bridge the reviewed legacy import errors until the narrow data patch is published.
 * A subsequently edited value is preserved; only the recorded old value is replaced.
 */
export function applyReviewedAdventVespers(day) {
  const fields = reviewed.documents[day?.id];
  if (!fields) return day;
  const result = { ...day, _fieldSources: { ...day._fieldSources } };
  for (const [field, correction] of Object.entries(fields)) {
    if ((day[field] ?? null) !== correction.before) continue;
    result[field] = correction.value;
    result._fieldSources[field] = { document: day.id, field, reviewed: true };
    if (Array.isArray(result._fromDayFields)) {
      result._fromDayFields = result._fromDayFields.filter((key) => key !== field);
    }
  }
  return result;
}

export const ADVENT_VESPERS_PSALMS = ['vesperPs1', 'vesperPs2', 'vesperPs3'];
