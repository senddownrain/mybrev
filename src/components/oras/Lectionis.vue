<template>
    <v-container  class="prayer-content-area">
        <v-row lign="center"
      justify="center">
      <v-col md="6" lg="6" sm="8" v-if="!pending && day">
                <day-title :day-data="day" />
                <intro :title="title" />
                <hymnus :text="day.officeOfReadingsHymn" />
                <psalms :ant1="day.officeOfReadingsAnt1" :ant2="day.officeOfReadingsAnt2" :ant3="day.officeOfReadingsAnt3" :ps1="day.officeOfReadingsPs1"
                    :ps2="day.officeOfReadingsPs2" :ps3="day.officeOfReadingsPs3" />
                <resp :text="day.officeOfReadingsVers"/>
                <lectio :text="day.officeOfReadingsR1" />
                <lectio :text="day.officeOfReadingsR2" />   
                <last-prayer :text="day.officeOfReadingsPr" />
                <end-of-sext/>
            </v-col>
        </v-row>
    </v-container>
    <div>


    </div>
</template>
<script setup>

import { useResolvedLiturgicalDay } from '@/composables/useResolvedLiturgicalDay';
import Hymnus from '@/components/oraparts/Hymnus.vue';
import Intro from '@/components/oraparts/Intro.vue';
import Psalms from '@/components/oraparts/Psalms.vue';
import Reading from '@/components/oraparts/Reading.vue';
import Resp from '@/components/oraparts/Resp.vue';
import Inters from '@/components/oraparts/Inters.vue';
import Magnificat from '@/components/oraparts/Magnificat.vue';
import PaterNoster from '@/components/oraparts/PaterNoster.vue';
import LastPrayer from '@/components/oraparts/LastPrayer.vue';
import EndOfSext from '@/components/oraparts/EndOfSext.vue';
import DayTitle from '@/components/oraparts/DayTitle.vue';
import Lectio from '@/components/oraparts/Lectio.vue';

const { day, pending } = useResolvedLiturgicalDay();

const title = "ГАДЗІНА ЧЫТАННЯЎ"

</script>
