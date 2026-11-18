<template>
  <span class="category-icon-glyph" :style="{ '--category-icon-size': `${size}px` }" aria-hidden="true">
    <component :is="phosphor" v-if="phosphor" :size="size" />
    <span v-else-if="svg" class="category-icon-svg" v-html="svg" />
    <component :is="fallback" v-else :size="size" />
  </span>
</template>

<script setup>
import { computed } from 'vue';
import { isValidCategoryIconKey } from '@/constants/prayerCategoryIcons.js';
import { CUSTOM_SVG_MARKUP, FALLBACK_ICON_COMPONENT, PHOSPHOR_COMPONENTS } from './categoryIconRegistry.js';

const props = defineProps({
  iconKey: { type: String, default: '' },
  size: { type: Number, default: 22 },
});

const valid = computed(() => isValidCategoryIconKey(props.iconKey));
const phosphor = computed(() => (valid.value ? PHOSPHOR_COMPONENTS[props.iconKey] : null));
// Raw markup comes from our own bundled .svg files (looked up by allowlisted key).
const svg = computed(() => (valid.value ? CUSTOM_SVG_MARKUP[props.iconKey] : null));
const fallback = FALLBACK_ICON_COMPONENT;
</script>

<style scoped>
.category-icon-glyph { display: inline-flex; align-items: center; justify-content: center; flex: none; line-height: 0; color: inherit; }
.category-icon-svg { display: inline-flex; width: var(--category-icon-size); height: var(--category-icon-size); }
.category-icon-svg :deep(svg) { width: 100%; height: 100%; display: block; }
</style>
