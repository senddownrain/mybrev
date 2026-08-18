<template>
  <div class="alternative-text">
    <div
      v-if="options.length > 1"
      class="alternative-tabs mb-4"
      role="tablist"
      :aria-label="ariaLabel"
    >
      <button
        v-for="(option, index) in options"
        :id="`${instanceId}-tab-${index}`"
        :key="`${index}-${option.title}`"
        type="button"
        role="tab"
        class="alternative-tab"
        :class="{ 'alternative-tab--active': activeIndex === index }"
        :aria-selected="activeIndex === index"
        :aria-controls="`${instanceId}-panel`"
        @click="activeIndex = index"
      >
        {{ option.title }}
      </button>
    </div>

    <div
      v-if="activeOption"
      :id="`${instanceId}-panel`"
      role="tabpanel"
      :aria-labelledby="options.length > 1 ? `${instanceId}-tab-${activeIndex}` : undefined"
      v-html="activeOption.html"
    ></div>
  </div>
</template>

<script setup>
import { computed, getCurrentInstance, ref, watch } from 'vue';

const props = defineProps({
  text: { type: String, default: '' },
  ariaLabel: { type: String, default: 'Выбар варыянта' },
});

const alternativeSeparator = /<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?Або:\s*(?:(?!<\/p>)[\s\S])*?<\/p>/giu;
const activeIndex = ref(0);
const instanceId = `alternative-${getCurrentInstance()?.uid ?? 0}`;

function plainText(html) {
  if (!html) return '';
  const element = document.createElement('div');
  element.innerHTML = html;
  return String(element.textContent || '').replace(/\s+/g, ' ').trim();
}

function firstLine(html, index) {
  const firstParagraph = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/iu)?.[1] || html;
  const line = firstParagraph.split(/<br\s*\/?\s*>/iu)[0];
  return plainText(line) || `Варыянт ${index + 1}`;
}

const options = computed(() => String(props.text || '')
  .split(alternativeSeparator)
  .map((html) => html.trim())
  .filter(Boolean)
  .map((html, index) => ({ html, title: firstLine(html, index) })));

const activeOption = computed(() => options.value[activeIndex.value] || options.value[0] || null);

watch(() => props.text, () => {
  activeIndex.value = 0;
});
</script>

<style scoped>
.alternative-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: 100%;
  overflow: visible;
}

.alternative-tab {
  max-width: 100%;
  padding: 7px 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.22);
  border-radius: 8px;
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
  font-size: calc(0.82rem * var(--font-size-multiplier, 1));
  line-height: 1.3;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
  cursor: pointer;
}

.alternative-tab--active {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.alternative-tab:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
</style>
