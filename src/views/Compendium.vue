<template>
  <v-container class="prayers-list-container compendium-container">
    <header class="prayers-page-header">
      <div class="prayers-page-eyebrow">Каталіцкі Касцёл</div>
      <h1 class="prayers-page-title">{{ COMPENDIUM_TITLE }}</h1>
    </header>
    <v-alert v-if="store.error && !store.ready" type="warning" variant="tonal" class="mb-4 mx-3">
      Не атрымалася адкрыць Кампендый.
      <v-btn variant="text" :loading="store.isLoading" @click="store.init({ fresh: true })">Паўтарыць</v-btn>
    </v-alert>
    <v-progress-linear v-else-if="!store.ready" indeterminate aria-label="Загрузка Кампендыя" />
    <template v-else>
      <v-list lines="two" bg-color="transparent" class="prayer-options-list" aria-label="Часткі Кампендыя">
        <v-list-item v-for="part in parts" :key="part.id" :to="{ name: 'CompendiumPart', params: { partId: part.id } }" class="prayer-list-item">
          <template #prepend><span class="prayer-list-item__icon-wrap compendium-number">{{ romanNumeral(part.number) }}</span></template>
          <div class="prayers-page-eyebrow compendium-level-label">{{ part.label }}</div>
          <v-list-item-title class="prayer-title-text">{{ part.title }}</v-list-item-title>
          <div class="compendium-range">Пытанні {{ part.first }}–{{ part.last }}</div>
          <template #append><v-icon class="prayer-list-item__arrow" icon="mdi-chevron-right" size="24" /></template>
        </v-list-item>
      </v-list>
    </template>
  </v-container>
</template>
<script setup>
import { computed } from 'vue';
import { useCompendiumStore } from '@/stores/compendium';
import { COMPENDIUM_TITLE } from '@/constants/compendium';
import { romanNumeral } from '@/utils/compendiumData';
import { useCompendiumScroll } from '@/composables/useCompendiumScroll';
const store = useCompendiumStore();
const parts = computed(() => store.parts.map((part) => {
  const questions = store.questions.filter((question) => question.partId === part.id);
  return { ...part, first: questions[0]?.number, last: questions.at(-1)?.number };
}));
store.init();
useCompendiumScroll();
</script>
<style scoped src="@/styles/prayers-list.css"></style>
<style scoped src="@/styles/compendium.css"></style>
