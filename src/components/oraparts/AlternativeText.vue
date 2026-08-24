<template>
  <div class="alternative-text">
    <div v-if="options.length > 1" class="alternative-picker mb-5">
      <div class="alternative-picker__label">{{ ariaLabel }}</div>
      <div class="alternative-tabs" role="tablist" :aria-label="ariaLabel">
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
          <span class="alternative-tab__number">{{ index + 1 }}</span>
          <span class="alternative-tab__title">{{ option.title }}</span>
          <span v-if="activeIndex === index" class="alternative-tab__check" aria-hidden="true">✓</span>
        </button>
      </div>
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
.alternative-picker {
  padding: 13px;
  border: 1px solid var(--nav-border);
  border-radius: 18px;
  background: rgba(var(--v-theme-on-surface), 0.025);
}

.alternative-picker__label {
  margin: 0 3px 9px;
  color: var(--nav-on-surface);
  font-size: 0.68rem;
  font-weight: 800;
  line-height: 1.3;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.alternative-tabs {
  display: grid;
  gap: 7px;
  max-width: 100%;
  overflow: visible;
}

.alternative-tab {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 20px;
  align-items: center;
  gap: 9px;
  width: 100%;
  max-width: 100%;
  min-height: 48px;
  padding: 8px 11px;
  border: 1px solid var(--nav-border);
  border-radius: 13px;
  background: var(--nav-surface);
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
  font-size: calc(0.86rem * var(--font-size-multiplier, 1));
  line-height: 1.35;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
  cursor: pointer;
  transition: border-color 0.16s ease, background-color 0.16s ease;
}

.alternative-tab--active {
  border-color: rgba(var(--v-theme-on-surface), 0.24);
  background: var(--nav-active);
  font-weight: 680;
}

.alternative-tab__number {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 9px;
  background: var(--nav-active);
  color: var(--nav-muted);
  font-size: 0.74rem;
  font-weight: 800;
}

.alternative-tab--active .alternative-tab__number {
  background: var(--nav-on-surface);
  color: var(--nav-surface);
}

.alternative-tab__title {
  min-width: 0;
  overflow-wrap: anywhere;
}

.alternative-tab__check {
  color: var(--nav-on-surface);
  font-size: 1rem;
  font-weight: 800;
  text-align: center;
}

.alternative-tab:focus-visible {
  outline: 2px solid var(--nav-on-surface);
  outline-offset: 2px;
}
</style>
