import { ref } from 'vue';

const isSettingsSheetOpen = ref(false);
const isDrawerOpen = ref(false);
const isCalendarDialogOpen = ref(false);

export function useAppBar() {
  const toggleSettingsSheet = () => {
    isSettingsSheetOpen.value = !isSettingsSheetOpen.value;
  };
  const toggleCalendarDialog = () => {
    isCalendarDialogOpen.value = !isCalendarDialogOpen.value;
  };
  return {
    isDrawerOpen,
    isSettingsSheetOpen,
    isCalendarDialogOpen,
    toggleSettingsSheet,
    toggleCalendarDialog
  };
}