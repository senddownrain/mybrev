<template>
    <v-container>
        <v-row lign="center" justify="center">
            <v-col md="6" lg="6" sm="8" v-if="!pending">
                <day-title :day="day.weekDay" :date="nowDate" />

                <v-card class="ora" flat>
                    <v-card-title class="ora-header">
                        {{ title }}
                    </v-card-title>
                    <v-card-text class="ora-text">
                        <span style="color:red">Заклік з’яўляецца пачаткам штодзённай літургічнай малітвы. Ён
                            папярэднічае Гадзіне чытанняў або Ютрані, у залежнасці ад таго, якая з гэтых літургічных
                            гадзінаў распачынае малітву дня.</span> <br>
                        <br>
                        <span style="color:red">К.</span> <span> Пане, адкрый мае вусны.</span><br>
                        <span style="color:red">Н.</span> <span> І вусны мае будуць абвяшчаць Тваю хвалу.</span><br>
                    </v-card-text>
                </v-card>

                <v-card class="ora" flat>
                    <v-card-title class="ora-title">
                    </v-card-title>
                    <v-card-text class="ora-text">
                        <div class="ora-ant" v-html="day.invitatoriumAnt"></div>
                        <br>
                        <div class="ora-psalm" v-html="day.invitatoriumPs1"></div>
                        <br>
                        <div class="ora-ant" v-html="day.invitatoriumAnt"></div>
                        <br>
                        <div class="ora-psalm" v-html="day.invitatoriumPs2"></div>
                        <br>
                        <div class="ora-ant" v-html="day.invitatoriumAnt"></div>
                        <br>
                        <div class="ora-psalm" v-html="day.invitatoriumPs3"></div>
                        <br>
                        <div class="ora-ant" v-html="day.invitatoriumAnt"></div>
                        <br>
                        <div class="ora-psalm" v-html="day.invitatoriumPs4"></div>
                        <br>
                        <div class="ora-ant" v-html="day.invitatoriumAnt"></div>
                        <br v-if="day.invitatoriumPs5">
                        <div class="ora-psalm" v-if="day.invitatoriumPs5" v-html="day.invitatoriumPs5"></div>
                        <br v-if="day.invitatoriumPs5">
                        <div class="ora-ant" v-if="day.invitatoriumPs5" v-html="day.invitatoriumAnt"></div>
                        <br v-if="day.invitatoriumPs6">
                        <div class="ora-psalm" v-if="day.invitatoriumPs6" v-html="day.invitatoriumPs6"></div>
                        <br v-if="day.invitatoriumPs6">
                        <div class="ora-ant" v-if="day.invitatoriumPs6" v-html="day.invitatoriumAnt"></div>
                        <br v-if="day.invitatoriumPs6">
                    </v-card-text>
                </v-card>

            </v-col>
        </v-row>
    </v-container>

</template>

<script setup>

import { ref } from 'vue'
import moment from 'moment';
import 'moment/dist/locale/be';

import { useRoute } from 'vue-router'
import { useCollection, useFirestore, useDocument } from 'vuefire'
import { collection, orderBy, query, doc, updateDoc } from 'firebase/firestore'
import DayTitle from '@/components/oraparts/DayTitle.vue';

const db = useFirestore()

const route = useRoute()
const docRef = doc(db, "days", route.params.id);
var { data: day, pending } = useDocument(docRef)

let [d, m, y] = route.params.day.split('-').map(Number);
const originDate = new Date(y, m - 1, d)
const nowDate = `${moment(originDate).format('dddd')}, ${moment(originDate).format('LL')} `
const title = "ЗАКЛІК"

</script>