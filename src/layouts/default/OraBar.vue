<template>
  <v-app-bar flat class="floating-ora-bar">
    <v-app-bar-nav-icon class="ora-circle-btn" aria-label="Назад" @click="goBack">
      <PhArrowLeft :size="21" />
    </v-app-bar-nav-icon>

    <v-menu v-if="sections.length" location="bottom center">
      <template #activator="{ props }">
        <button
          v-bind="props"
          type="button"
          class="ora-location"
          :aria-label="`Раздзелы: ${hourTitle}`"
        >
          <span class="ora-location__hour">{{ hourTitle }}</span>
          <span class="ora-location__section">{{ currentSectionLabel }}</span>
          <PhCaretDown :size="14" aria-hidden="true" />
        </button>
      </template>
      <v-list class="ora-section-menu" density="compact" aria-label="Раздзелы Гадзіны">
        <v-list-item
          v-for="section in sections"
          :key="section.id"
          :title="section.label"
          :active="section.id === currentSectionId"
          @click="goToSection(section)"
        />
      </v-list>
    </v-menu>
    <div v-else class="ora-location ora-location--static">
      <span class="ora-location__hour">{{ hourTitle }}</span>
    </div>

    <TextScaleControl
      v-if="showTextScaleControl"
      class="ora-action-start"
    />

    <v-btn
      v-if="auth && auth.isAdmin"
      icon
      variant="flat"
      class="ora-circle-btn"
      :class="{ 'ora-action-start': !showTextScaleControl }"
      aria-label="Рэдагаваць"
      @click="onEditClick"
    >
      <PhPencilSimple :size="21" />
    </v-btn>
  </v-app-bar>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { PhArrowLeft, PhCaretDown, PhPencilSimple } from '@phosphor-icons/vue';
import TextScaleControl from '@/components/TextScaleControl.vue';
import moment from '@/utils/moment-be';
import { LITURGICAL_HOUR_TITLES } from '@/constants/liturgicalHours';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const sections = ref([]);
const currentSectionId = ref('');
let contentObserver;
let saveTimer;
let restoredKey = '';
let activePositionKey = '';

const hourTitle = computed(() => LITURGICAL_HOUR_TITLES[route.name] || 'Літургія гадзін');
const currentSectionLabel = computed(() => (
  sections.value.find((section) => section.id === currentSectionId.value)?.label || 'Пачатак'
));
const readingPositionKey = computed(() => [
  'mybrev:reading-position',
  route.params.day,
  route.params.id,
  route.name,
].join(':'));
const showTextScaleControl = computed(() => route.name !== 'oras');
const dateHomeRoute = computed(() => {
  const selectedDate = moment(route.params.day, 'YYYY-MM-DD', true);

  if (!selectedDate.isValid() || selectedDate.isSame(moment().startOf('day'), 'day')) {
    return { name: 'Today' };
  }

  return {
    name: 'SelectedDay',
    params: { day: selectedDate.format('YYYY-MM-DD') },
  };
});

const goBack = () => {
  if (route.name === 'oras') {
    router.push(dateHomeRoute.value);
    return;
  }

  if (window.history.length > 1) {
    router.go(-1);
  } else {
    router.push('/');
  }
};

function normalizeSectionId(label, index) {
  const slug = label.toLocaleLowerCase('be')
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-|-$/g, '');
  return `hour-section-${slug || index + 1}-${index + 1}`;
}

function discoverSections() {
  const cards = [...document.querySelectorAll('.liturgical-hour-column .ora')];
  const found = cards.map((element, index) => {
    const heading = element.querySelector('.ora-title, .ora-header, .liturgical-subheading, .ora-ending__title');
    const label = heading?.textContent?.replace(/\s+/g, ' ').trim();
    if (!label || label.toLocaleLowerCase('be') === hourTitle.value.toLocaleLowerCase('be')) return null;
    const id = normalizeSectionId(label, index);
    element.id = id;
    element.dataset.readerSection = id;
    return { id, label, element };
  }).filter(Boolean);
  sections.value = found;
  activePositionKey = readingPositionKey.value;
  updateCurrentSection();
  restoreReadingPosition();
}

function updateCurrentSection() {
  const threshold = 92;
  const visible = sections.value.filter((section) => section.element.getBoundingClientRect().top <= threshold);
  currentSectionId.value = (visible.at(-1) || sections.value[0])?.id || '';
  schedulePositionSave();
}

function schedulePositionSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveReadingPosition, 180);
}

function saveReadingPosition() {
  const section = sections.value.find((item) => item.id === currentSectionId.value);
  if (!section) return;
  const rect = section.element.getBoundingClientRect();
  const relative = Math.max(0, Math.min(1, (92 - rect.top) / Math.max(rect.height, 1)));
  if (!activePositionKey) return;
  localStorage.setItem(activePositionKey, JSON.stringify({
    sectionId: section.id,
    relative,
    scrollY: window.scrollY,
    savedAt: Date.now(),
  }));
}

function restoreReadingPosition() {
  const key = readingPositionKey.value;
  if (!sections.value.length || restoredKey === key) return;
  let saved;
  try { saved = JSON.parse(localStorage.getItem(key)); } catch { saved = null; }
  restoredKey = key;
  if (!saved || Date.now() - saved.savedAt > 30 * 24 * 60 * 60 * 1000) return;
  const section = sections.value.find((item) => item.id === saved.sectionId);
  window.requestAnimationFrame(() => {
    if (section) {
      const top = window.scrollY + section.element.getBoundingClientRect().top - 84
        + section.element.offsetHeight * Math.max(0, Math.min(1, saved.relative || 0));
      window.scrollTo({ top, behavior: 'auto' });
    } else if (Number.isFinite(saved.scrollY)) {
      window.scrollTo({ top: saved.scrollY, behavior: 'auto' });
    }
  });
}

function goToSection(section) {
  section.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  currentSectionId.value = section.id;
}

onMounted(async () => {
  await nextTick();
  contentObserver = new window.MutationObserver(discoverSections);
  contentObserver.observe(document.querySelector('.v-main') || document.body, { childList: true, subtree: true });
  window.addEventListener('scroll', updateCurrentSection, { passive: true });
  window.addEventListener('pagehide', saveReadingPosition);
  discoverSections();
});

watch(() => route.fullPath, async () => {
  sections.value = [];
  currentSectionId.value = '';
  restoredKey = '';
  await nextTick();
  discoverSections();
});

onBeforeUnmount(() => {
  saveReadingPosition();
  contentObserver?.disconnect();
  window.clearTimeout(saveTimer);
  window.removeEventListener('scroll', updateCurrentSection);
  window.removeEventListener('pagehide', saveReadingPosition);
});

const onEditClick = () => {
  const dayId = route.params.id;
  if (dayId) {
    router.push({
      name: 'AdminDayEditor',
      params: { id: dayId },
      query: route.params.day ? { date: route.params.day } : {},
    });
  }
};
</script>

<style scoped>
.floating-ora-bar {
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.floating-ora-bar :deep(.v-toolbar__content) {
  gap: 8px;
  padding: 8px 12px;
}

.floating-ora-bar :deep(.v-toolbar__prepend),
.floating-ora-bar :deep(.v-toolbar__append) {
  margin-inline: 0;
}

.floating-ora-bar :deep(.v-toolbar__append) {
  gap: 8px;
}

.ora-circle-btn {
  width: 48px !important;
  height: 48px !important;
  min-width: 48px !important;
  flex: 0 0 48px !important;
  border: 1px solid var(--nav-border) !important;
  border-radius: 50% !important;
  background: color-mix(in srgb, var(--nav-surface) 78%, transparent) !important;
  color: var(--nav-on-surface) !important;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--nav-button-shadow) 72%, transparent) !important;
  transition: transform 0.16s ease, opacity 0.16s ease !important;
  backdrop-filter: blur(18px);
}

.ora-circle-btn:active {
  opacity: 0.72;
  transform: scale(0.94);
}

.ora-circle-btn--confirm {
  background: rgba(var(--chrome-accent-rgb), 0.13) !important;
  color: var(--chrome-accent) !important;
}

.ora-action-start {
  margin-left: auto !important;
}

.ora-location {
  display: grid;
  grid-template-columns: minmax(0, auto) 14px;
  align-items: center;
  min-width: 0;
  max-width: min(48vw, 360px);
  min-height: 48px;
  padding: 5px 12px;
  border: 1px solid var(--nav-border);
  border-radius: 24px;
  background: color-mix(in srgb, var(--nav-surface) 78%, transparent);
  color: var(--nav-on-surface);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--nav-button-shadow) 72%, transparent);
  backdrop-filter: blur(18px);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.ora-location--static { cursor: default; }
.ora-location__hour, .ora-location__section { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ora-location__hour { grid-column: 1; font-size: .82rem; font-weight: 760; }
.ora-location__section { grid-column: 1; color: var(--nav-muted); font-size: .68rem; }
.ora-location > svg { grid-column: 2; grid-row: 1 / span 2; }
.ora-section-menu { max-height: min(60vh, 420px); overflow-y: auto; }

.floating-ora-bar :deep(.text-scale-control) {
  background: color-mix(in srgb, var(--nav-surface) 78%, transparent);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--nav-button-shadow) 72%, transparent);
}

:global(.liturgical-hour-column [data-reader-section]) {
  scroll-margin-top: 84px;
}

@media (max-width: 359px) {
  .floating-ora-bar :deep(.v-toolbar__content) {
    gap: 6px;
    padding-inline: 10px;
  }

  .ora-circle-btn {
    width: 44px !important;
    height: 44px !important;
    min-width: 44px !important;
    flex-basis: 44px !important;
  }

  .ora-location { min-height: 44px; max-width: 42vw; padding-inline: 9px; }

}
</style>
