<template>
    <v-container  class="prayer-content-area">
        <v-row lign="center"
      justify="center">
      <v-col md="6" lg="6" sm="8" v-if="!pending && day">
                <day-title :day-data="day" />
                <intro :title="name" />
                <hymnus :text="daytimeField('Hymn')" />
                <psalms :ant1="daytimeField('Ant1')" :ant2="daytimeField('Ant2')" :ant3="daytimeField('Ant3')"
                    :ps1="daytimeField('Ps1')" :ps2="daytimeField('Ps2')" :ps3="daytimeField('Ps3')" />
                <reading :text="daytimeField('R')" />
                <last-prayer :text="daytimeField('Pr')" />
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
import LastPrayer from '@/components/oraparts/LastPrayer.vue';
import EndOfSext from '@/components/oraparts/EndOfSext.vue';
import DayTitle from '@/components/oraparts/DayTitle.vue';
import { getDaytimeHourField } from '@/utils/liturgicalDayResolution';

const { day, pending } = useResolvedLiturgicalDay();

const name = "МАЛІТВА ПЕРАД ПОЎДНЕМ"
const num = 1 // нумар палудневай малітвы
const daytimeField = (suffix) => getDaytimeHourField(day.value, num, suffix);

</script>
