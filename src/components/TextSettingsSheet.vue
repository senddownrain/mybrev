<template>
  <!-- Используем импортированный компонент -->
  <v-bottom-sheet v-model="isSettingsSheetOpen" inset>
    <v-card class="pa-2" rounded="t-xl">
      <v-list lines="one" subheader>
        <v-list-subheader class="text-center text-h6 font-weight-regular">Налады выгляду</v-list-subheader>

        <!-- Настройка темы -->
        <v-list-item title="Цёмная тэма">
          <template v-slot:prepend>
            <v-icon>mdi-theme-light-dark</v-icon>
          </template>
          <template v-slot:append>
            <v-switch
              :model-value="settings.currentTheme === 'dark'"
              @update:model-value="settings.toggleTheme"
              inset
              color="primary"
              hide-details
            ></v-switch>
          </template>
        </v-list-item>

        <v-divider class="my-2"></v-divider>

        <!-- Настройка размера шрифта -->
        <v-list-item title="Памер шрыфту">
          <template v-slot:prepend>
            <v-icon>mdi-format-font-size-increase</v-icon>
          </template>
          <div class="d-flex align-center">
            <v-btn 
              icon="mdi-minus" 
              variant="text" 
              size="small" 
              @click="settings.decreaseFontSize" 
              :disabled="settings.fontSizeMultiplier <= 0.7"
            ></v-btn>
            <span class="mx-2 font-weight-bold" style="width: 50px; text-align: center;">
              {{ Math.round(settings.fontSizeMultiplier * 100) }}%
            </span>
            <v-btn 
              icon="mdi-plus" 
              variant="text" 
              size="small" 
              @click="settings.increaseFontSize" 
              :disabled="settings.fontSizeMultiplier >= 1.8"
            ></v-btn>
          </div>
        </v-list-item>

        <v-divider class="my-2"></v-divider>

        <!-- Настройка шрифта -->
        <v-list-item>
          <template v-slot:title>
              Сямейства шрыфтоў
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
              variant="outlined" 
              class="ma-1"
              :style="{ fontFamily: font.value }"
            >
              {{ font.title }}
            </v-chip>
          </v-chip-group>
        </div>

      </v-list>
      <!-- <v-card-actions>
        <v-btn color="primary" block variant="text" @click="toggleSettingsSheet">Закрыць</v-btn>
      </v-card-actions> -->
    </v-card>
  </v-bottom-sheet>
</template>

<script setup>
import { ref } from 'vue';
import { useSettingsStore } from '@/stores/settings.js';
import { useAppBar } from '@/composables/useAppBar.js';

const settings = useSettingsStore();
const { isSettingsSheetOpen, toggleSettingsSheet } = useAppBar();

const fontOptions = ref([
  { title: 'Сістэмны', value: settings.systemFont },
 { title: 'Kurale', value: 'Kurale, serif' },
  { title: 'Old Standard TT', value: "'Old Standard TT', serif" }, // Важно: кавычки внутри строки для шрифтов с пробелами
  { title: 'Pacifico', value: 'Pacifico, cursive' },
  { title: 'Comfortaa', value: 'Comfortaa, sans-serif' },
]);
</script>