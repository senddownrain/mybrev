// Old service workers cached Firestore GET responses, including admin reads.
// Keep the independent public IndexedDB store. The old asset cache could
// also contain SPA fallback responses under JavaScript URLs.
globalThis.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all(['firestore-api', 'firebase-auth', 'mybrev-opened-assets-v1']
    .map((name) => globalThis.caches.delete(name))));
});
