/** Shared policy for existing tag categories and optional explicit parent links. */
export function prayerAccessPolicy(_prayers = [], categories = []) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const restrictions = new Map();
  function categoryRestricted(id, visiting = new Set()) {
    if (restrictions.has(id)) return restrictions.get(id);
    const category = byId.get(id);
    // Broken links and cycles fail closed; admin can repair without losing flags.
    if (!category || visiting.has(id)) return true;
    const next = new Set(visiting).add(id);
    const restricted = category.priestOnly === true
      || Boolean(category.parentId && categoryRestricted(category.parentId, next));
    restrictions.set(id, restricted);
    return restricted;
  }
  const restrictedTags = new Set(categories.filter((c) => categoryRestricted(c.id)).flatMap((c) => c.tags || []));
  function prayerRestricted(prayer) {
    return prayer.priestOnly === true
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
    if (permitted.some((p) => (c.tags || []).some((tag) => (p.tags || []).includes(tag))
      || p.categoryId === c.id || (p.categoryIds || []).includes(c.id))) nonempty.add(c.id);
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
