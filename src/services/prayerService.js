import { db } from '@/plugins/firebase';
import { 
  collection, 
  addDoc, 
  deleteDoc, 
  updateDoc, 
  doc,
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { logger } from '@/utils/logger';
import { retryFirestore } from '@/utils/retry';
import { getDocsOfflineAware } from '@/utils/firestoreRead';
import { createReadSession } from '@/utils/contentCache';
import { publicContentCache, publicContentKey } from '@/utils/publicContentCache';

const PRAYERS_COLLECTION = 'prayers';

export function getPrayersCollection() {
  return collection(db, PRAYERS_COLLECTION);
}

export function getPrayersQuery() {
  try {
    return query(getPrayersCollection(), orderBy('createdAt', 'desc'));
  } catch (error) {
    logger.error('[prayerService] Памылка стварэння запыту, спрабую без orderBy:', error);
    // Fallback: если нет индекса, возвращаем запрос без сортировки
    return query(getPrayersCollection());
  }
}

/** Public reading mode. Editors keep their real-time subscription. */
export async function getSavedPrayers(options = {}) {
  const entry = await publicContentCache.read(publicContentKey('prayers'), async () => {
    const session = createReadSession();
    const snapshot = await getDocsOfflineAware(getPrayersQuery(), session);
    return { data: snapshot.docs.map((item) => ({ id: item.id, ...item.data() })), complete: session.complete };
  }, options);
  if (options.requireFresh && !entry.complete) throw new Error('Не атрымалася абнавіць малітвы. Захаваная копія засталася даступнай.');
  return entry.data;
}

export async function addPrayer(data) {
  try {
    const docRef = await retryFirestore(() => addDoc(getPrayersCollection(), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    logger.log('[prayerService] Малітва дададзена:', docRef.id);
    return docRef;
  } catch (error) {
    logger.error('[prayerService] Памылка дадавання малітвы:', error);
    throw error;
  }
}

export async function deletePrayer(id) {
  try {
    await retryFirestore(() => deleteDoc(doc(db, PRAYERS_COLLECTION, id)));
    logger.log('[prayerService] Малітва выдалена:', id);
  } catch (error) {
    logger.error('[prayerService] Памылка выдалення малітвы:', error);
    throw error;
  }
}

export async function updatePrayer(id, data) {
  try {
    const dataToUpdate = { ...data };
    delete dataToUpdate.id;
    dataToUpdate.updatedAt = serverTimestamp();
    await retryFirestore(() => updateDoc(doc(db, PRAYERS_COLLECTION, id), dataToUpdate));
    logger.log('[prayerService] Малітва абноўлена:', id);
  } catch (error) {
    logger.error('[prayerService] Памылка абнаўлення малітвы:', error);
    throw error;
  }
}

