<template>
    <v-container fluid>
        <v-row dense>
            
            <v-col cols="12" sm="12">
                        <div v-if="!pending" class="text-h6 mb-3 mt-1">
                            Дзень {{ current.day }} - [{{ current.title }}]
                        </div>

                        <v-card v-if="firstDayOfWeek && !pending" class="mt-3" :title="currentWeek.title">
                            
                            <v-card-text v-if="!pending">
                                <p v-html="currentWeek.comment"></p>
                            </v-card-text>
                        </v-card>
                        <v-card v-if="!firstDayOfWeek && !pending" class="mt-3" :title="currentWeek.title">
                           
                            <v-card-text v-if="!pending">
                                <p v-html="currentWeek.shotcomment"></p>
                            </v-card-text>
                        </v-card>

                        <v-card :loading="pending" v-if="firstDayOfWeek" class="mt-3" title="Духоўныя практыкаванні на тыдзень">
                            <v-card-text v-if="!pending">
                                <div class="pa-3" v-html="currentWeek.tasks"></div>
                            </v-card-text>
                        </v-card>
                        <v-card :loading="pending" v-if="!firstDayOfWeek" class="mt-3" title="Духоўныя практыкаванні на тыдзень">
                            <v-card-text v-if="!pending">
                                <p v-html="currentWeek.shottasks"></p>
                            </v-card-text>
                        </v-card>

                        <v-card :loading="pending" class="mt-3">
                            <v-card-text v-if="!pending">
                                <p> Памаліся, каб Гасподзь вызваліў цябе і тваю супольнасць.</p>
                                <p>Маліся аб вызваленні для ўсіх з супольнасці Зыход, ведаючы, што і яны моляцца за
                                    цябе.</p>
                                <p>
                                    Ойча наш...
                                </p>
                            </v-card-text>
                        </v-card>

                        <v-card v-if="!pending" class="mt-3" :title="current.verse">
                            <v-card-text v-if="!pending">
                                <p v-html="current.bible"></p>
                            </v-card-text>
                        </v-card>
                        <v-card :loading="pending" class="mt-3" title="РАЗВАЖАННІ">
                            <v-card-text v-if="!pending">
                                <p v-html="current.comment"></p>
                            </v-card-text>
                        </v-card>
            </v-col>
        </v-row>
    </v-container>
</template>
    
<script setup>

import { ref } from 'vue'
//import json from '../json/GCH_Ant_table.json'



import { useDocument, useFirestore } from 'vuefire'
import { collection, orderBy, query, doc, updateDoc } from 'firebase/firestore'
const db = useFirestore()


const first = new Date('01.09.2023');
const firstDayNum = getDayOfYear(first)
const todayDayNum = getDayOfYear()
const weekNum = Math.floor((todayDayNum - firstDayNum) / 7)
const firstDayOfWeek = (todayDayNum - firstDayNum - weekNum * 7) == 0


var { data: currentWeek, pending } = useDocument(doc(db, 'weeks', (weekNum + 1).toString()))

var { data: current, pending } = useDocument(doc(db, 'days', (todayDayNum - firstDayNum + 1).toString()))

function strippedHtml(value) {
    if (!value)
        return ""

    let regex = /(<([^>]+)>)/ig;
    return value.replace(regex, "");
}

function getDayOfYear(date = new Date()) {
    const timestamp1 = Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
    );
    const timestamp2 = Date.UTC(date.getFullYear(), 0, 0);

    const differenceInMilliseconds = timestamp1 - timestamp2;

    const differenceInDays = differenceInMilliseconds / 1000 / 60 / 60 / 24;

    return differenceInDays;
}

</script>

<style>
.v-card .v-card-text {
    line-height: 1.35rem !important;
}

.v-card-text {
    font-size: 0.975rem !important;
}
</style>