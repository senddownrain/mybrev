<template>
  <v-container v-if="prayer" class="prayer-view-container">
    <div class="prayer-content-area" @click="navigatePrayerLink">
      <article
        class="prayer-reading-surface"
        :class="{ 'prayer-reading-surface--mass': isMassOrder, 'prayer-reading-surface--office': isDevotionalOffice }"
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
          </header>

          <div
            ref="prayerTextElement"
            v-html="prayerHtml"
            class="prayer-text"
            :lang="isMassOrder && massLanguage !== 'be' ? massLanguage : undefined"
          ></div>
          <footer v-if="displaySource" class="prayer-source">
            <span class="prayer-source__label">Крыніца:</span>
            <span class="prayer-source__content" v-html="sourceHtml" />
          </footer>
      </article>
    </div>

    <!-- Primary navigation inside the Mass: one control showing the current
         major section (always in Belarusian); tapping it opens the picker. -->
    <MassSectionNav
      v-if="isMassOrder"
      :section-ids="massSectionIds"
      :active-section-id="activeMassSectionId"
      @select="scrollToMassSection"
    />
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
  activeMassSectionAt,
  getMassVariant,
  massSectionFromHash,
  resolveMassLanguage,
  resolveMassSectionTarget,
} from '@/utils/massRitual';
import { buildMassDocument, renderMassBlocks } from '@/utils/massContent';
import { devotionalOfficeProfile } from '@/utils/devotionalOffice';
import MassSectionNav from '@/components/prayers/MassSectionNav.vue';

const route = useRoute();
const router = useRouter();
const { prayers, isLoading, getTitle, getText } = usePrayers();
const { notifySuccess } = useNotifier();
const uiStore = useUiStore();
const MASS_READING_LINE = 132;
// Room taken by the floating section control when deciding what is still visible.
const MASS_DOCK_CLEARANCE = 88;
const bundledMassTexts = {
  'order-of-mass-en.md': () => import('@/data/mass/order-of-mass-en.md?raw'),
};
const prayerTextElement = ref(null);
const activeMassSectionId = ref(null);
const massLanguage = ref(resolveMassLanguage(route.query.lang, readStoredMassLanguage()));
const bundledMassText = ref({});
// A `#mass-<section>` link opens the reader at that section.
let pendingMassSection = massSectionFromHash(route.hash);
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
const isDevotionalOffice = computed(() => !isMassOrder.value && Boolean(devotionalOfficeProfile(displayTitle.value)));
const displaySource = computed(() => (
  massVariant.value && massVariant.value.prayerId !== MASS_ORDER_PRAYER_ID
    ? massVariantPrayer.value?.source || massVariant.value.source || ''
    : prayer.value?.source || ''
));
// Every Mass language goes through the same semantic adapter and renderer, so
// equal liturgical elements look the same in every language.
const massDocument = computed(() => (
  isMassOrder.value
    ? buildMassDocument(displayText.value, massVariant.value, textPrayer.value?.textFormat)
    : { blocks: [], sections: [] }
));
const prayerHtml = computed(() => (
  isMassOrder.value
    ? renderMassBlocks(massDocument.value.blocks, massVariant.value)
    : renderPrayerMarkdown(displayText.value, textPrayer.value?.textFormat,
      isDevotionalOffice.value ? { presentation: 'devotional-office' } : {})
));
const sourceHtml = computed(() => renderPrayerMarkdown(displaySource.value));
const massSections = computed(() => massDocument.value.sections);
const massSectionIds = computed(() => massSections.value.map(section => section.sectionId));

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

watch(massLanguage, (language) => {
  uiStore.massLanguage = isMassOrder.value ? language : null;
}, { immediate: true });

watch(isMassOrder, (isMass) => {
  uiStore.massLanguage = isMass ? massLanguage.value : null;
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
  uiStore.massLanguage = null;
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
    activeMassSectionId.value = null;
    return;
  }
  // A bundled variant may still be loading; keep the pending section for it.
  if (!displayText.value.trim()) return;

  const target = resolveMassSectionTarget(pendingMassSection, massSectionIds.value);
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

function trackActiveMassSection() {
  if (!massSections.value.length) {
    activeMassSectionId.value = null;
    return;
  }
  // An open sheet (section picker, text settings) locks page scrolling and
  // reports a zero scroll position; the current section cannot change then.
  if (document.documentElement.classList.contains('v-overlay-scroll-blocked')) return;
  const tops = massSections.value.map(section => ({
    sectionId: section.sectionId,
    top: massSectionElement(section.sectionId)?.getBoundingClientRect().top ?? Infinity,
  }));
  // The last sections can be too short to reach the reading line; once the
  // page cannot scroll further, the last heading on screen is the current one.
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
  const readingLine = atBottom ? window.innerHeight - MASS_DOCK_CLEARANCE : MASS_READING_LINE;
  activeMassSectionId.value = activeMassSectionAt(tops, readingLine);
}

// Expose for parent components that may use template refs
defineExpose({
  toggleEdit,
  copyText,
  copySuccess,
});
</script>
<style scoped src="@/styles/prayer-reading.css"></style>
