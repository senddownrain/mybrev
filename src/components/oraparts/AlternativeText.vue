<template>
  <div class="alternative-text">
    <div v-if="showPicker && options.length > 1" class="alternative-picker mb-5">
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
          @click="selectOption(index)"
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
      :aria-labelledby="showPicker && options.length > 1 ? `${instanceId}-tab-${activeIndex}` : undefined"
      :class="{ 'intercessions': kind === 'intercession' }"
      v-html="displayedHtml"
    ></div>
  </div>
</template>

<script setup>
import { computed, getCurrentInstance, ref, watch } from 'vue';
import { formatIntercessions, getLiturgicalAlternatives } from '@/utils/liturgicalAlternatives';

const props = defineProps({
  text: { type: String, default: '' },
  ariaLabel: { type: String, default: 'Выбар варыянта' },
  kind: { type: String, default: 'generic' },
  modelValue: { type: Number, default: undefined },
  showPicker: { type: Boolean, default: true },
});
const emit = defineEmits(['update:modelValue']);
const internalIndex = ref(0);
const activeIndex = computed(() => (
  Number.isInteger(props.modelValue) ? props.modelValue : internalIndex.value
));
const instanceId = `alternative-${getCurrentInstance()?.uid ?? 0}`;

const options = computed(() => getLiturgicalAlternatives(props.text, props.kind));

const activeOption = computed(() => options.value[activeIndex.value] || options.value[0] || null);
const displayedHtml = computed(() => {
  const html = activeOption.value?.html || '';
  return props.kind === 'intercession' ? formatIntercessions(html) : html;
});

watch(() => props.text, () => {
  internalIndex.value = 0;
  if (Number.isInteger(props.modelValue)) emit('update:modelValue', 0);
});

function selectOption(index) {
  internalIndex.value = index;
  emit('update:modelValue', index);
}
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
  border-color: rgba(var(--chrome-accent-rgb), 0.24);
  background: rgba(var(--chrome-accent-rgb), 0.1);
  color: var(--chrome-accent);
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
  background: var(--chrome-accent);
  color: var(--on-chrome-accent);
}

.alternative-tab__title {
  min-width: 0;
  overflow-wrap: anywhere;
}

.alternative-tab__check {
  color: var(--chrome-accent);
  font-size: 1rem;
  font-weight: 800;
  text-align: center;
}

.alternative-tab:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}
</style>
