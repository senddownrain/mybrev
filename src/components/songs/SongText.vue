<template>
  <div class="song-text" :class="{ 'song-text--left': showChords && layout === 'left' }">
    <div v-for="(line, index) in lines" :key="index" class="song-line">
      <div v-if="showChords && line.chord" class="song-chords">{{ transposeChordLine(line.chord, transpose, notation, accidentals) }}</div>
      <div class="song-lyrics">{{ line.text || '\u00a0' }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { songLines, transposeChordLine } from '@/utils/songChords';
const props = defineProps({ song: { type: Object, required: true }, showChords: Boolean, layout: { type: String, default: 'above' }, notation: { type: String, default: 'lowercase' }, accidentals: { type: String, default: 'auto' }, transpose: { type: Number, default: 0 } });
const lines = computed(() => songLines(props.song));
</script>

<style scoped>
.song-text { font-family: var(--reader-font-family); font-size: calc(1.04rem * var(--font-size-multiplier, 1)); line-height: 1.78; }
.song-line { min-width: 0; }
.song-lyrics { white-space: pre-wrap; overflow-wrap: anywhere; }
.song-chords { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--devotional-accent); font-family: ui-monospace, monospace; font-size: 0.85em; font-weight: 700; }
.song-text--left .song-line { display: grid; grid-template-columns: minmax(0, .55fr) minmax(0, 1fr); gap: 16px; }
.song-text--left .song-lyrics { grid-column: 2; grid-row: 1; }
.song-text--left .song-chords { grid-column: 1; grid-row: 1; padding-top: 0.15em; }
@media (max-width: 480px) { .song-text--left .song-line { gap: 10px; grid-template-columns: minmax(0, .65fr) minmax(0, 1fr); } }
</style>
