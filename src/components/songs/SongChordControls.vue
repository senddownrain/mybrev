<template>
  <!-- Every part has a fixed size and stays rendered whatever the state or width (unavailable parts
       are only dimmed), so toggling chords, switching layout or transposing never moves the bar. -->
  <div class="song-chord-bar" role="toolbar" aria-label="Акорды">
    <div class="song-chord-bar__group">
      <button type="button" class="song-chord-toggle" :class="{ 'song-chord-toggle--on': showChords }" aria-label="Акорды" :aria-pressed="showChords ? 'true' : 'false'" :title="showChords ? 'Схаваць акорды' : 'Паказаць акорды'" @click="emit('update:showChords', !showChords)">
        <PhMusicNotes :size="18" :weight="showChords ? 'fill' : 'regular'" aria-hidden="true" /><span class="song-chord-toggle__label">Акорды</span>
      </button>
      <!-- The selector shows what is rendered. When the text is too narrow for chords on the right,
           "right" is dimmed and explained instead of disappearing; the stored preference is untouched. -->
      <div class="song-chord-layout" role="radiogroup" aria-label="Размяшчэнне акордаў" :aria-describedby="layoutAvailable ? undefined : 'song-chord-layout-note'" @keydown="onLayoutKeydown">
        <button v-for="option in LAYOUT_OPTIONS" :key="option.value" type="button" role="radio" class="song-chord-layout__option" :class="{ 'song-chord-layout__option--active': shownLayout === option.value, 'song-chord-layout__option--unavailable': isUnavailable(option.value) }" :aria-checked="shownLayout === option.value ? 'true' : 'false'" :aria-label="option.label" :aria-disabled="isUnavailable(option.value) ? 'true' : undefined" :title="isUnavailable(option.value) ? `${option.label}: ${NARROW_NOTE}` : option.label" :tabindex="shownLayout === option.value ? 0 : -1" :disabled="!showChords" @click="selectLayout(option.value)">
          <component :is="option.icon" :size="18" aria-hidden="true" />
        </button>
        <span id="song-chord-layout-note" class="song-chord-bar__sr">{{ NARROW_NOTE }}</span>
      </div>
    </div>
    <div class="song-transpose" role="group" aria-label="Танальнасць">
      <button type="button" class="song-transpose__step" aria-label="Панізіць на паўтон" title="Панізіць на паўтон" :disabled="!showChords || transpose <= -TRANSPOSE_LIMIT" @click="step(-1)"><PhMinus :size="16" weight="bold" aria-hidden="true" /></button>
      <!-- The offset itself is the reset: a shifted value shows a small "return" mark and tapping it
           goes back to the original key. The mark is always in the box, so nothing moves. -->
      <button type="button" class="song-transpose__value" :class="{ 'song-transpose__value--shifted': transpose !== 0 }" :aria-label="transpose === 0 ? 'Арыгінальная танальнасць' : `Танальнасць ${label}. Вярнуць арыгінальную`" :title="transpose === 0 ? 'Арыгінальная танальнасць' : 'Вярнуць арыгінальную танальнасць'" :disabled="!showChords" @click="emit('update:transpose', 0)">
        <span class="song-transpose__number">{{ label }}</span>
        <PhArrowCounterClockwise class="song-transpose__reset" :size="11" weight="bold" aria-hidden="true" />
      </button>
      <button type="button" class="song-transpose__step" aria-label="Павысіць на паўтон" title="Павысіць на паўтон" :disabled="!showChords || transpose >= TRANSPOSE_LIMIT" @click="step(1)"><PhPlus :size="16" weight="bold" aria-hidden="true" /></button>
      <span class="song-chord-bar__sr" aria-live="polite">{{ transpose === 0 ? 'Арыгінальная танальнасць' : `Танальнасць ${label}` }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { PhArrowCounterClockwise, PhColumns, PhMinus, PhMusicNotes, PhPlus, PhRows } from '@phosphor-icons/vue';
import { clampTranspose, formatTranspose, resolveChordLayout, TRANSPOSE_LIMIT } from '@/utils/songDisplay';

const props = defineProps({
  showChords: Boolean,
  layout: { type: String, default: 'above' },
  transpose: { type: Number, default: 0 },
  // False when the song text is too narrow for chords on the right.
  layoutAvailable: { type: Boolean, default: true },
});
const emit = defineEmits(['update:showChords', 'update:layout', 'update:transpose']);
const LAYOUT_OPTIONS = [
  { value: 'above', label: 'Акорды над тэкстам', icon: PhRows },
  { value: 'right', label: 'Акорды справа ад тэксту', icon: PhColumns },
];
const NARROW_NOTE = 'даступна на шырэйшым экране, цяпер акорды паказаны над тэкстам';
const label = computed(() => formatTranspose(props.transpose));
// What is actually rendered: "right" falls back to "above" on narrow text.
const shownLayout = computed(() => resolveChordLayout(props.layout, props.layoutAvailable));
const isUnavailable = (value) => value === 'right' && !props.layoutAvailable;
const step = (delta) => emit('update:transpose', clampTranspose(props.transpose + delta));

// Re-tapping the shown option (possibly only a fallback) keeps the stored preference.
function selectLayout(value) {
  if (isUnavailable(value) || value === shownLayout.value) return false;
  emit('update:layout', value);
  return true;
}

// Radio group keyboard pattern: one tab stop, arrows move the selection.
function onLayoutKeydown(event) {
  const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
  if (!delta) return;
  event.preventDefault();
  const current = LAYOUT_OPTIONS.findIndex((option) => option.value === shownLayout.value);
  const next = (current + delta + LAYOUT_OPTIONS.length) % LAYOUT_OPTIONS.length;
  if (selectLayout(LAYOUT_OPTIONS[next].value)) event.currentTarget.querySelectorAll('[role="radio"]')[next]?.focus();
}
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
    position: relative;
    // Taller hit area than the visible 34–38px control, without changing the bar's size.
    &::after { content: ''; position: absolute; inset: -6px 0; }
    &:focus-visible { outline: 2px solid var(--devotional-accent); outline-offset: 2px; }
    &:disabled { cursor: default; }
  }
  .song-chord-bar__group { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .song-chord-bar__sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
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
    &.song-chord-layout__option--unavailable, &.song-chord-layout__option--unavailable:hover { color: var(--reader-muted); opacity: .35; cursor: default; }
    &:disabled { opacity: .45; }
    &.song-chord-layout__option--unavailable:disabled { opacity: .25; }
  }
  .song-transpose__step {
    width: 36px; height: 34px; border-radius: 11px;
    &:hover:not(:disabled) { background: var(--reader-surface); color: var(--devotional-accent); }
    &:disabled { opacity: .3; }
  }
  // Fixed width + tabular figures: "−12", "0" and "+12" occupy exactly the same box.
  .song-transpose__value {
    width: 3.9rem; height: 34px; border-radius: 11px; color: var(--reader-muted); cursor: default;
    font-size: .86rem; font-weight: 750; font-variant-numeric: tabular-nums;
    &.song-transpose__value--shifted { background: var(--reader-surface); color: var(--devotional-accent); box-shadow: 0 1px 3px rgba(0, 0, 0, .08); cursor: pointer; }
    &:disabled { opacity: .45; }
  }
  // Centred by the fixed-width flex button (reader styles force text-align: left on descendants).
  .song-transpose__number { white-space: nowrap; }
  // Out of flow, so showing it never moves the number.
  .song-transpose__reset { position: absolute; top: 50%; right: 5px; transform: translateY(-50%); opacity: 0; transition: opacity .18s ease; }
  .song-transpose__value--shifted .song-transpose__reset { opacity: .7; }
}
@media (max-width: 600px) {
  .song-chord-bar { padding-inline: 16px; }
}
// Small phones: tighter spacing, then an icon-only toggle, so the bar always fits on one row.
@media (max-width: 370px) {
  .song-chord-bar { gap: 8px; padding-inline: 12px; }
  .song-chord-bar .song-chord-bar__group { gap: 6px; }
}
@media (max-width: 359px) {
  .song-chord-bar .song-chord-toggle { width: 38px; padding: 0; }
  .song-chord-bar .song-chord-toggle__label { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .song-chord-bar button, .song-chord-bar .song-transpose__reset { transition: none; }
}
</style>
