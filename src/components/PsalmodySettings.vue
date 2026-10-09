<template>
  <section class="psalmody-settings" aria-label="Псальмодыя">
    <h3>Псальмодыя</h3>
    <div class="psalmody-setting">
      <span>Водступ кожнай другой страфы</span>
      <v-switch v-model="alternatingIndent" color="primary" hide-details inset aria-label="Водступ кожнай другой страфы" />
    </div>
    <div class="psalmody-setting">
      <span>Перанос пасля * і †</span>
      <v-switch v-model="breakAfterMarker" color="primary" hide-details inset aria-label="Перанос пасля * і †" />
    </div>
  </section>
</template>

<script setup>
import { useSettingsStore } from '@/stores/settings';
import { computed } from 'vue';
const settings = useSettingsStore();
const alternatingIndent = computed({
  get: () => settings.psalmVerseLayout === 'alternatingIndent',
  set: (enabled) => { settings.psalmVerseLayout = enabled ? 'alternatingIndent' : 'alignedLeft'; },
});
const breakAfterMarker = computed({
  get: () => settings.psalmMarkerBreakMode === 'breakAfterMarker',
  set: (enabled) => { settings.psalmMarkerBreakMode = enabled ? 'breakAfterMarker' : 'inline'; },
});
</script>

<style scoped>
.psalmody-settings { display: grid; gap: 14px; padding: 16px; color: var(--nav-on-surface); }
h3 { font-size: 1rem; }
.psalmody-setting { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: .9rem; }
.psalmody-setting :deep(.v-switch) { flex: 0 0 auto; }
</style>
