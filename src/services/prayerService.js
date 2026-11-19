import { getPrayerContent } from './prayerContentService';

export async function getSavedPrayers() { return (await getPrayerContent()).prayers; }
export const addPrayer = async (data) => (await import('./prayerStorageService')).saveStoredPrayer(null, data, true);
export const updatePrayer = async (id, data) => (await import('./prayerStorageService')).saveStoredPrayer(id, data);
export const deletePrayer = async (id) => (await import('./prayerStorageService')).removeStoredPrayer(id);
export function subscribePrayers(onData, onError) {
  let cancelled = false;
  let unsubscribe;
  import('./prayerStorageService').then(({ subscribeAdminPrayerContent }) => {
    if (cancelled) return;
    unsubscribe = subscribeAdminPrayerContent((content) => onData(content.prayers.sort((left, right) =>
      (right.createdAt?.toMillis?.() || 0) - (left.createdAt?.toMillis?.() || 0))), onError);
  }).catch((error) => { if (!cancelled) onError(error); });
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}
