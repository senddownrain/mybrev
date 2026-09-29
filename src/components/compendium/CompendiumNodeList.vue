<template>
  <div v-if="node.leadCitations.length" class="compendium-node-lead compendium-answer">
    <blockquote v-for="(citation, index) in node.leadCitations" :key="index" class="compendium-citation">{{ citation.text }}</blockquote>
  </div>
  <v-list v-if="node.directQuestions.length || node.topics.length" lines="two" bg-color="transparent" class="prayer-options-list">
    <!-- Questions printed directly under this heading, before its first child heading. -->
    <v-list-item
      v-for="question in node.directQuestions"
      :key="question.id"
      :to="{ name: 'CompendiumQuestion', params: { number: question.number } }"
      class="prayer-list-item compendium-row"
    >
      <template #prepend><span class="prayer-list-item__icon-wrap compendium-number">{{ question.number }}</span></template>
      <v-list-item-title class="prayer-title-text">{{ question.question }}</v-list-item-title>
      <template #append><v-icon class="prayer-list-item__arrow" icon="mdi-chevron-right" size="24" /></template>
    </v-list-item>
    <!-- Named thematic headings; the question range is only secondary metadata. -->
    <template v-for="topic in node.topics" :key="topic.id">
      <div v-if="topic.parentTitle" class="compendium-parent-title">{{ topic.parentTitle }}</div>
      <v-list-item :to="{ name: 'CompendiumTopic', params: { topicId: topic.id } }" class="prayer-list-item">
        <v-list-item-title class="prayer-title-text">{{ topic.title }}</v-list-item-title>
        <div class="compendium-range">{{ questionRangeLabel(topic.firstQuestion, topic.lastQuestion) }}</div>
        <template #append><v-icon class="prayer-list-item__arrow" icon="mdi-chevron-right" size="24" /></template>
      </v-list-item>
    </template>
  </v-list>
</template>
<script setup>
import { questionRangeLabel } from '@/utils/compendiumNavigation';
defineProps({ node: { type: Object, required: true } });
</script>
<style scoped src="@/styles/prayers-list.css"></style>
<style scoped src="@/styles/compendium.css"></style>
