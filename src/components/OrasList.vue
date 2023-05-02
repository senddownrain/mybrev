<template>

    <v-container fluid>
        <v-row dense>
            <v-col cols="12">
                <v-card v-if="!pending">
                    <v-card-title>
                        {{ day.dayName == "" ? day.feastName : day.dayName}} - {{ day.weekDay }}
                    </v-card-title>
                    <v-card-text>
                        <v-list density="compact">
                    <v-list-item v-for="(item, i) in oras" :key="i" :value="item" active-color="primary" :to="item.to">
                        <v-list-item-title>
                            {{ item.title }}
                        </v-list-item-title>

                        <template v-slot:append>
                            <v-icon>mdi-chevron-right</v-icon>
                        </template>
                    </v-list-item>
                </v-list>
                    </v-card-text>
                </v-card>
               
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

const oras = [
    {
        title: "Vesper",
        to: `/ora/${route.params.id}/vesper`
    },
    {
        title: "Laudes",
    }
]

</script>