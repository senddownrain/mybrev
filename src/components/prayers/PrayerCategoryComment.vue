<template>
  <div class="category-comment">
    <button
      :id="`${id}-title`"
      type="button"
      class="category-comment__toggle"
      :aria-expanded="expanded"
      :aria-controls="id"
      @click="expanded = !expanded"
    >
      <span>{{ comment.title || 'Пра гэты раздзел' }}</span>
      <PhCaretDown :size="20" aria-hidden="true" />
    </button>
    <div :id="id" :hidden="!expanded" role="region" :aria-labelledby="`${id}-title`" class="category-comment__body">
      <template v-if="expanded">
        <div v-reader-prose class="prayer-text category-comment__prose" v-html="bodyHtml" />
        <footer v-if="source" class="category-comment__source">Крыніца: {{ source }}</footer>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, useId } from 'vue';
import { PhCaretDown } from '@phosphor-icons/vue';
import { vReaderProse } from '@/directives/readerProse';
import { PRAYER_TEXT_FORMAT, renderPrayerMarkdown } from '@/utils/prayerMarkdown';
import { PRAYER_SOURCE_REGISTRY } from '@/utils/prayerSource.mjs';

const props = defineProps({ comment: { type: Object, required: true } });
const id = useId();
const expanded = ref(false);
const bodyHtml = computed(() => renderPrayerMarkdown(props.comment.content, PRAYER_TEXT_FORMAT, { normalizeLegacy: false }));
const source = computed(() => PRAYER_SOURCE_REGISTRY.find(({ id }) => id === props.comment.sourceId)?.title);
</script>

<style scoped>
.category-comment {
  margin: 0 12px 18px;
  border: 1px solid var(--nav-border);
  border-radius: 16px;
  background: var(--nav-surface);
  color: var(--nav-on-surface);
}

.category-comment__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 10px 16px;
  border-radius: inherit;
  text-align: start;
  overflow-wrap: anywhere;
  font-size: calc(1rem * var(--font-size-multiplier, 1));
  font-weight: 650;
}

.category-comment__toggle:hover { background: var(--nav-active); }
.category-comment__toggle:focus-visible { outline: 2px solid var(--devotional-accent); outline-offset: 2px; }
.category-comment__toggle svg { flex: none; color: var(--devotional-accent); }
.category-comment__toggle[aria-expanded='true'] svg { transform: rotate(180deg); }

.category-comment__body {
  margin-inline: 16px;
  padding-block: 14px 16px;
  border-top: 1px solid var(--nav-border);
  font-family: var(--reader-font-family);
  font-size: calc(1rem * var(--font-size-multiplier, 1));
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.category-comment__prose { padding: 0; color: var(--reader-ink); font-size: inherit; line-height: inherit; }
.category-comment__prose :deep(> * + *) { margin-block-start: 0.8em; }
.category-comment__prose :deep(:is(h1, h2, h3, h4, h5, h6)) { font-size: 1.12em; line-height: 1.3; }
.category-comment__prose :deep(:is(ul, ol)) { padding-inline-start: 1.5em; }
.category-comment__prose :deep(blockquote) { border-inline-start: 2px solid var(--nav-border); padding-inline-start: 0.8em; }
.category-comment__prose :deep(.prayer-rubric) { color: var(--rubric-color); font-style: italic; }
.category-comment__prose :deep(a) { text-decoration: underline; }
.category-comment__prose :deep(img) { max-width: 100%; height: auto; }
.category-comment__prose :deep(pre) { white-space: pre-wrap; }
.category-comment__source { margin-block-start: 0.8em; color: var(--nav-muted); font-size: 0.9em; }
</style>
