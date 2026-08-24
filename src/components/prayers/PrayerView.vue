<template>
  <v-container v-if="prayer" class="prayer-view-container">
    <div class="prayer-content-area">
      <!-- Режим редактирования -->
      <template v-if="isEditing">
        <v-text-field
          v-model="editForm.title"
          label="Назва"
          variant="outlined"
          class="mb-4 prayer-title-field"
          :rules="[validatePrayerTitle]"
          counter="200"
          required
        ></v-text-field>

        <div class="mb-4">
          <label class="text-caption text-medium-emphasis mb-2 d-block">Тэкст малітвы</label>
          <quill-editor
            v-model:content="editForm.text"
            contentType="html"
            theme="snow"
            toolbar="essential"
            class="prayer-text-editor"
          />
        </div>

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
        <article class="prayer-reading-surface">
          <header class="prayer-reading-header">
            <div class="prayer-reading-eyebrow">Малітва</div>
            <!-- Plain text interpolation — no v-html, no XSS risk -->
            <h1 class="prayer-title">{{ getTitle(prayer) }}</h1>

            <div v-if="prayer.tags && prayer.tags.length > 0" class="prayer-tags">
              <v-chip
                v-for="tag in prayer.tags"
                :key="tag"
                size="small"
                color="primary"
                variant="tonal"
              >
                {{ tag }}
              </v-chip>
            </div>
          </header>

          <!-- Prayer body is trusted rich HTML from the database -->
          <div v-html="getText(prayer)" class="prayer-text"></div>
        </article>
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
import { ref, computed, watch, onUnmounted, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { usePrayers } from '@/composables/usePrayers';
import { useNotifier } from '@/composables/useNotifier';
import { useUiStore } from '@/stores/ui';
import { validatePrayerTitle, validatePrayerText } from '@/utils/validators';
import { logger } from '@/utils/logger';

const route = useRoute();
const { prayers, isLoading, getTitle, getText, updatePrayer, allTags } = usePrayers();
const { notifySuccess, notifyError } = useNotifier();
const uiStore = useUiStore();

const prayer = computed(() => {
  return prayers.value.find(p => p.id === route.params.id);
});

const isEditing = ref(false);
const saving = ref(false);
const copySuccess = ref(false);
let copyTimeoutId = null;

const editForm = ref({
  title: '',
  text: '',
  tags: []
});

// Sync local edit state to store so Default.vue and PrayerBar can observe it reactively
watch([isEditing, saving], ([editing, isSaving]) => {
  uiStore.prayerIsEditing = editing;
  uiStore.prayerSaving = isSaving;
});

watch(prayer, (newPrayer) => {
  if (newPrayer && isEditing.value) {
    loadPrayerData();
  }
}, { immediate: true });

// Register action handlers with the Pinia store on mount — replaces window events
onMounted(() => {
  uiStore.registerPrayerActions({
    toggleEdit,
    cancelEdit,
    save: savePrayer,
  });
  // Sync initial state
  uiStore.prayerIsEditing = isEditing.value;
  uiStore.prayerSaving = saving.value;
});

onUnmounted(() => {
  uiStore.clearPrayerActions();
  if (copyTimeoutId) {
    clearTimeout(copyTimeoutId);
  }
});

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
    savePrayer();
  } else {
    loadPrayerData();
    isEditing.value = true;
  }
}

function cancelEdit() {
  if (isEditing.value) {
    isEditing.value = false;
    loadPrayerData();
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

  const resetCopySuccess = () => {
    copySuccess.value = false;
    copyTimeoutId = null;
  };

  try {
    await navigator.clipboard.writeText(textToCopy);
    copySuccess.value = true;
    notifySuccess('Тэкст скапіяваны');
    copyTimeoutId = setTimeout(resetCopySuccess, 2000);
  } catch {
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
      copyTimeoutId = setTimeout(resetCopySuccess, 2000);
    } catch (err) {
      logger.error('Failed to copy prayer text:', err);
    } finally {
      document.body.removeChild(textArea);
    }
  }
}

// Expose for parent components that may use template refs
defineExpose({
  isEditing,
  toggleEdit,
  copyText,
  copySuccess,
});
</script>

<style scoped>
.prayer-view-container {
  width: min(100%, 960px);
  max-width: 960px;
  padding-top: 12px;
}

.prayer-title {
  max-width: 760px;
  margin: 0;
  color: rgb(var(--v-theme-on-surface));
  font-size: calc(clamp(1.55rem, 5.6vw, 2.05rem) * var(--font-size-multiplier, 1));
  font-weight: 720;
  word-wrap: break-word;
  overflow-wrap: break-word;
  line-height: 1.22;
  letter-spacing: -0.02em;
}

.prayer-reading-surface {
  margin: 0 12px;
  overflow: hidden;
  border: 1px solid var(--nav-border);
  border-radius: 28px;
  background: var(--nav-surface);
  color: var(--nav-on-surface);
  box-shadow: 0 5px 20px var(--nav-button-shadow);
  font-family: var(--app-font-family, sans-serif);
}

.prayer-reading-header {
  padding: 24px 26px 22px;
  border-bottom: 1px solid var(--nav-border);
  background:
    radial-gradient(circle at 92% 18%, rgba(var(--v-theme-primary), 0.13) 0, rgba(var(--v-theme-primary), 0.13) 44px, transparent 45px),
    linear-gradient(145deg, rgba(var(--v-theme-primary), 0.08), transparent 62%);
}

.prayer-reading-eyebrow {
  margin-bottom: 8px;
  color: rgb(var(--v-theme-primary));
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.prayer-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 14px;
}

.prayer-text {
  padding: 28px 26px 32px;
  color: rgb(var(--v-theme-on-surface));
  font-family: var(--app-font-family, sans-serif);
  font-size: calc(1.04rem * var(--font-size-multiplier, 1));
  line-height: 1.78;
  word-wrap: break-word;
  overflow-wrap: break-word;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
  text-align: left !important;
  hanging-punctuation: first last;
  hyphens: auto;
  text-wrap: pretty;
}

.prayer-text :deep(p) {
  margin-bottom: 1em;
  font-size: inherit;
  line-height: inherit;
  word-wrap: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
  text-align: left !important;
}

.prayer-text :deep(*) {
  text-align: left !important;
}

.prayer-text :deep([style*="text-align: justify"]),
.prayer-text :deep([style*="text-align:justify"]) {
  text-align: left !important;
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
    padding: 8px 4px !important;
    max-width: 100% !important;
  }

  .prayer-reading-surface {
    margin-inline: 8px;
    border-radius: 24px;
  }

  .prayer-reading-header {
    padding: 21px 20px 19px;
  }

  .prayer-text {
    padding: 24px 20px 28px;
  }

  .prayer-content-area {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }

  .prayer-title {
    font-size: calc(1.55rem * var(--font-size-multiplier, 1)) !important;
    word-wrap: break-word;
    overflow-wrap: break-word;
    line-height: 1.3 !important;
  }

  .prayer-text {
    font-size: calc(1.04rem * var(--font-size-multiplier, 1));
    width: 100%;
    max-width: 100%;
  }

  .prayer-text :deep(p) {
    font-size: inherit;
    line-height: inherit;
  }
}

/* Стили для QuillEditor */
.prayer-text-editor :deep(.ql-toolbar.ql-snow) {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-left: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px 4px 0 0;
}

.prayer-text-editor :deep(.ql-container.ql-snow) {
  border-left: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-top: none;
  border-radius: 0 0 4px 4px;
  min-height: 200px;
}

.prayer-text-editor :deep(.ql-editor) {
  min-height: 200px;
  font-size: 1rem;
}

/* Поле названия — текст не должен обрезаться */
.prayer-title-field :deep(.v-field__input) {
  white-space: normal !important;
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
  word-break: break-word !important;
  text-overflow: unset !important;
  overflow: visible !important;
}

.prayer-title-field :deep(input) {
  white-space: normal !important;
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
  word-break: break-word !important;
}
</style>
