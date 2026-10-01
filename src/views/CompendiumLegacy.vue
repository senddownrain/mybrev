<template>
  <v-container class="prayers-list-container compendium-container">
    <v-progress-linear v-if="!store.ready && !store.error" indeterminate aria-label="Загрузка Кампендыя" />
    <v-alert v-else-if="!target" type="warning" class="mx-3">Спасылка не знойдзена. <router-link :to="{ name: 'Compendium' }">Да зместу</router-link></v-alert>
  </v-container>
</template>
<script setup>
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCompendiumStore } from '@/stores/compendium';
import { resolveLegacyNodeRoute, resolveLegacyTopicRoute } from '@/utils/compendiumNavigation';

const props = defineProps({ id: { type: String, required: true }, kind: { type: String, required: true } });
const store = useCompendiumStore();
const route = useRoute();
const router = useRouter();
const target = computed(() => store.index && (props.kind === 'node'
  ? resolveLegacyNodeRoute(store.index, props.id)
  : resolveLegacyTopicRoute(store.index, props.id)));
watch(target, (location) => {
  if (!location) return;
  const oldQuestion = /^#compendium-q-(\d+)$/.exec(route.hash);
  const question = oldQuestion ? store.getQuestion(oldQuestion[1]) : null;
  const group = props.kind === 'topic' ? store.getGroup(props.id) : null;
  const hash = question && question.partId === location.params.partId
    && (!group || group.questions.some((entry) => entry.number === question.number))
    ? `#${question.id}` : location.hash;
  router.replace({ ...location, hash, query: route.query });
}, { immediate: true });
store.init();
</script>
<style scoped src="@/styles/prayers-list.css"></style>
<style scoped src="@/styles/compendium.css"></style>
