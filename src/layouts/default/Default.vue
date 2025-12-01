<template>
  <v-app 
    :style="{ 
      '--app-font-family': settings.fontFamily,
      '--font-size-multiplier': settings.fontSizeMultiplier 
    }"
  >
    <v-app-bar flat class="app-bar-border">
      <!-- Кнопка-гамбургер для открытия бокового меню -->
      <v-app-bar-nav-icon @click.stop="isDrawerOpen = !isDrawerOpen"></v-app-bar-nav-icon>

      <v-app-bar-title @click="goHome()" style="cursor: pointer;">My Brev</v-app-bar-title>

      <v-spacer></v-spacer>

      <!-- Кнопка настроек текста -->
      <v-btn icon @click="toggleSettingsSheet">
        <v-icon>mdi-format-font</v-icon>
      </v-btn>

    </v-app-bar>
    
    <!-- Наша боковая панель -->
    <NavigationDrawer />

    <v-main>
      <!-- Здесь будут рендериться все дочерние страницы: ItemsList, Settings, Login... -->
      <router-view />
    </v-main>

    <!-- Нижняя навигация (если нужна) -->
    <router-view name="bottomNav" />
    
    <!-- Панель настроек текста -->
    <TextSettingsSheet />
    
    <!-- Toast уведомления -->
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
</style>