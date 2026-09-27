<template>
  <v-container v-if="prayer" class="prayer-view-container">
    <div class="prayer-content-area" @click="navigatePrayerLink">
      <article
        class="prayer-reading-surface"
        :class="{
          'prayer-reading-surface--mass': isMassOrder,
          'prayer-reading-surface--mass-strong-responses': isMassOrder && massVariant?.strongMarksResponses,
        }"
      >
          <header class="prayer-reading-header">
            <div class="prayer-reading-eyebrow">{{ isMassOrder ? 'Літургія' : 'Малітва' }}</div>
            <!-- Plain text interpolation — no v-html, no XSS risk -->
            <h1 class="prayer-title" :lang="isMassOrder ? massLanguage : undefined">{{ displayTitle }}</h1>

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

            <div
              v-if="isMassOrder"
              class="mass-languages"
              role="radiogroup"
              aria-label="Мова святой Імшы"
            >
              <button
                v-for="variant in MASS_RITUAL.variants"
                :key="variant.language"
                type="button"
                role="radio"
                class="mass-languages__option"
                :class="{ 'mass-languages__option--active': variant.language === massLanguage }"
                :aria-checked="variant.language === massLanguage"
                :lang="variant.language"
                @click="selectMassLanguage(variant.language)"
              >
                {{ variant.label }}
              </button>
            </div>
          </header>

          <nav
            v-if="isMassOrder && massMajorSections.length"
            ref="massNavElement"
            class="mass-sections"
            aria-label="Раздзелы святой Імшы"
          >
            <span class="mass-sections__label">Перайсці да раздзела</span>
            <button
              v-for="section in massMajorSections"
              :key="section.sectionId"
              type="button"
              class="mass-sections__link"
              :class="{ 'mass-sections__link--active': section.sectionId === activeMajorSectionId }"
              :aria-current="section.sectionId === activeMajorSectionId ? 'location' : undefined"
              @click="scrollToMassSection(section.sectionId)"
            >
              {{ section.title }}
            </button>
            <div v-if="activeSubsections.length" class="mass-sections__sub" aria-label="Падраздзелы">
              <button
                v-for="section in activeSubsections"
                :key="section.sectionId"
                type="button"
                class="mass-sections__link mass-sections__link--sub"
                :class="{ 'mass-sections__link--active': section.sectionId === activeMassSectionId }"
                :aria-current="section.sectionId === activeMassSectionId ? 'location' : undefined"
                @click="scrollToMassSection(section.sectionId)"
              >
                {{ section.title }}
              </button>
            </div>
          </nav>

          <div
            ref="prayerTextElement"
            v-html="prayerHtml"
            class="prayer-text"
            :lang="isMassOrder && massLanguage !== 'be' ? massLanguage : undefined"
          ></div>
          <div
            v-if="isMassOrder && showMassReadingBar"
            class="mass-reading-bar"
            role="toolbar"
            aria-label="Раздзел і мова святой Імшы"
          >
            <button
              type="button"
              class="mass-reading-bar__section"
              :aria-label="`Раздзел: ${activeMassSectionTitle}. Паказаць усе раздзелы`"
              @click="scrollToMassNavigation"
            >
              {{ activeMassSectionTitle }}
            </button>
            <span class="mass-reading-bar__divider" aria-hidden="true" />
            <button
              v-for="variant in MASS_RITUAL.variants"
              :key="variant.language"
              type="button"
              class="mass-reading-bar__language"
              :class="{ 'mass-reading-bar__language--active': variant.language === massLanguage }"
              :aria-label="variant.label"
              :aria-pressed="variant.language === massLanguage"
              @click="selectMassLanguage(variant.language)"
            >
              {{ variant.shortLabel }}
            </button>
          </div>
          <footer v-if="displaySource" class="prayer-source">
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
import {
  MASS_LANGUAGE_STORAGE_KEY,
  MASS_ORDER_PRAYER_ID,
  MASS_RITUAL,
  activeMassSectionAt,
  getMassSection,
  getMassVariant,
  locateMassSections,
  resolveMassLanguage,
  resolveMassSectionTarget,
} from '@/utils/massRitual';

const route = useRoute();
const router = useRouter();
const { prayers, isLoading, getTitle, getText } = usePrayers();
const { notifySuccess } = useNotifier();
const uiStore = useUiStore();
const MASS_READING_LINE = 132;
const bundledMassTexts = {
  'order-of-mass-en.md': () => import('@/data/mass/order-of-mass-en.md?raw'),
};
const prayerTextElement = ref(null);
const massNavElement = ref(null);
const showMassReadingBar = ref(false);
const massSections = ref([]);
const activeMassSectionId = ref(null);
const massLanguage = ref(resolveMassLanguage(route.query.lang, readStoredMassLanguage()));
const bundledMassText = ref({});
let pendingMassSection = null;
let scrollFrame = 0;

const prayer = computed(() => {
  return prayers.value.find(p => p.id === route.params.id);
});
const isMassOrder = computed(() => route.params.id === MASS_ORDER_PRAYER_ID);
const massVariant = computed(() => (isMassOrder.value ? getMassVariant(massLanguage.value) : null));
// The Belarusian variant is the Mass prayer itself; other variants are their
// own prayer documents, with a bundled text used until one is published.
const massVariantPrayer = computed(() => {
  const variant = massVariant.value;
  if (!variant || variant.prayerId === MASS_ORDER_PRAYER_ID) return null;
  return prayers.value.find(p => p.id === variant.prayerId) || null;
});
const textPrayer = computed(() => massVariantPrayer.value || prayer.value);
const displayText = computed(() => {
  const variant = massVariant.value;
  if (!variant || variant.prayerId === MASS_ORDER_PRAYER_ID || massVariantPrayer.value) {
    return getText(textPrayer.value);
  }
  return bundledMassText.value[variant.bundledText] || '';
});
const displayTitle = computed(() => {
  const variant = massVariant.value;
  if (!variant || variant.prayerId === MASS_ORDER_PRAYER_ID) return getTitle(prayer.value);
  return getTitle(massVariantPrayer.value) || variant.title;
});
const displaySource = computed(() => (
  massVariant.value && massVariant.value.prayerId !== MASS_ORDER_PRAYER_ID
    ? massVariantPrayer.value?.source || massVariant.value.source || ''
    : prayer.value?.source || ''
));
const prayerHtml = computed(() => renderPrayerMarkdown(displayText.value, textPrayer.value?.textFormat));
const sourceHtml = computed(() => renderPrayerMarkdown(displaySource.value));
const massMajorSections = computed(() => massSections.value.filter(section => !section.parent));
const activeMajorSectionId = computed(() => (
  getMassSection(activeMassSectionId.value)?.parent || activeMassSectionId.value
));
const activeMassSectionTitle = computed(() => (
  massSections.value.find(section => section.sectionId === activeMassSectionId.value)?.title
  || massVariant.value?.title
  || ''
));
const activeSubsections = computed(() => massSections.value.filter(section => (
  section.parent && section.parent === activeMajorSectionId.value
)));

const copySuccess = ref(false);
let copyTimeoutId = null;

// Editing always opens the full form, which includes the live preview column.
onMounted(() => {
  uiStore.registerPrayerActions({ toggleEdit });
  uiStore.prayerIsEditing = false;
  uiStore.prayerSaving = false;
  window.addEventListener('scroll', onReaderScroll, { passive: true });
  updateMassSections();
});

watch([() => route.params.id, prayerHtml], () => {
  updateMassSections();
}, { flush: 'post' });

watch(() => route.query.lang, (lang) => {
  if (!isMassOrder.value || !getMassVariant(lang) || lang === massLanguage.value) return;
  switchMassLanguage(lang);
});

watch(massVariant, (variant) => {
  if (!variant?.bundledText || bundledMassText.value[variant.bundledText]) return;
  if (variant.prayerId === MASS_ORDER_PRAYER_ID || massVariantPrayer.value) return;
  const loader = bundledMassTexts[variant.bundledText];
  loader?.().then((module) => {
    bundledMassText.value = { ...bundledMassText.value, [variant.bundledText]: module.default };
  }).catch((err) => logger.error('Failed to load bundled Mass text:', err));
}, { immediate: true });

onUnmounted(() => {
  window.removeEventListener('scroll', onReaderScroll);
  if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
  uiStore.clearPrayerActions();
  if (copyTimeoutId) {
    clearTimeout(copyTimeoutId);
  }
});

function toggleEdit() {
  const id = massVariantPrayer.value?.id || route.params.id;
  router.push({ name: 'PrayerEdit', params: { id } });
}

function readStoredMassLanguage() {
  try {
    return localStorage.getItem(MASS_LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function selectMassLanguage(language) {
  if (language === massLanguage.value) return;
  switchMassLanguage(language);
  router.replace({ query: { ...route.query, lang: language }, hash: route.hash });
}

function switchMassLanguage(language) {
  pendingMassSection = activeMassSectionId.value;
  massLanguage.value = language;
  try {
    localStorage.setItem(MASS_LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Private mode: the choice still applies to this visit through the URL.
  }
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

  const title = displayTitle.value;
  const plainText = prayerMarkdownToPlainText(displayText.value, textPrayer.value?.textFormat);

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
    activeMassSectionId.value = null;
    return;
  }
  // A bundled variant may still be loading; keep the pending section for it.
  if (!displayText.value.trim()) {
    massSections.value = [];
    return;
  }

  const blocks = Array.from(prayerTextElement.value.querySelectorAll('h2, h3, h4, h5, h6, p, aside'));
  const located = locateMassSections(massVariant.value, blocks.map(block => block.textContent));
  massSections.value = located.map((section) => {
    const element = blocks[section.blockIndex];
    element.id = `mass-${section.sectionId}`;
    element.tabIndex = -1;
    element.dataset.massSection = section.sectionId;
    // Some sources mark sections with a rubric rather than a heading.
    if (!/^H[2-6]$/.test(element.tagName)) {
      element.classList.add(section.parent ? 'mass-section-anchor' : 'mass-section-anchor--major');
    }
    return section;
  });

  markMassSpeakerLabels();
  markStandaloneMassRubrics();

  const target = resolveMassSectionTarget(pendingMassSection, massSections.value.map(section => section.sectionId));
  pendingMassSection = null;
  if (target) {
    scrollToMassSection(target, 'auto');
  } else {
    trackActiveMassSection();
  }
}

function massSectionElement(sectionId) {
  return prayerTextElement.value?.querySelector(`[data-mass-section="${sectionId}"]`) || null;
}

function scrollToMassSection(sectionId, behavior = 'smooth') {
  const element = massSectionElement(sectionId);
  if (!element) return;
  activeMassSectionId.value = sectionId;
  element.scrollIntoView({ behavior, block: 'start' });
  element.focus({ preventScroll: true });
}

function onReaderScroll() {
  if (!isMassOrder.value || scrollFrame) return;
  scrollFrame = window.requestAnimationFrame(() => {
    scrollFrame = 0;
    trackActiveMassSection();
  });
}

function scrollToMassNavigation() {
  massNavElement.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function trackActiveMassSection() {
  // The compact bar replaces the header controls once they leave the screen.
  showMassReadingBar.value = Boolean(massNavElement.value)
    && massNavElement.value.getBoundingClientRect().bottom < 0;
  if (!massSections.value.length) {
    activeMassSectionId.value = null;
    return;
  }
  const tops = massSections.value.map(section => ({
    sectionId: section.sectionId,
    top: massSectionElement(section.sectionId)?.getBoundingClientRect().top ?? Infinity,
  }));
  activeMassSectionId.value = activeMassSectionAt(tops, MASS_READING_LINE);
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
    const parts = textNode.nodeValue.split(/([СCН]\.:|Альбо:|\bOr:)/g);
    if (parts.length === 1) return;

    const fragment = document.createDocumentFragment();
    parts.forEach((part) => {
      if (/^[СCН]\.:$/.test(part) || part === 'Альбо:' || part === 'Or:') {
        const label = document.createElement('span');
        label.className = part === 'Альбо:' || part === 'Or:' ? 'mass-rubric-inline' : 'mass-speaker';
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
