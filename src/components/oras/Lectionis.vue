<template>
    <v-container  class="prayer-content-area">
        <v-row lign="center"
      justify="center">
      <v-col class="liturgical-hour-column" v-if="!pending && day">
                <day-title :day-data="day" />
                <intro :title="title" />
                <hymnus :text="day.officeOfReadingsHymn" :feast-name="day._feastName" />
                <psalms :ant1="day.officeOfReadingsAnt1" :ant2="day.officeOfReadingsAnt2" :ant3="day.officeOfReadingsAnt3" :ps1="day.officeOfReadingsPs1"
                    :ps2="day.officeOfReadingsPs2" :ps3="day.officeOfReadingsPs3" />
                <resp :text="day.officeOfReadingsVers"/>
                <lectio title="Першае чытанне" :text="day.officeOfReadingsR1" />
                <lectio title="Другое чытанне" :text="day.officeOfReadingsR2" />
                <te-deum v-if="showTeDeum" />
                <last-prayer :text="day.officeOfReadingsPr" />
                <end-of-sext/>
            </v-col>
        </v-row>
    </v-container>
    <div>


    </div>
</template>
<script setup>

import { computed } from 'vue';
import { useResolvedLiturgicalDay } from '@/composables/useResolvedLiturgicalDay';
import Hymnus from '@/components/oraparts/Hymnus.vue';
import Intro from '@/components/oraparts/Intro.vue';
import Psalms from '@/components/oraparts/Psalms.vue';
import Resp from '@/components/oraparts/Resp.vue';
import LastPrayer from '@/components/oraparts/LastPrayer.vue';
import EndOfSext from '@/components/oraparts/EndOfSext.vue';
import DayTitle from '@/components/oraparts/DayTitle.vue';
import Lectio from '@/components/oraparts/Lectio.vue';
import TeDeum from '@/components/oraparts/TeDeum.vue';
import { shouldShowTeDeum } from '@/utils/liturgicalOffice';

const { day, pending } = useResolvedLiturgicalDay();
const showTeDeum = computed(() => shouldShowTeDeum(day.value));

const title = "ГАДЗІНА ЧЫТАННЯЎ"

</script>
