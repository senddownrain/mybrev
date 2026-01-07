<template>
    <v-container  class="prayer-content-area">
        <v-row lign="center"
      justify="center">
      <v-col md="6" lg="6" sm="8" v-if="!pending">
                <day-title :day="day.weekDay" :date="nowDate"/>
                <intro :title="title"    />
                <exam />
                <hymnus :text="day.compHymn" />
                <psalms :ant1="day.compAnt1" :ant2="day.compAnt2" :ant3="day.compAnt3" :ps1="day.compPs1"
                   />
                <reading :text="day.compR" />
                <resp :text="day.compResp" />
                <nunc :ant="day.compAntS" />
                <last-prayer :text="day.compPr" />
                <end-of-compline :ant="day.compAntM" />
            </v-col>
        </v-row>
    </v-container>
    <div>


    </div>
</template>
<script setup>

import { ref } from 'vue'
import moment from '@/utils/moment-be';

import { useRoute } from 'vue-router'
import { useCollection, useFirestore, useDocument } from 'vuefire'
import { collection, orderBy, query, doc, updateDoc } from 'firebase/firestore'
import Hymnus from '@/components/oraparts/Hymnus.vue';
import Intro from '@/components/oraparts/Intro.vue';
import Psalms from '@/components/oraparts/Psalms.vue';
import Reading from '@/components/oraparts/Reading.vue';
import Resp from '@/components/oraparts/Resp.vue';
import Nunc from '@/components/oraparts/Nunc.vue';
import LastPrayer from '@/components/oraparts/LastPrayer.vue';
import EndOfCompline from '@/components/oraparts/EndOfCompline.vue';
import Exam from '@/components/oraparts/Exam.vue';
import DayTitle from '@/components/oraparts/DayTitle.vue';

const db = useFirestore()

//const days = useCollection(query(collection(db, 'days')))
//const notes = useCollection(query(collection(db, 'days'), orderBy('id')))

const route = useRoute()
const docRef = doc(db, "days", route.params.id);
var { data: day, pending } = useDocument(docRef)

let [d, m, y] = route.params.day.split('-').map(Number);
const originDate = new Date(y, m - 1, d) 
const nowDate = `${moment(originDate).format('dddd')}, ${moment(originDate).format('LL')} `
const title = "КАМПЛЕТА"

</script>