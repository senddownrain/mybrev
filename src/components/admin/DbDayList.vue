<template>
    <v-container fluid>
        <v-row dense>
            <v-col cols="12">

                <v-expansion-panels variant="popout">
                    <v-expansion-panel title="Ordinary">
                        <v-expansion-panel-text>
                            <v-list>

                                <v-list-item-group>
                                    <v-list-item
                                        v-for="(item, i) in days.filter(d => d._periodType == 'ordinary').sort((a, b) => a?._dayOfWeek - b?._dayOfWeek).sort((a, b) => a?._periodWeekNumber - b?._periodWeekNumber)"
                                        :key="i" 
                                        :value="item" 
                                        color="primary">
                                        <v-list-item-content>
                                            <v-list-item-title @click="edit(item)">
                                                {{ item?._feastName }} {{ item?._dayName }} - {{ item?._weekDay }} -
                                                week
                                                [{{
                                            item?._periodWeekNumber }}]
                                            </v-list-item-title>
                                            <v-list-item-subtitle> id [{{ item?.id }}]</v-list-item-subtitle>
                                        </v-list-item-content>
                                    </v-list-item>

                                </v-list-item-group>
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

        <v-dialog v-model="dialog" fullscreen :scrim="false" transition="dialog-bottom-transition">
            <v-card>
                <v-toolbar dark color="primary">
                    <v-btn icon dark @click="dialog = false">
                        <v-icon>mdi-close</v-icon>
                    </v-btn>
                    <v-toolbar-title>Edit Day</v-toolbar-title>
                    <v-spacer></v-spacer>
                    <v-toolbar-items>
                        <v-btn variant="text" @click="deleteItem()">
                            Delete
                        </v-btn>
                        <v-btn variant="text" @click="updateItem()">
                            Save
                        </v-btn>
                    </v-toolbar-items>
                </v-toolbar>
                <day-edit></day-edit>
            </v-card>
        </v-dialog>

        
    <!-- Confirmation dialog -->
    <v-dialog v-model="showConfirmDialog" max-width="290">
      <v-card>
        <v-card-title class="headline">Подтвердить удаление</v-card-title>
        <v-card-text>
          Уверен?
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="green darken-1" text @click="confirmDelete">Подтвердить</v-btn>
          <v-btn color="red darken-1" text @click="closeConfirmDialog">Отмена</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    </v-container>
</template>

<script setup>

import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCollection, useFirestore } from 'vuefire'
import { collection, query, orderBy } from 'firebase/firestore'

// DayEditPage removed - using DayEditor.vue instead

const dialog = ref(false);

const showConfirmDialog = ref(false);

import { useDayStore } from '@/stores/day'
const dayStore = useDayStore()
const currentItem = ref({})
const router = useRouter();
 
function edit(item) {
    router.push({ name: 'AdminDayEditor', params: { id: item.id } });
    // Removed console.log
    // dialog.value = true;
    // currentItem.value = item
    // dayStore.setDayToEdit(item);
}

const db = useFirestore()
const days = useCollection(query(collection(db, 'days'), orderBy('_weekNum')))

function updateItem() {
    dayStore.updateDay(currentItem.value)
    dialog.value = false;
}

function deleteItem() {
    showConfirmDialog.value = true
}

function closeConfirmDialog() {
      showConfirmDialog.value = false; // Hide the dialog
    }

  function  confirmDelete() {
      dayStore.deleteDay(currentItem.value);
      closeConfirmDialog(); // Close dialog after deletion
      dialog.value = false
    }

</script>