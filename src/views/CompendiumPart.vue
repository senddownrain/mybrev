<template>
  <v-container class="prayers-list-container compendium-container">
    <template v-if="outline">
      <header class="prayers-page-header">
        <div class="prayers-page-eyebrow">{{ outline.part.label }}</div>
        <h1 class="prayers-page-title">{{ outline.part.title }}</h1>
      </header>
      <!-- Only real source headings are structural nodes; questions printed
           directly under a heading are plain question rows. -->
      <section v-for="section in outline.sections" :id="section.id" :key="section.id" class="compendium-section compendium-anchor" :aria-label="section.title">
        <div class="compendium-section__label">{{ section.label }}</div>
        <h2 class="compendium-section__title">{{ section.title }}</h2>
        <CompendiumNodeList :node="section" />
        <div v-for="chapter in section.chapters" :id="chapter.id" :key="chapter.id" class="compendium-chapter compendium-anchor">
          <div class="compendium-chapter__label">{{ chapter.label }}</div>
          <h3 class="compendium-chapter__title">{{ chapter.title }}</h3>
          <CompendiumNodeList :node="chapter" />
        </div>
      </section>
      <div class="compendium-source-note"><CompendiumSource /></div>
    </template>
    <v-progress-linear v-else-if="!store.ready && !store.error" indeterminate aria-label="Загрузка Кампендыя" />
    <v-alert v-else type="warning" class="mx-3">Частка не знойдзена. <router-link :to="{ name: 'Compendium' }">Да зместу</router-link></v-alert>
  </v-container>
</template>
<script setup>
import { computed, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useCompendiumStore } from '@/stores/compendium';
import { buildPartOutline } from '@/utils/compendiumNavigation';
import CompendiumNodeList from '@/components/compendium/CompendiumNodeList.vue';
import CompendiumSource from '@/components/compendium/CompendiumSource.vue';
import { useCompendiumScroll } from '@/composables/useCompendiumScroll';
const props = defineProps({ partId: { type: String, required: true } });
const store = useCompendiumStore();
const route = useRoute();
const outline = computed(() => (store.index ? buildPartOutline(store.index, props.partId) : null));
store.init();
useCompendiumScroll();
// A heading anchor (#p1-s1-ch1) from a context link or a legacy group link:
// the router scrolls to it when it is rendered; this covers a cold load.
watch(outline, async (value, previous) => {
  if (!value || previous || !route.hash || window.history.state?.scroll) return;
  await nextTick();
  document.getElementById(route.hash.slice(1))?.scrollIntoView({ block: 'start' });
}, { immediate: true });
</script>
<style scoped src="@/styles/prayers-list.css"></style>
<style scoped src="@/styles/compendium.css"></style>
<style scoped>
.compendium-source-note :deep(.prayer-source) { margin: 0; padding: 0; }
</style>
