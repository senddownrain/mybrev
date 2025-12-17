<template>
  <v-app 
    :style="{ 
      '--app-font-family': settings.fontFamily,
      '--font-size-multiplier': settings.fontSizeMultiplier 
    }"
  >
    <v-app-bar flat class="app-bar-border">
      <v-app-bar-nav-icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-app-bar-nav-icon>

      <v-app-bar-title>
        Адмін-панель
      </v-app-bar-title>

      <v-spacer></v-spacer>
    </v-app-bar>

    <v-main>
      <router-view />
      <TextSettingsSheet />
      <NotificationSnackbar />
    </v-main>
  </v-app>
</template>

<script setup>
import { useRouter } from 'vue-router';
import TextSettingsSheet from '@/components/TextSettingsSheet.vue';
import NotificationSnackbar from '@/components/NotificationSnackbar.vue';
import { useSettingsStore } from '@/stores/settings.js';

const settings = useSettingsStore();
const router = useRouter();

const goBack = () => {
  if (window.history.length > 1) {
    router.go(-1);
  } else {
    router.push('/');
  }
};
</script>

<style scoped>
.app-bar-border {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>

