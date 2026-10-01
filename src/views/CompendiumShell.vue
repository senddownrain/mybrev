<template>
  <div class="compendium-shell">
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
    <!-- The only search dock of the Compendium: pages never mount their own. -->
    <CompendiumSearchDock @focus="onDockFocus" />
  </div>
</template>

<script setup>
import { toRef } from 'vue';
import { useRouter } from 'vue-router';
import { useCompendiumStore } from '@/stores/compendium';
import { COMPENDIUM_TITLE } from '@/constants/compendium';
import { createCompendiumSearchSync } from '@/utils/compendiumSearchRoute';
import CompendiumSearchDock from '@/components/compendium/CompendiumSearchDock.vue';
import CompendiumSearchResults from '@/components/compendium/CompendiumSearchResults.vue';

// Shared shell of every Compendium level: one persistent search dock and one
// global results layer. See `createCompendiumSearchSync` for the history rules.
const store = useCompendiumStore();
store.init();
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
