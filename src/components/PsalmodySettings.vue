<template>
  <section class="psalmody-settings" aria-label="Псальмодыя">
    <h3>Псальмодыя</h3>
    <div class="psalmody-modes" role="radiogroup" aria-label="Выгляд псальмодыі" @keydown="onKeydown">
      <button v-for="option in options" :key="option.value" type="button" role="radio"
        :data-mode="option.value" :aria-checked="settings.psalmodyMode === option.value"
        :tabindex="settings.psalmodyMode === option.value ? 0 : -1"
        :aria-label="option.label" :title="option.label" @click="settings.psalmodyMode = option.value">
        <svg viewBox="0 0 40 32" width="40" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false">
          <path :d="option.lines" />
        </svg>
      </button>
    </div>
  </section>
</template>

<script setup>
import { useSettingsStore } from '@/stores/settings';
const settings = useSettingsStore();
const options = [
  { value: 'left-break', label: 'Злева, пераносы пасля * і † без водступу', lines: 'M4 4H32 M4 10H24 M4 22H32 M4 28H24' },
  { value: 'left-break-indent', label: 'Злева, пераносы пасля * і † з водступам', lines: 'M4 4H32 M10 10H30 M4 22H32 M10 28H30' },
  { value: 'alternating-stanzas', label: 'Чаргаванне строфаў з водступам, без пераносаў пасля * і †', lines: 'M4 4H28 M4 10H22 M12 22H36 M12 28H30' },
];
function onKeydown(event) {
  const index = options.findIndex((option) => option.value === settings.psalmodyMode);
  let next;
  if (['ArrowRight', 'ArrowDown'].includes(event.key)) next = (index + 1) % options.length;
  else if (['ArrowLeft', 'ArrowUp'].includes(event.key)) next = (index + options.length - 1) % options.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = options.length - 1;
  else return;
  event.preventDefault();
  settings.psalmodyMode = options[next].value;
  event.currentTarget.querySelectorAll('[role="radio"]')[next].focus();
}
</script>

<style scoped>
.psalmody-settings { display: grid; gap: 14px; padding: 16px; color: var(--nav-on-surface); }
h3 { font-size: 1rem; }
.psalmody-modes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--nav-border); border-radius: 14px; overflow: hidden; }
.psalmody-modes button { display: grid; place-items: center; min-width: 0; min-height: 52px; border: 0; background: transparent; color: inherit; cursor: pointer; }
.psalmody-modes button + button { border-inline-start: 1px solid var(--nav-border); }
.psalmody-modes button[aria-checked="true"] { background: var(--nav-active); color: var(--chrome-accent); box-shadow: inset 0 -3px currentColor; }
.psalmody-modes button:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -4px; }
@media (forced-colors: active) { .psalmody-modes button[aria-checked="true"] { border-bottom: 3px solid Highlight; } }
</style>
