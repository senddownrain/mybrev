<template>
  <!-- Every legal celebration opens its own Hours and Readings. -->
  <nav class="celebration-actions" :aria-label="`Перайсці: ${title}`">
    <router-link :to="hours" class="celebration-action" data-test="celebration-hours">
      <PhSunHorizon :size="16" weight="bold" aria-hidden="true" />
      <span>Літургія гадзін</span>
    </router-link>
    <router-link :to="readings" class="celebration-action" data-test="celebration-readings">
      <PhBookOpenText :size="16" weight="bold" aria-hidden="true" />
      <span>Чытанні</span>
    </router-link>
  </nav>
</template>

<script setup>
import { PhBookOpenText, PhSunHorizon } from '@phosphor-icons/vue';

defineProps({
  hours: { type: Object, required: true },
  readings: { type: Object, required: true },
  title: { type: String, default: '' },
});
</script>

<style scoped>
.celebration-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.celebration-action {
  display: inline-flex; align-items: center; gap: 6px; min-height: 34px; max-width: 100%; padding: 6px 12px;
  border: 1px solid rgba(var(--chrome-accent-rgb), .22); border-radius: 999px; background: rgba(var(--chrome-accent-rgb), .07);
  color: var(--chrome-accent); font-size: .8rem; font-weight: 720; line-height: 1.2; text-decoration: none;
  -webkit-tap-highlight-color: transparent; transition: background .16s ease, border-color .16s ease;
}
.celebration-action:hover { border-color: rgba(var(--chrome-accent-rgb), .4); background: rgba(var(--chrome-accent-rgb), .13); }
.celebration-action:focus-visible { outline: 3px solid rgba(var(--chrome-accent-rgb), .3); outline-offset: 2px; }
.celebration-action span { min-width: 0; overflow-wrap: anywhere; }
</style>
