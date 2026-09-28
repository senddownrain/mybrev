<template>
  <v-container class="prayer-view-container compendium-reader">
    <div v-if="question" class="prayer-content-area">
      <article class="prayer-reading-surface">
        <header class="prayer-reading-header">
          <div class="prayer-reading-eyebrow">Пытанне {{ question.number }}</div>
          <h1 class="prayer-title">{{ question.question }}</h1>
          <nav class="compendium-trail" aria-label="Месца ў Кампендыі">
            <template v-for="(crumb, index) in trail" :key="crumb.label"><template v-if="index"> · </template><router-link :to="crumb.to">{{ crumb.label }}</router-link></template>
          </nav>
        </header>
        <div class="prayer-text"><CompendiumAnswer :question="question" /></div>
        <nav class="compendium-pager" aria-label="Суседнія пытанні">
          <v-btn v-if="previous" variant="text" class="text-none" prepend-icon="mdi-chevron-left" :to="{ name: 'CompendiumQuestion', params: { number: previous.number } }">{{ previous.number }}</v-btn><span v-else />
          <v-btn variant="text" class="text-none" :to="context.to">{{ context.label }}</v-btn>
          <v-btn v-if="next" variant="text" class="text-none" append-icon="mdi-chevron-right" :to="{ name: 'CompendiumQuestion', params: { number: next.number } }">{{ next.number }}</v-btn><span v-else />
        </nav>
        <CompendiumSource />
      </article>
    </div>
    <v-progress-linear v-else-if="!store.ready && !store.error" indeterminate aria-label="Загрузка Кампендыя" />
    <v-alert v-else type="warning">Пытанне {{ number }} не знойдзена. <router-link :to="{ name: 'Compendium' }">Да зместу</router-link></v-alert>
  </v-container>
</template>
<script setup>
import { computed } from 'vue';
import { useCompendiumStore } from '@/stores/compendium';
import { buildCompendiumNavigation, nodeRoute, questionTrail } from '@/utils/compendiumNavigation';
import CompendiumAnswer from '@/components/compendium/CompendiumAnswer.vue';
import CompendiumSource from '@/components/compendium/CompendiumSource.vue';
const props = defineProps({ number: { type: String, required: true } });
const store = useCompendiumStore();
const question = computed(() => (/^\d{1,3}$/.test(props.number) ? store.getQuestion(props.number) : null));
// Real source headings only (part · section · chapter · named topic), each linkable.
const trail = computed(() => (question.value ? questionTrail(store.index, question.value) : []));
// A question inside a named topic opens that topic; a question printed directly
// under a section/chapter opens the part screen at that heading.
const context = computed(() => {
  const placement = buildCompendiumNavigation(store.index).getPlacement(question.value.number);
  const node = buildCompendiumNavigation(store.index).getNode(placement.nodeId);
  return node.kind === 'topic'
    ? { label: 'Уся тэма', to: nodeRoute(node) }
    : { label: 'Да зместу', to: nodeRoute(node) };
});
const previous = computed(() => (question.value ? store.getQuestion(question.value.number - 1) : null));
const next = computed(() => (question.value ? store.getQuestion(question.value.number + 1) : null));
store.init();
</script>
<style scoped src="@/styles/prayer-reading.css"></style>
<style scoped src="@/styles/compendium.css"></style>
<style scoped>
.compendium-trail a { color: inherit; text-decoration-color: color-mix(in srgb, currentColor 35%, transparent); text-underline-offset: 2px; }
</style>
