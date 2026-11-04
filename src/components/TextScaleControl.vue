<template>
  <div class="text-scale-control" role="group" aria-label="Памер тэксту">
    <button v-if="showSettings" type="button" class="text-scale-button" aria-label="Выгляд тэксту" title="Выгляд тэксту" @click="ui.toggleSettingsSheet"><PhTextAa :size="22" /></button>
    <button
      type="button"
      class="text-scale-button"
      aria-label="Паменшыць тэкст"
      :disabled="settings.fontSizeMultiplier <= 0.7"
      @click="settings.decreaseFontSize"
    >
      <PhMinus :size="18" weight="bold" />
    </button>

    <button
      type="button"
      class="text-scale-button"
      aria-label="Павялічыць тэкст"
      :disabled="settings.fontSizeMultiplier >= 1.8"
      @click="settings.increaseFontSize"
    >
      <PhPlus :size="18" weight="bold" />
    </button>
  </div>
</template>

<script setup>
import { PhMinus, PhPlus, PhTextAa } from '@phosphor-icons/vue';
import { useSettingsStore } from '@/stores/settings.js';

import { useUiStore } from '@/stores/ui';
defineProps({ showSettings: Boolean });
const ui = useUiStore();
const settings = useSettingsStore();
</script>

<style scoped>
.text-scale-control {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  height: 48px;
  padding: 0 4px;
  border: 1px solid var(--nav-border);
  border-radius: 24px;
  background: var(--overlay-surface);
  color: var(--nav-on-surface);
  box-shadow: 0 2px 9px var(--nav-button-shadow);
  backdrop-filter: blur(18px);
}

.text-scale-button {
  display: grid;
  place-items: center;
  width: 44px;
  flex: 0 0 44px;
  height: 44px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.text-scale-button:active {
  background: rgba(var(--chrome-accent-rgb), 0.12);
  color: var(--chrome-accent);
}

.text-scale-button + .text-scale-button {
  position: relative;
}

.text-scale-button + .text-scale-button::before {
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: 0;
  width: 1px;
  background: var(--nav-border);
  content: '';
}

.text-scale-button:disabled {
  opacity: 0.28;
  cursor: default;
}

@media (max-width: 359px) {
  .text-scale-control {
    height: 44px;
    padding-inline: 2px;
  }

  .text-scale-button {
    width: 44px;
    flex-basis: 44px;
    height: 44px;
  }
}
</style>
