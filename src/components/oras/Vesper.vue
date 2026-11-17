<template>
    <v-container  class="prayer-content-area">
        <v-row lign="center"
      justify="center">
      <v-col class="liturgical-hour-column" v-if="!isLoading && vesperDay">
                <day-title :day-data="vesperDay" />
                <intro title="НЕШПАРЫ" />
                <p v-if="triduumVespersNotice(vesperDay)" class="ora-text" style="color:var(--rubric-color)">{{ triduumVespersNotice(vesperDay) }}</p>
                <v-chip
                    v-if="vespersRubric"
                    class="mb-4 vespers-rubric-chip"
                    :class="`vespers-rubric-chip--${vespersRubric.kind}`"
                    :prepend-icon="vespersRubric.icon || undefined"
                    :style="vespersRubricStyle"
                    variant="tonal"
                >
                    <span class="vespers-rubric__line" aria-hidden="true"></span>
                    <span class="vespers-rubric__label" v-html="vespersRubric.labelHtml"></span>
                </v-chip>
                <v-alert v-if="firstVespersWarning" type="warning" variant="tonal" class="mb-4" role="alert">{{ firstVespersWarning }}</v-alert>
                <hymnus :text="vesperDay.vesperHymn" :feast-name="vesperDay._feastName" />
                <psalms :ant1="vesperDay.vesperAnt1" :ant2="vesperDay.vesperAnt2" :ant3="vesperDay.vesperAnt3" :ps1="vesperDay.vesperPs1"
                    :ps2="vesperDay.vesperPs2" :ps3="vesperDay.vesperPs3" />
                <reading :text="vesperDay.vesperR" />
                <resp v-if="triduumVespersAntiphon" :text="triduumVespersAntiphon" />
                <magnificat :ant="vesperDay.vesperAntMag" />
                <inters :text="vesperDay.vesperInter" :rubric="goodFridayIntercessionsRubric(vesperDay)" />
                <pater-noster />
                <last-prayer :text="vesperDay.vesperPr == '' ? vesperDay.laudesPr : vesperDay.vesperPr" />
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
import { eveningVespersModel } from '@/utils/liturgicalVespers';
import { logger } from '@/utils/logger';
import { getLiturgicalTheme, PLACE_LABEL_MAP } from '@/constants/liturgical';
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
  String(vesperDay.value?.vesperR || '').includes('Хрыстус стаў дзеля нас')
    ? '' : triduumAntiphon(vesperDay.value)
));
const isLoading = computed(() => pending.value || checkingTomorrow.value);
const vespersRubricStyle = computed(() => {
  const theme = getLiturgicalTheme(vesperDay.value, vesperDay.value?._periodType);
  return { '--vespers-rubric-color': theme.color, '--vespers-rubric-rgb': theme.rgb };
});
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
const firstVespersWarning = computed(() => (
  tomorrowFirstVespers.value?.day?._missingFirstVespersFields?.length
    ? 'Не ўсе тэксты I Нешпараў знойдзены ў псалтыры. Тэксты II Нешпараў не падстаўляюцца.'
    : ''
));
const firstVespersLabel = computed(() => {
  const source = tomorrowFirstVespers.value;
  if (!source) return '';
  const places = (source.places || []).map((place) => PLACE_LABEL_MAP[place] || place);
  return ['I Нешпары', source.title, ...places].filter(Boolean).join(' · ');
});
const vespersRubric = computed(() => {
  if (tomorrowFirstVespers.value) return {
    labelHtml: formatTitleHtml(firstVespersLabel.value),
    kind: 'first',
    icon: '',
  };
  if (eveningModel.value.second) return {
    labelHtml: 'II Нешпары',
    kind: 'second',
    icon: '',
  };
  return null;
});

// Назва свята надходзіць з даных: дазваляем толькі <br>, а іншыя тэгі экраніруем.
function formatTitleHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\?&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/\r?\n/g, '<br>');
}

watch(
  () => [route.params.day, ordoCalendarEpoch.value, effectiveOrdoDiocese.value],
  async ([routeDateParam]) => {
    const version = ++requestVersion;
    tomorrowContent.value = null;
    const date = moment(String(routeDateParam), ['YYYY-MM-DD', 'DD-MM-YYYY'], true);
    if (!date.isValid() || String(route.params.id) === 'office-for-dead') return;
    checkingTomorrow.value = true;
    try {
      const content = await getLiturgicalContentForDate(date.clone().add(1, 'day').toDate());
      if (version === requestVersion) tomorrowContent.value = content;
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

<style scoped>
.vespers-rubric-chip {
  width: fit-content;
  max-width: 100%;
  height: auto !important;
  min-height: 24px;
  padding-inline: 3px !important;
  white-space: normal;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: color-mix(in srgb, var(--vespers-rubric-color) 34%, var(--nav-muted)) !important;
  font-size: 0.72rem !important;
  font-weight: 750;
  letter-spacing: 0.035em;
}

.vespers-rubric-chip :deep(.v-chip__content) {
  display: flex;
  align-items: center;
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.35;
  white-space: normal;
}

.vespers-rubric__line {
  width: 18px;
  height: 1px;
  flex: 0 0 18px;
  margin-right: 8px;
  background: rgba(var(--vespers-rubric-rgb), 0.28);
}
</style>
