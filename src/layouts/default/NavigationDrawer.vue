<template>
  <v-navigation-drawer v-model="isDrawerOpen" temporary>
    <!-- Показываем спиннер, пока идет проверка пользователя -->
    <div v-if="auth.loading" class="text-center py-4">
      <v-progress-circular indeterminate color="primary"></v-progress-circular>
    </div>

    <v-list v-else>
      <v-list-item prepend-icon="mdi-home-outline" title="Галоўная" to="/"></v-list-item>
      <v-list-item prepend-icon="mdi-cog-outline" title="Налады" to="/settings"></v-list-item>
      
      <v-divider class="my-2"></v-divider>

      <!-- Ссылки для неавторизованного пользователя -->
      <v-list-item v-if="!auth.user" prepend-icon="mdi-login" title="Уваход" to="/login"></v-list-item>
      
      <!-- Ссылки, если пользователь вошел -->
      <template v-if="auth.user">
        <!-- Доступно только администратору -->
        <v-list-item v-if="auth.isAdmin" prepend-icon="mdi-shield-account-outline" title="Панэль адміністратара" to="/admin"></v-list-item>
        
        <!-- Кнопка выхода -->
        <v-list-item prepend-icon="mdi-logout" title="Выйсці" @click="auth.logout"></v-list-item>
      </template>

    </v-list>
  </v-navigation-drawer>
</template>

<script setup>
import { useAppBar } from '@/composables/useAppBar.js';
import { useAuthStore } from '@/stores/auth.js';

const { isDrawerOpen } = useAppBar();
const auth = useAuthStore();
</script>