<template>
    <v-container fluid>
        <v-row dense>
            <v-col cols="12">


                <v-card>
                    <v-card-title>
                        Ordinary
                    </v-card-title>
                    <v-card-text>
                        <v-list>
                            <v-list-item
                                v-for="(item, i) in days.filter(d => d._periodType == 'ordinary').sort((a, b) => a?._dayOfWeek - b?._dayOfWeek).sort((a, b) => a?._periodWeekNumber - b?._periodWeekNumber)"
                                :key="i" :value="item" color="primary">
                                <v-list-item-title>
                                    {{ item?._feastName }} {{ item?._dayName }} - {{ item?._weekDay }} - week [{{
                                        item?._periodWeekNumber }}] - id [{{ item?.id }}]
                                </v-list-item-title>
                            </v-list-item>
                        </v-list>
                    </v-card-text>

                </v-card>
            </v-col>

        </v-row>


        
        <v-row dense>
            <v-col cols="12">


                <v-card>
                    <v-card-title>
                        Advent
                    </v-card-title>
                    <v-card-text>
                        <v-list>
                            <v-list-item v-for="(item, i) in days.filter(d => d._periodType == 'advent').sort((a, b) => a?._periodWeekNumber - b?._periodWeekNumber).sort((a, b) => a?._dayOfWeek - b?._dayOfWeek)" :key="i"
                                :value="item" color="primary">
                                <v-list-item-title>
                                    {{ item?._feastName }} {{ item?._dayName }} - {{ item?._weekDay }} - week [{{
                                        item?._periodWeekNumber }}] - id [{{ item?.id }}]
                                </v-list-item-title>
                            </v-list-item>
                        </v-list>
                    </v-card-text>

                </v-card>
            </v-col>

        </v-row>


        <v-row dense>
            <v-col cols="12">


                <v-card>
                    <v-card-title>
                        Christmas
                    </v-card-title>
                    <v-card-text>
                        <v-list>
                            <v-list-item v-for="(item, i) in days.filter(d => d._periodType == 'christmas').sort((a, b) => a?._periodWeekNumber - b?._periodWeekNumber).sort((a, b) => a?._dayOfWeek - b?._dayOfWeek)" :key="i"
                                :value="item" color="primary">
                                <v-list-item-title>
                                    {{ item?._feastName }} {{ item?._dayName }} - {{ item?._weekDay }} - week [{{
                                        item?._periodWeekNumber }}] - id [{{ item?.id }}]
                                </v-list-item-title>
                            </v-list-item>
                        </v-list>
                    </v-card-text>

                </v-card>
            </v-col>

        </v-row>

        <v-row dense>
            <v-col cols="12">


                <v-card>
                    <v-card-title>
                        Lent
                    </v-card-title>
                    <v-card-text>
                        <v-list>
                            <v-list-item v-for="(item, i) in days.filter(d => d._periodType == 'lent').sort((a, b) => a?._dayOfWeek - b?._dayOfWeek).sort((a, b) => a?._periodWeekNumber - b?._periodWeekNumber)" :key="i"
                                :value="item" color="primary">
                                <v-list-item-title>
                                    {{ item?._feastName }} {{ item?._dayName }} - {{ item?._weekDay }} - week [{{
                                        item?._periodWeekNumber }}] - id [{{ item?.id }}]
                                </v-list-item-title>
                            </v-list-item>
                        </v-list>
                    </v-card-text>

                </v-card>
            </v-col>

        </v-row>

        
        <v-row dense>
            <v-col cols="12">


                <v-card>
                    <v-card-title>
                        Holy Week
                    </v-card-title>
                    <v-card-text>
                        <v-list>
                            <v-list-item v-for="(item, i) in days.filter(d => d._periodType == 'holyweek').sort((a, b) => a?._periodWeekNumber - b?._periodWeekNumber).sort((a, b) => a?._dayOfWeek - b?._dayOfWeek)" :key="i"
                                :value="item" color="primary">
                                <v-list-item-title>
                                    {{ item?._feastName }} {{ item?._dayName }} - {{ item?._weekDay }} - week [{{
                                        item?._periodWeekNumber }}] - id [{{ item?.id }}]
                                </v-list-item-title>
                            </v-list-item>
                        </v-list>
                    </v-card-text>

                </v-card>
            </v-col>

        </v-row>


        <v-row dense>
            <v-col cols="12">


                <v-card>
                    <v-card-title>
                        Easter
                    </v-card-title>
                    <v-card-text>
                        <v-list>
                            <v-list-item v-for="(item, i) in days.filter(d => d._periodType == 'easter').sort((a, b) => a?._dayOfWeek - b?._dayOfWeek).sort((a, b) => a?._periodWeekNumber - b?._periodWeekNumber)" :key="i"
                                :value="item" color="primary">
                                <v-list-item-title>
                                    {{ item?._feastName }} {{ item?._dayName }} - {{ item?._weekDay }} - week [{{
                                        item?._periodWeekNumber }}] - id [{{ item?.id }}]
                                </v-list-item-title>
                            </v-list-item>
                        </v-list>
                    </v-card-text>

                </v-card>
            </v-col>

        </v-row>

        <v-row dense>
            <v-col cols="12">

                <v-card>
                    <v-card-title>
                        Dates
                    </v-card-title>
                    <v-card-text>
                        <v-list>
                            <v-list-item v-for="(item, i) in days.filter(d => d._date)" :key="i" :value="item"
                                color="primary">
                                <v-list-item-title>
                                    {{ item?._date }} {{ item?._feastName }} {{ item?._dayName }} - {{ item?._weekDay }} -
                                    week [{{ item?._periodWeekNumber }}] - id [{{ item?.id }}]
                                </v-list-item-title>
                            </v-list-item>
                        </v-list>
                    </v-card-text>

                </v-card>
            </v-col>

        </v-row>

        <v-row dense>
            <v-col cols="12">

                <v-card>
                    <v-card-title>
                        Feasts
                    </v-card-title>
                    <v-card-text>
                        <v-list>
                            <v-list-item v-for="(item, i) in days.filter(d => d._feast)" :key="i" :value="item"
                                color="primary">
                                <v-list-item-title>
                                    {{ item?._date }} {{ item?._feastName }} {{ item?._dayName }} - {{ item?._weekDay }} -
                                    week [{{ item?._periodWeekNumber }}] - id [{{ item?.id }}]
                                </v-list-item-title>
                            </v-list-item>
                        </v-list>
                    </v-card-text>

                </v-card>
            </v-col>

        </v-row>
    </v-container>
</template>

<script setup>

import { ref } from 'vue'
import { useCollection, useFirestore } from 'vuefire'
import { collection, query, orderBy } from 'firebase/firestore'



const db = useFirestore()
const days = useCollection(query(collection(db, 'days'), orderBy('_weekNum')))


</script>