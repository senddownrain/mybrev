import { prayerAccessPolicy } from './priestPolicy.mjs';
import { isPriestMirror, isProtectedPrayerRow } from './accessSetsV2Policy.mjs';
import { directCategoryPrayers } from './prayerCategoryMembership.mjs';
import { buildCategoryTree } from './prayerCategoryTree.mjs';

export function readerPrayerCategoryName(category) {
  if (category?.name === 'Для святара' && !category.parentId && (category.priestOnly === true
    || category.effectivePriestOnly === true || isPriestMirror(category.effectiveAccessSets))) return 'Для святароў';
  return category?.name;
}

export function prayerCollectionMenu(categories) {
  return buildCategoryTree(categories).filter((category) => !isProtectedPrayerRow(category) || !category.parentId);
}

export function buildPrayerCategoryMenu(
  globalCategories = [], personalCategories = [], hiddenGlobalCategoryIds = [], permittedPrayers = null, allowRestricted = false,
) {
  const hiddenIds = new Set(hiddenGlobalCategoryIds);
  const policy = prayerAccessPolicy(permittedPrayers || [], globalCategories);
  const globalNames = new Set();
  const items = globalCategories
    .filter((c) => !hiddenIds.has(c.id) && (permittedPrayers === null || allowRestricted || (!isProtectedPrayerRow(c) && !policy.categoryRestricted(c.id))))
    .map((c) => {
      globalNames.add(c.name.toLocaleLowerCase('be'));
      return { ...c, tags: c.tags || [], prayerIds: c.prayerIds || [], key: `global-${c.id}`, scope: 'global',
        directCount: permittedPrayers === null ? null : directCategoryPrayers(permittedPrayers, c).length };
    });
  // Keep empty folders only when they lead to visible content. Preserve each ID,
  // including same-name nodes in different branches. Personal categories stay flat.
  const visible = new Set(items.filter((c) => permittedPrayers === null || c.directCount > 0 || (allowRestricted && isProtectedPrayerRow(c))).map((c) => c.id));
  const byId = new Map(items.map((c) => [c.id, c]));
  for (const id of [...visible]) {
    let parent = byId.get(id)?.parentId;
    const seen = new Set([id]);
    while (parent && byId.has(parent) && !seen.has(parent)) {
      seen.add(parent); visible.add(parent); parent = byId.get(parent).parentId;
    }
  }
  const personal = personalCategories.flatMap((c, index) => {
    const name = c.name.toLocaleLowerCase('be');
    if (globalNames.has(name)) return [];
    globalNames.add(name);
    if (permittedPrayers !== null && !directCategoryPrayers(permittedPrayers, c).length) return [];
    return [{ ...c, parentId: null, key: `personal-${index}-${c.name}`, scope: 'personal', personalIndex: index }];
  });
  return [...items.filter((c) => visible.has(c.id)), ...personal];
}
