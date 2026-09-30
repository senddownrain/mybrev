<template>
  <div v-if="screen.node.leadCitations.length" class="compendium-node-lead compendium-answer">
    <blockquote v-for="(citation, index) in screen.node.leadCitations" :key="index" class="compendium-citation">{{ citation.text }}</blockquote>
  </div>
  <v-list v-if="screen.questions.length || screen.topics.length || screen.children.length" lines="two" bg-color="transparent" class="prayer-options-list" :aria-label="screen.node.title">
    <!-- Questions owned directly by this heading (printed before its first child heading). -->
    <v-list-item
      v-for="question in screen.questions"
      :key="question.id"
      :to="{ name: 'CompendiumQuestion', params: { number: question.number } }"
      class="prayer-list-item compendium-row"
    >
      <template #prepend><span class="prayer-list-item__icon-wrap compendium-number">{{ question.number }}</span></template>
      <v-list-item-title class="prayer-title-text">{{ question.question }}</v-list-item-title>
      <template #append><v-icon class="prayer-list-item__arrow" icon="mdi-chevron-right" size="24" /></template>
    </v-list-item>
    <!-- Named thematic headings of this node: shown by their title only;
         the question range is secondary metadata. -->
    <template v-for="topic in screen.topics" :key="topic.id">
      <div v-if="topic.parentTitle" class="compendium-parent-title">{{ topic.parentTitle }}</div>
      <v-list-item :to="nodeRoute(topic)" class="prayer-list-item">
        <v-list-item-title class="prayer-title-text">{{ topic.title }}</v-list-item-title>
        <div class="compendium-range">{{ questionRangeLabel(topic.firstQuestion, topic.lastQuestion) }}</div>
        <template #append><v-icon class="prayer-list-item__arrow" icon="mdi-chevron-right" size="24" /></template>
      </v-list-item>
    </template>
    <!-- Child structural screens: section rows of a part, subsection rows of a section. -->
    <v-list-item v-for="child in screen.children" :key="child.id" :to="nodeRoute(child)" class="prayer-list-item compendium-node-row">
      <div class="prayers-page-eyebrow compendium-level-label">{{ child.uiLabel }}</div>
      <v-list-item-title class="prayer-title-text">{{ child.title }}</v-list-item-title>
      <div class="compendium-range">{{ questionRangeLabel(child.firstQuestion, child.lastQuestion) }}</div>
      <template #append><v-icon class="prayer-list-item__arrow" icon="mdi-chevron-right" size="24" /></template>
    </v-list-item>
  </v-list>
</template>
<script setup>
import { nodeRoute, questionRangeLabel } from '@/utils/compendiumNavigation';
// `screen` comes from `buildNodeScreen`: only what this node owns directly.
defineProps({ screen: { type: Object, required: true } });
</script>
<style scoped src="@/styles/prayers-list.css"></style>
<style scoped src="@/styles/compendium.css"></style>
