import { ref } from 'vue';

const isSettingsSheetOpen = ref(false);
const isDrawerOpen = ref(false); // ✅ ДОБАВЛЯЕМ
const isCalendarDialogOpen = ref(false); // ✅ ДОБАВЛЯЕМ СОСТОЯНИЕ ДЛЯ КАЛЕНДАРЯ

export function useAppBar() {
  const toggleSettingsSheet = () => {
    isSettingsSheetOpen.value = !isSettingsSheetOpen.value; // ✅ МЕНЯЕМ ГЛОБАЛЬНОЕ СОСТОЯНИЕ
  };
  const toggleCalendarDialog = () => {
    isCalendarDialogOpen.value = !isCalendarDialogOpen.value;
  };
  return {
    isDrawerOpen,
    isSettingsSheetOpen,
    isCalendarDialogOpen, // ✅ ЭКСПОРТИРУЕМ
    toggleSettingsSheet,
    toggleCalendarDialog // ✅ ЭКСПОРТИРУЕМ ФУНКЦИЮ
  };
}