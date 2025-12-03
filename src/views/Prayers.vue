<template>
  <v-container>
    <v-list lines="one" bg-color="transparent">
      <v-list-item 
        prepend-icon="mdi-format-list-text" 
        title="Усе малітвы"
        @click="navigateToCategory(null)"
        :active="!selectedCategory"
      ></v-list-item>
      
      <v-list-item
        v-for="category in settings.menuCategories"
        :key="category.name"
        prepend-icon="mdi-label-outline"
        :title="category.name"
        @click="navigateToCategory(category)"
        :active="selectedCategory?.name === category.name"
      ></v-list-item>
    </v-list>

    <PrayersList :selected-category="selectedCategory" />
  </v-container>
</template>

<script setup>
import { ref } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import PrayersList from '@/components/prayers/PrayersList.vue';

const settings = useSettingsStore();
const selectedCategory = ref(null);

function navigateToCategory(category) {
  selectedCategory.value = category;
}
</script>

