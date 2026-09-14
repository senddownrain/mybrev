const KEY_PREFIX = 'mybrev:firestore-memory-cache:';

export function isFirestoreCacheError(error) {
  return error?.name === 'IndexedDbTransactionError'
    || /IndexedDB transaction .* failed/i.test(error?.message || '');
}

// Keep the workaround within this tab's session. Never delete persisted data:
// it can include pending writes as well as offline content.
export function createFirestoreCacheRecovery({ storage, reload, projectId, isOnline }) {
  const key = `${KEY_PREFIX}${projectId}`;
  let recovering = false;
  const usesMemoryCache = () => {
    try {
      return storage()?.getItem(key) === '1';
    } catch {
      return false;
    }
  };

  function recover(error) {
    if (!isFirestoreCacheError(error) || recovering || usesMemoryCache() || !isOnline()) return false;
    try {
      const sessionStorage = storage();
      if (!sessionStorage) return false;
      sessionStorage.setItem(key, '1');
      // Confirm the next page can read the flag before requesting a reload.
      if (!usesMemoryCache()) return false;
      recovering = true;
      reload();
      return true;
    } catch {
      return false;
    }
  }

  return { usesMemoryCache, recover };
}
