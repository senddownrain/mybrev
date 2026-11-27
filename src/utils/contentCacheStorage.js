/** Independent IndexedDB database; never clears Firestore, settings or favourites. */
export function createContentCacheStorage(name, indexedDB) {
  let connection;
  let retryOpenAfter = 0;
  function open() {
    if (connection) return connection;
    if (Date.now() < retryOpenAfter) return Promise.reject(new Error('Content cache temporarily unavailable'));
    connection = new Promise((resolve, reject) => {
      const database = indexedDB ?? globalThis.indexedDB;
      if (!database) throw new Error('IndexedDB unavailable');
      const request = database.open(name, 1);
      let abandoned = false;
      const fail = (error) => {
        abandoned = true;
        clearTimeout(timeout);
        reject(error);
      };
      const timeout = setTimeout(() => fail(new Error('Content cache open timed out')), 350);
      request.onupgradeneeded = () => {
        if (abandoned) request.transaction.abort();
        else request.result.createObjectStore('entries');
      };
      request.onerror = () => fail(request.error);
      request.onblocked = () => fail(new Error('Content cache blocked'));
      request.onsuccess = () => {
        clearTimeout(timeout);
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
    return connection;
  }
  async function execute(mode, operation) {
    const db = await open();
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
    async get(key) {
      const value = await execute('readonly', (store) => store.get(key));
      return value === undefined ? undefined : JSON.parse(value);
    },
    // JSON removes Vue proxies and stores only presentation data, not SDK objects.
    set: (key, value) => execute('readwrite', (store) => store.put(JSON.stringify(value), key)),
    keys: () => execute('readonly', (store) => store.getAllKeys()),
  };
}
