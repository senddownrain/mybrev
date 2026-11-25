/** Public Hosting snapshot contract. No admin/priest/draft fields may reach this file. */
import { prayerAccessPolicy } from './priestPolicy.mjs';
import { hasV2ContentFields } from './accessSetsV2Policy.mjs';

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
const explicitlyPublic = (item) => !hasV2ContentFields(item) && (item.priestOnly === undefined || item.priestOnly === false)
  && (item.effectivePriestOnly === undefined || item.effectivePriestOnly === false)
  && item.published !== false && !BLOCKED_STATUSES.has(String(item.status || '').toLowerCase());

// Shared by Web, the Hosting exporter and Flutter bundle/manifest generation.
// Physical protected paths stay protected even if their payload is incomplete.
export function publicPrayerRows({
  prayers, categories, protectedCategories = [], protectedPrayers = [],
}, { legacyPrayerIds = [] } = {}) {
  const privatePrayerIds = new Set(protectedPrayers.map((item) => item.id));
  const privateCategoryIds = new Set(protectedCategories.map((item) => item.id));
  const guardedCategories = [...categories.map((item) => explicitlyPublic(item) ? item : { ...item, priestOnly: true }),
    ...protectedCategories.map((item) => ({ ...item, priestOnly: true }))];
  const policy = prayerAccessPolicy(prayers, guardedCategories);
  const allowedPrayers = prayers.filter((item) => explicitlyPublic(item)
    && !privatePrayerIds.has(item.id) && !policy.prayerRestricted(item));
  const allowedCategories = categories.filter((item) => explicitlyPublic(item)
    && !privateCategoryIds.has(item.id) && !policy.categoryRestricted(item.id));
  const prayerIds = new Set([...allowedPrayers.map((item) => item.id), ...legacyPrayerIds]);
  const categoryIds = new Set(allowedCategories.map((item) => item.id));
  return {
    prayers: allowedPrayers.map((item) => {
      const row = { ...item };
      if (row.categoryId && !categoryIds.has(row.categoryId)) delete row.categoryId;
      if (row.categoryIds) row.categoryIds = row.categoryIds.filter((id) => categoryIds.has(id));
      return row;
    }),
    categories: allowedCategories.map((item) => item.prayerIds
      ? { ...item, prayerIds: item.prayerIds.filter((id) => prayerIds.has(id)) } : item),
  };
}

/** Takes collections available only to the trusted exporter and projects an explicit public allowlist. */
export function buildPublicPrayerCatalog(collections, publishedAt = new Date().toISOString()) {
  const { prayers, categories, protectedCategories = [], protectedPrayers = [] } = collections;
  if (![prayers, categories, protectedCategories, protectedPrayers].every(Array.isArray)) {
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
  const allowed = publicPrayerRows(collections);
  const projectedPrayers = allowed.prayers.map((item) => select(item, PRAYER_FIELDS));
  const projectedCategories = allowed.categories.map((item) => select(item, CATEGORY_FIELDS));
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
  if (catalog.prayers.some((item) => policy.prayerRestricted(item))
    || catalog.categories.some((item) => policy.categoryRestricted(item.id))) {
    throw new Error('Public prayer catalog contains restricted content');
  }
  return { prayers: catalog.prayers, categories: catalog.categories };
}
