<template>
  <v-app 
    :style="{ 
      '--app-font-family': settings.fontFamily,
      '--font-size-multiplier': settings.fontSizeMultiplier 
    }"
  >
    <v-app-bar flat class="app-bar-border">
      <v-app-bar-nav-icon @click.stop="isDrawerOpen = !isDrawerOpen"></v-app-bar-nav-icon>

      <v-app-bar-title @click="goHome()" style="cursor: pointer;">Малітоўнік</v-app-bar-title>

      <v-spacer></v-spacer>

    </v-app-bar>
    
    <NavigationDrawer />

    <v-main>
      <router-view />
    </v-main>

    <router-view name="bottomNav" />
    
    <TextSettingsSheet />
    
    <NotificationSnackbar />
  </v-app>
</template>

<script setup>
import { useAppBar } from '@/composables/useAppBar.js';
import NavigationDrawer from './NavigationDrawer.vue';
import TextSettingsSheet from '@/components/TextSettingsSheet.vue';
import NotificationSnackbar from '@/components/NotificationSnackbar.vue';
import { useSettingsStore } from '@/stores/settings.js';
import { useRouter } from 'vue-router';

const { isDrawerOpen, toggleSettingsSheet } = useAppBar();
const settings = useSettingsStore();
const router = useRouter();

const goHome = function(){
  router.push('/')
}
</script>

<style scoped>
.app-bar-border {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

@media (max-width: 600px) {
  .v-app-bar-title {
    font-size: 1.1rem !important;
    padding: 0 8px !important;
  }

  .v-app-bar-nav-icon {
    margin-left: 4px !important;
  }
}
</style>