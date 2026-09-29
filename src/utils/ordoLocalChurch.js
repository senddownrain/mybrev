/**
 * The user's own church for the generated Ordo (persisted per device, next
 * to the diocese). Off by default.
 *
 * Setting shape (localStorage `ordoLocalChurch`):
 *   { enabled, titleCelebrationId, dedicationMode: 'none'|'date'|'unknown', dedicationDate: 'MM-DD' }
 *
 * `toEngineLocalChurch()` turns it into the engine's LocalChurchContext:
 * the title celebration and the dedication anniversary become proper
 * solemnities (row 4) of this church; an unknown dedication date is kept on
 * the last Sunday of October.
 */
import { ref } from 'vue';

export const ORDO_LOCAL_CHURCH_STORAGE_KEY = 'ordoLocalChurch';
export const LOCAL_CHURCH_ID = 'own-church';
export const DEDICATION_MODES = Object.freeze(['none', 'date', 'unknown']);

export const DEFAULT_LOCAL_CHURCH = Object.freeze({
  enabled: false,
  titleCelebrationId: '',
  dedicationMode: 'none',
  dedicationDate: '',
});

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** `MM-DD` (also accepts `DD.MM`) or '' when invalid. */
export function normalizeMonthDay(value) {
  const text = String(value || '').trim();
  let month;
  let day;
  if (/^\d{1,2}-\d{1,2}$/.test(text)) [month, day] = text.split('-').map(Number);
  else if (/^\d{1,2}\.\d{1,2}$/.test(text)) [day, month] = text.split('.').map(Number);
  else return '';
  if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= DAYS_IN_MONTH[month - 1])) return '';
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function normalizeLocalChurchSetting(value) {
  const source = value && typeof value === 'object' ? value : {};
  const dedicationMode = DEDICATION_MODES.includes(source.dedicationMode) ? source.dedicationMode : 'none';
  return {
    enabled: source.enabled === true,
    titleCelebrationId: typeof source.titleCelebrationId === 'string' ? source.titleCelebrationId.trim() : '',
    dedicationMode,
    dedicationDate: normalizeMonthDay(source.dedicationDate),
  };
}

/** LocalChurchContext for the engine, or null (setting off or empty). */
export function toEngineLocalChurch(setting) {
  const value = normalizeLocalChurchSetting(setting);
  if (!value.enabled) return null;
  const context = { id: LOCAL_CHURCH_ID };
  if (value.titleCelebrationId) context.titleCelebrationId = value.titleCelebrationId;
  if (value.dedicationMode === 'unknown') context.dedicationDate = 'unknown';
  else if (value.dedicationMode === 'date' && value.dedicationDate) context.dedicationDate = value.dedicationDate;
  return context.titleCelebrationId || context.dedicationDate ? context : null;
}

/** Cache-key part: '' when off, so existing offline caches stay valid. */
export function localChurchCacheKey(localChurch) {
  if (!localChurch) return '';
  return ['title', localChurch.titleCelebrationId || '', 'dedication', localChurch.dedicationDate || ''].join(':');
}

export function readStoredLocalChurch(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(ORDO_LOCAL_CHURCH_STORAGE_KEY);
    return normalizeLocalChurchSetting(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_LOCAL_CHURCH };
  }
}

export function writeStoredLocalChurch(value, storage = globalThis.localStorage) {
  const normalized = normalizeLocalChurchSetting(value);
  try {
    storage?.setItem(ORDO_LOCAL_CHURCH_STORAGE_KEY, JSON.stringify(normalized));
  } catch { /* Session-only fallback. */ }
  return normalized;
}

export const ordoLocalChurch = ref(readStoredLocalChurch());

/** Merge a partial change into the setting and persist it. */
export function setOrdoLocalChurch(patch) {
  ordoLocalChurch.value = writeStoredLocalChurch({ ...ordoLocalChurch.value, ...patch });
  return ordoLocalChurch.value;
}

/** The engine context of the current setting (null when off). */
export const currentOrdoLocalChurch = () => toEngineLocalChurch(ordoLocalChurch.value);
