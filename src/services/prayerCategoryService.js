import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { getPriestEditorDb } from '@/plugins/priestFirebase';
import { DEFAULT_CATEGORIES } from '@/constants/categories';
import { normalizeCategoryIconKey } from '@/constants/prayerCategoryIcons';
import { buildPrayerTagRemovalPlan } from '@/utils/prayerCategoryAdmin';
import { comparePrayerCategories, validateCategoryChange, removeCategoryFromContent } from '@/utils/prayerCategoryMembership.mjs';
import { getPrayerContent } from './prayerContentService';
import { mutatePrayerContent, subscribeAdminPrayerContent } from './prayerStorageService';

export const PRAYER_CATEGORIES_COLLECTION = 'prayerCategories';
function cleanTags(tags) { return [...new Set((tags || []).map((tag) => String(tag).trim()).filter(Boolean))]; }
function categoryPayload(category) {
  // iconKey is only written when it is on the allowlist; otherwise an existing stored value is left alone by the merge in update.
  const iconKey = normalizeCategoryIconKey(category.iconKey);
  return { ...(iconKey ? { iconKey } : {}), name: String(category.name || '').trim(), priestOnly: category.priestOnly === true,
    parentId: category.parentId || null, tags: cleanTags(category.tags), prayerIds: category.prayerIds || [],
    order: category.order == null ? Date.now() : Number(category.order) };
}
const sorted = (categories) => categories.map((item) => ({ ...item, tags: cleanTags(item.tags), prayerIds: item.prayerIds || [] })).sort(comparePrayerCategories);
export async function getSavedPrayerCategories(publicData) { return sorted((await getPrayerContent(publicData)).categories); }
export function subscribePrayerCategories(onData, onError) { return subscribeAdminPrayerContent((content) => onData(sorted(content.categories)), onError); }
export async function updatePrayerCategory(id, category) {
  await mutatePrayerContent((content) => {
    const old = content.categories.find((item) => item.id === id);
    if (!old) throw new Error('Катэгорыя не знойдзена.');
    const next = { ...old, ...categoryPayload({ ...old, ...category }), id, updatedAt: serverTimestamp() };
    validateCategoryChange(next, content.categories, content.prayers);
    content.categories = content.categories.map((item) => item.id === id ? next : item);
  });
}
export async function createPrayerCategory(category) {
  const db = await getPriestEditorDb();
  const id = doc(collection(db, PRAYER_CATEGORIES_COLLECTION)).id;
  await mutatePrayerContent((content) => {
    const next = { ...categoryPayload(category), id, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    validateCategoryChange(next, content.categories, content.prayers);
    content.categories.push(next);
  });
  return { id };
}
export async function deletePrayerCategory(id) {
  await mutatePrayerContent((content) => removeCategoryFromContent(content, id));
}
export async function restoreDefaultPrayerCategories() {
  return mutatePrayerContent((content) => {
    const existingIds = new Set(content.categories.map((category) => category.id));
    const existingNames = new Set(content.categories.map((category) => category.name.toLocaleLowerCase('be')));
    const missing = DEFAULT_CATEGORIES.filter((category) => !existingIds.has(category.id) && !existingNames.has(category.name.toLocaleLowerCase('be')));
    content.categories.push(...missing.map((category) => ({ ...categoryPayload(category), id: category.id, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })));
    return missing.length;
  });
}
export async function deletePrayerTagEverywhere(tag) {
  return mutatePrayerContent((content) => {
    const plan = buildPrayerTagRemovalPlan(tag, content.prayers, content.categories);
    const prayerUpdates = new Map(plan.prayerUpdates.map((item) => [item.id, item]));
    const categoryChanges = new Map(plan.categoryChanges.map((item) => [item.id, item]));
    content.prayers = content.prayers.map((item) => prayerUpdates.has(item.id) ? { ...item, tags: prayerUpdates.get(item.id).tags, updatedAt: serverTimestamp() } : item);
    content.categories = content.categories.filter((item) => categoryChanges.get(item.id)?.type !== 'delete')
      .map((item) => categoryChanges.has(item.id) ? { ...item, tags: categoryChanges.get(item.id).tags, updatedAt: serverTimestamp() } : item);
    return { prayers: plan.prayerUpdates.length, categories: plan.categoryChanges.length, deletedCategories: plan.deletedCategories };
  });
}
