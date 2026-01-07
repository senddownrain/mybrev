<template>
  <v-navigation-drawer v-model="isDrawerOpen" temporary>
    <div v-if="auth.loading" class="text-center py-4">
      <v-progress-circular indeterminate color="primary"></v-progress-circular>
    </div>

    <div class="text-center py-4">
      <img src="/favicon.svg" alt="Logo" style="height: 180px; width: auto;" />
    </div>

    <v-list>
      <v-list-item 
        prepend-icon="mdi-home-outline" 
        title="Літургія" 
        :to="{ name: 'Today' }"
        :active="route.name === 'Today' || route.name === 'SelectedDay'"
      ></v-list-item>
      <!-- <v-list-item 
        prepend-icon="mdi-book-open-variant-outline" 
        title="Чытанні" 
        :to="{ name: 'Readings' }"
        :active="route.name === 'Readings' || route.name === 'ReadingsByDate' || route.name === 'ReadingsPicker'"
      ></v-list-item> -->
      <v-list-item 
        prepend-icon="mdi-book-heart-outline" 
        title="Малітвы" 
        :to="{ name: 'Prayers' }"
        :active="route.name === 'Prayers' || route.name === 'PrayersList' || route.name === 'PrayerView'"
      ></v-list-item>

      <v-divider class="my-2"></v-divider>
      <v-list-item
        prepend-icon="mdi-heart"
        title="Абраныя малітвы"
        :to="{ name: 'FavoritePrayers' }"
        :active="route.name === 'FavoritePrayers'"
      ></v-list-item>
      <v-list-item
        prepend-icon="mdi-format-list-text"
        title="Марыйныя"
        @click="selectCategoryByName('Марыйныя')"
        :active="selectedCategory?.name === 'Марыйныя'"
      ></v-list-item>
      <v-list-item
        prepend-icon="mdi-format-list-text"
        title="Літаніі"
        @click="selectCategoryByName('Літаніі')"
        :active="selectedCategory?.name === 'Літаніі'"
      ></v-list-item>
      <v-list-item
        prepend-icon="mdi-format-list-text"
        title="Навэнны"
        @click="selectCategoryByName('Навэнны')"
        :active="selectedCategory?.name === 'Навэнны'"
      ></v-list-item>
      
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
import { useRoute, useRouter } from 'vue-router';
import { useSettingsStore } from '@/stores/settings.js';
import { usePrayersFilters } from '@/composables/usePrayersFilters.js';

const { isDrawerOpen } = useAppBar();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
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

const selectCategoryByName = (categoryName) => {
  // Находим категорию по имени в settings.menuCategories
  const category = settings.menuCategories.find(cat => cat.name === categoryName);
  if (category) {
    selectCategory(category);
    // Переходим на страницу молитв
    router.push({ name: 'Prayers' });
  }
};
</script>