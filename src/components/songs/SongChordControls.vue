<template>
  <!-- Every part has a fixed size and stays rendered whatever the state (chords off only disables
       controls), so toggling chords, switching layout or transposing never moves the bar. -->
  <div class="song-chord-bar" role="toolbar" aria-label="Акорды">
    <div class="song-chord-bar__group">
      <button type="button" class="song-chord-toggle" :class="{ 'song-chord-toggle--on': showChords }" :aria-pressed="showChords ? 'true' : 'false'" @click="emit('update:showChords', !showChords)">
        <PhMusicNotes :size="18" :weight="showChords ? 'fill' : 'regular'" aria-hidden="true" /><span>Акорды</span>
      </button>
      <!-- Hidden only when the text is too narrow for chords on the right (a width change, not a state change). -->
      <div v-show="layoutAvailable" class="song-chord-layout" role="radiogroup" aria-label="Размяшчэнне акордаў">
        <button v-for="option in LAYOUT_OPTIONS" :key="option.value" type="button" role="radio" class="song-chord-layout__option" :class="{ 'song-chord-layout__option--active': layout === option.value }" :aria-checked="layout === option.value ? 'true' : 'false'" :aria-label="option.label" :title="option.label" :disabled="!showChords" @click="emit('update:layout', option.value)">
          <component :is="option.icon" :size="18" aria-hidden="true" />
        </button>
      </div>
    </div>
    <div class="song-transpose" role="group" aria-label="Танальнасць">
      <button type="button" class="song-transpose__step" aria-label="Панізіць на паўтон" :disabled="!showChords || transpose <= -TRANSPOSE_LIMIT" @click="step(-1)"><PhMinus :size="16" weight="bold" aria-hidden="true" /></button>
      <!-- The offset itself is the reset: tapping a shifted value returns to the original key. -->
      <button type="button" class="song-transpose__value" :class="{ 'song-transpose__value--shifted': transpose !== 0 }" :aria-label="transpose === 0 ? 'Арыгінальная танальнасць' : `Танальнасць ${label}. Вярнуць арыгінал`" :title="transpose === 0 ? 'Арыгінальная танальнасць' : 'Вярнуць арыгінальную танальнасць'" :disabled="!showChords" @click="emit('update:transpose', 0)">
        <span class="song-transpose__number">{{ label }}</span>
      </button>
      <button type="button" class="song-transpose__step" aria-label="Павысіць на паўтон" :disabled="!showChords || transpose >= TRANSPOSE_LIMIT" @click="step(1)"><PhPlus :size="16" weight="bold" aria-hidden="true" /></button>
      <span class="song-transpose__status" aria-live="polite">{{ transpose === 0 ? 'Арыгінальная танальнасць' : `Танальнасць ${label}` }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { PhColumns, PhMinus, PhMusicNotes, PhPlus, PhRows } from '@phosphor-icons/vue';
import { clampTranspose, formatTranspose, TRANSPOSE_LIMIT } from '@/utils/songDisplay';

const props = defineProps({
  showChords: Boolean,
  layout: { type: String, default: 'above' },
  transpose: { type: Number, default: 0 },
  layoutAvailable: { type: Boolean, default: true },
});
const emit = defineEmits(['update:showChords', 'update:layout', 'update:transpose']);
const LAYOUT_OPTIONS = [
  { value: 'above', label: 'Акорды над тэкстам', icon: PhRows },
  { value: 'right', label: 'Акорды справа ад тэксту', icon: PhColumns },
];
const label = computed(() => formatTranspose(props.transpose));
const step = (delta) => emit('update:transpose', clampTranspose(props.transpose + delta));
</script>

<style scoped lang="scss">
.song-chord-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 10px 20px; border-bottom: 1px solid var(--reader-border);
  color: var(--reader-ink);
  button {
    display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center;
    margin: 0; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer;
    transition: background .18s ease, color .18s ease, opacity .18s ease;
    &:focus-visible { outline: 2px solid var(--devotional-accent); outline-offset: 2px; }
    &:disabled { cursor: default; }
  }
  .song-chord-bar__group { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .song-chord-toggle {
    gap: 6px; height: 38px; padding: 0 13px 0 11px; border: 1px solid var(--reader-border); border-radius: 13px;
    color: var(--reader-muted); font-size: .8rem; font-weight: 700; letter-spacing: .01em;
    &:hover { background: var(--devotional-soft); }
    &.song-chord-toggle--on { border-color: rgba(var(--devotional-rgb), .24); background: var(--devotional-soft); color: var(--devotional-accent); }
  }
  .song-chord-layout, .song-transpose { display: flex; align-items: center; height: 38px; padding: 2px; border-radius: 13px; background: var(--devotional-soft); }
  .song-chord-layout__option {
    width: 36px; height: 34px; border-radius: 11px; color: var(--reader-muted);
    &:hover:not(:disabled) { color: var(--devotional-accent); }
    &.song-chord-layout__option--active { background: var(--reader-surface); color: var(--devotional-accent); box-shadow: 0 1px 3px rgba(0, 0, 0, .08); }
    &:disabled { opacity: .45; }
  }
  .song-transpose__step {
    width: 36px; height: 34px; border-radius: 11px;
    &:hover:not(:disabled) { background: var(--reader-surface); color: var(--devotional-accent); }
    &:disabled { opacity: .3; }
  }
  // Fixed width + tabular figures: "−12", "0" and "+12" occupy exactly the same box.
  .song-transpose__value {
    width: 3.4rem; height: 34px; border-radius: 11px; color: var(--reader-muted);
    font-size: .86rem; font-weight: 750; font-variant-numeric: tabular-nums;
    &.song-transpose__value--shifted { background: var(--reader-surface); color: var(--devotional-accent); box-shadow: 0 1px 3px rgba(0, 0, 0, .08); }
    &:disabled { opacity: .45; }
  }
  // Centred by the fixed-width flex button (reader styles force text-align: left on descendants).
  .song-transpose__number { white-space: nowrap; }
  .song-transpose__status { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
}
@media (max-width: 600px) {
  .song-chord-bar { padding-inline: 16px; }
}
</style>
