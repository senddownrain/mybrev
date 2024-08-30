<template>
    <v-container>
        <v-row lign="center"
      justify="center">
      <v-col md="6" lg="6" sm="8" v-if="!pending">
                <day-title :day="day.weekDay" :date="nowDate"/>
                <intro :title="title" />
                <hymnus :text="day.officeOfReadingsHymn" />
                <psalms :ant1="day.officeOfReadingsAnt1" :ant2="day.officeOfReadingsAnt2" :ant3="day.officeOfReadingsAnt3" :ps1="day.officeOfReadingsPs1"
                    :ps2="day.officeOfReadingsPs2" :ps3="day.officeOfReadingsPs3" />
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
import EndOfSext from '@/components/oraparts/EndOfSext.vue';
import DayTitle from '@/components/oraparts/DayTitle.vue';
import Lectio from '@/components/oraparts/Lectio.vue';

const db = useFirestore()

//const days = useCollection(query(collection(db, 'days')))
//const notes = useCollection(query(collection(db, 'days'), orderBy('id')))

const route = useRoute()
const docRef = doc(db, "days", route.params.id);
var { data: day, pending } = useDocument(docRef)

let [d, m, y] = route.params.day.split('-').map(Number);
const originDate = new Date(y, m - 1, d) 
const nowDate = `${moment(originDate).format('dddd')}, ${moment(originDate).format('LL')} `

const title = "ГАДЗІНА ЧЫТАННЯЎ"

</script>