<template>
    <v-container>
        <v-row lign="center"
      justify="center">
            <v-col md="6" lg="4" sm="12" v-if="!pending">
                <day-title :day="day.weekDay" :date="nowDate"/>
                <intro title="НЕШПАРЫ" />
                <hymnus :text="day.vesperHymn" />
                <psalms :ant1="day.vesperAnt1" :ant2="day.vesperAnt2" :ant3="day.vesperAnt3" :ps1="day.vesperPs1"
                    :ps2="day.vesperPs2" :ps3="day.vesperPs3" />
                <reading :text="day.vesperR" />
                <magnificat :ant="day.vesperAntMag" />
                <inters :text="day.vesperInter" />
                <pater-noster />
                <last-prayer :text="day.vesperPr" />
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
import Magnificat from '@/components/oraparts/Magnificat.vue';
import PaterNoster from '@/components/oraparts/PaterNoster.vue';
import LastPrayer from '@/components/oraparts/LastPrayer.vue';
import EndOfVesper from '@/components/oraparts/EndOfVesper.vue';
import DayTitle from '@/components/oraparts/DayTitle.vue';

const db = useFirestore()

//const days = useCollection(query(collection(db, 'days')))
//const notes = useCollection(query(collection(db, 'days'), orderBy('id')))

const route = useRoute()
const docRef = doc(db, "days", route.params.id);
var { data: day, pending } = useDocument(docRef)

const nowDate = moment(Date.now()).format('LL')

</script>