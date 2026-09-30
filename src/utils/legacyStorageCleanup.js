/**
 * Device settings of removed features. The keys are deleted once at start so
 * that nothing stale stays in localStorage.
 */
export const LEGACY_STORAGE_KEYS = Object.freeze([
  // Settings → «Мой касцёл» (own-church level of the Ordo, removed).
  'ordoLocalChurch',
]);

export function removeLegacyStorageKeys(storage = globalThis.localStorage) {
  LEGACY_STORAGE_KEYS.forEach((key) => {
    try { storage?.removeItem(key); } catch { /* Storage unavailable. */ }
  });
}
