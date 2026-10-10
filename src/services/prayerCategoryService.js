import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { DEFAULT_CATEGORIES } from '@/constants/categories';
import { retryFirestore } from '@/utils/retry';
import { buildPrayerTagRemovalPlan } from '@/utils/prayerCategoryAdmin';
import { requestContentRefresh } from '@/utils/publicContentCache';
import { getPrayerContent } from './prayerContentService';

export const PRAYER_CATEGORIES_COLLECTION = 'prayerCategories';
const MAX_BATCH_OPERATIONS = 400;

function categoryCollection() {
  return collection(db, PRAYER_CATEGORIES_COLLECTION);
}

function cleanTags(tags) {
  return [...new Set((tags || []).map((tag) => String(tag).trim()).filter(Boolean))];
}

function categoryPayload(category) {
  return {
    name: String(category.name || '').trim(),
    priestOnly: category.priestOnly === true,
    parentId: category.parentId || null,
    tags: cleanTags(category.tags),
    order: Number.isFinite(category.order) ? category.order : Date.now(),
  };
}

function normalizeCategories(snapshot) {
  return snapshot.docs
    .map((categoryDoc) => ({ id: categoryDoc.id, ...categoryDoc.data() }))
    .map((category) => ({ ...category, tags: cleanTags(category.tags) }))
    .sort((left, right) => (
      (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER)
      || left.name.localeCompare(right.name, 'be', { sensitivity: 'base' })
    ));
}

/** Public reading mode. Admin editors keep the real-time subscription below. */
export async function getSavedPrayerCategories() {
  return (await getPrayerContent()).categories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function updatePrayerCategory(id, category) {
  await retryFirestore(() => updateDoc(doc(db, PRAYER_CATEGORIES_COLLECTION, id), { ...categoryPayload(category), updatedAt: serverTimestamp() }));
  requestContentRefresh();
}

export function subscribePrayerCategories(onData, onError) {
  return onSnapshot(categoryCollection(), (snapshot) => {
    onData(normalizeCategories(snapshot));
  }, onError);
}

export async function createPrayerCategory(category) {
  const result = await retryFirestore(() => addDoc(categoryCollection(), {
    ...categoryPayload(category),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  requestContentRefresh();
  return result;
}

export async function deletePrayerCategory(categoryId) {
  const result = await retryFirestore(() => deleteDoc(doc(db, PRAYER_CATEGORIES_COLLECTION, categoryId)));
  requestContentRefresh();
  return result;
}

export async function restoreDefaultPrayerCategories(existingCategories = []) {
  const existingIds = new Set(existingCategories.map((category) => category.id));
  const existingNames = new Set(existingCategories
    .map((category) => String(category.name || '').toLocaleLowerCase('be')));
  const missing = DEFAULT_CATEGORIES.filter(
    (category) => !existingIds.has(category.id) && !existingNames.has(category.name.toLocaleLowerCase('be')),
  );

  if (!missing.length) return 0;

  const batch = writeBatch(db);
  missing.forEach((category) => {
    batch.set(doc(db, PRAYER_CATEGORIES_COLLECTION, category.id), {
      ...categoryPayload(category),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await retryFirestore(() => batch.commit());
  requestContentRefresh();
  return missing.length;
}

async function commitOperations(operations) {
  for (let offset = 0; offset < operations.length; offset += MAX_BATCH_OPERATIONS) {
    const batch = writeBatch(db);
    operations.slice(offset, offset + MAX_BATCH_OPERATIONS).forEach((operation) => {
      const reference = doc(db, operation.collection, operation.id);
      if (operation.type === 'delete') batch.delete(reference);
      else batch.update(reference, operation.data);
    });
    await retryFirestore(() => batch.commit());
  }
  if (operations.length) requestContentRefresh();
}

export async function deletePrayerTagEverywhere(tag, prayers, categories) {
  const plan = buildPrayerTagRemovalPlan(tag, prayers, categories);
  const operations = plan.prayerUpdates.map((prayer) => ({
    type: 'update',
    collection: 'prayers',
    id: prayer.id,
    data: {
      tags: prayer.tags,
      updatedAt: serverTimestamp(),
    },
  }));

  plan.categoryChanges.forEach((category) => {
    if (category.type === 'update') {
      operations.push({
        type: 'update',
        collection: PRAYER_CATEGORIES_COLLECTION,
        id: category.id,
        data: { tags: category.tags, updatedAt: serverTimestamp() },
      });
    } else {
      operations.push({
        type: 'delete',
        collection: PRAYER_CATEGORIES_COLLECTION,
        id: category.id,
      });
    }
  });

  await commitOperations(operations);
  return {
    prayers: plan.prayerUpdates.length,
    categories: plan.categoryChanges.length,
    deletedCategories: plan.deletedCategories,
  };
}
