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
        title="Літургія"
        :to="{ name: 'Today' }"
        :active="route.name === 'Today' || route.name === 'SelectedDay'"
      >
        <template #prepend>
          <PhCross :size="22" weight="light" class="drawer-icon" />
        </template>
      </v-list-item>

      <v-list-item
        title="Малітвы"
        :to="{ name: 'Prayers' }"
        :active="route.name === 'Prayers' || route.name === 'PrayersList' || route.name === 'PrayerView'"
      >
        <template #prepend>
          <PhBookBookmark :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <v-divider class="my-2"></v-divider>

      <v-list-item
        title="Абраныя малітвы"
        :to="{ name: 'FavoritePrayers' }"
        :active="route.name === 'FavoritePrayers'"
      >
        <template #prepend>
          <PhHeart :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <v-list-item
        title="Марыйныя"
        @click="selectCategoryByName('Марыйныя')"
        :active="selectedCategory?.name === 'Марыйныя'"
      >
        <template #prepend>
          <PhBookmark :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <v-list-item
        title="Літаніі"
        @click="selectCategoryByName('Літаніі')"
        :active="selectedCategory?.name === 'Літаніі'"
      >
        <template #prepend>
          <PhBookmark :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <v-list-item
        title="Навэнны"
        @click="selectCategoryByName('Навэнны')"
        :active="selectedCategory?.name === 'Навэнны'"
      >
        <template #prepend>
          <PhBookmark :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <v-divider class="my-2"></v-divider>

      <v-list-item
        title="Налады"
        :to="{ name: 'Settings' }"
        :active="route.name === 'Settings'"
      >
        <template #prepend>
          <PhGear :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <v-divider class="my-2"></v-divider>

      <v-list-item v-if="!auth.user" title="Уваход" to="/login">
        <template #prepend>
          <PhSignIn :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <template v-if="auth.user">
        <v-list-item v-if="auth.isAdmin" title="Панэль адміністратара" to="/admin">
          <template #prepend>
            <PhShieldCheck :size="22" class="drawer-icon" />
          </template>
        </v-list-item>
        <v-list-item title="Выйсці" @click="auth.logout">
          <template #prepend>
            <PhSignOut :size="22" class="drawer-icon" />
          </template>
        </v-list-item>
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
import {
  PhCross, PhBookBookmark, PhHeart, PhBookmark,
  PhGear, PhSignIn, PhSignOut, PhShieldCheck,
} from '@phosphor-icons/vue';

const { isDrawerOpen } = useAppBar();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const settings = useSettingsStore();
const { selectedCategory, setSelectedCategory } = usePrayersFilters();

const isPrayersPage = computed(() =>
  route.name === 'Prayers' || route.name === 'PrayersList' || route.name === 'PrayerView',
);

const selectCategory = (category) => {
  setSelectedCategory(category);
  isDrawerOpen.value = false;
};

const selectCategoryByName = (categoryName) => {
  const category = settings.menuCategories.find(cat => cat.name === categoryName);
  if (category) {
    selectCategory(category);
    router.push({ name: 'Prayers' });
  }
};
</script>

<style scoped>
.drawer-icon {
  margin-right: 16px;
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
</style>
