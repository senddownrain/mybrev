/**
 * The user's diocese for the generated Ordo (persisted per device).
 *
 * Default: Minsk–Mahilioŭ, whose calendar the app's texts were first
 * prepared from. Changing it changes which diocesan layer the engine applies
 * to Hours and Readings (and the cache keys of both).
 */
import { computed, ref } from 'vue';

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

/**
 * Diocesan context of the current route (`?diocese=pinsk`): a link from the
 * Ordo opens Hours / Readings for another diocese without changing the
 * stored setting. Empty = the user's diocese.
 */
export const routeDiocese = ref('');

export function setRouteDiocese(value) {
  routeDiocese.value = VALID.has(value) && value !== ordoDiocese.value ? value : '';
}

/** Diocese that Hours and Readings are resolved for right now. */
export const effectiveOrdoDiocese = computed(() => routeDiocese.value || ordoDiocese.value);

export const currentOrdoDiocese = () => effectiveOrdoDiocese.value;

/**
 * Route rule (pure): an explicit `?diocese=` sets the context; it stays while
 * the user moves between the Hours / Readings screens of the same date and
 * is dropped everywhere else.
 */
const CONTEXT_ROUTES = new Set([
  'SelectedDay', 'ReadingsByDate', 'oras', 'vesper', 'invitatorium', 'morning', 'laudes', 'sext', 'non', 'terz',
  'completorium', 'lectionis',
]);
const routeDate = (route) => String(route?.params?.day || route?.params?.date || '');

export function nextRouteDiocese(to, from, current = '') {
  const explicit = String(to?.query?.diocese || '');
  if (explicit) return VALID.has(explicit) ? explicit : '';
  const sameDate = routeDate(to) && routeDate(to) === routeDate(from);
  return current && CONTEXT_ROUTES.has(to?.name) && CONTEXT_ROUTES.has(from?.name) && sameDate ? current : '';
}
