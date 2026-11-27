<template>
  <div class="category-comment">
    <button
      ref="trigger"
      type="button"
      class="category-comment__chip"
      aria-haspopup="dialog"
      :aria-controls="id"
      @click="openReader"
    >
      <PhBookOpen :size="18" aria-hidden="true" />
      <span>{{ title }}</span>
      <PhArrowSquareOut :size="16" aria-hidden="true" />
    </button>
    <dialog ref="reader" :id="id" class="category-comment__reader" :aria-labelledby="id + '-title'" @close="readerClosed">
      <template v-if="isOpen">
        <header class="category-comment__header">
          <span>{{ categoryName }}</span>
          <button type="button" class="category-comment__close" aria-label="Закрыць" autofocus @click="closeReader">
            <PhX :size="22" aria-hidden="true" />
          </button>
        </header>
        <div class="category-comment__viewport">
          <article class="category-comment__document">
            <h1 :id="id + '-title'">{{ title }}</h1>
            <div v-reader-prose class="prayer-text category-comment__prose" v-html="bodyHtml" @click="openPrayerLink" />
            <footer v-if="source" class="category-comment__source">Крыніца: {{ source }}</footer>
          </article>
        </div>
      </template>
    </dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useId } from 'vue';
import { useRouter } from 'vue-router';
import { PhArrowSquareOut, PhBookOpen, PhX } from '@phosphor-icons/vue';
import { vReaderProse } from '@/directives/readerProse';
import { PRAYER_TEXT_FORMAT, renderPrayerMarkdown } from '@/utils/prayerMarkdown';
import { PRAYER_SOURCE_REGISTRY } from '@/utils/prayerSource.mjs';

const props = defineProps({ comment: { type: Object, required: true }, categoryName: String });
const emit = defineEmits(['open-prayer']);
const router = useRouter();
const id = useId();
const reader = ref(null);
const trigger = ref(null);
const isOpen = ref(false);
const title = computed(() => props.comment.title || 'Пра гэты раздзел');
const bodyHtml = computed(() => renderPrayerMarkdown(props.comment.content, PRAYER_TEXT_FORMAT, { normalizeLegacy: false }));
const source = computed(() => PRAYER_SOURCE_REGISTRY.find(({ id }) => id === props.comment.sourceId)?.title);

async function openReader() {
  if (isOpen.value) return;
  isOpen.value = true;
  await nextTick();
  reader.value?.showModal();
}

function closeReader() {
  reader.value?.close();
  isOpen.value = false;
}

function readerClosed() {
  isOpen.value = false;
  trigger.value?.focus({ preventScroll: true });
}

function openPrayerLink(event) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
  const anchor = event.target.closest('a[href^="/prayer/"]');
  if (!anchor) return;
  const route = router.resolve(anchor.getAttribute('href'));
  if (route.name !== 'PrayerView') return;
  event.preventDefault();
  closeReader();
  emit('open-prayer', route.params.id);
}

onBeforeUnmount(closeReader);
</script>

<style scoped>
.category-comment { margin-top: 12px; max-width: 100%; }

.category-comment__chip,
.category-comment__close {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  max-width: 100%;
  border-radius: 24px;
  color: var(--nav-on-surface);
}

.category-comment__chip {
  padding: 8px 14px;
  background: var(--nav-surface);
  text-align: start;
  overflow-wrap: anywhere;
  font-size: calc(1rem * var(--font-size-multiplier, 1));
  font-weight: 650;
}

.category-comment__chip span { min-width: 0; }
.category-comment__chip svg, .category-comment__close svg { flex: none; color: var(--devotional-accent); }
.category-comment__chip:hover, .category-comment__close:hover { background: var(--nav-active); }
.category-comment__chip:focus-visible, .category-comment__close:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }

.category-comment__reader {
  box-sizing: border-box;
  width: min(840px, calc(100% - 40px));
  max-width: none;
  height: min(90dvh, 850px);
  max-height: none;
  margin: auto;
  padding: 0;
  border: 0;
  border-radius: 20px;
  overflow: hidden;
  background: rgb(var(--v-theme-surface));
  color: var(--reader-ink);
}
.category-comment__reader[open] { display: flex; flex-direction: column; }
.category-comment__reader::backdrop { background: rgb(0 0 0 / .55); }
:global(html:has(.category-comment__reader[open])) { overflow: hidden; }

.category-comment__header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: max(4px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 4px max(16px, env(safe-area-inset-left));
  border-bottom: 1px solid var(--nav-border);
  color: var(--nav-muted);
  overflow-wrap: anywhere;
}
.category-comment__close { flex: none; justify-content: center; min-width: 48px; margin-inline-start: auto; }
.category-comment__viewport { min-height: 0; flex: 1; overflow: auto; overscroll-behavior: contain; }
.category-comment__document {
  max-width: 44rem;
  margin-inline: auto;
  padding: clamp(16px, 4vw, 36px) max(16px, env(safe-area-inset-right)) max(28px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  font-family: var(--reader-font-family);
  font-size: calc(1rem * var(--font-size-multiplier, 1));
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.category-comment__document > h1 { margin: 0 0 0.75em; font-size: 1.55em; line-height: 1.25; }
.category-comment__prose { padding: 0; color: var(--reader-ink); font-size: inherit; line-height: inherit; }
.category-comment__prose :deep(> * + *) { margin-block-start: 0.8em; }
.category-comment__prose :deep(:is(h1, h2, h3, h4, h5, h6)) { font-size: 1.12em; line-height: 1.3; }
.category-comment__prose :deep(:is(ul, ol)) { padding-inline-start: 1.5em; }
.category-comment__prose :deep(blockquote) { border-inline-start: 2px solid var(--nav-border); padding-inline-start: 0.8em; }
.category-comment__prose :deep(.prayer-rubric) { color: var(--rubric-color); font-style: italic; }
.category-comment__prose :deep(a) { text-decoration: underline; }
.category-comment__prose :deep(img) { max-width: 100%; height: auto; }
.category-comment__prose :deep(pre) { max-width: 100%; overflow: auto; white-space: pre-wrap; }
.category-comment__source { margin-block-start: 0.8em; color: var(--nav-muted); font-size: 0.9em; }

@media (max-width: 599px) {
  .category-comment__reader { inset: 0; width: 100dvw; height: 100dvh; margin: 0; border-radius: 0; }
}
</style>
