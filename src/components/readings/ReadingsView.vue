<template>
  <v-container class="readings-container">
    <h1 class="section-page-title">Чытанні</h1>
    <div v-if="isLoading" class="text-center py-8">
      <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
      <p class="mt-4 text-grey">Загрузка чытанняў...</p>
    </div>

    <v-alert v-else-if="error" type="error" class="mb-4">
      <div class="text-h6">Памылка загрузкі чытанняў</div>
      <p>{{ error.message || error }}</p>
      <v-btn
        variant="tonal"
        color="white"
        class="mt-2"
        prepend-icon="mdi-refresh"
        @click="load"
      >
        Паўтарыць
      </v-btn>
    </v-alert>

    <div v-else-if="hasReadings" class="readings-content">
      <ParsedReadingCard
        v-for="reading in items"
        :key="reading.id"
        :reading="reading"
        class="mb-6"
      />
    </div>

    <div v-else class="text-center py-16">
      <v-icon size="64" color="grey-lighten-1">mdi-book-open-variant-outline</v-icon>
      <p class="text-h6 mt-4 text-grey">Чытанні для гэтага дня не знойдзены</p>
      <p class="text-caption mt-2 text-grey-darken-1">
        Магчыма, яны яшчэ не дададзены ў базу даных
      </p>
    </div>
  </v-container>
</template>

<script setup>
import { onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useParsedReadings } from '@/composables/useParsedReadings';
import ParsedReadingCard from '@/components/readings/ParsedReadingCard.vue';
import moment from '@/utils/moment-be';

const route = useRoute();
const { items, isLoading, error, hasReadings, loadForDate, loadForToday } = useParsedReadings();

function load() {
  const dateParam = route.params.date || route.query.date;
  if (dateParam) {
    loadForDate(moment(dateParam, 'YYYY-MM-DD').toDate(), { dayId: route.query.dayId || '' });
  } else {
    loadForToday();
  }
}

onMounted(load);
watch(() => [route.params.date || route.query.date, route.query.dayId], load);
</script>

<style scoped>
.readings-container {
  max-width: 100%;
}

.section-page-title {
  margin: 8px 12px 22px;
  color: rgb(var(--v-theme-on-surface));
  font-size: clamp(1.85rem, 8vw, 2.35rem);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.025em;
}

.readings-content {
  width: 100%;
}
</style>
