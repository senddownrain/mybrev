import { prayerAccessPolicy } from './priestPolicy.mjs';
export const PRAYER_STORAGE = { prayers: 'priestProtectedPrayers', prayerCategories: 'priestProtectedCategories' };
export const CONTENT_CONTROL = 'priestContentControl/state';
export const MAX_ATOMIC_CONTENT_WRITES = 400; // leaves room below 500 and 10 MiB
export function canonicalPrayerContent(collections) {
  const result = {};
  for (const [name, protectedName] of Object.entries(PRAYER_STORAGE)) {
    const seen = new Set();
    result[name === 'prayers' ? 'prayers' : 'categories'] = [
      ...(collections.get(name) || []), ...(collections.get(protectedName) || []),
    ].map((document) => {
      if (seen.has(document.id)) throw new Error(`Duplicate content ID: ${name}/${document.id}`);
      seen.add(document.id);
      return { ...document, priestOnly: document.priestOnly === true };
    });
  }
  return result;
}
export function comparablePrayerValue(value) {
  if (Array.isArray(value)) return value.map(comparablePrayerValue);
  if (value instanceof Date) return { __firestoreType: 'date', iso: value.toISOString() };
  if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function' && typeof value.seconds === 'number') return { __firestoreType: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
    if (value.firestore && typeof value.path === 'string' && typeof value.withConverter === 'function') return { __firestoreType: 'reference', path: value.path };
    if (typeof value.latitude === 'number' && typeof value.longitude === 'number' && (value.__firestoreType === 'geopoint' || typeof value.isEqual === 'function')) return { __firestoreType: 'geopoint', latitude: value.latitude, longitude: value.longitude };
    if (typeof value.toUint8Array === 'function') return { __firestoreType: 'bytes', bytes: [...value.toUint8Array()] };
    if (value instanceof Uint8Array) return { __firestoreType: 'bytes', bytes: [...value] };
    return Object.fromEntries(Object.keys(value).filter((key) => typeof value[key] !== 'function').sort().map((key) => [key, comparablePrayerValue(value[key])]));
  }
  return value;
}
function same(left, right) {
  return JSON.stringify(comparablePrayerValue(left)) === JSON.stringify(comparablePrayerValue(right));
}
export function prayerStoragePlan(collections, content = canonicalPrayerContent(collections)) {
  const policy = prayerAccessPolicy(content.prayers, content.categories);
  const desired = new Map(Object.entries(PRAYER_STORAGE).flatMap(([name, protectedName]) => [[name, []], [protectedName, []]]));
  for (const [name, items, restricted] of [
    ['prayers', content.prayers, policy.prayerRestricted],
    ['prayerCategories', content.categories, (category) => policy.categoryRestricted(category.id)],
  ]) {
    for (const item of items) {
      const closed = restricted(item);
      desired.get(closed ? PRAYER_STORAGE[name] : name).push({ ...item, priestOnly: item.priestOnly === true, effectivePriestOnly: closed });
    }
  }
  const operations = [];
  for (const [name, items] of desired) {
    const before = new Map((collections.get(name) || []).map((item) => [item.id, item]));
    const after = new Map(items.map((item) => [item.id, item]));
    for (const [id, item] of after) if (!same(item, before.get(id))) {
      const { id: _id, ...data } = item;
      operations.push({ type: 'set', collection: name, id, data });
    }
    for (const id of before.keys()) if (!after.has(id)) operations.push({ type: 'delete', collection: name, id });
  }
  return { desired, operations };
}
