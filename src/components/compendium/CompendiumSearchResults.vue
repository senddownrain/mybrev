<template>
  <section class="compendium-results" aria-label="Вынікі пошуку">
    <p class="text-caption mb-3 compendium-results__count" aria-live="polite">Знойдзена: {{ results.length }}</p>
    <v-list lines="one" bg-color="transparent" class="prayer-options-list">
      <v-list-item
        v-for="result in results"
        :key="result.question.id"
        :to="{ name: 'CompendiumQuestion', params: { number: result.question.number } }"
        class="prayer-list-item compendium-row"
      >
        <template #prepend><span class="prayer-list-item__icon-wrap compendium-number">{{ result.question.number }}</span></template>
        <v-list-item-title class="prayer-title-text">{{ result.question.question }}</v-list-item-title>
        <div class="compendium-row__context">{{ questionContextLabel(result.question) }}</div>
        <template #append><v-icon class="prayer-list-item__arrow" icon="mdi-chevron-right" size="24" /></template>
      </v-list-item>
    </v-list>
    <p v-if="!results.length" class="compendium-empty">Нічога не знойдзена. Паспрабуйце іншае слова або нумар пытання.</p>
  </section>
</template>
<script setup>
import { questionContextLabel } from '@/utils/compendiumNavigation';
defineProps({ results: { type: Array, required: true } });
</script>
<style scoped src="@/styles/prayers-list.css"></style>
<style scoped src="@/styles/compendium.css"></style>
