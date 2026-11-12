<template>
  <v-container class="prayers-list-container compendium-container">
    <template v-if="outline">
      <header class="prayers-page-header">
        <div class="prayers-page-eyebrow">{{ outline.part.label }}</div>
        <h1 class="prayers-page-title compendium-node-title">{{ outline.part.title }}</h1>
      </header>
      <div class="compendium-part-outline" :aria-label="outline.part.title">
        <template v-for="item in outline.items" :key="item.id">
          <section v-if="item.kind === 'sectionHeading'" :id="item.id" class="compendium-outline-heading compendium-outline-heading--section">
            <div class="prayers-page-eyebrow">{{ item.label }}</div>
            <h2>{{ item.title }}</h2>
          </section>
          <section v-else-if="item.kind === 'subsectionHeading'" :id="item.id" class="compendium-outline-heading compendium-outline-heading--subsection">
            <div class="prayers-page-eyebrow">{{ item.label }}</div>
            <h3>{{ item.title }}</h3>
          </section>
          <h4 v-else-if="item.kind === 'topicHeading'" :id="item.id" class="compendium-outline-topic">{{ item.title }}</h4>
          <h5 v-else-if="item.kind === 'subtopicHeading'" :id="item.id" class="compendium-outline-subtopic">{{ item.title }}</h5>
          <div v-else-if="item.kind === 'leadCitations'" class="compendium-node-lead compendium-answer">
            <blockquote v-for="(citation, index) in item.citations" :key="index" class="compendium-citation">{{ citation.text }}</blockquote>
          </div>
          <v-list-item v-else :id="item.id" :to="{ name: 'CompendiumQuestion', params: { number: item.question.number } }" class="prayer-list-item compendium-row">
            <template #prepend><span class="prayer-list-item__icon-wrap compendium-number">{{ item.question.number }}</span></template>
            <v-list-item-title class="prayer-title-text">{{ item.question.question }}</v-list-item-title>
            <template #append><PhCaretRight :size="22" class="prayer-list-item__arrow" aria-hidden="true" /></template>
          </v-list-item>
        </template>
      </div>
    </template>
    <v-progress-linear v-else-if="!store.ready && !store.error" indeterminate aria-label="Загрузка Кампендыя" />
    <v-alert v-else type="warning" class="mx-3">Частка не знойдзена. <router-link :to="{ name: 'Compendium' }">Да зместу</router-link></v-alert>
  </v-container>
</template>
<script setup>
import { computed, nextTick, watch } from 'vue';
import { PhCaretRight } from '@phosphor-icons/vue';
import { useRoute } from 'vue-router';
import { useCompendiumStore } from '@/stores/compendium';
import { buildPartReadingOutline } from '@/utils/compendiumNavigation';
import { useCompendiumScroll } from '@/composables/useCompendiumScroll';

const props = defineProps({ partId: { type: String, required: true } });
const store = useCompendiumStore();
const route = useRoute();
const outline = computed(() => (store.index ? buildPartReadingOutline(store.index, props.partId) : null));
watch([outline, () => route.hash], async ([value, hash]) => {
  if (!value || !hash || route.query.q) return;
  await nextTick();
  window.requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }));
}, { immediate: true, flush: 'post' });
store.init();
useCompendiumScroll();
</script>
<style scoped src="@/styles/prayers-list.css"></style>
<style scoped src="@/styles/compendium.css"></style>
