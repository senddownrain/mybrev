<template>
    <v-container  class="prayer-content-area">
        <v-row lign="center"
      justify="center">
      <v-col class="liturgical-hour-column" v-if="!isLoading && vesperDay">
                <day-title :day-data="vesperDay" />
                <intro title="НЕШПАРЫ" />
                <v-chip v-if="firstVespersTitle" class="mb-4" color="primary" prepend-icon="mdi-calendar-arrow-right" variant="tonal">
                    Першыя Нешпары: {{ firstVespersTitle }}
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
import { findTomorrowFirstVespers } from '@/utils/liturgicalVespers';
import { logger } from '@/utils/logger';
import Hymnus from '@/components/oraparts/Hymnus.vue';
import Intro from '@/components/oraparts/Intro.vue';
import Psalms from '@/components/oraparts/Psalms.vue';
import Reading from '@/components/oraparts/Reading.vue';
import Resp from '@/components/oraparts/Resp.vue';
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
const firstVespersTitle = computed(() => tomorrowFirstVespers.value?.title || '');
const isLoading = computed(() => pending.value || checkingTomorrow.value);

watch(
  () => route.params.day,
  async (routeDate) => {
    const version = ++requestVersion;
    tomorrowFirstVespers.value = null;
    const date = moment(String(routeDate), ['YYYY-MM-DD', 'DD-MM-YYYY'], true);
    if (!date.isValid()) return;
    checkingTomorrow.value = true;
    try {
      const content = await getLiturgicalContentForDate(date.clone().add(1, 'day').toDate());
      if (version === requestVersion) tomorrowFirstVespers.value = findTomorrowFirstVespers(content);
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
