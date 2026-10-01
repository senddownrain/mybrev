<template>
  <div ref="root" class="song-text" :class="{ 'song-text--right': showChords && effectiveLayout === 'right' }" :data-chord-layout="showChords ? effectiveLayout : undefined">
    <div v-for="(line, index) in lines" :key="index" class="song-line">
      <div class="song-lyrics">{{ line.text || '\u00a0' }}</div>
      <!-- In the right layout every line keeps its chord cell, so lyric and chord rows stay paired. -->
      <div v-if="showChords && (line.chord || effectiveLayout === 'right')" class="song-chords">{{ transposeChordLine(line.chord, transpose, notation, accidentals) }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { songLines, transposeChordLine } from '@/utils/songChords';
import { resolveChordLayout, rightLayoutFits } from '@/utils/songDisplay';
const props = defineProps({ song: { type: Object, required: true }, showChords: Boolean, layout: { type: String, default: 'above' }, notation: { type: String, default: 'lowercase' }, accidentals: { type: String, default: 'auto' }, transpose: { type: Number, default: 0 } });
const emit = defineEmits(['right-fits']);
const lines = computed(() => songLines(props.song));
const root = ref(null);
const rightFits = ref(true);
// Narrow screens (or very large text) render "above" without touching the stored preference.
const effectiveLayout = computed(() => resolveChordLayout(props.layout, rightFits.value));
watch(rightFits, (value) => emit('right-fits', value), { immediate: true });

let observer;
function measure() {
  const element = root.value;
  if (!element) return;
  rightFits.value = rightLayoutFits(element.clientWidth, parseFloat(getComputedStyle(element).fontSize));
}
onMounted(() => {
  measure();
  if (typeof window.ResizeObserver === 'function') {
    observer = new window.ResizeObserver(measure);
    observer.observe(root.value);
  }
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<style scoped>
.song-text { font-family: var(--reader-font-family); font-size: calc(1.04rem * var(--font-size-multiplier, 1)); line-height: 1.78; }
.song-line { display: flex; flex-direction: column; min-width: 0; }
.song-lyrics { white-space: pre-wrap; overflow-wrap: anywhere; }
.song-chords { order: -1; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--devotional-accent); font-family: ui-monospace, monospace; font-size: 0.85em; font-weight: 700; }
/* A shared grid pairs each lyric and chord row. Both tracks can shrink, so long lines wrap
   inside the reader instead of setting the width of the page. */
.song-text--right { display: grid; width: 100%; grid-template-columns: minmax(0, 1fr) minmax(0, 34%); column-gap: clamp(.55rem, 2.4vw, 1.5rem); align-items: baseline; }
.song-text--right .song-line { display: contents; }
.song-text--right .song-lyrics { grid-column: 1; min-width: 0; }
.song-text--right .song-chords { order: 0; grid-column: 2; min-width: 0; opacity: .88; }
</style>
