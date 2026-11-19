/** Independent IndexedDB database; never clears Firestore, settings or favourites. */
export function createContentCacheStorage(name, indexedDB = globalThis.indexedDB) {
  let connection;
  function open() {
    if (!indexedDB) return Promise.reject(new Error('IndexedDB unavailable'));
    if (!connection) connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      let abandoned = false;
      const fail = (error) => {
        abandoned = true;
        clearTimeout(timeout);
        reject(error);
      };
      const timeout = setTimeout(() => fail(new Error('Content cache open timed out')), 1000);
      request.onupgradeneeded = () => request.result.createObjectStore('entries');
      request.onerror = () => fail(request.error);
      request.onblocked = () => fail(new Error('Content cache blocked'));
      request.onsuccess = () => {
        clearTimeout(timeout);
        if (abandoned) {
          request.result.close();
          return;
        }
        request.result.onversionchange = () => { request.result.close(); connection = null; };
        resolve(request.result);
      };
    });
    return connection;
  }
  async function execute(mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('entries', mode);
      const request = operation(transaction.objectStore('entries'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Content cache transaction aborted'));
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
