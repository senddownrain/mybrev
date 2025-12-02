<template>
  <v-app 
    :style="{ 
      '--app-font-family': settings.fontFamily,
      '--font-size-multiplier': settings.fontSizeMultiplier 
    }"
  >
    <v-main>
      <!-- Здесь будет рендериться контент админки (DayEditor и т.д.) -->
      <router-view />
      
      <!-- Панель настроек текста -->
      <TextSettingsSheet />
      
      <!-- Toast уведомления -->
      <NotificationSnackbar />
    </v-main>
  </v-app>
</template>

<script setup>
import TextSettingsSheet from '@/components/TextSettingsSheet.vue';
import NotificationSnackbar from '@/components/NotificationSnackbar.vue';
import { useSettingsStore } from '@/stores/settings.js';

const settings = useSettingsStore();
</script>

