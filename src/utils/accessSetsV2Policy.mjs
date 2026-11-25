import { ACCESS_SET_ID } from './accessSetsV2Code.mjs';
import { MAX_CATEGORY_DEPTH, prayerCategoryMatch } from './prayerCategoryMembership.mjs';

export const V2_CONTENT_FIELDS = Object.freeze(['accessSchemaVersion', 'accessSets', 'effectiveAccessSets', 'contentHash']);
export const hasV2ContentFields = (row) => V2_CONTENT_FIELDS.some((field) => Object.hasOwn(row, field));
export const isProtectedPrayerRow = (row) => Boolean(row && (row.priestOnly === true
  || row.effectivePriestOnly === true || hasV2ContentFields(row)));

// Also used by the reader before constructing an SDK document reference.
export function validCatalogId(id) {
  return typeof id === 'string' && id.length > 0 && id !== '.' && id !== '..'
    && !id.includes('/') && !/^__.*__$/su.test(id) && !/[\uD800-\uDFFF]/u.test(id)
    && new globalThis.TextEncoder().encode(id).length <= 1500;
}

export function validAccessSetList(sets) {
  return Array.isArray(sets) && [...sets].every((id) => typeof id === 'string' && ACCESS_SET_ID.test(id))
    && new Set(sets).size === sets.length;
}

export function catalogError(code) {
  return Object.assign(new Error(code), { code });
}

const fail = (code) => { throw catalogError(code); };
const intersect = (left, right) => {
  if (!left) return right;
  if (!right) return left;
  const result = left.filter((id) => right.includes(id));
  if (!result.length) fail('incompatible-access-sets');
  return result;
};

function list(value, validate) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(validate)) fail('invalid-membership');
  return value;
}

function uniqueRows(rows) {
  const byId = new Map();
  for (const row of rows) {
    if (!validCatalogId(row?.id) || byId.has(row.id)) fail('invalid-or-duplicate-content-id');
    byId.set(row.id, row);
  }
  return byId;
}

// null is unrestricted. [] is a valid own declaration (inherit only), never
// a valid result of intersecting two protected constraints.
export function evaluateAccessSets({ prayers, categories }, activeSets) {
  const byId = uniqueRows(categories);
  const prayerById = uniqueRows(prayers);
  const categorySets = new Map();
  const prayerSets = new Map();
  const byTag = new Map();
  const byPrayer = new Map();
  function attach(map, key, category) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(category);
  }
  function own(row) {
    if (row.priestOnly !== undefined && typeof row.priestOnly !== 'boolean') fail('invalid-legacy-visibility');
    const sets = row.accessSets === undefined ? [] : row.accessSets;
    if (!validAccessSetList(sets)) fail('invalid-access-sets');
    if (sets.length && row.priestOnly === true && !(sets.length === 1 && sets[0] === 'priest')) {
      fail('conflicting-legacy-visibility');
    }
    const declared = sets.length ? [...sets].sort() : row.priestOnly === true ? ['priest'] : null;
    if (declared?.some((id) => !activeSets.has(id))) fail('inactive-or-unknown-access-set');
    return declared;
  }
  for (const category of categories) {
    for (const tag of list(category.tags, (v) => typeof v === 'string')) attach(byTag, tag, category.id);
    for (const id of list(category.prayerIds, validCatalogId)) {
      if (!prayerById.has(id)) fail('unknown-prayer-membership');
      attach(byPrayer, id, category.id);
    }
    const seen = new Set();
    let current = category;
    let effective = null;
    while (current) {
      if (seen.has(current.id) || seen.size >= MAX_CATEGORY_DEPTH) fail('invalid-category-ancestry');
      seen.add(current.id);
      effective = intersect(effective, own(current));
      if (noCategory(current.parentId)) break;
      current = byId.get(current.parentId);
      if (!current) fail('unknown-parent-category');
    }
    categorySets.set(category.id, effective);
  }
  for (const prayer of prayers) {
    const ids = new Set([
      ...(noCategory(prayer.categoryId) ? [] : [prayer.categoryId]),
      ...list(prayer.categoryIds, validCatalogId),
      ...(byPrayer.get(prayer.id) || []),
      ...list(prayer.tags, (v) => typeof v === 'string').flatMap((tag) => byTag.get(tag) || []),
    ]);
    let effective = own(prayer);
    for (const id of ids) {
      if (!categorySets.has(id)) fail('unknown-prayer-category');
      effective = intersect(effective, categorySets.get(id));
    }
    prayerSets.set(prayer.id, effective);
  }
  return { prayers: prayerSets, categories: categorySets };
}

export const noCategory = (id) => id === undefined || id === null || id === '';
export const isPriestMirror = (sets) => sets?.length === 1 && sets[0] === 'priest';

export function permittedCanonicalRow(row, setIds) {
  return Boolean(row?.accessSchemaVersion === 2 && validAccessSetList(row.accessSets)
    && validAccessSetList(row.effectiveAccessSets) && typeof row.contentHash === 'string' && /^[a-f0-9]{64}$/.test(row.contentHash)
    && ['tags', 'prayerIds', 'categoryIds'].every((key) => row[key] === undefined
      || (Array.isArray(row[key]) && row[key].every((value) => typeof value === 'string')))
    && (row.priestOnly !== true || isPriestMirror(row.effectiveAccessSets))
    && row.effectiveAccessSets.some((set) => setIds.includes(set))
    && (!row.accessSets.length || row.effectiveAccessSets.every((set) => row.accessSets.includes(set))));
}

// The server already enforced effectiveAccessSets. An incomplete or inconsistent
// index must not turn a closed orphan, hidden parent or stale public twin into UI.
export function assembleCanonicalCatalog(publicData, protectedData) {
  const categories = new Map(publicData.categories.map((row) => [row.id, row]));
  for (const row of protectedData.categories) categories.set(row.id, row);
  function validAncestry(row) {
    const seen = new Set();
    let current = row;
    while (current) {
      if (seen.has(current.id) || seen.size >= MAX_CATEGORY_DEPTH) return false;
      seen.add(current.id);
      if (noCategory(current.parentId)) return true;
      const parent = categories.get(current.parentId);
      if (parent?.effectiveAccessSets && (!current.effectiveAccessSets
        || !current.effectiveAccessSets.every((set) => parent.effectiveAccessSets.includes(set)))) return false;
      current = parent;
    }
    return false;
  }
  const visibleCategories = [...categories.values()].filter(validAncestry);
  const visibleIds = new Set(visibleCategories.map((row) => row.id));
  const prayers = new Map(publicData.prayers.map((row) => [row.id, row]));
  for (const row of protectedData.prayers) prayers.set(row.id, row);
  const visiblePrayers = [...prayers.values()].filter((row) => {
    if (row.categoryIds !== undefined && !Array.isArray(row.categoryIds)) return false;
    const ids = [row.categoryId, ...(row.categoryIds || [])].filter((id) => !noCategory(id));
    if (ids.some((id) => !visibleIds.has(id))) return false;
    return visibleCategories.every((category) => !category.effectiveAccessSets
      || !prayerCategoryMatch(row, category).matches
      || row.effectiveAccessSets?.every((set) => category.effectiveAccessSets.includes(set)));
  });
  const populated = new Set();
  for (const row of visibleCategories) {
    if (!visiblePrayers.some((prayer) => prayerCategoryMatch(prayer, row).matches)) continue;
    for (let current = row; current && !populated.has(current.id); current = categories.get(current.parentId)) {
      populated.add(current.id);
    }
  }
  return { prayers: visiblePrayers, categories: visibleCategories.filter((row) => populated.has(row.id)) };
}
