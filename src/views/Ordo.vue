<template>
  <v-container class="ordo-page">
    <header class="ordo-page__header">
      <h1 class="section-page-title">Літургічны каляндар</h1>
      <div class="ordo-page__tools">
        <!-- Back to the Hours of the date being viewed (today on the month). -->
        <router-link :to="hoursRoute" class="hours-capsule" data-test="ordo-hours-shortcut" aria-label="Літургія гадзін гэтага дня">
          <PhSunHorizon :size="18" weight="bold" aria-hidden="true" />
          <span>Літургія</span>
        </router-link>
        <OrdoDioceseFilter />
      </div>
    </header>
    <!-- `/ordo` is one month; `/ordo/:date` the detail of a day. -->
    <OrdoDay v-if="route.params.date" />
    <OrdoMonth v-else />
  </v-container>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { PhSunHorizon } from '@phosphor-icons/vue';
import OrdoDay from '@/components/ordo/OrdoDay.vue';
import OrdoMonth from '@/components/ordo/OrdoMonth.vue';
import OrdoDioceseFilter from '@/components/ordo/OrdoDioceseFilter.vue';
import { ordoHoursRoute } from '@/utils/ordoScreen';
import { ordoDiocese } from '@/utils/ordoDiocese';
import { ordoDioceseFilter } from '@/utils/ordoMonthFilter';

const route = useRoute();
const hoursRoute = computed(() => ordoHoursRoute({
  date: route.params.date || '',
  filter: ordoDioceseFilter.value,
  userDiocese: ordoDiocese.value,
}));
</script>

<style scoped>
.ordo-page { width: min(100%, 760px); max-width: 760px; padding-top: 12px; }
.ordo-page__header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px 12px 18px; }
.ordo-page__tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.section-page-title { min-width: 0; margin: 0; color: rgb(var(--v-theme-on-surface)); font-size: clamp(1.6rem, 7vw, 2.35rem); font-family: var(--reader-display-font-family); font-weight: 700; line-height: 1.1; letter-spacing: -.025em; }
.hours-capsule {
  position: sticky; top: 10px; z-index: 3;
  display: inline-flex; align-items: center; gap: 6px; min-height: 38px; padding: 7px 14px;
  border: 1px solid rgba(var(--chrome-accent-rgb), .3); border-radius: 999px;
  background: var(--nav-surface); color: var(--chrome-accent); box-shadow: 0 4px 14px var(--nav-button-shadow);
  font-size: .84rem; font-weight: 760; text-decoration: none; white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
}
.hours-capsule:hover { background: rgba(var(--chrome-accent-rgb), .1); }
.hours-capsule:focus-visible { outline: 3px solid rgba(var(--chrome-accent-rgb), .3); outline-offset: 2px; }
@media (max-width: 600px) { .ordo-page { padding: 8px 4px !important; } }
@media (max-width: 420px) {
  .ordo-page__header { align-items: flex-start; flex-direction: column; }
  .ordo-page__tools { justify-content: flex-start; }
}
</style>
