import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { getPriestEditorDb } from '@/plugins/priestFirebase';
import { DEFAULT_CATEGORIES } from '@/constants/categories';
import { buildPrayerTagRemovalPlan } from '@/utils/prayerCategoryAdmin';
import { getPrayerContent } from './prayerContentService';
import { mutatePrayerContent, subscribeAdminPrayerContent } from './prayerStorageService';

export const PRAYER_CATEGORIES_COLLECTION = 'prayerCategories';
function cleanTags(tags) { return [...new Set((tags || []).map((tag) => String(tag).trim()).filter(Boolean))]; }
function categoryPayload(category) {
  return { name: String(category.name || '').trim(), priestOnly: category.priestOnly === true,
    parentId: category.parentId || null, tags: cleanTags(category.tags), order: Number.isFinite(category.order) ? category.order : Date.now() };
}
const sorted = (categories) => categories.map((item) => ({ ...item, tags: cleanTags(item.tags) })).sort((left, right) =>
  (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name, 'be', { sensitivity: 'base' }));
export async function getSavedPrayerCategories() { return sorted((await getPrayerContent()).categories); }
export function subscribePrayerCategories(onData, onError) { return subscribeAdminPrayerContent((content) => onData(sorted(content.categories)), onError); }
export async function updatePrayerCategory(id, category) {
  await mutatePrayerContent((content) => {
    if (!content.categories.some((item) => item.id === id)) throw new Error('Катэгорыя не знойдзена.');
    content.categories = content.categories.map((item) => item.id === id ? { ...item, ...categoryPayload(category), updatedAt: serverTimestamp() } : item);
  });
}
export async function createPrayerCategory(category) {
  const db = await getPriestEditorDb();
  const id = doc(collection(db, PRAYER_CATEGORIES_COLLECTION)).id;
  await mutatePrayerContent((content) => { content.categories.push({ ...categoryPayload(category), id, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); });
  return { id };
}
export async function deletePrayerCategory(id) {
  await mutatePrayerContent((content) => { content.categories = content.categories.filter((item) => item.id !== id); });
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
