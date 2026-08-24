<template>
  <div class="text-scale-control" role="group" aria-label="Памер тэксту">
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
      class="text-scale-value"
      aria-label="Адкрыць налады выгляду"
      @click="toggleSettingsSheet"
    >
      {{ Math.round(settings.fontSizeMultiplier * 100) }}%
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
import { PhMinus, PhPlus } from '@phosphor-icons/vue';
import { useSettingsStore } from '@/stores/settings.js';
import { useAppBar } from '@/composables/useAppBar.js';

const settings = useSettingsStore();
const { toggleSettingsSheet } = useAppBar();
</script>

<style scoped>
.text-scale-control {
  display: flex;
  align-items: center;
  height: 48px;
  padding: 0 4px;
  border: 1px solid var(--nav-border);
  border-radius: 24px;
  background: var(--nav-surface);
  color: var(--nav-on-surface);
  box-shadow: 0 2px 9px var(--nav-button-shadow);
}

.text-scale-button,
.text-scale-value {
  display: grid;
  place-items: center;
  height: 40px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.text-scale-button {
  width: 38px;
  flex: 0 0 38px;
  border-radius: 50%;
}

.text-scale-value {
  min-width: 44px;
  padding: 0 4px;
  border-radius: 12px;
  color: var(--nav-muted);
  font-size: 0.72rem;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}

.text-scale-button:active,
.text-scale-value:active {
  background: var(--nav-active);
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

  .text-scale-button,
  .text-scale-value {
    height: 38px;
  }

  .text-scale-button {
    width: 34px;
    flex-basis: 34px;
  }

  .text-scale-value {
    min-width: 38px;
    font-size: 0.67rem;
  }
}
</style>
