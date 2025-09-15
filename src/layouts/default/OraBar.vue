<template>
  <v-app-bar flat>
    <v-app-bar-nav-icon @click="goBack">
      <v-icon>mdi-arrow-left</v-icon>
    </v-app-bar-nav-icon>

    <v-app-bar-title></v-app-bar-title>

    <v-spacer></v-spacer>

 
    <!-- Кнопка настроек вида, видна всем -->
    <v-btn icon @click="toggleSettingsSheet">
      <v-icon>mdi-cog-outline</v-icon>
    </v-btn>

     <v-btn v-if="auth && auth.isAdmin" icon @click="goToEdit">
      <v-icon>mdi-pencil-outline</v-icon>
    </v-btn>
    <!-- ✅ КОНЕЦ БЛОКА КНОПОК -->
    
  </v-app-bar>
</template>

<script setup>
// Убираем импорт useSettingsStore, он здесь больше не нужен
import { useRouter, useRoute } from 'vue-router';
import { useAppBar } from '@/composables/useAppBar';
import { useAuthStore } from '@/stores/auth.js';

const router = useRouter();
const route = useRoute();
const { toggleSettingsSheet } = useAppBar();

const auth = useAuthStore(); // Эта строка остается

const goBack = () => {
  if (window.history.length > 1) {
    router.go(-1);
  } else {
    router.push('/');
  }
};

const goToEdit = () => {
  const dayId = route.params.id;
  if (dayId) {
     router.push({ name: 'AdminEditDay', params: { id: dayId } });
  }
};
</script>