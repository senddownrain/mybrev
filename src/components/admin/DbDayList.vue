<template>
    <v-container fluid>
        <v-row dense>
            <v-col cols="12">

                <v-expansion-panels variant="popout">
                    <v-expansion-panel title="Ordinary">
                        <v-expansion-panel-text>
                            <v-list>
                                <v-list-item
                                    v-for="(item, i) in days.filter(d => d._periodType == 'ordinary').sort((a, b) => a?._dayOfWeek - b?._dayOfWeek).sort((a, b) => a?._periodWeekNumber - b?._periodWeekNumber)"
                                    :key="i" :value="item" color="primary">
                                    <v-list-item-title @click="edit(item)">
                                        {{ item?._feastName }} {{ item?._dayName }} - {{ item?._weekDay }} - week [{{
                                            item?._periodWeekNumber }}] - id [{{ item?.id }}]
                                    </v-list-item-title>
                                </v-list-item>
                            </v-list>
                        </v-expansion-panel-text>

                    </v-expansion-panel>

                    <v-expansion-panel title="Advent">
                        <v-expansion-panel-text>
                            <v-list>
                                <v-list-item
                                    v-for="(item, i) in days.filter(d => d._periodType == 'advent').sort((a, b) => a?._periodWeekNumber - b?._periodWeekNumber).sort((a, b) => a?._dayOfWeek - b?._dayOfWeek)"
                                    :key="i" :value="item" color="primary">
                                    <v-list-item-title @click="edit(item)">
                                        {{ item?._feastName }} {{ item?._dayName }} - {{ item?._weekDay }} - week [{{
                                            item?._periodWeekNumber }}] - id [{{ item?.id }}]
                                    </v-list-item-title>
                                </v-list-item>
                            </v-list>
                        </v-expansion-panel-text>
                    </v-expansion-panel>
                    <v-expansion-panel title="Christmas">
                        <v-expansion-panel-text>
                            <v-list>
                                <v-list-item
                                    v-for="(item, i) in days.filter(d => d._periodType == 'christmas').sort((a, b) => a?._periodWeekNumber - b?._periodWeekNumber).sort((a, b) => a?._dayOfWeek - b?._dayOfWeek)"
                                    :key="i" :value="item" color="primary">
                                    <v-list-item-title @click="edit(item)">
                                        {{ item?._feastName }} {{ item?._dayName }} - {{ item?._weekDay }} - week [{{
                                            item?._periodWeekNumber }}] - id [{{ item?.id }}]
                                    </v-list-item-title>
                                </v-list-item>
                            </v-list>
                        </v-expansion-panel-text>

                    </v-expansion-panel>

                    <v-expansion-panel title="Lent">
                        <v-expansion-panel-text>
                            <v-list>
                                <v-list-item
                                    v-for="(item, i) in days.filter(d => d._periodType == 'lent').sort((a, b) => a?._dayOfWeek - b?._dayOfWeek).sort((a, b) => a?._periodWeekNumber - b?._periodWeekNumber)"
                                    :key="i" :value="item" color="primary">
                                    <v-list-item-title @click="edit(item)">
                                        {{ item?._feastName }} {{ item?._dayName }} - {{ item?._weekDay }} - week [{{
                                            item?._periodWeekNumber }}] - id [{{ item?.id }}]
                                    </v-list-item-title>
                                </v-list-item>
                            </v-list>
                        </v-expansion-panel-text>

                    </v-expansion-panel>

                    <v-expansion-panel title="Holy Week">
                        <v-expansion-panel-text>
                            <v-list>
                                <v-list-item
                                    v-for="(item, i) in days.filter(d => d._periodType == 'holyweek').sort((a, b) => a?._periodWeekNumber - b?._periodWeekNumber).sort((a, b) => a?._dayOfWeek - b?._dayOfWeek)"
                                    :key="i" :value="item" color="primary">
                                    <v-list-item-title @click="edit(item)">
                                        {{ item?._feastName }} {{ item?._dayName }} - {{ item?._weekDay }} - week [{{
                                            item?._periodWeekNumber }}] - id [{{ item?.id }}]
                                    </v-list-item-title>
                                </v-list-item>
                            </v-list>
                        </v-expansion-panel-text>

                    </v-expansion-panel>

                    <v-expansion-panel title="Easter">
                        <v-expansion-panel-text>
                            <v-list>
                                <v-list-item
                                    v-for="(item, i) in days.filter(d => d._periodType == 'easter').sort((a, b) => a?._dayOfWeek - b?._dayOfWeek).sort((a, b) => a?._periodWeekNumber - b?._periodWeekNumber)"
                                    :key="i" :value="item" color="primary">
                                    <v-list-item-title @click="edit(item)">
                                        {{ item?._feastName }} {{ item?._dayName }} - {{ item?._weekDay }} - week [{{
                                            item?._periodWeekNumber }}] - id [{{ item?.id }}]
                                    </v-list-item-title>
                                </v-list-item>
                            </v-list>
                        </v-expansion-panel-text>

                    </v-expansion-panel>

                    <v-expansion-panel title="Dates">
                        <v-expansion-panel-text>
                            <v-list>
                                <v-list-item v-for="(item, i) in days.filter(d => d._date)" :key="i" :value="item"
                                    color="primary">
                                    <v-list-item-title @click="edit(item)">
                                        {{ item?._date }} {{ item?._feastName }} {{ item?._dayName }} - {{
                                            item?._weekDay }} -
                                        week [{{ item?._periodWeekNumber }}] - id [{{ item?.id }}]
                                    </v-list-item-title>
                                </v-list-item>
                            </v-list>
                        </v-expansion-panel-text>

                    </v-expansion-panel>

                    <v-expansion-panel title="Feasts">
                        <v-expansion-panel-text>
                            <v-list>
                                <v-list-item v-for="(item, i) in days.filter(d => d._feast)" :key="i" :value="item"
                                    color="primary">
                                    <v-list-item-title @click="edit(item)">
                                        {{ item?._date }} {{ item?._feastName }} {{ item?._dayName }} - {{
                                            item?._weekDay }} -
                                        week [{{ item?._periodWeekNumber }}] - id [{{ item?.id }}]
                                    </v-list-item-title>
                                </v-list-item>
                            </v-list>
                        </v-expansion-panel-text>

                    </v-expansion-panel>
                </v-expansion-panels>
            </v-col>
        </v-row>

    <v-dialog
      v-model="dialog"
      fullscreen
      :scrim="false"
      transition="dialog-bottom-transition"
    >
      <v-card>
        <v-toolbar
          dark
          color="primary"
        >
          <v-btn
            icon
            dark
            @click="dialog = false"
          >
            <v-icon>mdi-close</v-icon>
          </v-btn>
          <v-toolbar-title>Edit Day</v-toolbar-title>
          <v-spacer></v-spacer>
          <v-toolbar-items>
            <v-btn
              variant="text"
              @click="updateItem()"
            >
              Save
            </v-btn>
          </v-toolbar-items>
        </v-toolbar>
       <day-edit></day-edit>
      </v-card>
    </v-dialog>
    </v-container>
</template>

<script setup>

import { ref } from 'vue'
import { useCollection, useFirestore } from 'vuefire'
import { collection, query, orderBy } from 'firebase/firestore'

import DayEdit from '@/components/admin/DayEditPage.vue';

const dialog = ref(false);


import { useDayStore } from '@/stores/day'
const dayStore = useDayStore()
const currentItem = ref({})

function edit(item){
    dialog.value = true;
    currentItem.value = item
    dayStore.setDayToEdit(item);
}

const db = useFirestore()
const days = useCollection(query(collection(db, 'days'), orderBy('_weekNum')))

function updateItem(){
    dayStore.updateDay(currentItem.value)
    dialog.value = false;
}

</script>