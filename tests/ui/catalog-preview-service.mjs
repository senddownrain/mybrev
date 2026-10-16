// Offline transport replacement only; the real source selector and renderer run unchanged.
import { loadCatalogPreview } from '/src/utils/catalogPreview.js';
import { documents } from 'virtual:catalog-fixtures';
export async function fetchCatalogPreview(entry, diocese) {
  return loadCatalogPreview(entry, {
    document: async (collection, id) => documents[`${collection}/${id}`] || null,
    query: async (collection, spec) => Object.entries(documents)
      .filter(([path, doc]) => path.startsWith(`${collection}/`) && Object.entries(spec).every(([key, value]) => doc[key] === value))
      .map(([, doc]) => doc),
  }, { diocese });
}
