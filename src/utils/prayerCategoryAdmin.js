export function buildPrayerTagStats(prayers = [], categories = []) {
  const stats = new Map();
  const ensureTag = (name) => {
    const normalizedName = String(name || '').trim();
    if (!normalizedName) return null;
    if (!stats.has(normalizedName)) {
      stats.set(normalizedName, { name: normalizedName, prayerCount: 0, categoryCount: 0 });
    }
    return stats.get(normalizedName);
  };

  prayers.forEach((prayer) => {
    [...new Set(prayer.tags || [])].forEach((tag) => {
      const stat = ensureTag(tag);
      if (stat) stat.prayerCount += 1;
    });
  });
  categories.forEach((category) => {
    [...new Set(category.tags || [])].forEach((tag) => {
      const stat = ensureTag(tag);
      if (stat) stat.categoryCount += 1;
    });
  });

  return [...stats.values()].sort((left, right) => (
    left.name.localeCompare(right.name, 'be', { sensitivity: 'base' })
  ));
}

export function buildPrayerTagRemovalPlan(tag, prayers = [], categories = []) {
  const normalizedTag = String(tag || '').trim();
  if (!normalizedTag) throw new Error('Тэг не пазначаны');

  const prayerUpdates = prayers
    .filter((prayer) => prayer.tags?.includes(normalizedTag))
    .map((prayer) => ({
      id: prayer.id,
      tags: prayer.tags.filter((item) => item !== normalizedTag),
    }));

  const categoryChanges = categories
    .filter((category) => category.tags?.includes(normalizedTag))
    .map((category) => {
      const tags = category.tags.filter((item) => item !== normalizedTag);
      return { id: category.id, type: tags.length ? 'update' : 'delete', tags };
    });

  return {
    tag: normalizedTag,
    prayerUpdates,
    categoryChanges,
    deletedCategories: categoryChanges.filter((change) => change.type === 'delete').length,
  };
}
