<template>
  <v-menu location="bottom end" :offset="6">
    <template #activator="{ props: activatorProps }">
      <button
        v-bind="activatorProps"
        type="button"
        class="mass-language-button"
        :aria-label="`Мова тэксту: ${current?.label || ''}. Змяніць мову`"
      >
        <PhTranslate :size="18" weight="bold" aria-hidden="true" />
        <span class="mass-language-button__code" :lang="current?.language">{{ current?.shortLabel }}</span>
      </button>
    </template>

    <v-list class="mass-language-list" density="compact" aria-label="Мова святой Імшы">
      <v-list-item
        v-for="variant in MASS_RITUAL.variants"
        :key="variant.language"
        :active="variant.language === current?.language"
        :aria-current="variant.language === current?.language ? 'true' : undefined"
        rounded="lg"
        @click="selectLanguage(variant.language)"
      >
        <v-list-item-title :lang="variant.language">{{ variant.label }}</v-list-item-title>
        <template #append>
          <span class="mass-language-list__code">{{ variant.shortLabel }}</span>
        </template>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { PhTranslate } from '@phosphor-icons/vue';
import { useUiStore } from '@/stores/ui.js';
import { MASS_RITUAL, getMassVariant } from '@/utils/massRitual.js';

// Compact, secondary language control for the Holy Mass screen. The reader
// follows `?lang` and keeps the reader at the same semantic section.
const route = useRoute();
const router = useRouter();
const uiStore = useUiStore();

const current = computed(() => getMassVariant(uiStore.massLanguage) || getMassVariant(MASS_RITUAL.defaultLanguage));

function selectLanguage(language) {
  if (language === current.value?.language) return;
  router.replace({ query: { ...route.query, lang: language }, hash: route.hash });
}
</script>

<style scoped>
.mass-language-button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  height: 48px;
  padding: 0 14px 0 13px;
  border: 1px solid var(--nav-border);
  border-radius: 24px;
  background: var(--overlay-surface);
  color: var(--nav-on-surface);
  box-shadow: 0 2px 9px var(--nav-button-shadow);
  font: inherit;
  cursor: pointer;
  backdrop-filter: blur(18px);
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.mass-language-button:active {
  opacity: 0.72;
  transform: scale(0.96);
}

.mass-language-button:focus-visible {
  outline: 2px solid var(--chrome-accent);
  outline-offset: 2px;
}

.mass-language-button__code {
  font-size: 0.8rem;
  font-weight: 750;
  letter-spacing: 0.06em;
}

.mass-language-list {
  min-width: 176px;
  padding: 6px !important;
}

.mass-language-list__code {
  margin-left: 12px;
  opacity: 0.6;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
}

@media (max-width: 359px) {
  .mass-language-button {
    height: 44px;
    padding: 0 11px 0 10px;
  }
}
</style>
