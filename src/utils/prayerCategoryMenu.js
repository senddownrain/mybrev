export function buildPrayerCategoryMenu(
  globalCategories = [],
  personalCategories = [],
  hiddenGlobalCategoryIds = [],
  permittedPrayers = null,
) {
  const hiddenIds = new Set(hiddenGlobalCategoryIds);
  const categoriesByName = new Map();

  globalCategories
    .filter((category) => !hiddenIds.has(category.id))
    .forEach((category) => {
      categoriesByName.set(category.name.toLocaleLowerCase('be'), {
        ...category,
        key: `global-${category.id}`,
        scope: 'global',
      });
    });

  personalCategories.forEach((category, index) => {
    const nameKey = category.name.toLocaleLowerCase('be');
    if (categoriesByName.has(nameKey)) return;
    categoriesByName.set(nameKey, {
      ...category,
      key: `personal-${index}-${category.name}`,
      scope: 'personal',
      personalIndex: index,
    });
  });

  const items = [...categoriesByName.values()].map((category) => {
    if (category.scope !== 'global') return category;
    const descendantIds = new Set([category.id]);
    let size;
    do {
      size = descendantIds.size;
      globalCategories.forEach((c) => { if (descendantIds.has(c.parentId)) descendantIds.add(c.id); });
    } while (size !== descendantIds.size);
    return { ...category, tags: [...new Set(globalCategories.filter((c) => descendantIds.has(c.id)).flatMap((c) => c.tags || []))] };
  });
  return permittedPrayers === null ? items : items.filter((c) => permittedPrayers.some((p) => (p.tags || []).some((t) => c.tags.includes(t))));
}
