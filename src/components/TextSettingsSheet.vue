<template>
  <v-bottom-sheet v-model="isSettingsSheetOpen" inset>
    <v-card class="text-settings-card" rounded="t-xl">
      <div class="text-settings-header">
        <div>
          <div class="text-settings-eyebrow">Чытанне</div>
          <div class="text-settings-title">Выгляд тэксту</div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" aria-label="Закрыць налады" @click="toggleSettingsSheet" />
      </div>

      <v-list lines="one" subheader>
        <v-list-item title="Тэма">
          <template v-slot:prepend>
            <v-icon>mdi-theme-light-dark</v-icon>
          </template>
          <template v-slot:append>
            <v-btn-toggle
              :model-value="settings.themePreference"
              mandatory
              density="compact"
              variant="outlined"
              aria-label="Тэма праграмы"
              @update:model-value="settings.setThemePreference"
            >
              <v-btn value="system" aria-label="Сістэмная тэма">Аўта</v-btn>
              <v-btn value="light" aria-label="Светлая тэма">Светлая</v-btn>
              <v-btn value="dark" aria-label="Цёмная тэма">Цёмная</v-btn>
            </v-btn-toggle>
          </template>
        </v-list-item>

        <v-divider class="my-2"></v-divider>

        <v-list-item title="Памер шрыфту">
          <template v-slot:prepend>
            <v-icon>mdi-format-font-size-increase</v-icon>
          </template>
          <div class="sheet-scale-control">
            <v-btn 
              icon="mdi-minus" 
              variant="flat"
              class="sheet-scale-button"
              size="small" 
              @click="settings.decreaseFontSize" 
              :disabled="settings.fontSizeMultiplier <= 0.7"
            ></v-btn>
            <span class="sheet-scale-value">
              {{ Math.round(settings.fontSizeMultiplier * 100) }}%
            </span>
            <v-btn 
              icon="mdi-plus" 
              variant="flat"
              class="sheet-scale-button"
              size="small" 
              @click="settings.increaseFontSize" 
              :disabled="settings.fontSizeMultiplier >= 1.8"
            ></v-btn>
          </div>
        </v-list-item>

        <v-divider class="my-2"></v-divider>

        <v-list-item>
          <template v-slot:title>
              Шрыфт чытання
          </template>
          <template v-slot:prepend>
            <v-icon>mdi-format-font</v-icon>
          </template>
        </v-list-item>
        <div class="px-4 pb-2">
          <v-chip-group 
            :model-value="settings.fontFamily" 
            @update:model-value="settings.setFontFamily"
            mandatory
            column
          >
            <v-chip 
              v-for="font in fontOptions" 
              :key="font.value" 
              :value="font.value" 
              filter 
              variant="flat"
              class="ma-1"
              :style="{ fontFamily: font.value }"
            >
              {{ font.title }}
            </v-chip>
          </v-chip-group>
        </div>

      </v-list>
    </v-card>
  </v-bottom-sheet>
</template>

<script setup>
import { useSettingsStore } from '@/stores/settings.js';
import { useAppBar } from '@/composables/useAppBar.js';
import { READER_FONT_OPTIONS } from '@/constants/fonts';

const settings = useSettingsStore();
const { isSettingsSheetOpen, toggleSettingsSheet } = useAppBar();

const fontOptions = READER_FONT_OPTIONS;
</script>

<style scoped>
.text-settings-card {
  padding: 10px 12px 16px;
  max-height: 85dvh;
  overflow-y: auto;
  border: 1px solid var(--nav-border);
  background:
    radial-gradient(circle at 88% 0, rgba(var(--chrome-accent-rgb), 0.13), transparent 240px),
    var(--overlay-surface) !important;
  color: var(--nav-on-surface);
  box-shadow: 0 -12px 40px var(--nav-shadow) !important;
}

.text-settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 10px 14px;
}

.text-settings-eyebrow {
  color: var(--chrome-accent);
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.text-settings-title {
  margin-top: 2px;
  font-size: 1.25rem;
  font-family: var(--reader-display-font-family);
  font-weight: 700;
}

.text-settings-card :deep(.v-list) {
  background: transparent !important;
  color: inherit;
}

.text-settings-card :deep(.v-list-item) {
  border-radius: 16px;
}

.sheet-scale-control {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sheet-scale-button {
  background: var(--nav-active) !important;
  color: var(--nav-on-surface) !important;
}

.sheet-scale-value {
  width: 50px;
  color: var(--nav-on-surface);
  font-weight: 750;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.text-settings-card :deep(.v-chip) {
  background: transparent !important;
  color: var(--nav-on-surface) !important;
  box-shadow: inset 0 0 0 1px var(--nav-border);
}

.text-settings-card :deep(.v-chip--selected) {
  background: var(--nav-active) !important;
  box-shadow: none;
}
</style>
