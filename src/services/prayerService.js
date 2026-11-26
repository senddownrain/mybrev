import { getPrayerContent } from './prayerContentService';

export async function getSavedPrayers(publicData) { return (await getPrayerContent(publicData)).prayers; }
export const addPrayer = async (data) => (await import('./prayerStorageService')).saveStoredPrayer(null, data, true);
export const updatePrayer = async (id, data) => (await import('./prayerStorageService')).saveStoredPrayer(id, data);
export const deletePrayer = async (id) => (await import('./prayerStorageService')).removeStoredPrayer(id);
