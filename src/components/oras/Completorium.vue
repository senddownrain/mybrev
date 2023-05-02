<template>
    <v-container>
        <v-row>
            <v-col cols="12" v-if="!pending">
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

const nowDate = moment(Date.now()).format('LL')
const title = "КАМПЛЕТА"

</script>