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

      <!-- Настройки текста теперь доступны через кнопку настроек в AppBar -->
      <v-list-item title="Налады тэксту" prepend-icon="mdi-format-font" @click="openTextSettings">
        <template v-slot:append>
          <v-icon>mdi-chevron-right</v-icon>
        </template>
      </v-list-item>

    </v-list>
  </v-container>
</template>

<script setup>
import { useSettingsStore } from '@/stores/settings.js';
import { useAppBar } from '@/composables/useAppBar.js';

const settings = useSettingsStore();
const { toggleSettingsSheet } = useAppBar();

const openTextSettings = () => {
  toggleSettingsSheet();
};
</script>