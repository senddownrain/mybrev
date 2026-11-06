<template>
  <div class="alignment-setting">
    <strong>Выраўноўванне тэксту</strong>
    <div class="alignment-options" role="radiogroup" aria-label="Выраўноўванне тэксту" @keydown="onKeydown">
      <button v-for="option in options" :key="option.value" type="button" role="radio"
        :aria-checked="settings.textAlignment === option.value" :aria-label="option.label" :title="option.label"
        :tabindex="settings.textAlignment === option.value ? 0 : -1" :data-alignment="option.value"
        @click="settings.textAlignment = option.value">
        <component :is="option.icon" :size="22" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
<script setup>
import { PhTextAlignLeft, PhTextAlignJustify } from '@phosphor-icons/vue';
import { useSettingsStore } from '@/stores/settings';
const settings = useSettingsStore();
const options = [
  { value: 'start', label: 'Па левым краі', icon: PhTextAlignLeft },
  { value: 'justify', label: 'Па шырыні', icon: PhTextAlignJustify },
];
function onKeydown(event) {
  let next;
  if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) next = settings.textAlignment === 'start' ? 1 : 0;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = 1;
  else return;
  event.preventDefault();
  settings.textAlignment = options[next].value;
  event.currentTarget.querySelectorAll('button')[next].focus();
}
</script>
<style scoped>
.alignment-setting { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding-block: 14px; color: var(--nav-on-surface); }
strong { font-size: .9rem; font-weight: 720; }
.alignment-options { display: flex; flex: 0 0 auto; border: 1px solid var(--nav-border); border-radius: 13px; overflow: hidden; }
button { display: grid; place-items: center; width: 48px; min-height: 44px; border: 0; background: transparent; color: inherit; cursor: pointer; }
button + button { border-inline-start: 1px solid var(--nav-border); }
button[aria-checked="true"] { background: var(--nav-active); color: var(--chrome-accent); box-shadow: inset 0 -3px currentColor; }
button:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -4px; }
@media (forced-colors: active) { button[aria-checked="true"] { border-bottom: 3px solid Highlight; } }
</style>
