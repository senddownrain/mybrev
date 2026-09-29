/**
 * Lazy loader of the Ordo notes (`src/data/ordo/notes.json`, ~1.3 MB).
 *
 * Only the Ordo screen imports this module, and the JSON is behind a dynamic
 * `import()`, so it becomes its own chunk and never enters the startup
 * bundle (checked by `tests/ordo-screen.test.mjs`). The promise is shared:
 * the file is parsed once per session.
 */
let pending = null;

export function loadOrdoNotes() {
  if (!pending) {
    pending = import('../data/ordo/notes.json')
      .then((module) => {
        const data = module.default || module;
        return Array.isArray(data?.notes) ? data.notes : [];
      })
      .catch((error) => {
        pending = null; // Offline without the chunk: allow a retry later.
        throw error;
      });
  }
  return pending;
}
