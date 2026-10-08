<template>
  <div
    ref="rootElement"
    class="ora-psalm psalmody-text"
    :data-verse-layout="settings.psalmVerseLayout"
    :data-dimmed-side="psalmody?.dimmedSide.value || undefined"
    @click="toggle"
    @keydown="onKeydown"
    v-html="displayedHtml"
  />
</template>

<script setup>
import { computed, ref, watchPostEffect } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { usePsalmody } from '@/composables/usePsalmody';
import { decoratePsalmody } from '@/utils/psalmodyDisplay';

const props = defineProps({ html: { type: String, default: '' } });
const settings = useSettingsStore();
const psalmody = usePsalmody();
const rootElement = ref(null);
const displayedHtml = computed(() => {
  const root = document.createElement('div');
  root.innerHTML = props.html;
  decoratePsalmody(root, {
    breakAfterMarker: settings.psalmMarkerBreakMode === 'breakAfterMarker',
  });
  return root.innerHTML;
});
watchPostEffect(() => {
  const side = psalmody?.dimmedSide.value;
  // Track a text/layout update too, while keeping focus on a toggled strophe.
  displayedHtml.value;
  rootElement.value?.querySelectorAll('[data-psalm-side]').forEach((strophe) => {
    strophe.setAttribute('aria-pressed', String(strophe.dataset.psalmSide === side));
  });
});
function toggle(event) {
  const strophe = event.target.closest('[data-psalm-side]');
  if (strophe && event.currentTarget.contains(strophe)) psalmody?.toggleSide(strophe.dataset.psalmSide);
}
function onKeydown(event) {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-psalm-side]')) {
    event.preventDefault();
    toggle(event);
  }
}
</script>

<style scoped>
.psalmody-text :deep([data-psalm-side]) { cursor: pointer; transition: opacity .16s ease; }
.psalmody-text :deep([data-psalm-side]:focus-visible) { outline: 2px solid var(--focus-ring); outline-offset: 3px; }
.psalmody-text[data-dimmed-side="A"] :deep([data-psalm-side="A"]),
.psalmody-text[data-dimmed-side="B"] :deep([data-psalm-side="B"]) {
  opacity: .68;
}
.psalmody-text[data-verse-layout="alignedLeft"] :deep(p[data-psalm-side]) { margin-left: 0 !important; padding-left: 0 !important; text-indent: 0 !important; }
.psalmody-text :deep(.psalm-continuation) { display: block; margin-inline-start: .65em; }
/* Consecutive markers stay at the same modest continuation indent. */
.psalmody-text :deep(.psalm-continuation .psalm-continuation) { margin-inline-start: 0; }
.psalmody-text { min-width: 0; overflow-wrap: break-word; }
@media (prefers-reduced-motion: reduce) { .psalmody-text :deep([data-psalm-side]) { transition: none; } }
</style>
