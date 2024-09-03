<template>
    <v-container>

        <v-row>
            <v-col>
                <v-card flat>
                    <v-card-title>
                        Параметры 
                    </v-card-title>
                    <v-row>
                        <v-col>
                            <v-text-field v-model="dte._date" :label="'Дата (_date)'"></v-text-field></v-col>
                        <v-col>
                            <v-text-field v-model="dte._dayName" :label="'Імя дня (_dayName)'"></v-text-field></v-col>
                    </v-row>

                    <v-row>
                        <v-col>
                            <v-text-field v-model="dte._feast" :label="'Свята (_feast)'"></v-text-field></v-col>
                        <v-col>
                            <v-text-field v-model="dte._feastName" :label="'Імя свята (_feastName)'"></v-text-field></v-col>
                        <v-col>
                            <v-text-field v-model="dte._feastType" :label="'Тып свята (_feastType)'"></v-text-field></v-col>
                    </v-row>

                    <v-row>
                        <v-col>
                            <v-text-field v-model="dte._periodType" :label="'Перыяд (_periodType)'"></v-text-field></v-col>
                        <v-col>
                            <v-text-field v-model="dte._periodWeekNumber"
                                :label="'Нумар тыдня (_periodType)'"></v-text-field></v-col>
                        <v-col>
                            <v-text-field v-model="dte._psalmWeek"
                                :label="'Тыдзень псалтыра (_psalmWeek)'"></v-text-field></v-col>
                    </v-row>

                    <v-row>
                        <v-col>
                            <v-text-field v-model="dte._weekDay" :label="'Дзень тыдня (_weekDay)'"></v-text-field></v-col>
                        <v-col>
                            <v-text-field v-model="dte._weekNum" :label="'Нумар тыдня (_weekNum)'"></v-text-field></v-col>
                        <v-col>
                            <v-text-field v-model="dte.allowedAlleluia"
                                :label="'Аллелюя (allowedAlleluia)'"></v-text-field></v-col>
                    </v-row>

                    
                    <v-row>
                        <TwoColsField :dte="dte" :fieldName="'feastComment'" :fieldTitle="'Апісанне свята (feastComment)'" />
                    </v-row>


                    <v-card-actions>
                        <v-spacer></v-spacer>
                        <v-btn @click="updateItem()" color="primary">
                            Абнавіць
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-col>
        </v-row>
        <v-divider></v-divider>
        
        <v-row>
            <v-col>
                <v-card flat>
                    <v-card-title>
                        Заклік
                    </v-card-title>

                    <v-row>
                        <TwoColsField :dte="dte" :fieldName="'invitatoriumAnt'" :fieldTitle="'Антыфона (invitatoriumAnt)'" />
                        <TwoColsField :dte="dte" :fieldName="'invitatoriumPs1'" :fieldTitle="'Пасальм 1 куплет (invitatoriumPs1)'" />
                        <TwoColsField :dte="dte" :fieldName="'invitatoriumPs2'" :fieldTitle="'Пасальм 2 куплет (invitatoriumPs2)'" />
                        <TwoColsField :dte="dte" :fieldName="'invitatoriumPs3'" :fieldTitle="'Пасальм 3 куплет (invitatoriumPs3)'" />
                        <TwoColsField :dte="dte" :fieldName="'invitatoriumPs4'" :fieldTitle="'Пасальм 4 куплет (invitatoriumPs4)'" />
                        <TwoColsField :dte="dte" :fieldName="'invitatoriumPs5'" :fieldTitle="'Пасальм 5 куплет (invitatoriumPs5)'" />
                        <TwoColsField :dte="dte" :fieldName="'invitatoriumPs6'" :fieldTitle="'Пасальм 6 куплет (invitatoriumPs6)'" />
                        
                    </v-row>                 

                    <v-card-actions>
                        <v-spacer></v-spacer>
                        <v-btn @click="updateItem()" color="primary">
                            Абнавіць
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-col>
        </v-row>

        <v-divider></v-divider>
        

        <v-row>
            <v-col>
                <v-card flat>
                    <v-card-title>
                        Ютрань
                    </v-card-title>

                    <v-row>
                        <TwoColsField :dte="dte" :fieldName="'laudesHymn'" :fieldTitle="'Гімн (laudesHymn)'" />
                        <TwoColsField :dte="dte" :fieldName="'laudesAnt1'" :fieldTitle="'Антыфона 1 (laudesAnt1)'" />
                        <TwoColsField :dte="dte" :fieldName="'laudesPs1'" :fieldTitle="'Пальм 1 (laudesPs1)'" />

                        <TwoColsField :dte="dte" :fieldName="'laudesAnt2'" :fieldTitle="'Антыфона 2 (laudesAnt2)'" />
                        <TwoColsField :dte="dte" :fieldName="'laudesPs2'" :fieldTitle="'Пальм 2 (laudesPs2)'" />

                        <TwoColsField :dte="dte" :fieldName="'laudesAnt3'" :fieldTitle="'Антыфона 3 (laudesAnt3)'" />
                        <TwoColsField :dte="dte" :fieldName="'laudesPs3'" :fieldTitle="'Пальм 3 (laudesPs3)'" />

                        <TwoColsField :dte="dte" :fieldName="'laudesR'" :fieldTitle="'Чытанне (laudesR)'" />
                        <TwoColsField :dte="dte" :fieldName="'laudesAntBen'" :fieldTitle="'Антыфона (laudesAntBen)'" />
                        <TwoColsField :dte="dte" :fieldName="'laudesInter'" :fieldTitle="'Просьбы (laudesInter)'" />
                        <TwoColsField :dte="dte" :fieldName="'laudesPr'" :fieldTitle="'Малітва (laudesPr)'" />
                    </v-row>                    

                    <v-card-actions>
                        <v-spacer></v-spacer>
                        <v-btn @click="updateItem()" color="primary">
                            Абнавіць
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-col>
        </v-row>
        <v-divider></v-divider>
        
        <v-row>
            <v-col>
                <v-card flat>
                    <v-card-title>
                        Гадзіна чытанняў
                    </v-card-title>

                    <v-row>
                        <TwoColsField :dte="dte" :fieldName="'officeOfReadingsHymn'" :fieldTitle="'Гімн (officeOfReadingsHymn)'" />
                        <TwoColsField :dte="dte" :fieldName="'officeOfReadingsAnt1'" :fieldTitle="'Антыфона 1 (officeOfReadingsAnt1)'" />
                        <TwoColsField :dte="dte" :fieldName="'officeOfReadingsPs1'" :fieldTitle="'Пальм 1 (officeOfReadingsPs1)'" />

                        <TwoColsField :dte="dte" :fieldName="'officeOfReadingsAnt2'" :fieldTitle="'Антыфона 2 (officeOfReadingsAnt2)'" />
                        <TwoColsField :dte="dte" :fieldName="'officeOfReadingsPs2'" :fieldTitle="'Пальм 2 (officeOfReadingsPs2)'" />

                        <TwoColsField :dte="dte" :fieldName="'officeOfReadingsAnt3'" :fieldTitle="'Антыфона 3 (officeOfReadingsAnt3)'" />
                        <TwoColsField :dte="dte" :fieldName="'officeOfReadingsPs3'" :fieldTitle="'Пальм 3 (officeOfReadingsPs3)'" />
                       
                        <TwoColsField :dte="dte" :fieldName="'officeOfReadingsR1'" :fieldTitle="'Чытанне 1 (officeOfReadingsR1)'" />
                       
                        <TwoColsField :dte="dte" :fieldName="'officeOfReadingsR2'" :fieldTitle="'Чытанне 2 (officeOfReadingsR2)'" />
                        <TwoColsField :dte="dte" :fieldName="'officeOfReadingPr'" :fieldTitle="'Малітва (officeOfReadingsPr)'" />
                    </v-row>                    

                    <v-card-actions>
                        <v-spacer></v-spacer>
                        <v-btn @click="updateItem()" color="primary">
                            Абнавіць
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-col>
        </v-row>
        <v-divider></v-divider>

        <v-row>
            <v-col>
                <v-card flat>
                    <v-card-title>
                        Малітва перад поўднем
                    </v-card-title>

                    <v-row>
                        <TwoColsField :dte="dte" :fieldName="'sext1Hymn'" :fieldTitle="'Гімн (sext1Hymn)'" />
                        <TwoColsField :dte="dte" :fieldName="'sext1Ant1'" :fieldTitle="'Антыфона 1 (sext1Ant1)'" />
                        <TwoColsField :dte="dte" :fieldName="'sext1Ps1'" :fieldTitle="'Пальм 1 (sext1Ps1)'" />

                        <TwoColsField :dte="dte" :fieldName="'sext1Ant2'" :fieldTitle="'Антыфона 2 (sext1Ant2)'" />
                        <TwoColsField :dte="dte" :fieldName="'sext1Ps2'" :fieldTitle="'Пальм 2 (sext1Ps2)'" />

                        <TwoColsField :dte="dte" :fieldName="'sext1Ant3'" :fieldTitle="'Антыфона 3 (sext1Ant3)'" />
                        <TwoColsField :dte="dte" :fieldName="'sext1Ps3'" :fieldTitle="'Пальм 3 (sext1Ps3)'" />

                        <TwoColsField :dte="dte" :fieldName="'sext1R'" :fieldTitle="'Чытанне (sext1R)'" /> />
                        <TwoColsField :dte="dte" :fieldName="'sext1Pr'" :fieldTitle="'Малітва (sext1Pr)'" />
                    </v-row>                    

                    <v-card-actions>
                        <v-spacer></v-spacer>
                        <v-btn @click="updateItem()" color="primary">
                            Абнавіць
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-col>
        </v-row>
        <v-divider></v-divider>
        <v-row>
            <v-col>
                <v-card flat>
                    <v-card-title>
                        Малітва апоўдні
                    </v-card-title>

                    <v-row>
                        <TwoColsField :dte="dte" :fieldName="'sext2Hymn'" :fieldTitle="'Гімн (sext2Hymn)'" />
                        <TwoColsField :dte="dte" :fieldName="'sext2Ant1'" :fieldTitle="'Антыфона 1 (sext2Ant1)'" />
                        <TwoColsField :dte="dte" :fieldName="'sext2Ps1'" :fieldTitle="'Пальм 1 (sext2Ps1)'" />

                        <TwoColsField :dte="dte" :fieldName="'sext2Ant2'" :fieldTitle="'Антыфона 2 (sext2Ant2)'" />
                        <TwoColsField :dte="dte" :fieldName="'sext2Ps2'" :fieldTitle="'Пальм 2 (sext2Ps2)'" />

                        <TwoColsField :dte="dte" :fieldName="'sext2Ant3'" :fieldTitle="'Антыфона 3 (sext2Ant3)'" />
                        <TwoColsField :dte="dte" :fieldName="'sext2Ps3'" :fieldTitle="'Пальм 3 (sext2Ps3)'" />

                        <TwoColsField :dte="dte" :fieldName="'sext2R'" :fieldTitle="'Чытанне (sext2R)'" /> />
                        <TwoColsField :dte="dte" :fieldName="'sext2Pr'" :fieldTitle="'Малітва (sext2Pr)'" />
                    </v-row>                    

                    <v-card-actions>
                        <v-spacer></v-spacer>
                        <v-btn @click="updateItem()" color="primary">
                            Абнавіць
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-col>
        </v-row>
        <v-divider></v-divider>
        <v-row>
            <v-col>
                <v-card flat>
                    <v-card-title>
                        Малітва пасля поўдня
                    </v-card-title>

                    <v-row>
                        <TwoColsField :dte="dte" :fieldName="'sext3Hymn'" :fieldTitle="'Гімн (3)'" />
                        <TwoColsField :dte="dte" :fieldName="'sext3Ant1'" :fieldTitle="'Антыфона 1 (sext3Ant1)'" />
                        <TwoColsField :dte="dte" :fieldName="'sext3Ps1'" :fieldTitle="'Пальм 1 (sext2Ps1)'" />

                        <TwoColsField :dte="dte" :fieldName="'sext3Ant2'" :fieldTitle="'Антыфона 2 (sext3Ant2)'" />
                        <TwoColsField :dte="dte" :fieldName="'sext3Ps2'" :fieldTitle="'Пальм 2 (sext3Ps2)'" />

                        <TwoColsField :dte="dte" :fieldName="'sext3Ant3'" :fieldTitle="'Антыфона 3 (sext3Ant3)'" />
                        <TwoColsField :dte="dte" :fieldName="'sext3Ps3'" :fieldTitle="'Пальм 3 (sext3Ps3)'" />

                        <TwoColsField :dte="dte" :fieldName="'sext3R'" :fieldTitle="'Чытанне (sext3R)'" /> />
                        <TwoColsField :dte="dte" :fieldName="'sext3Pr'" :fieldTitle="'Малітва (sext3Pr)'" />
                    </v-row>                    

                    <v-card-actions>
                        <v-spacer></v-spacer>
                        <v-btn @click="updateItem()" color="primary">
                            Абнавіць
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-col>
        </v-row>
        <v-divider></v-divider>
        <v-row>
            <v-col>
                <v-card flat>
                    <v-card-title>
                        Нешпары
                    </v-card-title>

                    <v-row>
                        <TwoColsField :dte="dte" :fieldName="'vesperHymn'" :fieldTitle="'Гімн (vesperHymn)'" />
                        <TwoColsField :dte="dte" :fieldName="'vesperAnt1'" :fieldTitle="'Антыфона 1 (vesperAnt1)'" />
                        <TwoColsField :dte="dte" :fieldName="'vesperPs1'" :fieldTitle="'Пальм 1 (vesperPs1)'" />

                        <TwoColsField :dte="dte" :fieldName="'vesperAnt2'" :fieldTitle="'Антыфона 2 (vesperAnt2)'" />
                        <TwoColsField :dte="dte" :fieldName="'vesperPs2'" :fieldTitle="'Пальм 2 (vesperPs2)'" />

                        <TwoColsField :dte="dte" :fieldName="'vesperAnt3'" :fieldTitle="'Антыфона 3 (vesperAnt3)'" />
                        <TwoColsField :dte="dte" :fieldName="'vesperPs3'" :fieldTitle="'Пальм 3 (vesperPs3)'" />

                        <TwoColsField :dte="dte" :fieldName="'vesperR'" :fieldTitle="'Чытанне (vesperR)'" />
                        <TwoColsField :dte="dte" :fieldName="'vesperAntMag'" :fieldTitle="'Антыфона (vesperAntMag)'" />
                        <TwoColsField :dte="dte" :fieldName="'vesperInter'" :fieldTitle="'Просьбы (vesperInter)'" />
                        <TwoColsField :dte="dte" :fieldName="'vesperPr'" :fieldTitle="'Малітва (vesperPr)'" />
                    </v-row>                    

                    <v-card-actions>
                        <v-spacer></v-spacer>
                        <v-btn @click="updateItem()" color="primary">
                            Абнавіць
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-col>
        </v-row>
        <v-divider></v-divider>
        <v-row>
            <v-col>
                <v-card flat>
                    <v-card-title>
                        Камплета
                    </v-card-title>

                    <v-row>
                        <TwoColsField :dte="dte" :fieldName="'compHymn'" :fieldTitle="'Гімн'" />
                        <TwoColsField :dte="dte" :fieldName="'compAnt1'" :fieldTitle="'Антыфона 1 (compAnt1)'" />
                        <TwoColsField :dte="dte" :fieldName="'compPs1'" :fieldTitle="'Пальм 1 (compPs1)'" />

                        <TwoColsField :dte="dte" :fieldName="'compAnt2'" :fieldTitle="'Антыфона 2 (compAnt2)'" />
                        <TwoColsField :dte="dte" :fieldName="'compPs2'" :fieldTitle="'Пальм 2 (compPs2)'" />

                        <TwoColsField :dte="dte" :fieldName="'compR'" :fieldTitle="'Чытанне (compR)'" />
                        <TwoColsField :dte="dte" :fieldName="'compResp'" :fieldTitle="'Рэспансорый (compResp)'" />
                        <TwoColsField :dte="dte" :fieldName="'compAntS'" :fieldTitle="'Антыфона (compAntS)'" />
                        <TwoColsField :dte="dte" :fieldName="'compPr'" :fieldTitle="'Малітва (compPr)'" />
                        <TwoColsField :dte="dte" :fieldName="'compAntM'" :fieldTitle="'Антыфона Марыі (compAntM)'" />
                    </v-row>                    

                    <v-card-actions>
                        <v-spacer></v-spacer>
                        <v-btn @click="updateItem()" color="primary">
                            Абнавіць
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-col>
        </v-row>
      

        
    </v-container>
</template>

<script setup>
import TwoColsField from './TwoColsField.vue'
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



function checkEditor(field) {
    return field && field.length > 50
}

function getTitle(field) {
    if (!field)
        return "---"

    return field.length > 30 ? "" : field;
}

function updateItem() {
    dayStore.updateDay(dte.value)
}




</script>
