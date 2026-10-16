<template>
  <span class="vestment" :aria-label="`Колер літургічнага адзення: ${info.label}`" :title="info.label">
    <span class="vestment-dot" :style="{ background: info.swatch, borderColor: pickerSwatch(color) }" />
    <span>{{ info.label }}</span>
  </span>
</template>
<script setup>
import { computed } from 'vue';
import { colorInfo } from '@/utils/ordoScreen';
import { pickerSwatch } from '@/utils/ordoDatePicker';
const props = defineProps({ color: { type: String, required: true } });
const info = computed(() => colorInfo(props.color));
</script>
<style scoped>
.vestment { display: inline-flex; align-items: center; gap: 6px; font-size: .8rem; }
.vestment-dot { display: inline-block; flex: 0 0 16px; width: 16px; height: 16px; border: 2px solid; border-radius: 50%; box-shadow: 0 0 0 1px rgb(var(--v-theme-on-surface), .35); }
</style>
