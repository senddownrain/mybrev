<template>
    <v-container fluid>
        <v-row dense>
            <v-col cols="12" v-if="!pending">
                <div class="text-h6"> <span v-html="day._dayName == '' ? day._feastName : day._dayName"></span> - {{ day._weekDay }}</div>

                <v-list>
                    <v-list-item v-for="(item, i) in oras" :key="i" :value="item" active-color="primary" :to="item.to">
                        <v-list-item-title>
                            {{ item.title }}
                        </v-list-item-title>

                        <template v-slot:append>
                            <v-icon>mdi-chevron-right</v-icon>
                        </template>
                    </v-list-item>
                </v-list>


            </v-col>

        </v-row></v-container>
</template>

<script setup>

import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useCollection, useFirestore, useDocument } from 'vuefire'
import { collection, orderBy, query, doc, updateDoc } from 'firebase/firestore'

const db = useFirestore()

//const days = useCollection(query(collection(db, 'days')))
//const notes = useCollection(query(collection(db, 'days'), orderBy('id')))

const route = useRoute()
const docRef = doc(db, "days", route.params.id);
var { data: day, pending } = useDocument(docRef)


import { useDayStore } from '@/stores/day'
const dayStore = useDayStore()
dayStore.setDayToEdit(day);

const oras = [
    {
        title: "Заклік",
        to: `/day/${route.params.day}/ora/${route.params.id}/invitatorium`
    },
    {
        title: "Гадзіна чытанняў",
        to: `/day/${route.params.day}/ora/${route.params.id}/lectionis`
    },
    {
        title: "Ютрань",
        to: `/day/${route.params.day}/ora/${route.params.id}/laudes`
    },
    {
        title: "Малітва перад поўднем",
        to: `/day/${route.params.day}/ora/${route.params.id}/terz`
    },
    {
        title: "Малітва апоўдні",
        to: `/day/${route.params.day}/ora/${route.params.id}/sext`
    },
    {
        title: "Малітва пасля поўдня",
        to: `/day/${route.params.day}/ora/${route.params.id}/non`
    },
    {
        title: "Нешпары",
        to: `/day/${route.params.day}/ora/${route.params.id}/vesper`
    },
    {
        title: "Камплета",
        to: `/day/${route.params.day}/ora/${route.params.id}/completorium`
    },

]

</script>