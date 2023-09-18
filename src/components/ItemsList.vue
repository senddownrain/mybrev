<template>
    <v-container fluid>
        <v-row dense>
            <v-col cols="12">
                <v-card>
                    <v-toolbar @click="showCalendar()" :title="dayToDisplay" style="cursor: pointer;"></v-toolbar>

                    <v-list v-if="days.length > 0" density="compact">
                        <v-list-item v-for="(item, i) in days" :key="i" :value="item" active-color="primary"
                            :to="`/day/${dayToURL}/ora/${item.id}`">
                            <v-list-item-title>
                                <span v-html="item._dayName == '' ? item._feastName : item._dayName"></span>
                                 - {{ selectedDay.format("dddd") }}
                            </v-list-item-title>

                            <template v-slot:append>
                                <v-icon>mdi-chevron-right</v-icon>
                            </template>
                        </v-list-item>
                    </v-list>
                    <v-sheet v-else-if="loading" height="20" class="mb-5 mt-7 mr-7" >
                        <v-progress-linear class="ma-3 pa-1" indeterminate color="#2F4475"></v-progress-linear>
                    </v-sheet>

                    <v-alert class="my-3 mx-3" v-else type="info" color="#2F4475" variant="tonal">Дзень адсутнічае. Звярніцеся за падтрымкай</v-alert>


                    <v-dialog v-model="dialog" width="auto">
                        <v-card>
                            <v-card-text>
                                <VDatePicker v-model="picker" mode="date" />
                            </v-card-text>
                            <v-card-actions>
                                <v-btn variant="text" @click="dialog = false">Адмена</v-btn>
                                <v-btn variant="text" @click="loadDay()">Выбраць</v-btn>
                            </v-card-actions>
                        </v-card>
                    </v-dialog>

                    <v-snackbar v-model="snackbar" timeout="3000" color="error">
                        {{ snackText }}
                    </v-snackbar>
                </v-card>
            </v-col>

        </v-row>
    </v-container>
</template>

<script>

import moment from 'moment'
import 'moment/dist/locale/be'

import { ref, onMounted, reactive, computed, watch } from 'vue';
import { useCollection, useFirestore } from 'vuefire'
import { collection, orderBy, query, doc, getDoc, getDocs, where, updateDoc, setDoc } from 'firebase/firestore'
import { useRoute } from 'vue-router'
import router from '@/router';

export default {
    setup() {

        const snackText = ref("");
        const snackbar = ref(false)

        function showError(text) {
            snackText.value = text
            snackbar.value = true
        }


        const db = useFirestore()
        const route = useRoute()

        watch(
            () => route.params.day,
            async newDay => {
                selectedDay.value = checkTargetDay()
                await fetchItems();
            }
        )

        function checkTargetDay() {
            var targetDay = moment()
            if (route.params.day) {
                var tmp = moment(route.params.day, "DD-MM-YYYY")
                if (tmp.isValid()) {
                    targetDay = tmp
                } else {
                    showError(`Error on parsing Day param ${route.params.day}`)
                    console.log("!!Error on parsing day param %s", route.params.day)
                }
            }
            return targetDay;
        }


        const selectedDay = ref(checkTargetDay());
        const picker = ref(Date.now());

        const dialog = ref(false);

        const days = ref([]);
        const loading = ref(false);

        const yearOptions = ref({});

        const dayToDisplay = computed(() => { return selectedDay.value ? selectedDay.value.format("LL") : "" });

        const dayToURL = computed(() => { return selectedDay.value ? selectedDay.value.format("DD-MM-YYYY") : "" });


        const fetchItems = async () => {

            loading.value = true;
            yearOptions.value = await getYearOptions()
            days.value = []
            await checkFeast(selectedDay.value.date(), selectedDay.value.month() + 1)
            await checkPeriods(yearOptions.value, selectedDay.value)
            await checkDynamicFeasts(yearOptions.value, selectedDay.value)

            loading.value = false;
        }

        const getYearOptions = async () => {
            const currentYear = moment().year();
            const docRef = doc(db, "yearOptions", `${currentYear}`);
            const docSnap = await getDoc(docRef);
            return docSnap.data();
        };

        async function checkDynamicFeasts(opts, current) {

            // calculate all of these
            await getDayByFeast(opts, "heartofjesus", current);
            await getDayByFeast(opts, "heartofmary", current);
            await getDayByFeast(opts, "christthehighpriest", current);
            await getDayByFeast(opts, "trinity", current);
            await getDayByFeast(opts, "buptismofthelord", current);
            await getDayByFeast(opts, "christking", current);

            await getDayByFeast(opts, "ashWednesday", current);
            await getDayByFeast(opts, "palmSunday", current);
            await getDayByFeast(opts, "easterSunday", current);
            await getDayByFeast(opts, "ascension", current);
            await getDayByFeast(opts, "pentecost", current);
            await getDayByFeast(opts, "corpuschristi", current); 
        }

        async function checkPeriods(opts, day) {
            await checkAdvent(opts, day);
            await checkChristmasTime(opts, day);
            await checkLent(opts, day);
            await checkHolyWeek(opts, day);
            await checkEaster(opts, day);
            await checkOrdinary(opts, day)
        }

        async function getDayByFeast(opts, name, current) {
            let feast = getMomentDay(opts[name]);
            if (feast) {
                if (current.diff(feast, "days") == 0) {
                    logDay(name);

                    const q = query(collection(db, "days"), where("_feast", "==", `${name}`));

                    const querySnapshot = await getDocs(q);
                    querySnapshot.forEach((doc) => {
                        days.value.push({
                            id: doc.id,
                            ...doc.data()
                        })
                    });
                }
            }

        }


        async function checkHolyWeek(opts, day){
            
        }

        async function checkFeast(day, month) {

            const q = query(collection(db, "days"), where("_date", "==", `${day}.${month}`));
            console.log(`${day}.${month}`)
            const querySnapshot = await getDocs(q);
            querySnapshot.forEach((doc) => {

                days.value.push({
                    id: doc.id,
                    ...doc.data()
                })
                logDay(doc.data()._feastName)
            });

        }

        async function checkAdvent(opts, current) {
            const period = "advent"
            const fa = getMomentDay(opts.firstAdventSunday, opts.year);
            const christmas = moment(`${12}.${25}.${opts.year}`);

            if (current.diff(fa, "days") >= 0 && current.diff(christmas, "days") < 0) {
                logDay("advent time")
                const diff = current.diff(fa, "days");
                // 1 - sunday
                // 7 - saturday
                const dayOfWeek = diff % 7 + 1
                const periodWeek = Math.floor(diff / 7) + 1

                await getItemsForPeriod(period, dayOfWeek, periodWeek);
            }
        }

        async function checkChristmasTime(opts, current) {
            // const period = "christmas"
            // const fa = getMomentDay(opts.firstAdventSunday, opts.year);
            // const christmas = moment(`${12}.${25}.${opts.year}`);

            // if (current.diff(fa, "days") >= 0 && current.diff(christmas, "days") < 0) {
            //     const diff = current.diff(fa, "days");
            //     // 1 - sunday
            //     // 7 - saturday
            //     const dayOfWeek = diff % 7 + 1
            //     const periodWeek = Math.floor(diff / 7) + 1

            //     await getItemsForPeriod(period, dayOfWeek, periodWeek);
            // }
        }

        async function checkLent(opts, current) {
            const period = "lent";
            const ash = getMomentDay(opts.ashWednesday, opts.year);
            const easter = getMomentDay(opts.easterSunday, opts.year);

            if (current.diff(ash, "days") >= 0 && current.diff(easter, "days") < 0) {
                const firstLentSunday = ash.add(4, "days");
                const lastLentSunday = easter.add(-1, "weeks");

                if (current.diff(firstLentSunday, "days") < 0) {
                    logDay('after ash')
                    await getItemsForPeriod(period, 7 + diff + 1, 0)
                } else if (current.diff(lastLentSunday, "days") > 0) {
                    logDay("todo great week")
                    // great week
                } else if (current.diff(lastLentSunday, "days") == 0) {
                    logDay("todo palm sunday")
                    // palm sunday
                } else {
                    logDay('easter time')
                    let diff = current.diff(firstLentSunday, "days");
                    // 1 - sunday
                    // 7 - saturday
                    let dayOfWeek = diff % 7 + 1
                    let periodWeek = Math.floor(diff / 7) + 1
                    await getItemsForPeriod(period, dayOfWeek, periodWeek);
                }
            }
        }

        async function checkEaster(opts, current) {
            const period = "easter"
            const easter = getMomentDay(opts.easterSunday, opts.year);
            //const ascension = getMomentDay(opts.ascension, opts.year);
            const pentecost = getMomentDay(opts.pentecost, opts.year);

            if (current.diff(easter, "days") >= 0 && current.diff(pentecost, "days") < 0) {
                logDay("easter time")

                const diff = current.diff(easter, "days");
                // 1 - sunday
                // 7 - saturday
                const dayOfWeek = diff % 7 + 1
                const periodWeek = Math.floor(diff / 7) + 1

                await getItemsForPeriod(period, dayOfWeek, periodWeek);
            }
        }

        async function checkOrdinary(opts, current) {
            const period = "ordinary"
            const ash = getMomentDay(opts.ashWednesday, opts.year);
            //const ascension = getMomentDay(opts.ascension, opts.year);
            const pentecost = getMomentDay(opts.pentecost, opts.year);
            const fa = getMomentDay(opts.firstAdventSunday, opts.year);
            const weeksBefore = parseInt(opts.ordintaryWeeks1) - 1;
            const fo = ash.clone().add(-2, "days").add(-weeksBefore, "weeks");

            if (current.diff(fo, "days") >= 0 && current.diff(ash, "days") < 0) {
                logDay("ordinary before ash")
                let diff = current.diff(fo, "days");
                // 1 - sunday
                // 7 - saturday
                let dayOfWeek = diff % 7 + 1
                let periodWeek = Math.floor(diff / 7) + 1

                await getItemsForPeriod(period, dayOfWeek, periodWeek);
            } else if (current.diff(pentecost, "days") > 0 && current.diff(fa, "days") < 0) {
                let diff = current.diff(pentecost, "days");
                // 1 - sunday
                // 7 - saturday
                let startWeek = parseInt(opts.ordintaryWeeks2);

                let dayOfWeek = diff % 7 + 1
                let periodWeek = Math.floor(diff / 7) + startWeek

                logDay(`ordinary after pentocost. week - ${periodWeek}. day - ${dayOfWeek}`)

                await getItemsForPeriod(period, dayOfWeek, periodWeek);
            }
        }

        async function getItemsForPeriod(type, day, week) {
            const q = query(collection(db, "days"), where("_periodType", "==", type), where("_dayOfWeek", "==", `${day}`), where("_periodWeekNumber", "==", `${week}`));

            const querySnapshot = await getDocs(q);
            querySnapshot.forEach((doc) => {
                console.log(doc.data())
                days.value.push({
                    id: doc.id,
                    ...doc.data()
                })
            });
        }

        function getMomentDay(val, year) {
            const month = val?.split('.')[1]
            const day = val?.split('.')[0]
            return moment(`${month}.${day}.${year}`);
        }

        function logDay(val) {
            console.log(`selected day: ${val}`)
        }

        function showCalendar() {
            picker.value = selectedDay.value.toDate()
            dialog.value = true
        }

        function loadDay() {
            dialog.value = false
            router.push(`/day/${moment(picker.value).format("DD-MM-YYYY")}`)
        }

        onMounted(fetchItems);
        return {
            days,
            loading,
            selectedDay,
            dayToDisplay,
            dialog,
            picker,
            snackText,
            snackbar,
            dayToURL,

            showCalendar,
            loadDay
        };

    }


}


</script>