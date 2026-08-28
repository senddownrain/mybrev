import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * UI state store — manages global UI visibility flags and edit state.
 * Replaces module-level refs in useAppBar composable.
 * Acts as a communication bus for:
 *   PrayerView  ↔ Default.vue ↔ PrayerBar  (prayer view edit)
 *   PrayerForm  ↔ Default.vue               (prayer add/edit form)
 */
export const useUiStore = defineStore('ui', () => {
  // ── App bar / navigation ─────────────────────────────────────────────────
  const isDrawerOpen = ref(false);
  const isSettingsSheetOpen = ref(false);
  const isCalendarDialogOpen = ref(false);

  function toggleDrawer() {
    isDrawerOpen.value = !isDrawerOpen.value;
  }

  function toggleSettingsSheet() {
    isSettingsSheetOpen.value = !isSettingsSheetOpen.value;
  }

  function toggleCalendarDialog() {
    isCalendarDialogOpen.value = !isCalendarDialogOpen.value;
  }

  function closeAll() {
    isDrawerOpen.value = false;
    isSettingsSheetOpen.value = false;
    isCalendarDialogOpen.value = false;
  }

  // ── Prayer view edit state (PrayerView ↔ Default.vue ↔ PrayerBar) ────────
  const prayerIsEditing = ref(false);
  const prayerSaving = ref(false);

  let _toggleEdit = null;
  let _cancelEdit = null;
  let _savePrayer = null;

  function registerPrayerActions({ toggleEdit, cancelEdit, save } = {}) {
    _toggleEdit = toggleEdit ?? null;
    _cancelEdit = cancelEdit ?? null;
    _savePrayer = save ?? null;
  }

  function clearPrayerActions() {
    _toggleEdit = null;
    _cancelEdit = null;
    _savePrayer = null;
    prayerIsEditing.value = false;
    prayerSaving.value = false;
  }

  function triggerPrayerToggleEdit() { _toggleEdit?.(); }
  function triggerPrayerCancelEdit() { _cancelEdit?.(); }
  function triggerPrayerSave()       { _savePrayer?.(); }

  // ── Prayer form state (PrayerForm ↔ Default.vue) ─────────────────────────
  // prayerFormSaving is written by PrayerForm and read by Default.vue AppBar.
  const prayerFormSaving = ref(false);
  let _savePrayerForm = null;

  function registerPrayerFormActions({ save } = {}) {
    _savePrayerForm = save ?? null;
  }

  function clearPrayerFormActions() {
    _savePrayerForm = null;
    prayerFormSaving.value = false;
  }

  function triggerPrayerFormSave() { _savePrayerForm?.(); }

  // ── Reading form state (ReadingForm ↔ OraBar) ────────────────────────────
  return {
    // Navigation
    isDrawerOpen,
    isSettingsSheetOpen,
    isCalendarDialogOpen,
    toggleDrawer,
    toggleSettingsSheet,
    toggleCalendarDialog,
    closeAll,
    // Prayer view edit (PrayerView ↔ Default.vue ↔ PrayerBar)
    prayerIsEditing,
    prayerSaving,
    registerPrayerActions,
    clearPrayerActions,
    triggerPrayerToggleEdit,
    triggerPrayerCancelEdit,
    triggerPrayerSave,
    // Prayer form (PrayerForm ↔ Default.vue)
    prayerFormSaving,
    registerPrayerFormActions,
    clearPrayerFormActions,
    triggerPrayerFormSave,
  };
});
