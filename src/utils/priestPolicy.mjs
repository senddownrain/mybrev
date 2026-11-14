import { prayerCategoryMatch, MAX_CATEGORY_DEPTH } from './prayerCategoryMembership.mjs';
/** Shared policy for tag, manual and legacy membership. Restriction always wins. */
export function prayerAccessPolicy(_prayers = [], categories = []) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const restrictions = new Map();
  function categoryRestricted(id) {
    if (restrictions.has(id)) return restrictions.get(id);
    const seen = new Set();
    let current = byId.get(id);
    let restricted = false;
    // Inspect the whole bounded path: a cached parent must not bypass depth.
    while (true) {
      if (!current || seen.has(current.id) || seen.size >= MAX_CATEGORY_DEPTH) { restricted = true; break; }
      seen.add(current.id);
      if (current.priestOnly === true) { restricted = true; break; }
      if (!current.parentId) break;
      current = byId.get(current.parentId);
    }
    restrictions.set(id, restricted);
    return restricted;
  }
  const restrictedTags = new Set(categories.filter((c) => categoryRestricted(c.id)).flatMap((c) => c.tags || []));
  const restrictedPrayerIds = new Set(categories.filter((c) => categoryRestricted(c.id)).flatMap((c) => c.prayerIds || []));
  function prayerRestricted(prayer) {
    return prayer.priestOnly === true
      || restrictedPrayerIds.has(prayer.id)
      || (prayer.tags || []).some((tag) => restrictedTags.has(tag))
      || [prayer.categoryId, ...(prayer.categoryIds || [])].filter(Boolean).some((id) => categoryRestricted(id));
  }
  return { categoryRestricted, prayerRestricted };
}

export function permittedPrayerContent(prayers, categories, priest = false) {
  const policy = prayerAccessPolicy(prayers, categories);
  const permitted = prayers.filter((p) => priest || !policy.prayerRestricted(p))
    .map((p) => ({ ...p, effectivePriestOnly: policy.prayerRestricted(p) }));
  const nonempty = new Set();
  for (const c of categories) {
    if (!priest && policy.categoryRestricted(c.id)) continue;
    if (permitted.some((p) => prayerCategoryMatch(p, c).matches)) nonempty.add(c.id);
  }
  // Keep ancestors of visible descendants, including grouping categories without tags.
  for (const id of [...nonempty]) {
    const seen = new Set([id]);
    let parent = categories.find((c) => c.id === id)?.parentId;
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      if (!priest && policy.categoryRestricted(parent)) break;
      nonempty.add(parent);
      parent = categories.find((c) => c.id === parent)?.parentId;
    }
  }
  return { prayers: permitted, categories: categories.filter((c) => nonempty.has(c.id))
    .map((c) => ({ ...c, effectivePriestOnly: policy.categoryRestricted(c.id) })) };
}
