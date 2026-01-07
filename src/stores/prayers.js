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

    try {
      const prayersQuery = getPrayersQuery();
      logger.log('[prayersStore] Ініцыялізацыя падпіскі на малітвы...');
      
      unsubscribe = onSnapshot(
        prayersQuery,
        (snapshot) => {
          logger.log('[prayersStore] Атрымана дакументаў:', snapshot.docs.length);
          prayers.value = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          const tagsArray = (prayers.value || []).flatMap(prayer => prayer.tags || []);
          allTags.value = [...new Set(tagsArray)].sort();
          isLoading.value = false;
          error.value = null;
          logger.log('[prayersStore] Загружено молитв:', prayers.value.length);
          logger.log('[prayersStore] Першыя 3 малітвы:', prayers.value.slice(0, 3).map(p => ({ id: p.id, title: getTitle(p) })));
        },
        (err) => {
          logger.error('[prayersStore] Памылка пры загрузцы малітваў:', err);
          logger.error('[prayersStore] Дэталі памылкі:', err.code, err.message);
          error.value = err;
          isLoading.value = false;
        }
      );
    } catch (initError) {
      logger.error('[prayersStore] Памылка ініцыялізацыі:', initError);
      error.value = initError;
      isLoading.value = false;
    }
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
    let text = '';
    if (prayer.text) {
      text = prayer.text;
    } else if (prayer.textVersions) {
      text = prayer.textVersions.be || prayer.textVersions.ru || Object.values(prayer.textVersions)[0] || '';
    }

    // Убираем inline стили цвета rgb(64, 64, 64)
    if (text) {
      text = text.replace(/style="color:\s*rgb\(64,\s*64,\s*64\)"/gi, '');
      text = text.replace(/style="color:\s*rgb\(64,64,64\)"/gi, '');
    }

    return text;
  }

  function cleanup() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }

  return {
    prayers: computed(() => {
      const value = prayers.value;
      return Array.isArray(value) ? value : [];
    }),
    allTags: computed(() => {
      const value = allTags.value;
      return Array.isArray(value) ? value : [];
    }),
    isLoading: computed(() => isLoading.value ?? true),
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

