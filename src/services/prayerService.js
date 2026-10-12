import { getPrayerContent } from './prayerContentService';
import { removeStoredPrayer, saveStoredPrayer, subscribeAdminPrayerContent } from './prayerStorageService';

export async function getSavedPrayers() { return (await getPrayerContent()).prayers; }
export const addPrayer = (data) => saveStoredPrayer(null, data, true);
export const updatePrayer = (id, data) => saveStoredPrayer(id, data);
export const deletePrayer = (id) => removeStoredPrayer(id);
export function subscribePrayers(onData, onError) {
  return subscribeAdminPrayerContent((content) => onData(content.prayers.sort((left, right) =>
    (right.createdAt?.toMillis?.() || 0) - (left.createdAt?.toMillis?.() || 0))), onError);
}
