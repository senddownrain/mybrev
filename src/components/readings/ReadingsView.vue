<template>
  <v-container class="readings-container">
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
    loadForDate(moment(dateParam, 'YYYY-MM-DD').toDate());
  } else {
    loadForToday();
  }
}

onMounted(load);
watch(() => route.params.date || route.query.date, load);
</script>

<style scoped>
.readings-container {
  max-width: 100%;
}

.readings-content {
  width: 100%;
}
</style>
