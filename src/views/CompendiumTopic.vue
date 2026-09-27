<template>
  <v-container class="prayer-view-container compendium-reader">
    <div v-if="group" class="prayer-content-area">
      <article class="prayer-reading-surface">
        <header class="prayer-reading-header">
          <div class="prayer-reading-eyebrow">{{ eyebrow }}</div>
          <div v-if="group.parentTitle" class="compendium-trail">{{ group.parentTitle }}</div>
          <h1 class="prayer-title">{{ title }}</h1>
          <div class="compendium-trail">{{ rangeLabel }}</div>
        </header>
        <div v-if="group.leadCitations.length" class="compendium-lead compendium-answer">
          <blockquote v-for="(citation, index) in group.leadCitations" :key="index" class="compendium-citation">{{ citation.text }}</blockquote>
        </div>
        <div class="compendium-questions">
          <template v-for="question in group.questions" :key="question.id">
            <h2 v-if="subtopicStarts.has(question.number)" class="compendium-subtopic">{{ question.subtopicTitle }}</h2>
            <section class="compendium-question" :class="{ 'compendium-question--open': store.isExpanded(group.id, question.number) }">
              <button
                :id="`compendium-q-${question.number}`"
                type="button"
                class="compendium-question__toggle"
                :aria-expanded="store.isExpanded(group.id, question.number)"
                :aria-controls="`compendium-a-${question.number}`"
                @click="store.toggleExpanded(group.id, question.number)"
              >
                <span class="compendium-question__number">{{ question.number }}</span>
                <span class="compendium-question__text">{{ question.question }}</span>
                <PhCaretDown :size="18" class="compendium-question__caret" aria-hidden="true" />
              </button>
              <div v-if="store.isExpanded(group.id, question.number)" :id="`compendium-a-${question.number}`" class="compendium-question__body prayer-text compendium-answer-text">
                <CompendiumAnswer :question="question" />
                <router-link class="compendium-question__link" :to="{ name: 'CompendiumQuestion', params: { number: question.number } }">Адкрыць пытанне {{ question.number }}</router-link>
              </div>
            </section>
          </template>
        </div>
        <nav class="compendium-pager" aria-label="Суседнія тэмы">
          <v-btn v-if="previous" variant="text" class="text-none" prepend-icon="mdi-chevron-left" :to="{ name: 'CompendiumTopic', params: { topicId: previous.id } }">{{ previous.firstQuestion }}–{{ previous.lastQuestion }}</v-btn><span v-else />
          <v-btn v-if="next" variant="text" class="text-none" append-icon="mdi-chevron-right" :to="{ name: 'CompendiumTopic', params: { topicId: next.id } }">{{ next.firstQuestion }}–{{ next.lastQuestion }}</v-btn>
        </nav>
        <CompendiumSource />
      </article>
    </div>
    <v-progress-linear v-else-if="!store.ready && !store.error" indeterminate aria-label="Загрузка Кампендыя" />
    <v-alert v-else type="warning">Тэма не знойдзена. <router-link :to="{ name: 'Compendium' }">Да зместу</router-link></v-alert>
  </v-container>
</template>
<script setup>
import { computed } from 'vue';
import { PhCaretDown } from '@phosphor-icons/vue';
import { useCompendiumStore } from '@/stores/compendium';
import CompendiumAnswer from '@/components/compendium/CompendiumAnswer.vue';
import CompendiumSource from '@/components/compendium/CompendiumSource.vue';
import { useCompendiumScroll } from '@/composables/useCompendiumScroll';
const props = defineProps({ topicId: { type: String, required: true } });
const store = useCompendiumStore();
const group = computed(() => store.getGroup(props.topicId));
const unit = computed(() => group.value?.unit);
const eyebrow = computed(() => [unit.value?.partLabel, group.value?.kind === 'topic' ? unit.value?.chapterTitle || unit.value?.sectionTitle : unit.value?.sectionTitle].filter(Boolean).join(' · '));
const title = computed(() => (group.value?.kind === 'topic' ? group.value.title : unit.value?.chapterTitle || unit.value?.sectionTitle));
const rangeLabel = computed(() => (group.value.firstQuestion === group.value.lastQuestion ? `Пытанне ${group.value.firstQuestion}` : `Пытанні ${group.value.firstQuestion}–${group.value.lastQuestion}`));
const subtopicStarts = computed(() => new Set((group.value?.questions || [])
  .filter((question, index, list) => question.subtopicTitle && question.subtopicTitle !== list[index - 1]?.subtopicTitle)
  .map((question) => question.number)));
const position = computed(() => store.index?.groupOrder.indexOf(props.topicId) ?? -1);
const previous = computed(() => (position.value > 0 ? store.getGroup(store.index.groupOrder[position.value - 1]) : null));
const next = computed(() => (position.value >= 0 ? store.getGroup(store.index.groupOrder[position.value + 1]) : null));
store.init();
useCompendiumScroll();
</script>
<style scoped src="@/styles/prayer-reading.css"></style>
<style scoped src="@/styles/compendium.css"></style>
<style scoped>
.compendium-answer-text { padding-top: 0; padding-bottom: 18px; }
</style>
