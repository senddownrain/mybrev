/**
 * The user's diocese for the generated Ordo (persisted per device).
 *
 * Default: Minsk–Mahilioŭ, whose calendar the app's texts were first
 * prepared from. Changing it changes which diocesan layer the engine applies
 * to Hours and Readings (and the cache keys of both).
 */
import { ref } from 'vue';

export const ORDO_DIOCESE_STORAGE_KEY = 'ordoDiocese';
export const DEFAULT_ORDO_DIOCESE = 'minsk-mohilev';

export const ORDO_DIOCESES = Object.freeze([
  { value: 'minsk-mohilev', label: 'Мінска-Магілёўская' },
  { value: 'grodno', label: 'Гродзенская' },
  { value: 'pinsk', label: 'Пінская' },
  { value: 'vitebsk', label: 'Віцебская' },
]);

const VALID = new Set(ORDO_DIOCESES.map((item) => item.value));

export function normalizeOrdoDiocese(value) {
  return VALID.has(value) ? value : DEFAULT_ORDO_DIOCESE;
}

export function readStoredDiocese() {
  try {
    return normalizeOrdoDiocese(globalThis.localStorage?.getItem(ORDO_DIOCESE_STORAGE_KEY));
  } catch {
    return DEFAULT_ORDO_DIOCESE;
  }
}

export const ordoDiocese = ref(readStoredDiocese());

export function setOrdoDiocese(value) {
  ordoDiocese.value = normalizeOrdoDiocese(value);
  try {
    globalThis.localStorage?.setItem(ORDO_DIOCESE_STORAGE_KEY, ordoDiocese.value);
  } catch { /* Session-only fallback. */ }
}

export const currentOrdoDiocese = () => ordoDiocese.value;
