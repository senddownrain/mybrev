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
    addPrayer: prayersStore.addPrayer,
    deletePrayer: prayersStore.deletePrayer,
    updatePrayer: prayersStore.updatePrayer,
    getTitle: prayersStore.getTitle,
    getText: prayersStore.getText,
  };
}

