<template>
    <v-container fluid>
        <v-row dense>
            <v-col cols="12" sm="6">
                <v-list>
                    <v-list-item-group>
                        <v-list-item  v-for="(item, index) in transformedArray" :key="index" class="clickable-item"  @click="mapDay(item)">
                            <v-list-item-content>
                                <v-list-item-title>{{ item.Bridge_DayId }} {{ getFeastOrPeriod(item) }}</v-list-item-title>
                                <v-list-item-subtitle>{{ item.Bridge_DayName }}</v-list-item-subtitle>
                                <v-list-item-subtitle>{{ item.Day }}</v-list-item-subtitle>
                            </v-list-item-content>
                        </v-list-item>
                    </v-list-item-group>
                </v-list>
            </v-col>

        </v-row>

        <v-dialog v-model="dialog" fullscreen :scrim="false" transition="dialog-bottom-transition">
            <v-card>
                <v-toolbar dark color="primary">
                    <v-btn icon dark @click="dialog = false">
                        <v-icon>mdi-close</v-icon>
                    </v-btn>
                    <v-toolbar-title> Map day</v-toolbar-title>
                    <v-spacer></v-spacer>
                    <v-toolbar-items>

                        <v-btn variant="text" @click="save()">
                            Сохранить
                        </v-btn>
                        <v-btn variant="text" @click="dialog = false">
                            Отменить
                        </v-btn>
                    </v-toolbar-items>
                </v-toolbar>
                <v-card-text>


                    <v-col v-for="n in Object.getOwnPropertyNames(mappingDay).sort()" :key="n" cols="12">
                        <v-card :title="`${n}`">
                            <v-card-text>
                                <div v-if="!checkEditor(mappingDay[n])">
                                    <v-text-field v-model="mappingDay[n]"></v-text-field>
                                </div>

                                <v-row v-if="checkEditor(mappingDay[n])">
                                    <v-col cols="6">
                                        <v-textarea auto-grow variant="filled" v-model="mappingDay[n]"></v-textarea>
                                    </v-col>
                                    <v-col cols="6">
                                        <div v-html="mappingDay[n]"></div>
                                    </v-col>
                                </v-row>
                            </v-card-text>

                        </v-card>
                    </v-col>
                    <v-col cols="12">
                        {{ mappingDay }}
                    </v-col>
                </v-card-text>

            </v-card>
        </v-dialog>


        <v-dialog v-model="dialogAdd" fullscreen :scrim="false" transition="dialog-bottom-transition">
            <v-card>
                <v-toolbar dark color="primary">
                    <v-btn icon dark @click="dialogAdd = false">
                        <v-icon>mdi-close</v-icon>
                    </v-btn>
                    <v-toolbar-title> Add Note</v-toolbar-title>
                    <v-spacer></v-spacer>
                    <v-toolbar-items>

                        <v-btn variant="text" @click="add(addItem)">
                            Сохранить
                        </v-btn>
                        <v-btn variant="text" @click="dialogAdd = false">
                            Отменить
                        </v-btn>
                    </v-toolbar-items>
                </v-toolbar>
                <v-card-text>
                    <v-row>
                        <v-col cols="12" sm="6" class="mb-2">
                            <v-text-field v-model="addItem.title" hint="Назва уводзін" label="Назва"></v-text-field>
                        </v-col>
                        <v-col cols="12" sm="12" class="mb-5">
                            <quill-editor theme="snow" toolbar="minimal" v-model:content="addItem.text"
                                contentType="html" />
                        </v-col>
                    </v-row>


                </v-card-text>

            </v-card>
        </v-dialog>


    </v-container>
</template>


<script setup>
import tables from '@/json'

import { ref } from 'vue'

import { useCollection, useFirestore } from 'vuefire'

import { collection, orderBy, query, doc, updateDoc, getDocs, setDoc, addDoc } from 'firebase/firestore'


const db = useFirestore()

//console.log(tables.Bridge_table.map(a => a.Bridge_DayId));

const bridgeDaysModel = ref(tables.Bridge_table.map(a => a.Bridge_DayId));

// Функция для преобразования строки даты в объект Date
function parseDate(dateString) {
    const [day, month, year] = dateString.split('.').map(Number);
    return new Date(year, month - 1, day); // month - 1, т.к. месяцы начинаются с 0
}

// Преобразование и сортировка массива
const transformedArray = tables.Bridge_table.map(item => ({
    Bridge_DayId: item.Bridge_DayId,
    Bridge_DayName: item.Bridge_DayName,
    Day: item.Day,
    Feast: item.Svyata,
    date: parseDate(item.Bridge_DayId) // добавляем дату для сортировки
})).sort((a, b) =>  b.date - a.date) // сортируем по дате

//refactorDB();

function refactorDB() {
    const readingFixArray = tables.Bridge_table.map(item => ({
        Bridge_DayId: item.Bridge_DayId,
        Bridge_DayName: item.Bridge_DayName,
        Day: item.Day,
        Feast: item.Svyata,
        weekDay: item.Bridge_DayName,
        date: parseDate(item.Bridge_DayId), // добавляем дату для сортировки
        officeOfReadingsVers: getTableField("GCH_Versh", item["GCH_Versh"], "GCH_Versh_Text"),
    })).sort((a, b) => b.date - a.date); // сортируем по дате

    const ordinaryVersArray = readingFixArray
        .filter(item => item.Day.includes('звычай')) // Фильтруем по ключевой фразе
        .reduce((accumulator, current) => {
            const isDuplicate = accumulator.find(item => item.Day === current.Day && item.weekDay === current.weekDay);
            if (!isDuplicate) {
                accumulator.push({ date: current.date, Day: current.Day, weekDay: current.weekDay, officeOfReadingsVers: current.officeOfReadingsVers });
            }
            return accumulator;
        }, []);

    console.log(`unique elems ${ordinaryVersArray.length}`);

    const daysCollectionRef = collection(db, 'days');

    // Получение документов из Firestore и обновление их по данным из uniqueDays
    async function updateFirestoreDays(uniqueDays) {
        try {
            const querySnapshot = await getDocs(query(daysCollectionRef, orderBy('_weekNum')));
            const batch = [];

            // Проходим по каждому документу из Firestore
            querySnapshot.forEach(docSnapshot => {
                const docData = docSnapshot.data();
                const matchingUniqueDay = uniqueDays.find(uniqueDay => uniqueDay.Day === docData._dayName && uniqueDay.weekDay === docData._weekDay);

                // Если найден соответствующий uniqueDay, обновляем officeOfReadingsVers
                if (matchingUniqueDay) {
                    const docRef = doc(db, 'days', docSnapshot.id);
                    const updateOperation = updateDoc(docRef, {
                        officeOfReadingsVers: matchingUniqueDay.officeOfReadingsVers
                    });
                    // console.log(`${docData._dayName}-${docData._weekDay} updated`)
                    batch.push(updateOperation);
                }
            });

            console.log(`to update ${batch.length}`);
            // Выполняем все обновления
            await Promise.all(batch);

            console.log("Обновление завершено.");
        } catch (error) {
            console.error("Ошибка при обновлении Firestore:", error);
        }
    }

    // Вызов функции
    updateFirestoreDays(ordinaryVersArray);
}

function getFeastOrPeriod(a) {
  // Проверяем, существует ли объект и его свойства
  if (a && typeof a.Feast === 'string' && typeof a.Day !== 'undefined') {
    // Приводим свойство Feast к нижнему регистру и проверяем наличие слова "псалтыра"
    if (a.Feast.toLowerCase().includes("псалтыра")) {
      return a.Day; // Возвращаем значение свойства Day
    }
    return a.Feast; // Возвращаем значение свойства Feast
  }
  throw new Error("Неверный объект"); // Обработка ошибки, если объект не валиден
}


const selectedDay = ref(bridgeDaysModel.value[0]);
const selectedItem = ref({});

const loadingDay = ref("");
function loadDay() {
    selectedItem.value = tables.Bridge_table.find(x => x?.Bridge_DayId === loadingDay.value);
    
    //console.log(tables.Bridge_table.map(a => a.Bridge_DayId))
    // console.log(tables.Bridge_table.filter(x => x?.Day == "ХІІ звычайная нядзеля" && x?.Bridge_DayName == "Пятніца"))
}

const mappingDay = ref({})

function checkEditor(field) {
    return field && field.length > 100
}

function mapDay(item) {

    
    let dbItem = tables.Bridge_table.find(x => x?.Bridge_DayId === item.Bridge_DayId);
    
    dialog.value = true
    let b = dbItem;
    let day = {
        _dayOfWeek: "", // 1 - sunday, ...
        _periodType: "", // pasha, ordinary, advent
        _periodWeekNumber: "",
        _date: "", // date of feast
        _feast: "", // easter, christmas, ascension, pentocost, christthehighpriest
        _psalmWeek: b["Svyata"], // week of psalms


        _dayName: b["Day"],
        _weekDay: b["Bridge_DayName"],
        _weekNum: b["Bridge_Week"],
        _feastName: b["Svyata"] && b["Svyata"].toLowerCase().includes("псалтыра") ? "" : b["Svyata"],
        _feastType: b["Uspamin"],
        allowedAlleluia: b["Alleluia"] == "1",

        invitatoriumAnt: getTableField("Zakl_Ant", b["Zakl_Ant"], "Zakl_Ant_Text"),
        invitatoriumPs1: getTableField("Zakl_PS", b["Zakl_PS"], "Zakl_PS_Text1"),
        invitatoriumPs2: getTableField("Zakl_PS", b["Zakl_PS"], "Zakl_PS_Text2"),
        invitatoriumPs3: getTableField("Zakl_PS", b["Zakl_PS"], "Zakl_PS_Text3"),
        invitatoriumPs4: getTableField("Zakl_PS", b["Zakl_PS"], "Zakl_PS_Text4"),
        invitatoriumPs5: getTableField("Zakl_PS", b["Zakl_PS"], "Zakl_PS_Text5"),
        invitatoriumPs6: getTableField("Zakl_PS", b["Zakl_PS"], "Zakl_PS_Text6"),

        feastComment: getTableField("Svyat", b["Svyat"], "Svyat_Text"),

        officeOfReadingsHymn: getTableField("GCH_Gimn", b["GCH_Gimn"], "GCH_Gimn_Text"),

        officeOfReadingsAnt1: getTableField("GCH_Ant", b["GCH_Ant"], "GCH_Ant_Text1"),
        officeOfReadingsAnt2: getTableField("GCH_Ant", b["GCH_Ant"], "GCH_Ant_Text2"),
        officeOfReadingsAnt3: getTableField("GCH_Ant", b["GCH_Ant"], "GCH_Ant_Text3"),

        officeOfReadingsPs1: getTableField("GCH_PS", b["GCH_PS"], "GCH_PS_Text1"),
        officeOfReadingsPs2: getTableField("GCH_PS", b["GCH_PS"], "GCH_PS_Text2"),
        officeOfReadingsPs3: getTableField("GCH_PS", b["GCH_PS"], "GCH_PS_Text3"),
        officeOfReadingsVers: getTableField("GCH_Versh", b["GCH_Versh"], "GCH_Versh_Text"),

        officeOfReadingsR1: getTableField("GCH_CH_1", b["GCH_CH_1"], "GCH_CH_1_Text"),
        officeOfReadingsR2: getTableField("GCH_CH_2", b["GCH_CH_2"], "GCH_CH_2_Text"),

        officeOfReadingsTeDeum: b["GCH_Tabe"] == "1",
        officeOfReadingsPr: getTableField("GCH_Mal", b["GCH_Mal"], "GCH_Mal_Text"),

        laudesHymn: getTableField("UTR_Gimn", b["UTR_Gimn"], "UTR_Gimn_Text"),
        laudesAnt1: getTableField("UTR_Ant", b["UTR_Ant"], "UTR_Ant_Text1"),
        laudesAnt2: getTableField("UTR_Ant", b["UTR_Ant"], "UTR_Ant_Text2"),
        laudesAnt3: getTableField("UTR_Ant", b["UTR_Ant"], "UTR_Ant_Text3"),
        laudesPs1: getTableField("UTR_PS", b["UTR_PS"], "UTR_PS_Text1"),
        laudesPs2: getTableField("UTR_PS", b["UTR_PS"], "UTR_PS_Text2"),
        laudesPs3: getTableField("UTR_PS", b["UTR_PS"], "UTR_PS_Text3"),
        laudesR: getTableField("UTR_Chyt", b["UTR_Chyt"], "UTR_Chyt_Text"),
        laudesAntBen: getTableField("UTR_Ant_Zakh", b["UTR_Ant_Zakh"], "UTR_Ant_Zakh_Text"),
        laudesInter: getTableField("UTR_Prosby", b["UTR_Prosby"], "UTR_Prosby_Text"),
        laudesPr: getTableField("UTR_Mal", b["UTR_Mal"], "UTR_Mal_Text"),

        sext1Hymn: getTableField("MPD_Gimn_1", b["MPD_Gimn_1"], "MPD_Gimn_1_Text"),
        sext1Ant1: getTableField("MPD_Ant_1", b["MPD_Ant_1"], "MPD_Ant_1_Text1"),
        sext1Ant2: getTableField("MPD_Ant_1", b["MPD_Ant_1"], "MPD_Ant_1_Text2"),
        sext1Ant3: getTableField("MPD_Ant_1", b["MPD_Ant_1"], "MPD_Ant_1_Text3"),
        sext1Ps1: getTableField("MPD_PS_1", b["MPD_PS_1"], "MPD_PS_1_Text1"),
        sext1Ps2: getTableField("MPD_PS_1", b["MPD_PS_1"], "MPD_PS_1_Text2"),
        sext1Ps3: getTableField("MPD_PS_1", b["MPD_PS_1"], "MPD_PS_1_Text3"),
        sext1R: getTableField("MPD_Chyt_1", b["MPD_Chyt_1"], "MPD_Chyt_1_Text"),
        sext1Pr: getTableField("MPD_Mal_1", b["MPD_Mal_1"], "MPD_Mal_1_Text"),

        sext2Hymn: getTableField("MPD_Gimn_2", b["MPD_Gimn_2"], "MPD_Gimn_2_Text"),
        sext2Ant1: getTableField("MPD_Ant_2", b["MPD_Ant_2"], "MPD_Ant_2_Text"),
        sext2Ant2: getTableField("MPD_Ant_2", b["MPD_Ant_2"], "MPD_Ant_2_Text2"),
        sext2Ant3: getTableField("MPD_Ant_2", b["MPD_Ant_2"], "MPD_Ant_2_Text3"),
        sext2Ps1: getTableField("MPD_PS_2", b["MPD_PS_2"], "MPD_PS_2_Text1"),
        sext2Ps2: getTableField("MPD_PS_2", b["MPD_PS_2"], "MPD_PS_2_Text2"),
        sext2Ps3: getTableField("MPD_PS_2", b["MPD_PS_2"], "MPD_PS_2_Text3"),
        sext2R: getTableField("MPD_Chyt_2", b["MPD_Chyt_2"], "MPD_Chyt_2_Text"),
        sext2Pr: getTableField("MPD_Mal_2", b["MPD_Mal_2"], "MPD_Mal_2_Text"),

        sext3Hymn: getTableField("MPD_Gimn_3", b["MPD_Gimn_3"], "MPD_Gimn_3_Text"),
        sext3Ant1: getTableField("MPD_Ant_3", b["MPD_Ant_3"], "MPD_Ant_3_Text"),
        sext3Ant2: getTableField("MPD_Ant_3", b["MPD_Ant_3"], "MPD_Ant_3_Text2"),
        sext3Ant3: getTableField("MPD_Ant_3", b["MPD_Ant_3"], "MPD_Ant_3_Text3"),
        sext3Ps1: getTableField("MPD_PS_3", b["MPD_PS_3"], "MPD_PS_3_Text1"),
        sext3Ps2: getTableField("MPD_PS_3", b["MPD_PS_3"], "MPD_PS_3_Text2"),
        sext3Ps3: getTableField("MPD_PS_3", b["MPD_PS_3"], "MPD_PS_3_Text3"),
        sext3R: getTableField("MPD_Chyt_3", b["MPD_Chyt_3"], "MPD_Chyt_3_Text"),
        sext3Pr: getTableField("MPD_Mal_3", b["MPD_Mal_3"], "MPD_Mal_3_Text"),

        vesperHymn: getTableField("NESH_Gimn", b["NESH_Gimn"], "NESH_Gimn_Text"),
        vesperAnt1: getTableField("NESH_Ant", b["NESH_Ant"], "NESH_Ant_Text1"),
        vesperAnt2: getTableField("NESH_Ant", b["NESH_Ant"], "NESH_Ant_Text2"),
        vesperAnt3: getTableField("NESH_Ant", b["NESH_Ant"], "NESH_Ant_Text3"),
        vesperPs1: getTableField("NESH_PS", b["NESH_PS"], "NESH_PS_Text1"),
        vesperPs2: getTableField("NESH_PS", b["NESH_PS"], "NESH_PS_Text2"),
        vesperPs3: getTableField("NESH_PS", b["NESH_PS"], "NESH_PS_Text3"),
        vesperR: getTableField("NESH_Chyt", b["NESH_Chyt"], "NESH_Chyt_Text"),
        vesperAntMag: getTableField("NESH_Ant_M", b["NESH_Ant_M"], "NESH_Ant_M_Text"),
        vesperInter: getTableField("NESH_Prosby", b["NESH_Prosby"], "NESH_Prosby_Text"),
        vesperPr: getTableField("NESH_Mal", b["NESH_Mal"], "NESH_Mal_Text"),

        compHymn: getTableField("KAMP_Gimn", b["KAMP_Gimn"], "KAMP_Gimn_Text"),
        compAnt1: getTableField("KAMP_Ant", b["KAMP_Ant"], "KAMP_Ant_Text1"),
        compAnt2: getTableField("KAMP_Ant", b["KAMP_Ant"], "KAMP_Ant_Text2"),

        compPs1: getTableField("KAMP_PS", b["KAMP_PS"], "KAMP_PS_Text1"),
        compPs2: getTableField("KAMP_PS", b["KAMP_PS"], "KAMP_PS_Text2"),

        compR: getTableField("KAMP_Chyt", b["KAMP_Chyt"], "KAMP_Chyt_Text"),
        compResp: getTableField("KAMP_Resp", b["KAMP_Resp"], "KAMP_Resp_Text"),
        compAntS: getTableField("KAMP_Ant_S", b["KAMP_Ant_S"], "KAMP_Ant_S_Text"),
        compPr: getTableField("KAMP_Mal", b["KAMP_Mal"], "KAMP_Mal_Text"),
        compAntM: getTableField("KAMP_Ant_M", b["KAMP_Ant_M"], "KAMP_Ant_M_Text"),



    }
    mappingDay.value = day;
}


async function save() {
    dialog.value = false

    await addDoc(collection(db, "days"), mappingDay.value)
    // await setDoc(doc(db, "days", mappingDay.value.id), mappingDay.value);
    // item.text = tmp.value.text
    // const noteRef = doc(db, "notes", item.id);

    // await updateDoc(noteRef, {
    //     text: tmp.value.text
    // });
}

function getTableField(table, id, field) {
    let tableName = table + "_table";

    if (tables[tableName]) {

        let item = tables[tableName].find(x => x[table + "_ID"] == id)
        //console.log(item)
        if (item && item[field]) {
            return item[field]
        }
    }
    return ""
}

function getTableFieldUtr(table, id, field, idName) {
    let tableName = table + "_table";

    if (tables[tableName]) {

        let item = tables[tableName].find(x => x[idName] == id)
        //console.log(item)
        if (item && item[field]) {
            return item[field]
        }
    }
    return ""
}

function findItem(id) {
    let item = tables.Bridge_table.find(x => x.Bridge_DayId == id);
    selectedItem.value = item;

    return item;
}

function getProp(name, val) {
    let tbl = tables[name + "_table"]
    if (tbl) {
        let itemID = name + "_ID"
        if (tbl[0][itemID]) {

            let item = tables[name + "_table"].find(x => x[itemID] == val);
            return JSON.stringify(item);
        }
        else {
            return "no id"
        }

    }
    else {
        return 'not a table'
    }
}

function getIdProp(obj) {
    var props = Object.getOwnPropertyNames(obj);
    var id = props.find(x => x.indexOf("ID") != -1);

    return id;
}


const dialog = ref(false)

const dialogAdd = ref(false)
const addItem = ref({
    text: ""
})

const current = ref({})
const tmp = ref({})
const editMode = ref(false)


function strippedHtml(value) {
    let regex = /(<([^>]+)>)/ig;
    return value.replace(regex, "");
}

function select(item) {
    current.value = item;
    dialog.value = true
}

function edit(item) {
    tmp.value = Object.assign({}, item);
    editMode.value = true
}


function showAdd() {
    addItem.value = {
        text: ""
    }
    dialogAdd.value = true
}

async function add(item) {

    dialogAdd.value = false
    await addDoc(collection(db, "notes"), item)

    addItem.value = ref({
        text: ""
    })
}

</script>


<style scoped>
.dialog-bottom-transition-enter-active,
.dialog-bottom-transition-leave-active {
    transition: transform .2s ease-in-out;
}

.clickable-item {
    margin: 5px;
  cursor: pointer; /* Указатель мыши при наведении */
  background-color: #f5f5f5; /* Светлый фон для выделения */
  border-radius: 4px; /* Закругленные углы */
  transition: background-color 0.2s; /* Плавный переход цвета фона */
}

.clickable-item:hover {
  background-color: #e0e0e0; /* Цвет фона на наведение */
}

</style>