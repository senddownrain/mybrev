import { ref } from 'vue';

const isSettingsSheetOpen = ref(false);
const isDrawerOpen = ref(false); // ✅ ДОБАВЛЯЕМ

export function useAppBar() {
  const toggleSettingsSheet = () => { /* ... */ };

  return { 
    isSettingsSheetOpen,
    toggleSettingsSheet,
    isDrawerOpen, // ✅ ЭКСПОРТИРУЕМ
  };
}