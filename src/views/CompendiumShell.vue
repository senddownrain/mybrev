<template>
  <div class="compendium-shell" :class="{ 'compendium-shell--idle': !resultsOpen }">
    <!-- The current page stays mounted while results are shown, so closing the
         search returns to exactly the same page state. -->
    <!-- Keyed by path: `?q` and an anchor never remount the Part page. -->
    <router-view v-slot="{ Component, route }">
      <component :is="Component" :key="route.path" v-show="!resultsOpen" />
    </router-view>
    <v-container v-if="resultsOpen" class="prayers-list-container compendium-container">
      <header class="prayers-page-header">
        <div class="prayers-page-eyebrow">Каталіцкі Касцёл</div>
        <h1 class="prayers-page-title">{{ COMPENDIUM_TITLE }}</h1>
      </header>
      <CompendiumSearchResults v-if="store.ready" :results="store.searchResults" />
      <v-progress-linear v-else indeterminate aria-label="Загрузка Кампендыя" />
    </v-container>
    <FeedbackPrompt v-if="!resultsOpen" class="compendium-feedback" label="Заўважылі памылку ў Кампендыі?" :to="compendiumFeedbackTo" />
    <!-- The only search dock of the Compendium: pages never mount their own. -->
    <CompendiumSearchDock @focus="onDockFocus" />
  </div>
</template>

<script setup>
import { computed, toRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCompendiumStore } from '@/stores/compendium';
import { COMPENDIUM_TITLE } from '@/constants/compendium';
import { createCompendiumSearchSync } from '@/utils/compendiumSearchRoute';
import CompendiumSearchDock from '@/components/compendium/CompendiumSearchDock.vue';
import CompendiumSearchResults from '@/components/compendium/CompendiumSearchResults.vue';
import FeedbackPrompt from '@/components/common/FeedbackPrompt.vue';
import { feedbackLocationForRoute } from '@/utils/feedbackContext';

// Shared shell of every Compendium level: one persistent search dock and one
// global results layer. See `createCompendiumSearchSync` for the history rules.
const store = useCompendiumStore();
const route = useRoute();
store.init();

// Show the actual Compendium question or part in the feedback form instead of
// an opaque numeric ID, while preserving the original path and ID as context.
const compendiumFeedbackTo = computed(() => {
  const base = feedbackLocationForRoute(route);
  if (!base) return null; // Index: FeedbackPrompt provides the Compendium fallback.
  let title = '';
  if (route.name === 'CompendiumQuestion') {
    const question = store.getQuestion(route.params.number);
    title = question ? `Пытанне ${question.number}: ${question.question}` : `Пытанне ${route.params.number}`;
  } else if (route.name === 'CompendiumPart') {
    const part = store.getPart(route.params.partId);
    title = part ? `Частка ${part.number}: ${part.title}` : `Частка ${route.params.partId}`;
  }
  return title ? { ...base, query: { ...base.query, ctx_title: title.slice(0, 120) } } : base;
});
const { resultsOpen, reopen } = createCompendiumSearchSync({
  router: useRouter(),
  query: toRef(store, 'searchQuery'),
  getScroll: () => window.scrollY,
  setScroll: (top) => window.scrollTo({ top }),
});
const onDockFocus = () => { reopen(); };
</script>

<style scoped src="@/styles/prayers-list.css"></style>
<style scoped src="@/styles/compendium.css"></style>
<style scoped>
/* Reserve the fixed search dock below the footer instead of inside the list. */
.compendium-shell--idle :deep(.prayers-list-container.compendium-container),
.compendium-shell--idle :deep(.prayer-view-container.compendium-reader) {
  padding-bottom: 16px !important;
}
.compendium-shell :deep(.compendium-feedback) {
  margin-bottom: calc(104px + env(safe-area-inset-bottom, 0px));
}
</style>
