<template>
  <section class="psalmody-settings" aria-label="Псальмодыя">
    <h3>Псальмодыя</h3>
    <label>
      <span>Размяшчэнне строфаў</span>
      <select v-model="settings.psalmVerseLayout">
        <option value="alternatingIndent">Чаргаванне водступаў</option>
        <option value="alignedLeft">Па адным левым краі</option>
      </select>
    </label>
    <label>
      <span>Перанос пасля * і †</span>
      <select v-model="settings.psalmMarkerBreakMode">
        <option value="inline">Без прымусовага пераносу</option>
        <option value="breakAfterMarker">Новы радок пасля знака</option>
      </select>
    </label>
  </section>
</template>

<script setup>
import { useSettingsStore } from '@/stores/settings';
const settings = useSettingsStore();
</script>

<style scoped>
.psalmody-settings { display: grid; gap: 14px; padding: 16px; color: var(--nav-on-surface); }
h3 { font-size: 1rem; }
label { display: grid; gap: 7px; font-size: .9rem; }
select { width: 100%; min-width: 0; min-height: 44px; padding: 9px 12px; border: 1px solid var(--nav-border); border-radius: 12px; background: var(--nav-surface); color: inherit; font: inherit; }
select:focus-visible { outline: 2px solid var(--focus-ring); }
</style>
