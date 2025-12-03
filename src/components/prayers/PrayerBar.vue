<template>
  <v-app-bar flat>
    <v-app-bar-nav-icon @click="goBack">
      <v-icon>mdi-arrow-left</v-icon>
    </v-app-bar-nav-icon>

    <v-app-bar-title></v-app-bar-title>

    <v-spacer></v-spacer>
 
    <v-btn icon @click="toggleSettingsSheet">
      <v-icon>mdi-format-font</v-icon>
    </v-btn>

    <v-btn 
      v-if="auth && auth.isAdmin" 
      icon 
      @click="toggleEdit"
      :loading="saving"
    >
      <v-icon>{{ isEditing ? 'mdi-check' : 'mdi-pencil-outline' }}</v-icon>
    </v-btn>
    
  </v-app-bar>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAppBar } from '@/composables/useAppBar';
import { useAuthStore } from '@/stores/auth.js';

const router = useRouter();
const { toggleSettingsSheet } = useAppBar();
const auth = useAuthStore();

// Используем глобальное событие для связи с PrayerView
const isEditing = ref(false);
const saving = ref(false);

function handleStateUpdate(e) {
  isEditing.value = e.detail.isEditing;
  saving.value = e.detail.saving;
}

onMounted(() => {
  window.addEventListener('prayer-state-update', handleStateUpdate);
});

onUnmounted(() => {
  window.removeEventListener('prayer-state-update', handleStateUpdate);
});

const goBack = () => {
  if (window.history.length > 1) {
    router.go(-1);
  } else {
    router.push({ name: 'PrayersList' });
  }
};

const toggleEdit = () => {
  window.dispatchEvent(new CustomEvent('prayer-toggle-edit'));
};
</script>
