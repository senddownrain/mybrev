<template>

    <v-container fluid>
        <v-row dense>
            <v-col cols="12">
                <v-list density="compact">
                <v-list-item v-for="(item, i) in days" :key="i" :value="item" active-color="primary" :to="`/ora/${item.id}`">
                    <v-list-item-title>
                        {{ item.dayName == "" ? item.feastName : item.dayName}} - {{ item.weekDay }}
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

import { useCollection, useFirestore } from 'vuefire'
import { collection, orderBy, query, doc, updateDoc, setDoc } from 'firebase/firestore'

const db = useFirestore()

const days = useCollection(query(collection(db, 'days')))
//const notes = useCollection(query(collection(db, 'days'), orderBy('id')))


</script>