<template>
  <v-container v-if="prayer" class="prayer-view-container">
    <div class="d-flex align-center mb-4">
      <v-btn
        icon="mdi-arrow-left"
        variant="text"
        @click="goBack"
        class="mr-2"
        aria-label="Вярнуцца назад"
      ></v-btn>
      <v-spacer></v-spacer>
      <v-btn
        icon="mdi-content-copy"
        variant="text"
        @click="copyText"
        :title="copyButtonText"
        aria-label="Скапіяваць тэкст малітвы"
      >
        <v-icon>{{ copySuccess ? 'mdi-check' : 'mdi-content-copy' }}</v-icon>
      </v-btn>
    </div>
    
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
  
  <v-container v-else-if="isLoading" class="text-center">
    <v-progress-circular indeterminate color="primary"></v-progress-circular>
    <p class="mt-4">Загрузка малітвы...</p>
  </v-container>
  
  <v-container v-else class="text-center">
    <v-icon size="64" class="mb-4" color="grey">mdi-file-question-outline</v-icon>
    <h2 class="text-h5 mb-4">Малітва не знойдзена</h2>
    <p class="text-medium-emphasis mb-6">Малітва з такім ID не існуе або была выдалена</p>
    <v-btn color="primary" :to="{ name: 'PrayersList' }">Вярнуцца да спісу малітваў</v-btn>
  </v-container>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePrayers } from '@/composables/usePrayers';
import { useNotifier } from '@/composables/useNotifier';
import { logger } from '@/utils/logger';

const route = useRoute();
const router = useRouter();
const { prayers, isLoading, getTitle, getText } = usePrayers();
const { notifySuccess } = useNotifier();

const prayer = computed(() => {
  return prayers.value.find(p => p.id === route.params.id);
});

const copySuccess = ref(false);
const copyButtonText = computed(() => copySuccess.value ? 'Скапіявана!' : 'Скапіяваць тэкст');

function goBack() {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push({ name: 'PrayersList' });
  }
}

let copyTimeoutId = null;

async function copyText() {
  if (!prayer.value) return;
  
  if (copyTimeoutId) {
    clearTimeout(copyTimeoutId);
  }
  
  const title = getTitle(prayer.value);
  const text = getText(prayer.value);
  
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const plainText = doc.body.textContent || text;
  
  const textToCopy = `${title}\n\n${plainText}`;
  
  try {
    await navigator.clipboard.writeText(textToCopy);
    copySuccess.value = true;
    notifySuccess('Тэкст скапіяваны');
    copyTimeoutId = setTimeout(() => {
      copySuccess.value = false;
      copyTimeoutId = null;
    }, 2000);
  } catch (error) {
    const textArea = document.createElement('textarea');
    textArea.value = textToCopy;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      copySuccess.value = true;
      notifySuccess('Тэкст скапіяваны');
      copyTimeoutId = setTimeout(() => {
        copySuccess.value = false;
        copyTimeoutId = null;
      }, 2000);
    } catch (err) {
      logger.error('Не атрымалася скапіяваць тэкст:', err);
    } finally {
      document.body.removeChild(textArea);
    }
  }
}

onUnmounted(() => {
  if (copyTimeoutId) {
    clearTimeout(copyTimeoutId);
  }
});

watch([isLoading, prayer], ([loading, foundPrayer]) => {
  if (!loading && !foundPrayer && prayers.value.length > 0) {
  }
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

