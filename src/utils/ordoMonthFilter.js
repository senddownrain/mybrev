/**
 * Dioceses shown together on the Ordo screen (per device). A display filter
 * only: the diocese Hours and Readings are resolved for stays the one from
 * Settings.
 */
import { ref } from 'vue';
import { normalizeDioceseFilter } from './ordoScreen.js';
import { readStoredDiocese } from './ordoDiocese.js';

export const ORDO_MONTH_FILTER_STORAGE_KEY = 'ordoMonthDioceses';

export function readStoredDioceseFilter(storage = globalThis.localStorage, fallback = readStoredDiocese()) {
  try {
    const raw = storage?.getItem(ORDO_MONTH_FILTER_STORAGE_KEY);
    return normalizeDioceseFilter(raw ? JSON.parse(raw) : null, fallback);
  } catch {
    return normalizeDioceseFilter(null, fallback);
  }
}

export const ordoDioceseFilter = ref(readStoredDioceseFilter());

export function setOrdoDioceseFilter(value, storage = globalThis.localStorage) {
  ordoDioceseFilter.value = normalizeDioceseFilter(value, ordoDioceseFilter.value[0]);
  try { storage?.setItem(ORDO_MONTH_FILTER_STORAGE_KEY, JSON.stringify(ordoDioceseFilter.value)); } catch { /* Session only. */ }
  return ordoDioceseFilter.value;
}
