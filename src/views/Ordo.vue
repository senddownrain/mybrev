<template>
  <v-container class="ordo-page">
    <header class="ordo-page__header">
      <h1 class="section-page-title">Літургічны каляндар</h1>
      <div class="ordo-page__tools">
        <OrdoDioceseFilter />
      </div>
    </header>
    <!-- `/ordo` is one month; `/ordo/:date` the detail of a day. -->
    <OrdoDay v-if="route.params.date" />
    <OrdoMonth v-else />
    <FeedbackPrompt label="Заўважылі памылку ў календары?" />
  </v-container>
</template>

<script setup>
import { useRoute } from 'vue-router';
import OrdoDay from '@/components/ordo/OrdoDay.vue';
import OrdoMonth from '@/components/ordo/OrdoMonth.vue';
import OrdoDioceseFilter from '@/components/ordo/OrdoDioceseFilter.vue';
import FeedbackPrompt from '@/components/common/FeedbackPrompt.vue';

const route = useRoute();
</script>

<style scoped>
.ordo-page { width: min(100%, 760px); max-width: 760px; padding-top: 12px; }
.ordo-page__header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px 12px 18px; }
.ordo-page__tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.section-page-title { min-width: 0; margin: 0; color: rgb(var(--v-theme-on-surface)); font-size: clamp(1.6rem, 7vw, 2.35rem); font-family: var(--reader-display-font-family); font-weight: 700; line-height: 1.1; letter-spacing: -.025em; }
@media (max-width: 600px) { .ordo-page { padding: 8px 4px !important; } }
@media (max-width: 420px) {
  .ordo-page__header { align-items: flex-start; flex-direction: column; }
  .ordo-page__tools { justify-content: flex-start; }
}
</style>
