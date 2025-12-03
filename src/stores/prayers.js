import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { onSnapshot } from 'firebase/firestore';
import { logger } from '@/utils/logger';
import { getPrayersQuery } from '@/services/prayerService';
import * as prayerService from '@/services/prayerService';

export const usePrayersStore = defineStore('prayers', () => {
  const prayers = ref([]);
  const allTags = ref([]);
  const isLoading = ref(true);
  const error = ref(null);

  let unsubscribe = null;

  function init() {
    if (unsubscribe) {
      unsubscribe();
    }

    const prayersQuery = getPrayersQuery();
    
    unsubscribe = onSnapshot(
      prayersQuery,
      (snapshot) => {
        prayers.value = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        allTags.value = [...new Set(prayers.value.flatMap(prayer => prayer.tags || []))].sort();
        isLoading.value = false;
        error.value = null;
        logger.log('[prayersStore] Загружено молитв:', prayers.value.length);
      },
      (err) => {
        logger.error('[prayersStore] Памылка пры загрузцы малітваў:', err);
        error.value = err;
        isLoading.value = false;
      }
    );
  }

  async function addPrayerAction(data) {
    try {
      return await prayerService.addPrayer(data);
    } catch (err) {
      error.value = err;
      throw err;
    }
  }

  async function deletePrayerAction(id) {
    try {
      await prayerService.deletePrayer(id);
    } catch (err) {
      error.value = err;
      throw err;
    }
  }

  async function updatePrayerAction(id, data) {
    try {
      await prayerService.updatePrayer(id, data);
    } catch (err) {
      error.value = err;
      throw err;
    }
  }

  function getTitle(prayer) {
    if (!prayer) return '';
    if (prayer.title) {
      return prayer.title;
    }
    if (prayer.titleVersions) {
      return prayer.titleVersions.be || prayer.titleVersions.ru || Object.values(prayer.titleVersions)[0] || '';
    }
    return '';
  }

  function getText(prayer) {
    if (!prayer) return '';
    if (prayer.text) {
      return prayer.text;
    }
    if (prayer.textVersions) {
      return prayer.textVersions.be || prayer.textVersions.ru || Object.values(prayer.textVersions)[0] || '';
    }
    return '';
  }

  function cleanup() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }

  return {
    prayers: computed(() => prayers.value),
    allTags: computed(() => allTags.value),
    isLoading: computed(() => isLoading.value),
    error: computed(() => error.value),
    
    init,
    addPrayer: addPrayerAction,
    deletePrayer: deletePrayerAction,
    updatePrayer: updatePrayerAction,
    cleanup,
    
    getTitle,
    getText,
  };
});

