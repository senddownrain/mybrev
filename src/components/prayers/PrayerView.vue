<template>
  <v-container v-if="prayer" class="prayer-view-container">
    <div class="prayer-content-area">
      <!-- Режим редактирования -->
      <template v-if="isEditing">
        <v-text-field
          v-model="editForm.title"
          label="Назва"
          variant="outlined"
          class="mb-4"
          :rules="[validatePrayerTitle]"
          counter="200"
          required
        ></v-text-field>

        <v-textarea
          v-model="editForm.text"
          label="Тэкст малітвы"
          variant="outlined"
          rows="15"
          class="mb-4"
          :rules="[validatePrayerText]"
          required
        ></v-textarea>

        <v-combobox
          v-model="editForm.tags"
          :items="allTags"
          label="Тэгі"
          multiple
          chips
          clearable
          variant="outlined"
          class="mb-4"
        ></v-combobox>
      </template>

      <!-- Режим просмотра -->
      <template v-else>
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
      </template>
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
import { ref, computed, watch, onUnmounted, onMounted, provide } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePrayers } from '@/composables/usePrayers';
import { useNotifier } from '@/composables/useNotifier';
import { useAuthStore } from '@/stores/auth';
import { validatePrayerTitle, validatePrayerText } from '@/utils/validators';
import { logger } from '@/utils/logger';

const route = useRoute();
const router = useRouter();
const { prayers, isLoading, getTitle, getText, updatePrayer, allTags } = usePrayers();
const { notifySuccess, notifyError } = useNotifier();
const authStore = useAuthStore();

const prayer = computed(() => {
  return prayers.value.find(p => p.id === route.params.id);
});

const isEditing = ref(false);
const saving = ref(false);

const editForm = ref({
  title: '',
  text: '',
  tags: []
});

// Предоставляем функции для PrayerBar
provide('prayerView', {
  isEditing,
  toggleEdit: () => toggleEdit(),
  saving
});

watch(prayer, (newPrayer) => {
  if (newPrayer && isEditing.value) {
    loadPrayerData();
  }
}, { immediate: true });

// Слушаем события от PrayerBar и отправляем обновления состояния
onMounted(() => {
  window.addEventListener('prayer-toggle-edit', toggleEdit);
  
  // Отправляем начальное состояние
  updatePrayerBarState();
});

onUnmounted(() => {
  window.removeEventListener('prayer-toggle-edit', toggleEdit);
});

// Отслеживаем изменения состояния и отправляем в PrayerBar
watch([isEditing, saving], () => {
  updatePrayerBarState();
});

function updatePrayerBarState() {
  window.dispatchEvent(new CustomEvent('prayer-state-update', {
    detail: {
      isEditing: isEditing.value,
      saving: saving.value
    }
  }));
}

function loadPrayerData() {
  if (!prayer.value) return;
  
  if (prayer.value.titleVersions) {
    editForm.value.title = prayer.value.titleVersions.be || prayer.value.titleVersions.ru || Object.values(prayer.value.titleVersions)[0] || '';
  } else {
    editForm.value.title = prayer.value.title || '';
  }
  
  if (prayer.value.textVersions) {
    editForm.value.text = prayer.value.textVersions.be || prayer.value.textVersions.ru || Object.values(prayer.value.textVersions)[0] || '';
  } else {
    editForm.value.text = prayer.value.text || '';
  }
  
  editForm.value.tags = prayer.value.tags || [];
}

function toggleEdit() {
  if (isEditing.value) {
    // Сохраняем изменения
    savePrayer();
  } else {
    // Включаем режим редактирования
    loadPrayerData();
    isEditing.value = true;
  }
}

async function savePrayer() {
  const titleValidation = validatePrayerTitle(editForm.value.title);
  const textValidation = validatePrayerText(editForm.value.text);
  
  if (titleValidation !== true) {
    notifyError(titleValidation);
    return;
  }
  
  if (textValidation !== true) {
    notifyError(textValidation);
    return;
  }

  saving.value = true;
  try {
    await updatePrayer(route.params.id, editForm.value);
    notifySuccess('Малітва абноўлена');
    isEditing.value = false;
  } catch (error) {
    notifyError('Памылка пры абнаўленні малітвы');
    logger.error('Error updating prayer:', error);
  } finally {
    saving.value = false;
  }
}

// Экспортируем для использования в PrayerBar
defineExpose({
  isEditing,
  toggleEdit
});

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

