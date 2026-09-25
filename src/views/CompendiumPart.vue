<template>
  <v-container class="prayers-list-container compendium-container">
    <template v-if="outline">
      <header class="prayers-page-header">
        <div class="prayers-page-eyebrow">{{ outline.part.label }}</div>
        <h1 class="prayers-page-title">{{ outline.part.title }}</h1>
      </header>
      <section v-for="section in outline.sections" :key="section.id" class="compendium-section" :aria-label="section.title || outline.part.title">
        <div v-if="section.label" class="compendium-section__label">{{ section.label }}</div>
        <h2 v-if="section.title" class="compendium-section__title">{{ section.title }}</h2>
        <div v-for="chapter in section.chapters" :key="chapter.id" class="compendium-chapter">
          <template v-if="chapter.title">
            <div class="compendium-chapter__label">{{ chapter.label }}</div>
            <h3 class="compendium-chapter__title">{{ chapter.title }}</h3>
          </template>
          <v-list lines="two" bg-color="transparent" class="prayer-options-list">
            <template v-for="group in chapter.groups" :key="group.id">
              <div v-if="group.parentTitle" class="compendium-parent-title">{{ group.parentTitle }}</div>
              <v-list-item :to="{ name: 'CompendiumTopic', params: { topicId: group.id } }" class="prayer-list-item">
                <v-list-item-title class="prayer-title-text">{{ group.kind === 'topic' ? group.title : rangeLabel(group) }}</v-list-item-title>
                <div v-if="group.kind === 'topic'" class="compendium-range">{{ rangeLabel(group) }}</div>
                <template #append><v-icon class="prayer-list-item__arrow" icon="mdi-chevron-right" size="24" /></template>
              </v-list-item>
            </template>
          </v-list>
        </div>
      </section>
      <div class="compendium-source-note"><CompendiumSource /></div>
    </template>
    <v-progress-linear v-else-if="!store.ready && !store.error" indeterminate aria-label="Загрузка Кампендыя" />
    <v-alert v-else type="warning" class="mx-3">Частка не знойдзена. <router-link :to="{ name: 'Compendium' }">Да зместу</router-link></v-alert>
  </v-container>
</template>
<script setup>
import { computed } from 'vue';
import { useCompendiumStore } from '@/stores/compendium';
import { buildPartOutline } from '@/utils/compendiumData';
import CompendiumSource from '@/components/compendium/CompendiumSource.vue';
import { useCompendiumScroll } from '@/composables/useCompendiumScroll';
const props = defineProps({ partId: { type: String, required: true } });
const store = useCompendiumStore();
const outline = computed(() => (store.index ? buildPartOutline(store.index, props.partId) : null));
const rangeLabel = (group) => (group.firstQuestion === group.lastQuestion ? `Пытанне ${group.firstQuestion}` : `Пытанні ${group.firstQuestion}–${group.lastQuestion}`);
store.init();
useCompendiumScroll();
</script>
<style scoped src="@/styles/prayers-list.css"></style>
<style scoped src="@/styles/compendium.css"></style>
<style scoped>
.compendium-source-note :deep(.prayer-source) { margin: 0; padding: 0; }
</style>
