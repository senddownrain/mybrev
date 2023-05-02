<template>
    <v-container>
        <v-row>
            <v-col cols="12" v-if="!pending">
<intro title="НЕШПАРЫ"/>
                <hymnus :text="day.vesperHymn" :pending="pending"/>

                    <p class="text-h4" ma-5>
                        {{ day.weekDay }} - {{ nowDate }}
                    </p>
                    <div v-html="day.vesperHymn"></div>
                    <br>
                    <div>
                        {{ day.vesperHymn }}
                    </div>

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
import Hymnus from './Hymnus.vue';
import Intro from './Intro.vue';

const db = useFirestore()

//const days = useCollection(query(collection(db, 'days')))
//const notes = useCollection(query(collection(db, 'days'), orderBy('id')))

const route = useRoute()
const docRef = doc(db, "days", route.params.id);
var { data: day, pending } = useDocument(docRef)

const nowDate = moment(Date.now()).format('LL') 

</script>