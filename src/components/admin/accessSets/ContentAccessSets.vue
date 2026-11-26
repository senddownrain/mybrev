<template>
  <section class="content-access-sets" aria-label="Доступ" data-sentry-block>
    <h3>Доступ</h3>
    <SetPicker v-if="canonical && sets.length" :sets="sets" :selected="modelValue" label="Уласны доступ" :disabled="disabled"
      @update:selected="$emit('update:modelValue', $event)" />
    <p v-if="canonical && sets.length" class="text-caption">Пакіньце ўсе наборы пустымі, каб улічваліся толькі абмежаванні катэгорый.</p>
    <p class="content-access-sets__result"><strong>Выніковы доступ:</strong> {{ prayerAccessLabel(effectivePrayerAccess(modelValue, inherited), sets) }}</p>
  </section>
</template>

<script setup>
import { effectivePrayerAccess, prayerAccessLabel } from '@/utils/prayerAccessPresentation.mjs';
import SetPicker from './SetPicker.vue';

defineProps({
  sets: { type: Array, default: () => [] },
  modelValue: { type: Array, default: () => [] },
  inherited: { type: Array, default: () => [] },
  canonical: Boolean,
  disabled: Boolean,
});
defineEmits(['update:modelValue']);
</script>

<style src="./accessAdmin.css"></style>
<style scoped>
.content-access-sets { margin-block: 12px; padding: 12px 14px; border: 1px solid var(--nav-border); border-radius: 12px; }
.content-access-sets h3 { margin: 0 0 6px; font-size: 1rem; }
.content-access-sets__result { margin-block: 8px 0; overflow-wrap: anywhere; }
</style>
