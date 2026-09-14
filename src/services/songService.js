import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import initialSongs from '@/data/songs.json';
import { getDocsOfflineAware } from '@/utils/firestoreRead';
import { createReadSession } from '@/utils/contentCache';
import { publicContentCache, publicContentKey, requestContentRefresh } from '@/utils/publicContentCache';
import { normalizeSong } from '@/utils/songChords';
import { SONGS_CACHE_VERSION } from '@/constants/songTags';

export { initialSongs };

export async function getSavedSongs(options = {}) {
  const entry = await publicContentCache.read(publicContentKey('songs', SONGS_CACHE_VERSION), async () => {
    const session = createReadSession();
    const snapshot = await getDocsOfflineAware(collection(db, 'songs'), session);
    const merged = new Map(initialSongs.map((song) => [song.id, song]));
    snapshot.docs.forEach((item) => merged.set(item.id, { ...merged.get(item.id), ...item.data(), id: item.id }));
    return { data: [...merged.values()], complete: session.complete };
  }, options);
  if (options.requireFresh && !entry.complete) throw new Error('Не атрымалася абнавіць спевы. Захаваная падборка даступная.');
  return entry.data;
}

export async function saveSong(id, data, { creating = false } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Для захавання спеву патрэбны інтэрнэт. Змены застаюцца ў рэдактары.');
  const target = id ? doc(db, 'songs', id) : doc(collection(db, 'songs'));
  const value = normalizeSong(data);
  if (!value.title || !value.text.trim()) throw new Error('Увядзіце назву і тэкст спеву.');
  await setDoc(target, {
    ...value,
    ...(creating ? { createdAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  requestContentRefresh();
  return { ...value, id: target.id };
}
