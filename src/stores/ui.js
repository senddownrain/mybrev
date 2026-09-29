import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * UI state store — manages global UI visibility flags and edit state.
 * Replaces module-level refs in useAppBar composable.
 * Acts as a communication bus for:
 *   PrayerView  ↔ Default.vue               (prayer view edit)
 *   PrayerForm  ↔ Default.vue               (prayer add/edit form)
 *   PrayerView  ↔ MassLanguageMenu          (Holy Mass text language)
 */
export const useUiStore = defineStore('ui', () => {
  // ── App bar / navigation ─────────────────────────────────────────────────
  const isDrawerOpen = ref(false);
  const isSettingsSheetOpen = ref(false);
  const isCalendarDialogOpen = ref(false);
  const songSettingsOpen = ref(false);

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
    songSettingsOpen.value = false;
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

  // ── Holy Mass language (PrayerView ↔ MassLanguageMenu in the app bar) ─────
  // PrayerView owns the choice; the app bar only shows it and asks for a
  // change through the `?lang` query, which PrayerView already follows.
  const massLanguage = ref(null);

  // ── Prayer form state (PrayerForm ↔ Default.vue) ─────────────────────────
  // prayerFormSaving is written by PrayerForm and read by Default.vue AppBar.
  const prayerFormSaving = ref(false);
  const prayerFormCopying = ref(false);
  let _savePrayerForm = null;
  let _copyPrayerForm = null;

  function registerPrayerFormActions({ save, copy } = {}) {
    _savePrayerForm = save ?? null;
    _copyPrayerForm = copy ?? null;
  }

  function clearPrayerFormActions() {
    _savePrayerForm = null;
    _copyPrayerForm = null;
    prayerFormSaving.value = false;
    prayerFormCopying.value = false;
  }

  function triggerPrayerFormSave() { _savePrayerForm?.(); }
  function triggerPrayerFormCopy() { _copyPrayerForm?.(); }

  return {
    // Navigation
    isDrawerOpen,
    isSettingsSheetOpen,
    isCalendarDialogOpen,
    songSettingsOpen,
    toggleDrawer,
    toggleSettingsSheet,
    toggleCalendarDialog,
    closeAll,
    // Prayer view edit (PrayerView ↔ Default.vue)
    prayerIsEditing,
    prayerSaving,
    registerPrayerActions,
    clearPrayerActions,
    triggerPrayerToggleEdit,
    triggerPrayerCancelEdit,
    triggerPrayerSave,
    // Holy Mass
    massLanguage,
    // Prayer form (PrayerForm ↔ Default.vue)
    prayerFormSaving,
    prayerFormCopying,
    registerPrayerFormActions,
    clearPrayerFormActions,
    triggerPrayerFormSave,
    triggerPrayerFormCopy,
  };
});
