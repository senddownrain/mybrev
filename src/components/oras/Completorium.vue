<template>
    <v-container class="prayer-content-area">
      <v-row align="center" justify="center">
        <v-col v-if="pending" class="liturgical-hour-column text-center py-12">
          <v-progress-circular indeterminate color="primary" />
        </v-col>
        <v-col v-else-if="error" class="liturgical-hour-column">
          <v-alert type="error" variant="tonal">{{ error }}</v-alert>
        </v-col>
        <v-col v-else-if="day" class="liturgical-hour-column">
                <day-title :day-data="selectedDay" />
                <intro :title="title"    />
                <exam />
                <hymnus :text="day.compHymn" />
                <psalms :ant1="day.compAnt1" :ant2="day.compAnt2" :ant3="day.compAnt3" :ps1="day.compPs1"
                   />
                <reading :text="day.compR" />
                <resp :text="day.compResp" />
                <nunc :ant="day.compAntS" />
                <last-prayer :text="day.compPr" />
                <end-of-compline :ant="day.compAntM" />
        </v-col>
        </v-row>
    </v-container>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import moment from '@/utils/moment-be';
import { useRoute } from 'vue-router';
import { useCompletorium } from '@/composables/useCompletorium';
import { useResolvedLiturgicalDay } from '@/composables/useResolvedLiturgicalDay';
import { logger } from '@/utils/logger';
import Hymnus from '@/components/oraparts/Hymnus.vue';
import Intro from '@/components/oraparts/Intro.vue';
import Psalms from '@/components/oraparts/Psalms.vue';
import Reading from '@/components/oraparts/Reading.vue';
import Resp from '@/components/oraparts/Resp.vue';
import Nunc from '@/components/oraparts/Nunc.vue';
import LastPrayer from '@/components/oraparts/LastPrayer.vue';
import EndOfCompline from '@/components/oraparts/EndOfCompline.vue';
import Exam from '@/components/oraparts/Exam.vue';
import DayTitle from '@/components/oraparts/DayTitle.vue';

const route = useRoute();
const { getCompletoriumForDate } = useCompletorium();

const { day: selectedDay, pending: selectedDayPending } = useResolvedLiturgicalDay();

const day = ref(null);
const loadingCompletorium = ref(false);
const error = ref('');
const pending = computed(() => selectedDayPending.value || loadingCompletorium.value);
const title = 'КАМПЛЕТА';

let loadSequence = 0;

watch(
  [() => route.params.day, selectedDay, selectedDayPending],
  async ([dateParam, currentDay, isDayPending]) => {
    if (!dateParam || isDayPending) return;

    const sequence = ++loadSequence;
    const currentDate = moment(String(dateParam), ['YYYY-MM-DD', 'DD-MM-YYYY'], true);
    day.value = null;
    error.value = '';

    if (!currentDate.isValid()) {
      error.value = 'Няправільная дата для камплеты.';
      return;
    }

    loadingCompletorium.value = true;
    try {
      const result = await getCompletoriumForDate(currentDate.toDate(), currentDay || null);
      if (sequence === loadSequence) day.value = result;
    } catch (loadError) {
      logger.error('[Completorium] Памылка загрузкі:', loadError);
      if (sequence === loadSequence) {
        error.value = loadError?.message || 'Не атрымалася загрузіць камплету.';
      }
    } finally {
      if (sequence === loadSequence) loadingCompletorium.value = false;
    }
  },
  { immediate: true },
);

</script>
