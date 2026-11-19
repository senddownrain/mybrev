/** Versioned cache for complete PUBLIC presentation data, never auth/admin data. */
export function createContentCache({ storage, getRevision, isOnline, onError = () => {}, maxAgeMs = Infinity, now = Date.now }) {
  const memory = new Map();
  const requests = new Map();
  const reads = new Map();

  async function restore(key) {
    if (memory.has(key)) return memory.get(key);
    if (!reads.has(key)) {
      reads.set(key, (async () => {
        try {
          const entry = await storage.get(key);
          if (entry?.complete === true && typeof entry.revision === 'string'
            && Object.hasOwn(entry, 'data') && !memory.has(key)) memory.set(key, entry);
        } catch (error) { onError(error); }
        return memory.get(key);
      })().finally(() => reads.delete(key)));
    }
    return reads.get(key);
  }

  const isFresh = (entry) => {
    if (entry?.complete !== true || entry.revision !== getRevision()) return false;
    if (!Number.isFinite(maxAgeMs)) return true;
    // Existing persisted records without fetchedAt must be revalidated once online.
    return Number.isFinite(entry.fetchedAt)
      && now() >= entry.fetchedAt && now() - entry.fetchedAt < maxAgeMs;
  };

  function refresh(key, loader) {
    const revision = getRevision();
    const requestKey = JSON.stringify([key, revision]);
    if (requests.has(requestKey)) return requests.get(requestKey);
    const request = (async () => {
      const result = await loader();
      const previous = memory.get(key);
      // Offline / partial query results must never replace a known complete day.
      if (!result.complete && previous?.complete) return { ...previous, complete: false };
      const entry = { data: result.data, complete: result.complete === true, revision, fetchedAt: now() };
      if (getRevision() === revision) {
        memory.set(key, entry);
        if (entry.complete) {
          try { await storage.set(key, entry); } catch (error) { onError(error); }
        }
      }
      return entry;
    })().finally(() => requests.delete(requestKey));
    requests.set(requestKey, request);
    return request;
  }

  async function read(key, loader, { fresh = false, revalidate = false, onCached } = {}) {
    const entry = await restore(key);
    const online = isOnline();
    // Reader screens can display a complete copy from the current publication
    // while awaiting the TTL refresh. Explicit refreshes and editors still wait.
    const usable = entry?.complete && (!online || entry.revision === getRevision());
    if (usable && !revalidate) onCached?.(entry.data);
    if (isFresh(entry) && !(revalidate && online)) return entry;
    if (entry && (!online || (!fresh && !revalidate && !Number.isFinite(maxAgeMs)))) {
      // With no TTL keep the previous stale-while-revalidate behaviour.
      // TTL-controlled public content is awaited online to avoid rendering an
      // obsolete result as though it were the final version.
      if (online) refresh(key, loader).catch(onError);
      return { ...entry, complete: false };
    }
    try {
      return await refresh(key, loader);
    } catch (error) {
      if (!entry) throw error;
      onError(error);
      return { ...entry, complete: false };
    }
  }

  return {
    read,
    peek: (key) => memory.get(key)?.data,
    peekFresh: (key) => (isFresh(memory.get(key)) ? memory.get(key).data : undefined),
    // Only for opportunistic background prefetch. Reader pages retain their
    // shorter online revalidation TTL; revisions still invalidate this check.
    hasRecentComplete: (key, ageMs) => {
      const entry = memory.get(key);
      return entry?.complete === true && entry.revision === getRevision()
        && Number.isFinite(entry.fetchedAt) && Number.isFinite(ageMs)
        && now() >= entry.fetchedAt && now() - entry.fetchedAt < ageMs;
    },
    prime: (keys) => Promise.all(keys.map(restore)),
    async keys() {
      try { return [...new Set([...memory.keys(), ...await storage.keys()])]; }
      catch (error) { onError(error); return [...memory.keys()]; }
    },
  };
}

/** One tracker per assembled result; parallel queries share this tracker only. */
export function createReadSession() {
  return {
    complete: true,
    observe(snapshot) {
      if (snapshot.metadata?.fromCache !== false || snapshot.metadata?.hasPendingWrites) {
        this.complete = false;
      }
      return snapshot;
    },
  };
}
