<template>
    <v-container  class="prayer-content-area">
        <v-row lign="center"
      justify="center">
      <v-alert v-if="firstVespersUnavailable" type="warning" variant="tonal" role="status">
        Тэксты I Нешпараў недаступныя.
      </v-alert>
      <v-col class="liturgical-hour-column" v-else-if="!isLoading && vesperDay">
                <day-title :day-data="vesperDay" />
                <p v-if="participationNotice" class="ora-text" style="color:var(--rubric-color)">{{ participationNotice }}</p>
                <intro :title="vespersHeading" />

                <v-alert v-if="firstVespersWarning" type="warning" variant="tonal" class="mb-4" role="alert">{{ firstVespersWarning }}</v-alert>
                <hymnus :text="vesperDay.vesperHymn" :feast-name="vesperDay._feastName" />
                <psalms :ant1="vesperDay.vesperAnt1" :ant2="vesperDay.vesperAnt2" :ant3="vesperDay.vesperAnt3" :ps1="vesperDay.vesperPs1"
                    :ps2="vesperDay.vesperPs2" :ps3="vesperDay.vesperPs3" />
                <reading :text="vesperDay.vesperR" />
                <resp v-if="triduumVespersAntiphon" :text="triduumVespersAntiphon" />
                <magnificat :ant="vesperDay.vesperAntMag" />
                <inters :text="vesperDay.vesperInter" :rubric="intercessionsRubric" />
                <pater-noster />
                <last-prayer :text="vesperDay.vesperPr == '' ? vesperDay.laudesPr : vesperDay.vesperPr" full-conclusion />
                <end-of-vesper/>
            </v-col>
        </v-row>
    </v-container>
    <div>


    </div>
</template>
<script setup>

import { ordoCalendarEpoch } from '@/utils/ordoCalendarState';
import { effectiveOrdoDiocese } from '@/utils/ordoDiocese';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import moment from '@/utils/moment-be';
import { useResolvedLiturgicalDay } from '@/composables/useResolvedLiturgicalDay';
import { useLiturgicalContent } from '@/composables/useLiturgicalContent';
import { eveningVespersModel, needsTomorrowVespers, vespersHourTitle } from '@/utils/liturgicalVespers';
import { liturgicalText } from '@/utils/liturgicalSourceHtml';
import { logger } from '@/utils/logger';
import Hymnus from '@/components/oraparts/Hymnus.vue';
import Intro from '@/components/oraparts/Intro.vue';
import Psalms from '@/components/oraparts/Psalms.vue';
import Reading from '@/components/oraparts/Reading.vue';
import Inters from '@/components/oraparts/Inters.vue';
import Resp from '@/components/oraparts/Resp.vue';
import { triduumAntiphon, triduumVespersNotice, goodFridayIntercessionsRubric } from '@/utils/triduumCompline';
import Magnificat from '@/components/oraparts/Magnificat.vue';
import PaterNoster from '@/components/oraparts/PaterNoster.vue';
import LastPrayer from '@/components/oraparts/LastPrayer.vue';
import EndOfVesper from '@/components/oraparts/EndOfVesper.vue';
import DayTitle from '@/components/oraparts/DayTitle.vue';

const route = useRoute();
const { day, pending, periodDay } = useResolvedLiturgicalDay();
const { getLiturgicalContentForDate } = useLiturgicalContent();
const tomorrowContent = ref(null);
const checkingTomorrow = ref(false);
let requestVersion = 0;

const vesperDay = computed(() => tomorrowFirstVespers.value?.day || day.value);
const triduumVespersAntiphon = computed(() => (
  liturgicalText(vesperDay.value?.vesperR).includes('Хрыстус стаў дзеля нас паслухмяным')
    ? '' : triduumAntiphon(vesperDay.value)
));
const participationNotice = computed(() => {
  const notice = triduumVespersNotice(vesperDay.value);
  return liturgicalText(vesperDay.value?.vesperR).includes(notice) ? '' : notice;
});
const intercessionsRubric = computed(() => {
  const rubric = goodFridayIntercessionsRubric(vesperDay.value);
  return liturgicalText(vesperDay.value?.vesperInter).includes(rubric) ? '' : rubric;
});
const isLoading = computed(() => pending.value || checkingTomorrow.value);
const routeDate = computed(() => moment(String(route.params.day), ['YYYY-MM-DD', 'DD-MM-YYYY'], true));
// II Vespers vs I Vespers of tomorrow: the Ordo descriptor of the selected
// Office decides; without one, the legacy heuristics (and the explicit
// `firstVespersDayId` of a local card) still apply.
const eveningModel = computed(() => (
  String(route.params.id) === 'office-for-dead' ? { firstVespers: null, local: [], second: false }
    : eveningVespersModel(day.value, tomorrowContent.value, {
      isoWeekday: routeDate.value.isoWeekday(),
      requestedDayId: route.query.firstVespersDayId || '',
      periodDay: periodDay.value,
    })
));
const tomorrowFirstVespers = computed(() => eveningModel.value.firstVespers);
const firstVespersRequired = computed(() => day.value?._ordo?.vespers?.type === 'first'
  || Boolean(route.query.firstVespersDayId));
const shouldLoadTomorrow = computed(() => route.params.id !== 'office-for-dead' && needsTomorrowVespers(day.value));
const firstVespersUnavailable = computed(() => day.value && firstVespersRequired.value
  && !isLoading.value && !tomorrowFirstVespers.value);
const vespersHeading = computed(() => vespersHourTitle(eveningModel.value, true));
const firstVespersWarning = computed(() => (
  tomorrowFirstVespers.value?.day?._missingFirstVespersFields?.length
    ? 'Не ўсе тэксты I Нешпараў знойдзены ў псалтыры. Тэксты II Нешпараў не падстаўляюцца.'
    : ''
));
watch(
  [shouldLoadTomorrow, routeDate, ordoCalendarEpoch, effectiveOrdoDiocese,
    () => route.params.id, () => route.query.reference, () => route.query.view],
  async ([needed, date]) => {
    const version = ++requestVersion;
    tomorrowContent.value = null;
    checkingTomorrow.value = false;
    if (!needed || !date.isValid()) return;
    checkingTomorrow.value = true;
    const show = (content) => {
      if (version === requestVersion) {
        tomorrowContent.value = content;
        if (tomorrowFirstVespers.value) checkingTomorrow.value = false;
      }
    };
    try {
      show(await getLiturgicalContentForDate(date.clone().add(1, 'day').toDate(), undefined, { onCached: show, onUpdated: show }));
    } catch (error) {
      // The current day's Vespers remain usable if preloading tomorrow failed.
      logger.error('[Vesper] tomorrow first-Vespers lookup failed:', error);
    } finally {
      if (version === requestVersion) checkingTomorrow.value = false;
    }
  },
  { immediate: true },
);
</script>

