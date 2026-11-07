<template>
  <div
    ref="rootElement"
    class="ora-psalm psalmody-text"
    :data-psalmody-mode="settings.psalmodyMode"
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

const props = defineProps({ html: { type: String, default: '' }, interactive: { type: Boolean, default: true } });
const settings = useSettingsStore();
const psalmody = usePsalmody();
const rootElement = ref(null);
const displayedHtml = computed(() => {
  const root = document.createElement('div');
  root.innerHTML = props.html;
  decoratePsalmody(root, {
    mode: settings.psalmodyMode,
    interactive: props.interactive,
  });
  return root.innerHTML;
});
watchPostEffect(() => {
  const side = psalmody?.dimmedSide.value;
  // Track a text/layout update too, while keeping focus on a toggled strophe.
  displayedHtml.value;
  rootElement.value?.querySelectorAll('[data-psalm-side]').forEach((strophe) => {
    if (props.interactive) strophe.setAttribute('aria-pressed', String(strophe.dataset.psalmSide === side));
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
.psalmody-text :deep([data-psalm-side]) { transition: opacity .16s ease; }
.psalmody-text :deep([data-psalm-side][role="button"]) { cursor: pointer; }
.psalmody-text :deep([data-psalm-side]:focus-visible) { outline: 2px solid var(--focus-ring); outline-offset: 3px; }
.psalmody-text[data-dimmed-side="A"] :deep([data-psalm-side="A"]),
.psalmody-text[data-dimmed-side="B"] :deep([data-psalm-side="B"]) {
  opacity: .68;
}
.psalmody-text :deep(p[data-psalm-side]) {
  margin-inline: 0 !important;
  padding-inline: 0 !important;
  text-indent: 0 !important;
  text-align: left !important;
  white-space: normal !important;
}
.psalmody-text[data-psalmody-mode="alternating-stanzas"] :deep(p[data-psalm-side="B"]) {
  margin-inline-start: min(1em, 8%) !important;
}
.psalmody-text :deep(.psalm-continuation) { display: block; margin-inline-start: 0; }
.psalmody-text[data-psalmody-mode="left-break-indent"] :deep(p > .psalm-continuation) { margin-inline-start: .65em; }
/* Nested continuations share the same indent after successive cadence signs. */
.psalmody-text :deep(.psalm-continuation .psalm-continuation) { margin-inline-start: 0; }
.psalmody-text { min-width: 0; overflow-wrap: break-word; }
@media (prefers-reduced-motion: reduce) { .psalmody-text :deep([data-psalm-side]) { transition: none; } }
</style>
