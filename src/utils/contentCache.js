/** Versioned cache for complete PUBLIC presentation data, never auth/admin data. */
export function createContentCache({ storage, getRevision, isOnline, onError = () => {}, maxAgeMs = Infinity, now = Date.now }) {
  const memory = new Map();
  const requests = new Map();
  const reads = new Map();

  async function restore(key, options) {
    if (memory.get(key)?.complete) return memory.get(key);
    if (!reads.has(key)) {
      reads.set(key, (async () => {
        try {
          const entry = await storage.get(key, options);
          if (entry?.complete === true && typeof entry.revision === 'string'
            && Object.hasOwn(entry, 'data') && !memory.get(key)?.complete) memory.set(key, entry);
        } catch (error) { onError(error); }
        return memory.get(key);
      })().finally(() => reads.delete(key)));
    }
    return reads.get(key);
  }

  const isFresh = (entry, ageMs = maxAgeMs) => {
    if (entry?.complete !== true || entry.revision !== getRevision()) return false;
    if (!Number.isFinite(ageMs)) return true;
    // Existing persisted records without fetchedAt must be revalidated once online.
    return Number.isFinite(entry.fetchedAt)
      && now() >= entry.fetchedAt && now() - entry.fetchedAt < ageMs;
  };

  function refresh(key, loader) {
    const revision = getRevision();
    const requestKey = JSON.stringify([key, revision]);
    if (requests.has(requestKey)) return requests.get(requestKey);
    const request = (async () => {
      const previous = memory.get(key);
      const result = await loader(previous, revision);
      // Offline / partial query results must never replace a known complete day.
      if (!result.complete && previous?.complete) return { ...previous, complete: false };
      const entry = { ...result, complete: result.complete === true, revision, fetchedAt: now() };
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

  async function read(key, loader, {
    fresh = false, revalidate = false, onCached, onUpdated, revalidateInBackground,
    maxAge = maxAgeMs, legacyKey, acceptCached = () => true,
  } = {}) {
    const usableEntry = async (cacheKey) => {
      const stored = await restore(cacheKey, { preferExisting: Boolean(revalidateInBackground) && !revalidate });
      return stored && acceptCached(stored) ? stored : undefined;
    };
    const current = await usableEntry(key);
    const entry = current?.complete || !legacyKey ? current : (await usableEntry(legacyKey) || current);
    const online = isOnline();
    if (entry?.complete && revalidateInBackground && !revalidate) {
      onCached?.(entry.data);
      if (online && !isFresh(entry, maxAge)) {
        revalidateInBackground(() => refresh(key, loader).then((updated) => {
          if (updated.complete && updated.data !== entry.data) onUpdated?.(updated.data);
        }).catch(onError));
      }
      return entry;
    }
    // Reader screens can display a complete copy from the current publication
    // while awaiting the TTL refresh. Explicit refreshes and editors still wait.
    const usable = entry?.complete && (!online || entry.revision === getRevision());
    if (usable && !revalidate) onCached?.(entry.data);
    if (isFresh(entry, maxAge) && !(revalidate && online)) return entry;
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
      if (!entry || revalidate) throw error;
      onError(error);
      return { ...entry, complete: false };
    }
  }

  return {
    read,
    peek: (key) => memory.get(key)?.data,
    peekFresh: (key, ageMs) => (isFresh(memory.get(key), ageMs) ? memory.get(key).data : undefined),
    hasComplete: (key, accept = () => true) => {
      const entry = memory.get(key);
      return entry?.complete === true && accept(entry);
    },
    prime: (keys, options) => Promise.all(keys.map((key) => restore(key, options))),
    async keys() {
      try { return [...new Set([...memory.keys(), ...await storage.keys()])]; }
      catch (error) { onError(error); return [...memory.keys()]; }
    },
  };
}

/** One tracker per assembled result; parallel queries share this tracker only. */
export function createReadSession(deadline = Date.now() + 10000) {
  return {
    complete: true,
    deadline,
    observe(snapshot) {
      if (snapshot.metadata?.fromCache !== false || snapshot.metadata?.hasPendingWrites) {
        this.complete = false;
      }
      return snapshot;
    },
  };
}
