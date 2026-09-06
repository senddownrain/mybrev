/**
 * Returns whether a prayer belongs to a tag selection.
 * A prayer belongs when it has at least one selected tag.
 */
export function matchesPrayerTags(prayerTags, selectedTags) {
  if (!Array.isArray(selectedTags) || selectedTags.length === 0) return true;
  if (!Array.isArray(prayerTags)) return false;

  return selectedTags.some((tag) => prayerTags.includes(tag));
}
