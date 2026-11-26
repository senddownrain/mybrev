import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { getPriestEditorDb } from '@/plugins/priestFirebase';
import { DEFAULT_CATEGORIES } from '@/constants/categories';
import { normalizeCategoryIconKey } from '@/constants/prayerCategoryIcons';
import { buildPrayerTagRemovalPlan } from '@/utils/prayerCategoryAdmin';
import { comparePrayerCategories, validateCategoryChange, removeCategoryFromContent } from '@/utils/prayerCategoryMembership.mjs';
import { getPrayerContent } from './prayerContentService';
import { commitCanonicalCatalog, mutatePrayerContent, readCanonicalEditorContent, subscribeAdminPrayerContent, usesCanonicalCatalogWriter } from './prayerStorageService';

export const PRAYER_CATEGORIES_COLLECTION = 'prayerCategories';
function cleanTags(tags) { return [...new Set((tags || []).map((tag) => String(tag).trim()).filter(Boolean))]; }
function categoryPayload(category) {
  // iconKey is only written when it is on the allowlist; otherwise an existing stored value is left alone by the merge in update.
  const iconKey = normalizeCategoryIconKey(category.iconKey);
  return { ...(iconKey ? { iconKey } : {}), name: String(category.name || '').trim(), priestOnly: category.priestOnly === true,
    parentId: category.parentId || null, tags: cleanTags(category.tags), prayerIds: category.prayerIds || [],
    order: category.order == null ? Date.now() : Number(category.order) };
}
function canonicalCategoryPatch(category, create = false) {
  const { priestOnly, ...patch } = categoryPayload(category);
  if (category.accessSets !== undefined || (create && priestOnly)) patch.accessSets = category.accessSets ?? ['priest'];
  return patch;
}

const sorted = (categories) => categories.map((item) => ({ ...item, tags: cleanTags(item.tags), prayerIds: item.prayerIds || [] })).sort(comparePrayerCategories);
export async function getSavedPrayerCategories(publicData) { return sorted((await getPrayerContent(publicData)).categories); }
export function subscribePrayerCategories(onData, onError) { return subscribeAdminPrayerContent((content) => onData(sorted(content.categories)), onError); }
export async function updatePrayerCategory(id, category) {
  if (await usesCanonicalCatalogWriter()) {
    await commitCanonicalCatalog({ edits: [{ kind: 'categories', id, action: 'update', patch: canonicalCategoryPatch(category) }] });
    return;
  }
  if (category.accessSets !== undefined) throw new Error('Кананічны каталог недаступны. Абнавіце форму.');
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
  if (await usesCanonicalCatalogWriter()) {
    await commitCanonicalCatalog({ edits: [{ kind: 'categories', id, action: 'create', patch: canonicalCategoryPatch(category, true) }] });
    return { id };
  }
  if (category.accessSets !== undefined) throw new Error('Кананічны каталог недаступны. Абнавіце форму.');
  await mutatePrayerContent((content) => {
    const next = { ...categoryPayload(category), id, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    validateCategoryChange(next, content.categories, content.prayers);
    content.categories.push(next);
  });
  return { id };
}
export async function deletePrayerCategory(id) {
  if (await usesCanonicalCatalogWriter()) {
    await commitCanonicalCatalog({ edits: [{ kind: 'categories', id, action: 'delete' }] });
    return;
  }
  await mutatePrayerContent((content) => removeCategoryFromContent(content, id));
}
function missingDefaultCategories(categories) {
  const ids = new Set(categories.map((category) => category.id));
  const names = new Set(categories.map((category) => category.name.toLocaleLowerCase('be')));
  return DEFAULT_CATEGORIES.filter((category) => !ids.has(category.id) && !names.has(category.name.toLocaleLowerCase('be')));
}
export async function restoreDefaultPrayerCategories() {
  if (await usesCanonicalCatalogWriter()) {
    const { categories } = await readCanonicalEditorContent();
    const missing = missingDefaultCategories(categories);
    if (missing.length) await commitCanonicalCatalog({ edits: missing.map(category => ({
      kind: 'categories', id: category.id, action: 'create', patch: canonicalCategoryPatch(category, true),
    })) });
    return missing.length;
  }
  return mutatePrayerContent((content) => {
    const missing = missingDefaultCategories(content.categories);
    content.categories.push(...missing.map((category) => ({ ...categoryPayload(category), id: category.id, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })));
    return missing.length;
  });
}
export async function deletePrayerTagEverywhere(tag) {
  if (await usesCanonicalCatalogWriter()) {
    const { prayers, categories } = await readCanonicalEditorContent();
    const plan = buildPrayerTagRemovalPlan(tag, prayers, categories);
    const edits = [
      ...plan.prayerUpdates.map(({ id, tags }) => ({ kind: 'prayers', id, action: 'update', patch: { tags } })),
      ...plan.categoryChanges.map(({ id, type, tags }) => type === 'delete'
        ? { kind: 'categories', id, action: 'delete' }
        : { kind: 'categories', id, action: 'update', patch: { tags } }),
    ];
    if (edits.length) await commitCanonicalCatalog({ edits });
    return { prayers: plan.prayerUpdates.length, categories: plan.categoryChanges.length, deletedCategories: plan.deletedCategories };
  }
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
