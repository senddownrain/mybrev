// Old service workers cached Firestore GET responses, including admin reads.
// Keep explicitly managed public IndexedDB content; remove network caches only.
globalThis.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all(['firestore-api', 'firebase-auth'].map((name) => globalThis.caches.delete(name))));
});
