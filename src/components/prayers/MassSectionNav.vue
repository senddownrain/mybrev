<template>
  <!-- One compact control: the current major section (always in Belarusian).
       Tapping it opens the section picker. -->
  <nav class="mass-section-nav" aria-label="Раздзелы святой Імшы">
    <button
      type="button"
      class="mass-section-control"
      aria-haspopup="dialog"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-label="`Раздзел: ${currentTitle}. Выбраць раздзел`"
      @click="open = true"
    >
      <span v-if="picker.current" class="mass-section-control__count" aria-hidden="true">
        {{ picker.current.number }}/{{ picker.current.total }}
      </span>
      <span class="mass-section-control__title">{{ currentTitle }}</span>
      <PhCaretUp class="mass-section-control__chevron" :size="17" weight="bold" aria-hidden="true" />
    </button>

    <v-bottom-sheet v-model="open" content-class="mass-section-sheet-overlay">
      <v-card class="mass-section-sheet" rounded="t-xl" role="dialog" aria-label="Раздзелы святой Імшы">
        <header class="mass-section-sheet__header">
          <div>
            <div class="mass-section-sheet__eyebrow">Святая Імша</div>
            <h2 class="mass-section-sheet__heading">Раздзелы</h2>
          </div>
          <button type="button" class="mass-section-sheet__close" aria-label="Закрыць" @click="open = false">
            <PhX :size="20" />
          </button>
        </header>

        <ol class="mass-section-list">
          <li v-for="item in picker.items" :key="item.id">
            <button
              type="button"
              class="mass-section-item"
              :class="{ 'mass-section-item--active': item.active }"
              :aria-current="item.active ? 'location' : undefined"
              :disabled="!item.available"
              :data-mass-target="item.id"
              @click="select(item.id)"
            >
              <span class="mass-section-item__number" aria-hidden="true">{{ item.number }}</span>
              <span class="mass-section-item__title">{{ item.title }}</span>
              <PhCheck v-if="item.active" class="mass-section-item__check" :size="18" weight="bold" aria-hidden="true" />
            </button>
            <ul v-if="item.active && item.children.length" class="mass-subsection-list" :aria-label="`Часткі раздзела «${item.title}»`">
              <li v-for="child in item.children" :key="child.id">
                <button
                  type="button"
                  class="mass-subsection-item"
                  :class="{ 'mass-subsection-item--active': child.active }"
                  :aria-current="child.active ? 'location' : undefined"
                  :data-mass-target="child.id"
                  @click="select(child.id)"
                >
                  {{ child.title }}
                </button>
              </li>
            </ul>
          </li>
        </ol>
      </v-card>
    </v-bottom-sheet>
  </nav>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue';
import { PhCaretUp, PhCheck, PhX } from '@phosphor-icons/vue';
import { buildMassSectionPicker } from '@/utils/massRitual.js';

// Section navigation of the Holy Mass reader. Language is chosen elsewhere
// (top right); this control only moves between sections of the same ritual.
const props = defineProps({
  /** Section ids found in the text of the current language. */
  sectionIds: { type: Array, default: () => [] },
  /** Section at the reading line (major or subsection). */
  activeSectionId: { type: String, default: null },
});
const emit = defineEmits(['select']);

const open = ref(false);
const picker = computed(() => buildMassSectionPicker(props.sectionIds, props.activeSectionId));
const currentTitle = computed(() => picker.value.current?.title || 'Раздзелы');

// The open sheet locks page scrolling; the lock is released once the sheet
// starts closing, so the reader is asked to scroll on the next frame.
async function select(sectionId) {
  open.value = false;
  await nextTick();
  window.requestAnimationFrame(() => emit('select', sectionId));
}
</script>

<style scoped>
.mass-section-nav {
  position: fixed;
  z-index: 5;
  bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  left: 50%;
  display: flex;
  justify-content: center;
  width: min(calc(100vw - 24px), 420px);
  transform: translateX(-50%);
  pointer-events: none;
}

.mass-section-control {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 100%;
  min-height: 52px;
  padding: 7px 14px 7px 9px;
  border: 1px solid var(--reader-border);
  border-radius: 26px;
  background: color-mix(in srgb, var(--reader-surface) 94%, transparent);
  color: var(--reader-ink);
  box-shadow: var(--reader-shadow);
  font: inherit;
  text-align: left;
  cursor: pointer;
  pointer-events: auto;
  backdrop-filter: blur(12px);
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.mass-section-control:active {
  opacity: 0.8;
  transform: scale(0.98);
}

.mass-section-control:focus-visible,
.mass-section-item:focus-visible,
.mass-subsection-item:focus-visible,
.mass-section-sheet__close:focus-visible {
  outline: 2px solid var(--devotional-accent);
  outline-offset: 2px;
}

.mass-section-control__count {
  flex: 0 0 auto;
  min-width: 38px;
  padding: 6px 8px;
  border-radius: 18px;
  background: var(--devotional-soft);
  color: var(--devotional-accent);
  font-size: 0.74rem;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  text-align: center;
}

.mass-section-control__title {
  display: -webkit-box;
  overflow: hidden;
  min-width: 0;
  font-family: var(--reader-display-font-family);
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.2;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.mass-section-control__chevron {
  flex: 0 0 auto;
  opacity: 0.55;
}

.mass-section-sheet {
  padding: 10px 12px calc(16px + env(safe-area-inset-bottom, 0px));
  border: 1px solid var(--nav-border);
  background: var(--overlay-surface) !important;
  color: var(--nav-on-surface);
  box-shadow: 0 -12px 40px var(--nav-shadow) !important;
}

.mass-section-sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 6px 10px 12px;
}

.mass-section-sheet__eyebrow {
  color: var(--chrome-accent);
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.mass-section-sheet__heading {
  margin: 2px 0 0;
  font-family: var(--reader-display-font-family);
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.2;
}

.mass-section-sheet__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 22px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.mass-section-list,
.mass-subsection-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.mass-section-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 54px;
  padding: 8px 12px;
  border: 0;
  border-radius: 16px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.mass-section-item:hover {
  background: color-mix(in srgb, currentColor 6%, transparent);
}

.mass-section-item:disabled {
  opacity: 0.45;
  cursor: default;
}

.mass-section-item__number {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 15px;
  background: color-mix(in srgb, currentColor 8%, transparent);
  font-size: 0.82rem;
  font-weight: 750;
}

.mass-section-item__title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 1.02rem;
  font-weight: 650;
  line-height: 1.25;
}

.mass-section-item--active,
.mass-section-item--active:hover {
  background: rgba(var(--chrome-accent-rgb), 0.13);
  color: var(--chrome-accent);
}

.mass-section-item--active .mass-section-item__number {
  background: var(--chrome-accent);
  color: var(--overlay-surface);
}

.mass-section-item__check {
  flex: 0 0 auto;
}

.mass-subsection-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 8px 10px 54px;
}

.mass-subsection-item {
  min-height: 34px;
  padding: 5px 11px;
  border: 1px solid var(--nav-border);
  border-radius: 17px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.82rem;
  line-height: 1.2;
  cursor: pointer;
  opacity: 0.82;
}

.mass-subsection-item--active {
  border-color: var(--chrome-accent);
  color: var(--chrome-accent);
  opacity: 1;
}
</style>

<style>
/* The sheet is teleported, so its width constraint cannot be scoped. */
@media (min-width: 700px) {
  .mass-section-sheet-overlay {
    width: min(520px, 100%) !important;
    max-width: 520px !important;
    margin-inline: auto;
  }
}
</style>
