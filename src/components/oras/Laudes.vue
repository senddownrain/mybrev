<template>
    <v-container class="prayer-content-area">
        <v-row lign="center"
      justify="center">
            <v-col class="liturgical-hour-column" v-if="!pending && day">
                <day-title :day-data="day" />
                <intro title="ЮТРАНЬ" />
                <hymnus :text="day.laudesHymn" />
                <psalms :ant1="day.laudesAnt1" :ant2="day.laudesAnt2" :ant3="day.laudesAnt3" :ps1="day.laudesPs1"
                    :ps2="day.laudesPs2" :ps3="day.laudesPs3" />
                <reading :text="day.laudesR" />
                <benedictus :ant="day.laudesAntBen" />
                <inters :text="day.laudesInter" />
                <pater-noster />
                <last-prayer :text="day.laudesPr" />
                <end-of-vesper/>
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
import Benedictus from '@/components/oraparts/Benedictus.vue';
import PaterNoster from '@/components/oraparts/PaterNoster.vue';
import LastPrayer from '@/components/oraparts/LastPrayer.vue';
import EndOfVesper from '@/components/oraparts/EndOfVesper.vue';
import DayTitle from '@/components/oraparts/DayTitle.vue';

const { day, pending } = useResolvedLiturgicalDay();

</script>

