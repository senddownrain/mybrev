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
        <article class="prayer-reading-surface" :class="{ 'prayer-reading-surface--mass': isMassOrder }">
          <header class="prayer-reading-header">
            <div class="prayer-reading-eyebrow">{{ isMassOrder ? 'Літургія' : 'Малітва' }}</div>
            <!-- Plain text interpolation — no v-html, no XSS risk -->
            <h1 class="prayer-title">{{ getTitle(prayer) }}</h1>

            <div v-if="prayer.tags && prayer.tags.length > 0" class="prayer-tags">
              <v-chip
                v-for="tag in prayer.tags"
                :key="tag"
                size="small"
                variant="tonal"
                class="prayer-tag"
              >
                {{ tag }}
              </v-chip>
            </div>
          </header>

          <nav v-if="isMassOrder && massSections.length" class="mass-sections" aria-label="Раздзелы святой Імшы">
            <span class="mass-sections__label">Перайсці да раздзела</span>
            <button
              v-for="section in massSections"
              :key="section.id"
              type="button"
              class="mass-sections__link"
              @click="scrollToMassSection(section.id)"
            >
              {{ section.title }}
            </button>
          </nav>

          <!-- Prayer body is trusted rich HTML from the database -->
          <div ref="prayerTextElement" v-html="getText(prayer)" class="prayer-text"></div>
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
import { ref, computed, watch, nextTick, onUnmounted, onMounted } from 'vue';
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
const MASS_ORDER_PRAYER_ID = 'eMmCtxwyJ75ogmL5rwye';
const prayerTextElement = ref(null);
const massSections = ref([]);

const prayer = computed(() => {
  return prayers.value.find(p => p.id === route.params.id);
});
const isMassOrder = computed(() => route.params.id === MASS_ORDER_PRAYER_ID);

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
  updateMassSections();
});

watch([() => route.params.id, prayer], () => {
  updateMassSections();
}, { flush: 'post' });

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

async function updateMassSections() {
  await nextTick();
  if (!isMassOrder.value || !prayerTextElement.value) {
    massSections.value = [];
    return;
  }

  massSections.value = Array.from(prayerTextElement.value.querySelectorAll('h2, h3'))
    .map((heading, index) => {
      const title = heading.textContent.trim();
      if (!title) return null;
      const id = `mass-section-${index}`;
      heading.id = id;
      heading.tabIndex = -1;
      return { id, title };
    })
    .filter(Boolean);

  markMassSpeakerLabels();
  markStandaloneMassRubrics();
}

function scrollToMassSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function markMassSpeakerLabels() {
  const root = prayerTextElement.value;
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let currentNode = walker.nextNode();

  while (currentNode) {
    if (!currentNode.parentElement?.matches('.mass-speaker, .mass-rubric-inline')) {
      textNodes.push(currentNode);
    }
    currentNode = walker.nextNode();
  }

  textNodes.forEach((textNode) => {
    const parts = textNode.nodeValue.split(/([СCН]\.:|Альбо:)/g);
    if (parts.length === 1) return;

    const fragment = document.createDocumentFragment();
    parts.forEach((part) => {
      if (/^[СCН]\.:$/.test(part) || part === 'Альбо:') {
        const label = document.createElement('span');
        label.className = part === 'Альбо:' ? 'mass-rubric-inline' : 'mass-speaker';
        label.textContent = part;
        fragment.appendChild(label);
      } else if (part) {
        fragment.appendChild(document.createTextNode(part));
      }
    });
    textNode.replaceWith(fragment);
  });
}

function markStandaloneMassRubrics() {
  const rubricPattern = /^(Святар|Народ|Усе|Дыякан|Біскуп|Цэлебрант|Лектар|Псальміст|Кантар)[^.!?]*:$/;

  prayerTextElement.value?.querySelectorAll('p').forEach((paragraph) => {
    if (rubricPattern.test(paragraph.textContent.trim())) {
      paragraph.classList.add('mass-rubric-line');
    }
  });
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
  padding: 0 !important;
}

.prayer-content-area {
  padding-inline: 0;
}

.prayer-title {
  max-width: 760px;
  margin: 0;
  color: rgb(var(--v-theme-on-surface));
  font-size: calc(clamp(1.55rem, 5.6vw, 2.05rem) * var(--font-size-multiplier, 1));
  font-family: var(--reader-display-font-family);
  font-weight: 700;
  word-wrap: break-word;
  overflow-wrap: break-word;
  line-height: 1.22;
  letter-spacing: -0.02em;
}

.prayer-reading-surface {
  width: 100%;
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--reader-border);
  border-radius: 28px;
  background: var(--reader-surface);
  color: var(--reader-ink);
  box-shadow: var(--reader-shadow);
  font-family: var(--reader-font-family);
}

.prayer-reading-surface--mass {
  --mass-rubric-font-size: calc(0.83rem * var(--font-size-multiplier, 1));
}

.prayer-reading-header {
  padding: 24px 20px 22px;
  border-bottom: 1px solid var(--reader-border);
  background:
    radial-gradient(circle at 92% 18%, rgba(var(--devotional-rgb), 0.15) 0, rgba(var(--devotional-rgb), 0.15) 44px, transparent 45px),
    linear-gradient(145deg, var(--devotional-soft), transparent 62%);
}

.prayer-reading-eyebrow {
  margin-bottom: 8px;
  color: var(--devotional-accent);
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

.prayer-tag {
  border-color: rgba(var(--devotional-rgb), 0.18) !important;
  background: var(--devotional-soft) !important;
  color: var(--devotional-accent) !important;
}

.mass-sections {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 15px 20px;
  border-bottom: 1px solid var(--reader-border);
  background: color-mix(in srgb, var(--reader-surface) 90%, var(--devotional-soft));
}

.mass-sections__label {
  margin-right: 2px;
  color: var(--devotional-accent);
  font-size: 0.73rem;
  font-weight: 750;
}

.mass-sections__link {
  padding: 6px 10px;
  border: 1px solid rgba(var(--devotional-rgb), 0.25);
  border-radius: 999px;
  background: transparent;
  color: var(--reader-ink);
  font: inherit;
  font-size: 0.78rem;
  line-height: 1.2;
  cursor: pointer;
}

.mass-sections__link:hover,
.mass-sections__link:focus-visible {
  border-color: var(--devotional-accent);
  background: var(--devotional-soft);
  outline: none;
}

.prayer-text {
  padding: 24px 20px 30px;
  color: var(--reader-ink);
  font-family: var(--reader-font-family);
  font-optical-sizing: auto;
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

/* Rubrics in the Mass order are marked up as emphasis in the source. */
.prayer-reading-surface--mass .prayer-text :deep(h2),
.prayer-reading-surface--mass .prayer-text :deep(h3) {
  scroll-margin-top: 18px;
  margin: 1em 0 0.42em;
  padding: 0 0 0.42em 0.7em;
  border-bottom: 1px solid var(--reader-border);
  border-left: 3px solid var(--rubric-color);
  color: var(--rubric-color);
  font-family: var(--reader-display-font-family);
  font-size: 1.08em;
  line-height: 1.3;
}

.prayer-reading-surface--mass .prayer-text :deep(h2:first-child),
.prayer-reading-surface--mass .prayer-text :deep(h3:first-child) {
  margin-top: 0;
}

.prayer-reading-surface--mass .prayer-text :deep(em) {
  display: block;
  margin: 0.06em 0 0;
  color: var(--rubric-color);
  font-size: var(--mass-rubric-font-size) !important;
  font-style: normal;
  font-weight: 400;
  line-height: 1.35;
}

.prayer-reading-surface--mass .prayer-text :deep(em *) {
  font-size: var(--mass-rubric-font-size) !important;
  font-style: normal !important;
  font-weight: 400 !important;
  line-height: 1.35 !important;
}

.prayer-reading-surface--mass .prayer-text :deep(p) {
  margin-top: 0;
  margin-bottom: 0.16em;
}

.prayer-reading-surface--mass .prayer-text :deep(p:empty),
.prayer-reading-surface--mass .prayer-text :deep(p:has(> br:only-child)) {
  display: none;
}

.prayer-reading-surface--mass .prayer-text :deep(br + br) {
  display: none;
}

.prayer-reading-surface--mass .prayer-text :deep(em + br) {
  display: none;
}

.prayer-reading-surface--mass .prayer-text :deep(span:has(> em:only-child) + br),
.prayer-reading-surface--mass .prayer-text :deep(span:has(> em:only-child) + span:has(> br:only-child)) {
  display: none;
}

.prayer-reading-surface--mass .prayer-text :deep(.mass-rubric-inline),
.prayer-reading-surface--mass .prayer-text :deep(.mass-speaker) {
  color: var(--rubric-color);
  font-size: var(--mass-rubric-font-size);
  font-weight: 400;
}

.prayer-reading-surface--mass .prayer-text :deep(.mass-rubric-line) {
  margin: 0;
  color: var(--rubric-color);
  font-size: var(--mass-rubric-font-size);
  font-weight: 400;
  line-height: 1.35;
}

.prayer-reading-surface--mass .prayer-text :deep(.mass-speaker) {
  display: inline-block;
  min-width: 1.65em;
}

.prayer-reading-surface--mass .prayer-text :deep(strong) {
  color: var(--reader-ink);
  font-weight: 760;
}

.prayer-reading-surface--mass .prayer-text :deep(p:has(> strong:only-child)) {
  margin-top: 0.35em;
  color: var(--rubric-color);
  font-family: var(--reader-display-font-family);
  font-size: 0.94em;
  font-weight: 400;
  line-height: 1.35;
}

@media (max-width: 600px) {
  .prayer-view-container {
    padding: 0 !important;
    max-width: 100% !important;
  }

  .prayer-reading-surface {
    border-right: 0;
    border-left: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .prayer-reading-header {
    padding: 21px 16px 19px;
  }

  .mass-sections {
    padding: 13px 16px;
    gap: 7px;
  }

  .mass-sections__label {
    width: 100%;
  }

  .prayer-text {
    padding: 22px 16px 28px;
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
