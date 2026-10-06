/**
 * Dioceses shown together on the Ordo screen (per device). A display filter
 * only: the diocese Hours and Readings are resolved for stays the one from
 * Settings.
 */
import { ref, watch } from 'vue';
import { normalizeDioceseFilter } from './ordoScreen.js';
import { ordoDioceses, readStoredDiocese } from './ordoDiocese.js';

export const ORDO_MONTH_FILTER_STORAGE_KEY = 'ordoMonthDioceses';

/** Stored filter; `fallback: null` returns null when nothing is stored. */
export function readStoredDioceseFilter(storage = globalThis.localStorage, fallback = readStoredDiocese()) {
  try {
    const raw = storage?.getItem(ORDO_MONTH_FILTER_STORAGE_KEY);
    if (!raw && fallback === null) return null;
    return normalizeDioceseFilter(raw ? JSON.parse(raw) : null, fallback);
  } catch {
    return fallback === null ? null : normalizeDioceseFilter(null, fallback);
  }
}

// The temporary filter starts from the dioceses of Settings and follows them
// when Settings change; changing the filter never changes Settings.
export const ordoDioceseFilter = ref(readStoredDioceseFilter(globalThis.localStorage, null) || ordoDioceses.value);
watch(ordoDioceses, (list) => setOrdoDioceseFilter(list));

export function setOrdoDioceseFilter(value, storage = globalThis.localStorage) {
  ordoDioceseFilter.value = normalizeDioceseFilter(value, ordoDioceseFilter.value[0]);
  try { storage?.setItem(ORDO_MONTH_FILTER_STORAGE_KEY, JSON.stringify(ordoDioceseFilter.value)); } catch { /* Session only. */ }
  return ordoDioceseFilter.value;
}
