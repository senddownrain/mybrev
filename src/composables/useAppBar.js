/**
 * @deprecated Use `useUiStore` from `@/stores/ui` directly.
 * This composable is kept for backward compatibility.
 * All state is now managed in the Pinia `ui` store.
 */
import { storeToRefs } from 'pinia';
import { useUiStore } from '@/stores/ui';

export function useAppBar() {
  const uiStore = useUiStore();
  const { isDrawerOpen, isSettingsSheetOpen, isCalendarDialogOpen } = storeToRefs(uiStore);

  return {
    isDrawerOpen,
    isSettingsSheetOpen,
    isCalendarDialogOpen,
    toggleSettingsSheet: uiStore.toggleSettingsSheet,
    toggleCalendarDialog: uiStore.toggleCalendarDialog,
  };
}
