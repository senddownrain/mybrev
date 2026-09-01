export function buildPrayerCategoryMenu(
  globalCategories = [],
  personalCategories = [],
  hiddenGlobalCategoryIds = [],
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

  return [...categoriesByName.values()];
}
