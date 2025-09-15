<template>
  <v-app 
    :style="{ 
      '--app-font-family': settings.fontFamily,
      '--font-size-multiplier': settings.fontSizeMultiplier 
    }"
  >
    <v-main>
      <!-- Сюда будет рендериться OraBar -->
      <router-view name="topNav" /> 
      
      <!-- Сюда будут рендериться страницы молитв -->
      <router-view />

      <!-- Панель настроек -->
      <TextSettingsSheet />
    </v-main>
  </v-app>
</template>

<script setup>
  import TextSettingsSheet from '@/components/TextSettingsSheet.vue';
  import { useSettingsStore } from '@/stores/settings.js';
  
  const settings = useSettingsStore();
</script>