import { usePrayersStore } from '@/stores/prayers';
import { storeToRefs } from 'pinia';

export function usePrayers() {
  const prayersStore = usePrayersStore();
  
  // Используем storeToRefs для сохранения реактивности computed свойств
  const { prayers, allTags, isLoading, error } = storeToRefs(prayersStore);

  return {
    prayers,
    allTags,
    isLoading,
    error,
    init: prayersStore.init,
    deletePrayer: prayersStore.deletePrayer,
    getTitle: prayersStore.getTitle,
    getText: prayersStore.getText,
  };
}

