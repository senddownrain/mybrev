// Offline-first selection between the bundled canonical dataset and a newer
// Firestore copy. Dependencies are injected so the policy is testable in Node.
import { validateCompendiumDataset } from './compendiumData.js';

/** A remote dataset replaces the bundle only if it is valid and strictly newer. */
export function isNewerCompendium(candidateMeta, bundledMeta) {
  return Number.isInteger(candidateMeta?.contentVersion)
    && candidateMeta.schemaVersion === bundledMeta?.schemaVersion
    && candidateMeta.contentVersion > (bundledMeta?.contentVersion ?? 0);
}

/**
 * @param {object} deps
 * @param {() => Promise<object>} deps.loadBundled  canonical dataset shipped with the app
 * @param {(loader: Function, options: object) => Promise<{data: any, complete: boolean}>} deps.readCached
 *        public content cache read (returns the last complete result when offline)
 * @param {() => Promise<{data: object|null, complete: boolean}>} deps.readRemoteMeta  compendiumMeta/current
 * @param {(meta: object) => Promise<{data: object, complete: boolean}>} deps.readRemoteDataset  full dataset for that meta
 * @param {(message: string, error?: unknown) => void} [deps.warn]
 */
export function createCompendiumLoader({ loadBundled, readCached, readRemoteMeta, readRemoteDataset, warn = () => {} }) {
  return async function loadCompendium(options = {}) {
    const bundled = await loadBundled();
    let remote = null;
    let refreshError = null;
    try {
      const entry = await readCached(async () => {
        const meta = await readRemoteMeta();
        // `null` data = "nothing newer than the bundle"; it is cached too, so
        // an up-to-date client costs one document read per content revision.
        if (!meta?.data) return { data: null, complete: Boolean(meta?.complete) };
        if (!isNewerCompendium(meta.data, bundled.meta)) return { data: null, complete: meta.complete };
        const result = await readRemoteDataset(meta.data);
        const errors = validateCompendiumDataset(result.data);
        if (errors.length) {
          warn(`Remote Compendium rejected: ${errors[0]}`);
          return { data: null, complete: result.complete };
        }
        return result;
      }, options);
      remote = entry?.data || null;
    } catch (error) {
      refreshError = error;
      warn('Compendium refresh failed; using bundled content.', error);
    }
    const dataset = remote && isNewerCompendium(remote.meta, bundled.meta) ? remote : bundled;
    return { dataset, source: dataset === bundled ? 'bundled' : 'remote', refreshError };
  };
}
