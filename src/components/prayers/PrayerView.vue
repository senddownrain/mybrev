<template>
  <v-container v-if="prayer" class="prayer-view-container">
    <div class="prayer-content-area">
      <h1 class="text-h4 font-weight-light mb-4 prayer-title" v-html="getTitle(prayer)"></h1>
      
      <div v-if="prayer.tags && prayer.tags.length > 0" class="mb-4">
        <v-chip
          v-for="tag in prayer.tags"
          :key="tag"
          size="small"
          color="primary"
          variant="tonal"
          class="mr-2 mb-2"
        >
          {{ tag }}
        </v-chip>
      </div>

      <div v-html="getText(prayer)" class="prayer-text"></div>
    </div>
  </v-container>
  
  <v-container v-else class="text-center">
    <v-progress-circular indeterminate color="primary"></v-progress-circular>
    <p class="mt-4">Загрузка малітвы...</p>
  </v-container>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { usePrayers } from '@/composables/usePrayers';

const route = useRoute();
const { prayers, getTitle, getText } = usePrayers();

const prayer = computed(() => {
  return prayers.value.find(p => p.id === route.params.id);
});
</script>

<style scoped>
.prayer-view-container {
  max-width: 100%;
}

.prayer-title {
  word-wrap: break-word;
  overflow-wrap: break-word;
  line-height: 1.3;
}

.prayer-text {
  line-height: 1.8;
  word-wrap: break-word;
  overflow-wrap: break-word;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

.prayer-text :deep(p) {
  margin-bottom: 1em;
  word-wrap: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
}

.prayer-text :deep(p:last-child) {
  margin-bottom: 0;
}

.prayer-text :deep(*) {
  max-width: 100% !important;
  word-wrap: break-word;
  overflow-wrap: break-word;
  box-sizing: border-box;
}

.prayer-text :deep(img) {
  max-width: 100% !important;
  height: auto !important;
}

.prayer-text :deep(table) {
  width: 100% !important;
  max-width: 100% !important;
  table-layout: fixed;
  word-wrap: break-word;
}

@media (max-width: 600px) {
  .prayer-view-container {
    padding: 12px 16px !important;
    max-width: 100% !important;
  }

  .prayer-content-area {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }

  .prayer-title {
    font-size: calc(1.4rem * var(--font-size-multiplier, 1)) !important;
    margin-bottom: 16px !important;
    word-wrap: break-word;
    overflow-wrap: break-word;
    line-height: 1.3 !important;
  }

  .prayer-text {
    font-size: calc(1rem * var(--font-size-multiplier, 1));
    width: 100%;
    max-width: 100%;
  }

  .prayer-text :deep(p) {
    font-size: calc(1rem * var(--font-size-multiplier, 1));
    line-height: 1.8;
  }
}
</style>

