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
                <p v-if="triduumComplineNotice(selectedDay)" class="ora-text" style="color:var(--rubric-color)">{{ triduumComplineNotice(selectedDay) }}</p>
                <intro :title="title"    />
                <v-select
                    v-if="selectedDay?._ordo?.complineChoice"
                    v-model="formula"
                    :items="formulas"
                    label="Фармуляр Камплеты"
                    density="compact"
                    variant="outlined"
                    hide-details
                    class="mb-4"
                />
                <exam />
                <hymnus :text="day.compHymn" />
                <psalms :ant1="day.compAnt1" :ant2="day.compAnt2" :ant3="day.compAnt3" :ps1="day.compPs1" :ps2="day.compPs2"
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
import { applyComplineRubrics, triduumComplineNotice } from '@/utils/triduumCompline';
import { useResolvedLiturgicalDay } from '@/composables/useResolvedLiturgicalDay';
import { logger } from '@/utils/logger';
import { firestoreErrorMessage } from '@/utils/firestoreErrors.mjs';
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
const { getComplineFormulasForDate } = useCompletorium();

const { day: selectedDay, pending: selectedDayPending } = useResolvedLiturgicalDay({ forCompline: true });

const records = ref(null);
const day = computed(() => applyComplineRubrics(records.value?.[formula.value], selectedDay.value));
const loadingCompletorium = ref(false);
const error = ref('');
const pending = computed(() => selectedDayPending.value || loadingCompletorium.value);
const title = 'КАМПЛЕТА';
const formula = ref('second');
const formulas = [
  { title: 'Пасля II Нешпараў нядзелі', value: 'second' },
  { title: 'Пасля I Нешпараў нядзелі', value: 'first' },
];

watch(() => route.params.day, () => { formula.value = 'second'; }, { flush: 'sync' });

let loadSequence = 0;

watch(
  [() => route.params.day, selectedDay, selectedDayPending],
  async ([dateParam, currentDay, isDayPending]) => {
    const sequence = ++loadSequence;
    if (!dateParam || isDayPending) return;
    const currentDate = moment(String(dateParam), ['YYYY-MM-DD', 'DD-MM-YYYY'], true);
    records.value = null;
    loadingCompletorium.value = false;
    error.value = '';

    if (!currentDate.isValid()) {
      error.value = 'Няправільная дата для камплеты.';
      return;
    }

    loadingCompletorium.value = true;
    try {
      const result = await getComplineFormulasForDate(currentDate.toDate(), currentDay || null);
      if (sequence === loadSequence) records.value = result;
    } catch (loadError) {
      logger.error('[Completorium] Памылка загрузкі:', loadError);
      if (sequence === loadSequence) {
        error.value = firestoreErrorMessage(loadError);
      }
    } finally {
      if (sequence === loadSequence) loadingCompletorium.value = false;
    }
  },
  { immediate: true },
);

</script>
