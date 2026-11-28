const OPEN_TIMEOUT = new Error('Content cache open timed out');
const OPEN_BUDGET_MS = 350;
const EXISTING_DATABASE_BUDGET_MS = 1200;

function waitForOpen(promise, remaining) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(OPEN_TIMEOUT), Math.max(0, remaining));
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Independent IndexedDB database; never clears Firestore, settings or favourites. */
export function createContentCacheStorage(name, indexedDB) {
  let connection;
  let retryOpenAfter = 0;
  function connect() {
    if (connection) return connection;
    if (Date.now() < retryOpenAfter) throw new Error('Content cache temporarily unavailable');
    const database = indexedDB ?? globalThis.indexedDB;
    if (!database) throw new Error('IndexedDB unavailable');
    const state = { startedAt: Date.now(), existing: false };
    // Probe the database directory in parallel with opening. A new profile
    // uses the ordinary startup budget even when its first open is delayed.
    database.databases?.().then((items) => {
      state.existing = items.some((item) => item.name === name);
    }).catch(() => {});
    state.promise = new Promise((resolve, reject) => {
      const request = database.open(name, 1);
      let abandoned = false;
      const fail = (error) => {
        abandoned = true;
        reject(error);
      };
      request.onupgradeneeded = () => {
        if (abandoned) request.transaction.abort();
        else request.result.createObjectStore('entries');
      };
      request.onerror = () => fail(request.error);
      request.onblocked = () => fail(new Error('Content cache blocked'));
      request.onsuccess = () => {
        if (abandoned) {
          request.result.close();
          return;
        }
        request.result.onversionchange = () => { request.result.close(); connection = null; };
        request.result.onclose = () => { connection = null; };
        resolve(request.result);
      };
    }).catch((error) => {
      connection = null;
      retryOpenAfter = Date.now() + 2000;
      throw error;
    });
    connection = state;
    return state;
  }

  async function open(preferExisting) {
    const state = connect();
    const remaining = (budget) => state.startedAt + budget - Date.now();
    try {
      return await waitForOpen(state.promise, remaining(OPEN_BUDGET_MS));
    } catch (error) {
      if (error !== OPEN_TIMEOUT || !preferExisting || !state.existing) throw error;
      // The soft timeout belongs to the caller. The shared open remains usable,
      // and foreground readers share one deadline measured from its start.
      return waitForOpen(state.promise, remaining(EXISTING_DATABASE_BUDGET_MS));
    }
  }

  async function execute(mode, operation, preferExisting) {
    const db = await open(preferExisting);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('entries', mode);
      const request = operation(transaction.objectStore('entries'));
      const timeout = setTimeout(() => {
        try { transaction.abort(); } catch { /* Already finished. */ }
        reject(new Error('Content cache transaction timed out'));
      }, 500);
      transaction.oncomplete = () => { clearTimeout(timeout); resolve(request.result); };
      transaction.onabort = () => {
        clearTimeout(timeout);
        reject(transaction.error || new Error('Content cache transaction aborted'));
      };
    });
  }
  return {
    async get(key, { preferExisting } = {}) {
      const value = await execute('readonly', (store) => store.get(key), preferExisting);
      return value === undefined ? undefined : JSON.parse(value);
    },
    // JSON removes Vue proxies and stores only presentation data, not SDK objects.
    set: (key, value) => execute('readwrite', (store) => store.put(JSON.stringify(value), key)),
    keys: () => execute('readonly', (store) => store.getAllKeys()),
  };
}
