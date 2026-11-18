/** Public Hosting snapshot contract. No admin/priest/draft fields may reach this file. */
import { prayerAccessPolicy } from './priestPolicy.mjs';

export const PUBLIC_PRAYERS_ASSET = '/public-prayers-v1.json';
export const PUBLIC_PRAYERS_SCHEMA = 1;
export const PUBLIC_PRAYERS_KIND = 'mybrev-public-prayers';

const PRAYER_FIELDS = Object.freeze([
  'id', 'title', 'titleVersions', 'text', 'textVersions', 'textFormat', 'textFormatVersion',
  'tags', 'categoryId', 'categoryIds', 'source', 'sourceManual', 'sourceId',
  'sourceEntryId', 'copyrightNotices', 'verified', 'order', 'type', 'prayerType',
  'language', 'createdAt', 'updatedAt',
]);
const CATEGORY_FIELDS = Object.freeze([
  'id', 'name', 'parentId', 'tags', 'prayerIds', 'order', 'iconKey',
]);
const BLOCKED_STATUSES = new Set(['draft', 'pending', 'review', 'rejected', 'archived']);

function toPlain(value) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && value.__firestoreType === 'timestamp') {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  }
  if (Array.isArray(value)) return value.map(toPlain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toPlain(item)]));
  }
  return value;
}
const select = (item, fields) => Object.fromEntries(fields
  .filter((field) => Object.hasOwn(item, field))
  .map((field) => [field, toPlain(item[field])]));
const explicitlyPublic = (item) => item.priestOnly !== true && item.effectivePriestOnly !== true
  && item.published !== false && !BLOCKED_STATUSES.has(String(item.status || '').toLowerCase());

/** Takes collections available only to the trusted exporter and projects an explicit public allowlist. */
export function buildPublicPrayerCatalog({ prayers, categories, protectedCategories = [] }, publishedAt = new Date().toISOString()) {
  if (!Array.isArray(prayers) || !Array.isArray(categories) || !Array.isArray(protectedCategories)) {
    throw new Error('Public catalog export needs all three collection arrays');
  }
  const byId = (items, label) => {
    const ids = items.map((item) => item.id);
    if (ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) {
      throw new Error('Missing or repeated ' + label + ' IDs');
    }
  };
  byId(prayers, 'prayer');
  byId(categories, 'category');
  // A protected category can restrict a prayer via membership, tags or ancestry.
  const policy = prayerAccessPolicy(prayers, [...categories, ...protectedCategories]);
  const allowedPrayers = prayers.filter((prayer) => explicitlyPublic(prayer) && !policy.prayerRestricted(prayer));
  const allowedIds = new Set(allowedPrayers.map((prayer) => prayer.id));
  const allowedCategories = categories.filter((category) =>
    explicitlyPublic(category) && !policy.categoryRestricted(category.id));
  const allowedCategoryIds = new Set(allowedCategories.map((category) => category.id));
  const projectedPrayers = allowedPrayers.map((prayer) => {
    const item = select(prayer, PRAYER_FIELDS);
    if (item.categoryId && !allowedCategoryIds.has(item.categoryId)) delete item.categoryId;
    if (item.categoryIds) item.categoryIds = item.categoryIds.filter((id) => allowedCategoryIds.has(id));
    return item;
  });
  const projectedCategories = allowedCategories.map((category) => {
    const item = select(category, CATEGORY_FIELDS);
    if (item.prayerIds) item.prayerIds = item.prayerIds.filter((id) => allowedIds.has(id));
    // No private parent/category IDs in the public payload.
    if (item.parentId && !allowedCategoryIds.has(item.parentId)) throw new Error('Public category has a protected parent');
    return item;
  });
  if (!projectedPrayers.length || !projectedCategories.length) {
    throw new Error('Refusing to export an empty public prayer catalog');
  }
  const catalog = {
    kind: PUBLIC_PRAYERS_KIND,
    schemaVersion: PUBLIC_PRAYERS_SCHEMA,
    publishedAt,
    prayers: projectedPrayers,
    categories: projectedCategories,
  };
  validatePublicPrayerCatalog(catalog);
  return catalog;
}

/** Fail closed on malformed or contaminated Hosting data; never silently query Firestore. */
export function validatePublicPrayerCatalog(catalog) {
  if (!catalog || catalog.kind !== PUBLIC_PRAYERS_KIND || catalog.schemaVersion !== PUBLIC_PRAYERS_SCHEMA
    || !Array.isArray(catalog.prayers) || !Array.isArray(catalog.categories)
    || !catalog.prayers.length || !catalog.categories.length) {
    throw new Error('Invalid public prayer catalog');
  }
  const prayerFields = new Set(PRAYER_FIELDS);
  const categoryFields = new Set(CATEGORY_FIELDS);
  for (const [items, fields, name] of [
    [catalog.prayers, prayerFields, 'prayer'], [catalog.categories, categoryFields, 'category'],
  ]) {
    if (new Set(items.map((item) => item?.id)).size !== items.length) throw new Error('Duplicate public ' + name + ' IDs');
    for (const item of items) {
      if (typeof item?.id !== 'string' || !item.id || Object.keys(item).some((field) => !fields.has(field))) {
        throw new Error('Unsafe or malformed public ' + name);
      }
    }
  }
  const policy = prayerAccessPolicy(catalog.prayers, catalog.categories);
  if (catalog.prayers.some((item) => policy.prayerRestricted(item))) {
    throw new Error('Public prayer catalog contains restricted prayer');
  }
  return { prayers: catalog.prayers, categories: catalog.categories };
}
