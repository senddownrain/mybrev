<template>
  <div class="song-settings">
    <div class="song-settings__group">
      <h3 class="song-settings__heading">Спіс спеваў</h3>
      <div class="song-settings__row">
        <div class="song-settings__copy">
          <strong>Кампактны спіс</strong>
          <span>Карацейшыя радкі без тэгаў</span>
        </div>
        <v-switch v-model="settings.songCompactList" color="primary" density="compact" hide-details inset aria-label="Кампактны спіс" />
      </div>
    </div>

    <div class="song-settings__group">
      <h3 class="song-settings__heading">Акорды</h3>
      <div class="song-settings__row">
        <div class="song-settings__copy">
          <strong>Паказваць акорды</strong>
          <span>У тэксце спеваў</span>
        </div>
        <v-switch v-model="settings.songShowChords" color="primary" density="compact" hide-details inset aria-label="Паказваць акорды" />
      </div>
      <div class="song-settings__layout">
        <span class="song-settings__label">Пазіцыя акордаў</span>
        <div class="song-settings__options" role="radiogroup" aria-label="Пазіцыя акордаў">
          <button
            v-for="layout in layouts"
            :key="layout.value"
            type="button"
            role="radio"
            :aria-checked="settings.songChordLayout === layout.value"
            :class="{ 'song-settings__option--active': settings.songChordLayout === layout.value }"
            @click="settings.songChordLayout = layout.value"
          >{{ layout.title }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useSettingsStore } from '@/stores/settings';

const settings = useSettingsStore();
const layouts = [{ title: 'Над радкамі', value: 'above' }, { title: 'Злева ад тэксту', value: 'left' }];
</script>

<style scoped>
.song-settings { color: var(--nav-on-surface); }
.song-settings__group + .song-settings__group { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--nav-border); }
.song-settings__heading { margin: 0 0 4px; color: var(--nav-muted); font-size: .7rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
.song-settings__row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 52px; }
.song-settings__copy { display: grid; min-width: 0; gap: 2px; }
.song-settings__copy strong { font-size: .88rem; font-weight: 720; }
.song-settings__copy span { color: var(--nav-muted); font-size: .75rem; line-height: 1.3; }
.song-settings__row :deep(.v-switch) { flex: 0 0 auto; }
.song-settings__row :deep(.v-selection-control) { min-height: 40px; }
.song-settings__layout { display: grid; gap: 9px; padding-top: 8px; border-top: 1px solid var(--nav-border); }
.song-settings__label { color: var(--nav-muted); font-size: .76rem; font-weight: 650; }
.song-settings__options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
.song-settings__options button { min-height: 40px; padding: 7px 10px; border: 1px solid var(--nav-border); border-radius: 12px; background: transparent; color: var(--nav-on-surface); font: inherit; font-size: .78rem; font-weight: 650; cursor: pointer; transition: background .18s ease, border-color .18s ease; }
.song-settings__options button:hover { background: var(--nav-active); }
.song-settings__options .song-settings__option--active { border-color: rgba(var(--chrome-accent-rgb), .28); background: var(--nav-active); color: var(--chrome-accent); }
.song-settings__options button:focus-visible { outline: 2px solid var(--chrome-accent); outline-offset: 2px; }
</style>
