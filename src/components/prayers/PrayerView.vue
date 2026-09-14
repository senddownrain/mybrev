<template>
  <v-container v-if="prayer" class="prayer-view-container">
    <div class="prayer-content-area" @click="navigatePrayerLink">
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

          <div ref="prayerTextElement" v-html="prayerHtml" class="prayer-text"></div>
          <footer v-if="prayer.source" class="prayer-source">
            <span class="prayer-source__label">Крыніца:</span>
            <span class="prayer-source__content" v-html="sourceHtml" />
          </footer>
      </article>
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
import '@/styles/prayer-reading.css';
import { ref, computed, watch, nextTick, onUnmounted, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePrayers } from '@/composables/usePrayers';
import { useNotifier } from '@/composables/useNotifier';
import { useUiStore } from '@/stores/ui';
import { logger } from '@/utils/logger';
import {
  prayerMarkdownToPlainText,
  renderPrayerMarkdown,
} from '@/utils/prayerMarkdown';

const route = useRoute();
const router = useRouter();
const { prayers, isLoading, getTitle, getText } = usePrayers();
const { notifySuccess } = useNotifier();
const uiStore = useUiStore();
const MASS_ORDER_PRAYER_ID = 'eMmCtxwyJ75ogmL5rwye';
const prayerTextElement = ref(null);
const massSections = ref([]);

const prayer = computed(() => {
  return prayers.value.find(p => p.id === route.params.id);
});
const isMassOrder = computed(() => route.params.id === MASS_ORDER_PRAYER_ID);
const prayerHtml = computed(() => renderPrayerMarkdown(getText(prayer.value), prayer.value?.textFormat));
const sourceHtml = computed(() => renderPrayerMarkdown(prayer.value?.source || ''));

const copySuccess = ref(false);
let copyTimeoutId = null;

// Editing always opens the full form, which includes the live preview column.
onMounted(() => {
  uiStore.registerPrayerActions({ toggleEdit });
  uiStore.prayerIsEditing = false;
  uiStore.prayerSaving = false;
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

function toggleEdit() {
  router.push({ name: 'PrayerEdit', params: { id: route.params.id } });
}

function navigatePrayerLink(event) {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest?.('a[href]');
  if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return;
  const destination = router.resolve(`${url.pathname}${url.search}${url.hash}`);
  if (destination.name !== 'PrayerView') return;
  event.preventDefault();
  router.push(destination.fullPath);
}

async function copyText() {
  if (!prayer.value) return;

  if (copyTimeoutId) {
    clearTimeout(copyTimeoutId);
  }

  const title = getTitle(prayer.value);
  const plainText = prayerMarkdownToPlainText(getText(prayer.value), prayer.value.textFormat);

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
  toggleEdit,
  copyText,
  copySuccess,
});
</script>
<style scoped src="@/styles/prayer-reading.css"></style>
