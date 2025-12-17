<template>
    <v-container class="prayer-content-area">
        <v-row lign="center"
      justify="center">
            <v-col md="6" lg="6" sm="8" v-if="!pending">
                <day-title :date="nowDate" :psalms="day._psalmWeek" :feastType="day._feastType" :feastComment="day.feastComment" :dayName="day._feastName ? day._feastName : day._dayName"/>
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

import { ref } from 'vue'
import moment from 'moment';
import 'moment/dist/locale/be';

import { useRoute } from 'vue-router'
import { useCollection, useFirestore, useDocument } from 'vuefire'
import { collection, orderBy, query, doc, updateDoc } from 'firebase/firestore'
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

const db = useFirestore()

const route = useRoute()
const docRef = doc(db, "days", route.params.id);
var { data: day, pending } = useDocument(docRef)

let [d, m, y] = route.params.day.split('-').map(Number);
const originDate = new Date(y, m - 1, d) 
const nowDate = `${moment(originDate).format('dddd')}, ${moment(originDate).format('LL')} `

</script>

