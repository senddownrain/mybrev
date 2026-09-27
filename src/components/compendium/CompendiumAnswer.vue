<template>
  <div class="compendium-answer">
    <p v-for="(paragraph, index) in paragraphs" :key="index">
      <template v-for="(run, runIndex) in paragraph" :key="runIndex">
        <em v-if="run.style === 'italic'">{{ run.text }}</em>
        <strong v-else-if="run.style === 'bold'">{{ run.text }}</strong>
        <template v-else>{{ run.text }}</template>
      </template>
    </p>
    <p v-if="question.cccRefs?.length" class="compendium-refs">ККК {{ formatCccRefs(question.cccRefs) }}</p>
    <blockquote v-for="(citation, index) in question.citations || []" :key="`c${index}`" class="compendium-citation">
      {{ citation.text }}
    </blockquote>
  </div>
</template>
<script setup>
import { computed } from 'vue';
import { answerParagraphs, formatCccRefs } from '@/utils/compendiumData';
const props = defineProps({ question: { type: Object, required: true } });
const paragraphs = computed(() => answerParagraphs(props.question));
</script>
<style scoped src="@/styles/compendium.css"></style>
