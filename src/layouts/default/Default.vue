<template>
  <v-app>
    <v-app-bar>
      <!-- Кнопка-гамбургер для открытия бокового меню -->
      <v-app-bar-nav-icon @click.stop="isDrawerOpen = !isDrawerOpen"></v-app-bar-nav-icon>
      <v-toolbar-title>MyBrev</v-toolbar-title>
    </v-app-bar>
    
    <!-- Наша боковая панель -->
    <NavigationDrawer />

    <v-main>
      <!-- Здесь будут рендериться все дочерние страницы: ItemsList, Settings, Login... -->
      <router-view />
    </v-main>

    <!-- Нижняя навигация (если нужна) -->
    <router-view name="bottomNav" />
  </v-app>
</template>

<script setup>
import { useAppBar } from '@/composables/useAppBar.js';
import NavigationDrawer from './NavigationDrawer.vue';

// isDrawerOpen теперь управляет и кнопкой, и самой панелью
const { isDrawerOpen } = useAppBar();
</script>