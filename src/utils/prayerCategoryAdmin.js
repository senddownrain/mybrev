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
  const normalizedTags = (tags) => [...new Set(
    (tags || []).map((tag) => String(tag || '').trim()).filter(Boolean),
  )];

  prayers.forEach((prayer) => {
    normalizedTags(prayer.tags).forEach((tag) => {
      const stat = ensureTag(tag);
      if (stat) stat.prayerCount += 1;
    });
  });
  categories.forEach((category) => {
    normalizedTags(category.tags).forEach((tag) => {
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
  const matchesTag = (value) => String(value || '').trim() === normalizedTag;

  const prayerUpdates = prayers
    .filter((prayer) => prayer.tags?.some(matchesTag))
    .map((prayer) => ({
      id: prayer.id,
      tags: prayer.tags.filter((item) => !matchesTag(item)),
    }));

  const categoryChanges = categories
    .filter((category) => category.tags?.some(matchesTag))
    .map((category) => {
      const tags = category.tags.filter((item) => !matchesTag(item));
      return { id: category.id, type: 'update', tags };
    });

  return {
    tag: normalizedTag,
    prayerUpdates,
    categoryChanges,
    deletedCategories: categoryChanges.filter((change) => change.type === 'delete').length,
  };
}
