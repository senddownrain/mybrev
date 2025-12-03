import { usePrayersStore } from '@/stores/prayers';

export function usePrayers() {
  const prayersStore = usePrayersStore();

  return {
    prayers: prayersStore.prayers,
    allTags: prayersStore.allTags,
    isLoading: prayersStore.isLoading,
    error: prayersStore.error,
    addPrayer: prayersStore.addPrayer,
    deletePrayer: prayersStore.deletePrayer,
    updatePrayer: prayersStore.updatePrayer,
    getTitle: prayersStore.getTitle,
    getText: prayersStore.getText,
  };
}

