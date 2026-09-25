<template>
  <v-container class="prayer-view-container compendium-reader">
    <div v-if="question" class="prayer-content-area">
      <article class="prayer-reading-surface">
        <header class="prayer-reading-header">
          <div class="prayer-reading-eyebrow">Пытанне {{ question.number }}</div>
          <h1 class="prayer-title">{{ question.question }}</h1>
          <nav class="compendium-trail" aria-label="Месца ў Кампендыі">
            <router-link :to="{ name: 'CompendiumPart', params: { partId: question.partId } }">{{ question.partLabel }}</router-link>
            <template v-for="label in trail" :key="label"> · {{ label }}</template>
          </nav>
        </header>
        <div class="prayer-text"><CompendiumAnswer :question="question" /></div>
        <nav class="compendium-pager" aria-label="Суседнія пытанні">
          <v-btn v-if="previous" variant="text" class="text-none" prepend-icon="mdi-chevron-left" :to="{ name: 'CompendiumQuestion', params: { number: previous.number } }">{{ previous.number }}</v-btn><span v-else />
          <v-btn variant="text" class="text-none" :to="{ name: 'CompendiumTopic', params: { topicId: question.groupId } }">Уся тэма</v-btn>
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
import { contextTrail } from '@/utils/compendiumData';
import CompendiumAnswer from '@/components/compendium/CompendiumAnswer.vue';
import CompendiumSource from '@/components/compendium/CompendiumSource.vue';
const props = defineProps({ number: { type: String, required: true } });
const store = useCompendiumStore();
const question = computed(() => (/^\d{1,3}$/.test(props.number) ? store.getQuestion(props.number) : null));
const trail = computed(() => (question.value ? contextTrail(store.index, question.value).slice(1) : []));
const previous = computed(() => (question.value ? store.getQuestion(question.value.number - 1) : null));
const next = computed(() => (question.value ? store.getQuestion(question.value.number + 1) : null));
store.init();
</script>
<style scoped src="@/styles/prayer-reading.css"></style>
<style scoped src="@/styles/compendium.css"></style>
<style scoped>
.compendium-trail a { color: inherit; }
</style>
