import { collection, doc, query, where } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { getDocOfflineAware, getDocsOfflineAware } from '@/utils/firestoreRead';
import { createReadSession } from '@/utils/contentCache';
import { publicContentCache, publicContentKey } from '@/utils/publicContentCache';
import { loadCatalogPreview } from '@/utils/catalogPreview';
import { getCalendarDefinitions, getDefinitionsEpoch } from '@/utils/ordo/definitions';

const ALLOWED = new Set(['days', 'liturgicalProperTexts', 'liturgicalTemplates', 'readings']);
const check = (name) => { if (!ALLOWED.has(name)) throw new Error('Unsupported catalog source'); };

export async function fetchCatalogPreview(entry, diocese) {
  const refs = JSON.stringify([entry.daysRef, entry.fallbackDaysRefs, entry.templates, entry.readingsRef, entry.fixedSourceRefs]);
  const key = publicContentKey('catalog-preview', entry.id, diocese, getCalendarDefinitions().revision, getDefinitionsEpoch(), refs);
  const result = await publicContentCache.read(key, async () => {
    const session = createReadSession();
    const reader = {
      async document(name, id) {
        check(name);
        const snapshot = await getDocOfflineAware(doc(db, name, id), session);
        return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null;
      },
      async query(name, spec) {
        check(name);
        const q = query(collection(db, name), ...Object.entries(spec).map(([field, value]) => where(field, '==', value)));
        const snapshot = await getDocsOfflineAware(q, session);
        return snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
      },
    };
    const data = await loadCatalogPreview(entry, reader, { diocese });
    return { data, complete: session.complete && !data.errors.length };
  }, { fresh: true });
  return result.complete ? result.data : { ...result.data, errors: [...new Set([...result.data.errors, 'incomplete-source-cache'])] };
}
