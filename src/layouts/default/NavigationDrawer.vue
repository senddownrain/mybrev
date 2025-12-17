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
        prepend-icon="mdi-book-open-variant-outline" 
        title="Чытанні" 
        :to="{ name: 'Readings' }"
        :active="route.name === 'Readings' || route.name === 'ReadingsByDate' || route.name === 'ReadingsPicker'"
      ></v-list-item>
      <v-list-item 
        prepend-icon="mdi-book-heart-outline" 
        title="Малітвы" 
        :to="{ name: 'Prayers' }"
        :active="route.name === 'Prayers' || route.name === 'PrayersList' || route.name === 'PrayerView'"
      ></v-list-item>
      
      <!-- Категории молитв (показываются только на странице Prayers) -->
      <template v-if="isPrayersPage">
        <v-divider class="my-2"></v-divider>
        <v-list-subheader>Катэгорыі</v-list-subheader>
        <v-list-item 
          prepend-icon="mdi-format-list-text" 
          title="Усе малітвы"
          @click="selectCategory(null)"
          :active="!selectedCategory"
        ></v-list-item>
        <v-list-item 
          prepend-icon="mdi-heart" 
          title="Абраныя малітвы" 
          :to="{ name: 'FavoritePrayers' }"
          :active="route.name === 'FavoritePrayers'"
        ></v-list-item>
        <v-list-item
          v-for="category in settings.menuCategories"
          :key="category.name"
          prepend-icon="mdi-label-outline"
          :title="category.name"
          @click="selectCategory(category)"
          :active="selectedCategory?.name === category.name"
        ></v-list-item>
      </template>
      
      <v-divider class="my-2"></v-divider>
      
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
        
        <v-list-item prepend-icon="mdi-logout" title="Выйсці" @click="auth.logout"></v-list-item>
      </template>

    </v-list>
  </v-navigation-drawer>
</template>

<script setup>
import { computed } from 'vue';
import { useAppBar } from '@/composables/useAppBar.js';
import { useAuthStore } from '@/stores/auth.js';
import { useRoute } from 'vue-router';
import { useSettingsStore } from '@/stores/settings.js';
import { usePrayersFilters } from '@/composables/usePrayersFilters.js';

const { isDrawerOpen } = useAppBar();
const auth = useAuthStore();
const route = useRoute();
const settings = useSettingsStore();
const { selectedCategory, setSelectedCategory } = usePrayersFilters();

const isPrayersPage = computed(() => {
  return route.name === 'Prayers' || route.name === 'PrayersList' || route.name === 'PrayerView';
});

const selectCategory = (category) => {
  setSelectedCategory(category);
  // Закрываем drawer после выбора категории
  isDrawerOpen.value = false;
};
</script>