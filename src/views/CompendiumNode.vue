<template>
  <v-container class="prayers-list-container compendium-container">
    <template v-if="screen && !legacyRoute">
      <!-- One screen per real structural node (part, section or subsection);
           the level label comes from compendiumLabels.js. -->
      <header class="prayers-page-header">
        <nav v-if="screen.ancestors.length" class="compendium-crumbs" aria-label="Месца ў Кампендыі">
          <template v-for="(ancestor, index) in screen.ancestors" :key="ancestor.id"><template v-if="index"> · </template><router-link :to="nodeRoute(ancestor)">{{ ancestor.kind === 'part' ? ancestor.uiLabel : ancestor.title }}</router-link></template>
        </nav>
        <div class="prayers-page-eyebrow">{{ screen.node.uiLabel }}</div>
        <h1 class="prayers-page-title" :class="{ 'compendium-node-title': screen.node.kind !== 'part' }">{{ screen.node.title }}</h1>
        <div v-if="screen.node.kind !== 'part'" class="compendium-range compendium-node-range">{{ questionRangeLabel(screen.node.firstQuestion, screen.node.lastQuestion) }}</div>
      </header>
      <CompendiumNodeList :screen="screen" />
      <div class="compendium-source-note"><CompendiumSource /></div>
    </template>
    <v-progress-linear v-else-if="legacyRoute || (!store.ready && !store.error)" indeterminate aria-label="Загрузка Кампендыя" />
    <v-alert v-else type="warning" class="mx-3">Раздзел не знойдзены. <router-link :to="{ name: 'Compendium' }">Да зместу</router-link></v-alert>
  </v-container>
</template>
<script setup>
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCompendiumStore } from '@/stores/compendium';
import { buildNodeScreen, nodeRoute, questionRangeLabel, resolveLegacyPartHash } from '@/utils/compendiumNavigation';
import CompendiumNodeList from '@/components/compendium/CompendiumNodeList.vue';
import CompendiumSource from '@/components/compendium/CompendiumSource.vue';
import { useCompendiumScroll } from '@/composables/useCompendiumScroll';
// `nodeId` is a part (`p1`), section (`p1-s1`) or chapter/subsection (`p1-s1-ch1`) id.
const props = defineProps({ nodeId: { type: String, required: true } });
const store = useCompendiumStore();
const route = useRoute();
const router = useRouter();
const screen = computed(() => (store.index ? buildNodeScreen(store.index, props.nodeId) : null));
// Old part anchors (`/compendium/part/p1#p1-s1-ch1`) open that heading's own screen.
const legacyRoute = computed(() => (store.index && route.name === 'CompendiumPart' && route.hash
  ? resolveLegacyPartHash(store.index, props.nodeId, route.hash)
  : null));
watch(legacyRoute, (location) => { if (location) router.replace(location); }, { immediate: true });
store.init();
useCompendiumScroll();
</script>
<style scoped src="@/styles/prayers-list.css"></style>
<style scoped src="@/styles/compendium.css"></style>
<style scoped>
.compendium-source-note :deep(.prayer-source) { margin: 0; padding: 0; }
</style>
