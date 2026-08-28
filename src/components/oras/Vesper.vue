<template>
    <v-container  class="prayer-content-area">
        <v-row lign="center"
      justify="center">
      <v-col class="liturgical-hour-column" v-if="!isLoading && vesperDay">
                <day-title :day-data="vesperDay" />
                <intro title="НЕШПАРЫ" />
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
                <hymnus :text="vesperDay.vesperHymn" />
                <psalms :ant1="vesperDay.vesperAnt1" :ant2="vesperDay.vesperAnt2" :ant3="vesperDay.vesperAnt3" :ps1="vesperDay.vesperPs1"
                    :ps2="vesperDay.vesperPs2" :ps3="vesperDay.vesperPs3" />
                <reading :text="vesperDay.vesperR" />
                <magnificat :ant="vesperDay.vesperAntMag" />
                <inters :text="vesperDay.vesperInter" />
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

import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import moment from '@/utils/moment-be';
import { useResolvedLiturgicalDay } from '@/composables/useResolvedLiturgicalDay';
import { useLiturgicalContent } from '@/composables/useLiturgicalContent';
import {
  findTomorrowRegularVespers,
  getTomorrowFirstVespersOptions,
  isLocalFirstVespers,
  isSolemnity,
} from '@/utils/liturgicalVespers';
import { logger } from '@/utils/logger';
import { getLiturgicalPeriodTheme, PLACE_LABEL_MAP } from '@/constants/liturgical';
import Hymnus from '@/components/oraparts/Hymnus.vue';
import Intro from '@/components/oraparts/Intro.vue';
import Psalms from '@/components/oraparts/Psalms.vue';
import Reading from '@/components/oraparts/Reading.vue';
import Inters from '@/components/oraparts/Inters.vue';
import Magnificat from '@/components/oraparts/Magnificat.vue';
import PaterNoster from '@/components/oraparts/PaterNoster.vue';
import LastPrayer from '@/components/oraparts/LastPrayer.vue';
import EndOfVesper from '@/components/oraparts/EndOfVesper.vue';
import DayTitle from '@/components/oraparts/DayTitle.vue';

const route = useRoute();
const { day, pending } = useResolvedLiturgicalDay();
const { getLiturgicalContentForDate } = useLiturgicalContent();
const tomorrowFirstVespers = ref(null);
const checkingTomorrow = ref(false);
let requestVersion = 0;

const vesperDay = computed(() => tomorrowFirstVespers.value?.day || day.value);
const isLoading = computed(() => pending.value || checkingTomorrow.value);
const vespersRubricStyle = computed(() => {
  const theme = getLiturgicalPeriodTheme(vesperDay.value, vesperDay.value?._periodType);
  return { '--vespers-rubric-color': theme.color, '--vespers-rubric-rgb': theme.rgb };
});
const routeDate = computed(() => moment(String(route.params.day), ['YYYY-MM-DD', 'DD-MM-YYYY'], true));
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
  if (routeDate.value.isoWeekday() === 7 || isSolemnity(day.value)) return {
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
  [() => route.params.day, () => route.query.firstVespersDayId],
  async ([routeDate, requestedDayId]) => {
    const version = ++requestVersion;
    tomorrowFirstVespers.value = null;
    const date = moment(String(routeDate), ['YYYY-MM-DD', 'DD-MM-YYYY'], true);
    if (!date.isValid()) return;
    checkingTomorrow.value = true;
    try {
      const content = await getLiturgicalContentForDate(date.clone().add(1, 'day').toDate());
      if (version !== requestVersion) return;
      const firstVespersOptions = getTomorrowFirstVespersOptions(content);
      const requested = requestedDayId
        ? firstVespersOptions.find((item) => item.sourceDayId === String(requestedDayId))
        : null;
      // Local diocesan celebrations are opt-in from their separate ora card.
      // Only a universal feast/solemnity may replace today's Vespers automatically.
      const universal = firstVespersOptions.find((item) => !isLocalFirstVespers(item));
      tomorrowFirstVespers.value = requested || universal
        || (date.isoWeekday() === 6 ? findTomorrowRegularVespers(content) : null);
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
