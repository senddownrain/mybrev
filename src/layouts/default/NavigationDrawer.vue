<template>
  <v-navigation-drawer v-model="isDrawerOpen" temporary>
    <div v-if="auth.loading" class="text-center py-4">
      <v-progress-circular indeterminate color="primary"></v-progress-circular>
    </div>

    <v-list v-else>
      <v-list-item 
        prepend-icon="mdi-home-outline" 
        title="Літургія" 
        :to="{ name: 'Today' }"
        :active="route.name === 'Today' || route.name === 'SelectedDay'"
      ></v-list-item>
      <v-list-item 
        prepend-icon="mdi-book-heart-outline" 
        title="Малітвы" 
        :to="{ name: 'Prayers' }"
        :active="route.name === 'Prayers' || route.name === 'PrayersList' || route.name === 'PrayerView'"
      ></v-list-item>
      <v-list-item 
        prepend-icon="mdi-heart" 
        title="Абраныя малітвы" 
        :to="{ name: 'FavoritePrayers' }"
        :active="route.name === 'FavoritePrayers'"
      ></v-list-item>
      <v-list-item 
        prepend-icon="mdi-cog-outline" 
        title="Налады" 
        :to="{ name: 'Settings' }"
        :active="route.name === 'Settings'"
      ></v-list-item>
      
      <v-divider class="my-2"></v-divider>

      <v-list-item v-if="!auth.user" prepend-icon="mdi-login" title="Уваход" to="/login"></v-list-item>
      
      <template v-if="auth.user">
        <v-list-item v-if="auth.isAdmin" prepend-icon="mdi-shield-account-outline" title="Панэль адміністратара" to="/admin"></v-list-item>
        <v-list-item v-if="auth.isAdmin" prepend-icon="mdi-label-outline" title="Катэгорыі малітваў" :to="{ name: 'AdminCategories' }"></v-list-item>
        
        <v-list-item prepend-icon="mdi-logout" title="Выйсці" @click="auth.logout"></v-list-item>
      </template>

    </v-list>
  </v-navigation-drawer>
</template>

<script setup>
import { useAppBar } from '@/composables/useAppBar.js';
import { useAuthStore } from '@/stores/auth.js';
import { useRoute } from 'vue-router';

const { isDrawerOpen } = useAppBar();
const auth = useAuthStore();
const route = useRoute();
</script>