<template>
    <v-container  class="prayer-content-area">
        <v-row lign="center"
      justify="center">
      <v-col md="6" lg="6" sm="8" v-if="!pending">
                <day-title :day="day.weekDay" :date="nowDate" :feastComment="day.feastComment"/>
                <intro :title="name" />
                <hymnus :text="day[`sext${num}Hymn`]" />
                <psalms :ant1="day[`sext${num}Ant1`]" :ant2="day[`sext${num}Ant2`]" :ant3="day[`sext${num}Ant3`]" 
                :ps1="day[`sext${num}Ps1`]"
                    :ps2="day[`sext${num}Ps2`]" :ps3="day[`sext${num}Ps3`]" />
                <reading :text="day[`sext${num}R`]" />
                <last-prayer :text="day[`sext${num}Pr`]" />
                <end-of-sext/>
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
import LastPrayer from '@/components/oraparts/LastPrayer.vue';
import EndOfSext from '@/components/oraparts/EndOfSext.vue';
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

const name = "МАЛІТВА ПАСЛЯ ПОЎДНЯ"
const num = 3 // нумар палудневай малітвы

</script>