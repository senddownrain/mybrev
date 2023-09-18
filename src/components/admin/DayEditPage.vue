<template>
    <v-container>
        <v-row>
            <v-expansion-panels>
                <v-expansion-panel v-for="n in Object.getOwnPropertyNames(dte).sort()" :key="n" :title="`${n}: ${getTitle(dte[n])}`">
                    <v-expansion-panel-text>
                        <div v-if="!checkEditor(dte[n])">
                            <v-text-field v-model="dte[n]" :label="n"></v-text-field>
                        </div>
                        <v-row v-if="checkEditor(dte[n])">
                            <v-col cols="6">
                                <v-textarea auto-grow variant="filled" v-model="dte[n]"></v-textarea>
                            </v-col>
                            <v-col cols="6">
                                <v-card class="ora-edit" flat>

                                    <v-card-text class="ora-edit-text">
                                        <div v-html="dte[n]"></div>
                                    </v-card-text>
                                </v-card>

                            </v-col>
                        </v-row>
                    </v-expansion-panel-text>

                </v-expansion-panel>
            </v-expansion-panels>
        </v-row>
    </v-container>
</template>

<script setup>
const props = defineProps({

    // date: String,
    // psalms: String,
    // feastType: String,
    // dayName: String,

})



import moment from 'moment'
import 'moment/dist/locale/be'
import { ref } from 'vue'

import { useDayStore } from '@/stores/day'
const dayStore = useDayStore()
console.log(dayStore)
const dte = ref(dayStore.getDayToEdit);


import { useFontStore } from '@/stores/font'
const font = useFontStore()

function checkEditor(field) {
    return field && field.length > 50
}

function getTitle(field){
    if(!field)
    return "---"

    return field.length > 30 ? "" : field; 
}



</script>

<style>
.ora-edit-text p {
    margin-top: 10px;
    margin-bottom: 10px;
}

.v-card .ora-edit-text {
    padding-left: 0;
    font-size: v-bind('font.getHeader.textSize');
    line-height: v-bind('font.getHeader.textLine');
}

/* 
.ora-text{
    padding-left: 0;
    font-size: 0.975rem;
    line-height: 1.4rem;
    letter-spacing: 0.02rem;
} 


    letter-spacing: v-bind('font.getHeader.textLetterSpacing');

    letter-spacing: v-bind('font.getHeader.headerLetterSpacing');
}
*/


.ora-edit {}

</style>