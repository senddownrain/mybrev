/**
 * Lazy loader of the Ordo notes (`src/data/ordo/notes.json`, ~1.3 MB).
 *
 * Only the Ordo screen imports this module, and the JSON is behind a dynamic
 * `import()`, so it becomes its own chunk and never enters the startup
 * bundle (checked by `tests/ordo-screen.test.mjs`). The promise is shared:
 * the file is parsed once per session.
 */
let pending = null;

/**
 * `loadPublished(bundledRevision)` may return a newer publication of
 * `liturgicalOrdoNotes` (the Ordo view passes the Firestore reader); without
 * it, or when nothing newer is published, the bundled notes are used.
 */
export async function loadOrdoNotes(loadPublished = null) {
  if (!pending) {
    pending = import('../data/ordo/notes.json')
      .catch((error) => {
        pending = null; // Offline without the chunk: allow a retry later.
        throw error;
      });
  }
  const module = await pending;
  const data = module.default || module;
  const bundled = Array.isArray(data?.notes) ? data.notes : [];
  if (!loadPublished) return bundled;
  try {
    const published = await loadPublished(Number(data?.revision) || 0);
    return Array.isArray(published) && published.length ? published : bundled;
  } catch { return bundled; }
}
