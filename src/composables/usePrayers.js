import { ref, computed } from 'vue';
import { db } from '@/plugins/firebase';
import { 
  collection, 
  onSnapshot, 
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

const prayers = ref([]);
const allTags = ref([]);
const isLoading = ref(true);

const prayersCollection = collection(db, 'prayers');
const prayersQuery = query(prayersCollection, orderBy('createdAt', 'desc'));

onSnapshot(prayersQuery, (snapshot) => {
  prayers.value = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  allTags.value = [...new Set(prayers.value.flatMap(prayer => prayer.tags || []))].sort();
  isLoading.value = false;
  logger.log('[usePrayers] Загружено молитв:', prayers.value.length);
}, (error) => {
  logger.error('[usePrayers] Памылка пры загрузцы малітваў:', error);
  isLoading.value = false;
});

export function usePrayers() {
  const addPrayer = async (data) => {
    try {
      const docRef = await retryFirestore(() => addDoc(prayersCollection, {
        ...data,
        createdAt: serverTimestamp()
      }));
      logger.log('[usePrayers] Малітва дададзена:', docRef.id);
      return docRef;
    } catch (error) {
      logger.error('[usePrayers] Памылка дадавання малітвы:', error);
      throw error;
    }
  };

  const deletePrayer = async (id) => {
    try {
      await retryFirestore(() => deleteDoc(doc(db, 'prayers', id)));
      logger.log('[usePrayers] Малітва выдалена:', id);
    } catch (error) {
      logger.error('[usePrayers] Памылка выдалення малітвы:', error);
      throw error;
    }
  };

  const updatePrayer = async (id, data) => {
    try {
      const dataToUpdate = { ...data };
      delete dataToUpdate.id;
      await retryFirestore(() => updateDoc(doc(db, 'prayers', id), dataToUpdate));
      logger.log('[usePrayers] Малітва абноўлена:', id);
    } catch (error) {
      logger.error('[usePrayers] Памылка абнаўлення малітвы:', error);
      throw error;
    }
  };

  const getTitle = (prayer) => {
    if (!prayer) return '';
    // Поддержка разных форматов названий
    if (prayer.titleVersions) {
      return prayer.titleVersions.be || prayer.titleVersions.ru || Object.values(prayer.titleVersions)[0] || '';
    }
    return prayer.title || '';
  };

  const getText = (prayer) => {
    if (!prayer) return '';
    if (prayer.textVersions) {
      return prayer.textVersions.be || prayer.textVersions.ru || Object.values(prayer.textVersions)[0] || '';
    }
    return prayer.text || '';
  };

  return {
    prayers: computed(() => prayers.value),
    allTags: computed(() => allTags.value),
    isLoading: computed(() => isLoading.value),
    addPrayer,
    deletePrayer,
    updatePrayer,
    getTitle,
    getText
  };
}

