<template>
  <v-app>
    <v-app-bar>
      <!-- Кнопка-гамбургер для открытия бокового меню -->
      <v-app-bar-nav-icon @click.stop="isDrawerOpen = !isDrawerOpen"></v-app-bar-nav-icon>

  <v-app-bar-title @click="goHome()" style="cursor: pointer;">My Brev</v-app-bar-title>

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
const { isDrawerOpen } = useAppBar();

const goHome = function(){
  router.push('/')
}

import { useRouter, useRoute } from 'vue-router';
const router = useRouter();

</script>