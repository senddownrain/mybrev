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

// ---------------------------------------------------------------------------
// Several dioceses (Settings): Hours and Readings show the union of their
// legal options. The engine still resolves ONE diocese per call; the union
// is built on top (presentation layer). `ordoDiocese` stays the primary one
// (default context, cache keys of a single-diocese view).
// ---------------------------------------------------------------------------
export const ORDO_DIOCESES_STORAGE_KEY = 'ordoDioceses';
const ORDER = ORDO_DIOCESES.map((item) => item.value);

/** Valid, unique, in the canonical order; at least one (`fallback`). */
export function normalizeOrdoDioceses(value, fallback = DEFAULT_ORDO_DIOCESE) {
  const selected = new Set((Array.isArray(value) ? value : [value]).filter((item) => VALID.has(item)));
  const list = ORDER.filter((id) => selected.has(id));
  return list.length ? list : [normalizeOrdoDiocese(fallback)];
}

/** Stored list; an old single setting (`ordoDiocese = 'vitebsk'`) migrates to `['vitebsk']`. */
export function readStoredDioceses(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(ORDO_DIOCESES_STORAGE_KEY);
    if (raw) return normalizeOrdoDioceses(JSON.parse(raw), readStoredDiocese());
    const migrated = [readStoredDiocese()];
    storage?.setItem(ORDO_DIOCESES_STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return [readStoredDiocese()];
  }
}

export const ordoDioceses = ref(readStoredDioceses());

function persist() {
  try {
    globalThis.localStorage?.setItem(ORDO_DIOCESE_STORAGE_KEY, ordoDiocese.value);
    globalThis.localStorage?.setItem(ORDO_DIOCESES_STORAGE_KEY, JSON.stringify(ordoDioceses.value));
  } catch { /* Session-only fallback. */ }
}

/** Primary diocese; it is always one of the selected ones. */
export function setOrdoDiocese(value) {
  ordoDiocese.value = normalizeOrdoDiocese(value);
  if (!ordoDioceses.value.includes(ordoDiocese.value)) ordoDioceses.value = normalizeOrdoDioceses([...ordoDioceses.value, ordoDiocese.value]);
  persist();
}

/** The selected dioceses (minimum one); the primary stays when still selected. */
export function setOrdoDioceses(value) {
  ordoDioceses.value = normalizeOrdoDioceses(value, ordoDiocese.value);
  if (!ordoDioceses.value.includes(ordoDiocese.value)) ordoDiocese.value = ordoDioceses.value[0];
  persist();
  return ordoDioceses.value;
}

/** Add or remove one diocese; the last one cannot be removed. */
export function toggleOrdoDiocese(value) {
  const list = ordoDioceses.value.includes(value)
    ? ordoDioceses.value.filter((item) => item !== value)
    : [...ordoDioceses.value, value];
  return list.length ? setOrdoDioceses(list) : ordoDioceses.value;
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

/**
 * Dioceses Hours and Readings show right now: the route context (a link from
 * the Ordo) is one diocese; otherwise every diocese of Settings.
 */
export const effectiveOrdoDioceses = computed(() => (routeDiocese.value ? [routeDiocese.value] : ordoDioceses.value));

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
