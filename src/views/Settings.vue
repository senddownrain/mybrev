<template>
  <v-container>
    <h1 class="text-h4 font-weight-light mb-4">Налады</h1>

    <v-list lines="two" subheader>
      <v-list-subheader>Знешні выгляд</v-list-subheader>

      <!-- Настройка темы -->
      <v-list-item title="Цёмная тэма">
        <template v-slot:prepend><v-icon>mdi-theme-light-dark</v-icon></template>
        <template v-slot:append>
          <v-switch
            :model-value="settings.currentTheme === 'dark'"
            @update:model-value="settings.toggleTheme"
            inset color="primary" hide-details
          ></v-switch>
        </template>
      </v-list-item>

      <!-- Настройка размера шрифта -->
      <v-list-item title="Памер шрыфту для малітваў">
        <template v-slot:prepend><v-icon>mdi-format-font-size-increase</v-icon></template>
        <template v-slot:append>
          <div class="d-flex align-center">
            <v-btn icon="mdi-minus" variant="text" size="small" @click="settings.decreaseFontSize" :disabled="settings.fontSizeMultiplier <= 0.7"></v-btn>
            <span class="mx-2 font-weight-bold" style="width: 50px; text-align: center;">{{ Math.round(settings.fontSizeMultiplier * 100) }}%</span>
            <v-btn icon="mdi-plus" variant="text" size="small" @click="settings.increaseFontSize" :disabled="settings.fontSizeMultiplier >= 1.8"></v-btn>
          </div>
        </template>
      </v-list-item>

      <!-- Настройка шрифта -->
      <v-list-item title="Шрыфт для малітваў">
        <template v-slot:prepend><v-icon>mdi-format-font</v-icon></template>
      </v-list-item>
      <div class="px-4 pb-4">
        <v-chip-group 
          :model-value="settings.fontFamily" 
          @update:model-value="settings.setFontFamily"
          mandatory column
        >
          <v-chip v-for="font in fontOptions" :key="font.value" :value="font.value" filter variant="outlined" class="ma-1" :style="{ fontFamily: font.value }">
            {{ font.title }}
          </v-chip>
        </v-chip-group>
      </div>

    </v-list>
  </v-container>
</template>

<script setup>
import { ref } from 'vue';
import { useSettingsStore } from '@/stores/settings.js';

const settings = useSettingsStore();

const fontOptions = ref([
  { title: 'Сістэмны', value: settings.systemFont },
  { title: 'Kurale', value: 'Kurale, serif' },
  { title: 'Old Standard TT', value: "'Old Standard TT', serif" },
  { title: 'Pacifico', value: 'Pacifico, cursive' },
  { title: 'Comfortaa', value: 'Comfortaa, sans-serif' },
]);
</script>