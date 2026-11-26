// Keep backend discovery independent of Admin SDK initialization.
export function bindCanonicalCatalogCallable({ onCall, options, loadHandler, HttpsError }) {
  let handler;
  return onCall({ ...options, enforceAppCheck: true, minInstances: 0, maxInstances: 2, concurrency: 1 }, async (request) => {
    handler ??= loadHandler().catch(() => {
      handler = undefined;
      throw new HttpsError('unavailable', 'catalog-writer-unavailable');
    });
    return (await handler)(request);
  });
}
