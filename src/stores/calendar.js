import { defineStore } from 'pinia';
import { ref, computed  } from 'vue'; // Убедимся, что импорт правильный
import { collection, query, where, getDocs, getFirestore } from 'firebase/firestore';
import moment from 'moment';
import 'moment/dist/locale/be';

export const useCalendarStore = defineStore('calendar', () => {
    const db = getFirestore();
    moment.locale('be');

    const yearOptionsCache = ref({});
    const dynamicDatesCache = ref({});
    
    // --- ✅ 1. ИЗМЕНЕНИЕ: getYearOptions теперь ищет по полю, а не по ID ---
    async function getYearOptions(year) {
        if (yearOptionsCache.value[year]) {
            return yearOptionsCache.value[year];
        }
        
        console.log(`[CalendarStore] Пошук наладаў для ${year} года ў Firestore...`);
        const q = query(collection(db, 'yearOptions'), where('year', '==', Number(year)));
        
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            console.error(`[CalendarStore] Налады для года ${year} не знойдзены!`);
            return null;
        }
        
        const options = querySnapshot.docs[0].data();
        yearOptionsCache.value[year] = options;
        console.log(`[CalendarStore] Налады для года ${year} паспяхова загружаны.`);
        return options;
    }

    // --- ✅ 2. ИЗМЕНЕНИЕ: getDynamicDates работает с новым форматом дат ---
    async function getDynamicDates(year) {
        if (dynamicDatesCache.value[year]) {
            return dynamicDatesCache.value[year];
        }
        
        const opts = await getYearOptions(year);
        if (!opts) return {};

        // Новый, более простой способ создания moment-объектов
        const getMoment = (isoDateStr) => moment(isoDateStr, 'YYYY-MM-DD');

        const dates = {};
        const easter = getMoment(opts.easterSunday);
        const pentecost = getMoment(opts.pentecost);
        const firstAdventSunday = getMoment(opts.firstAdventSunday);

        // Расчет Святого Семейства (логика без изменений, но работает с moment)
        const christmas = moment(`${year}-12-25`, 'YYYY-MM-DD');
        const nextSunday = christmas.clone().endOf('week').add(1, 'day');
        const firstOfJanuary = christmas.clone().add(1, 'year').startOf('year');
        dates.holyFamily = nextSunday.isBefore(firstOfJanuary) ? nextSunday : moment(`${year}-12-30`, 'YYYY-MM-DD');
        
        // Расчет Крещения (логика без изменений)
        const epiphany = moment(`${year}-01-06`, 'YYYY-MM-DD');
        dates.baptismOfLord = epiphany.clone().day(7);

        // Прочие праздники
        dates.christKing = firstAdventSunday.clone().subtract(7, 'days');
        dates.sacredHeartOfJesus = easter.clone().add(68, 'days');
        dates.immaculateHeartOfMary = dates.sacredHeartOfJesus.clone().add(1, 'day');
        dates.holyTrinity = pentecost.clone().add(7, 'days');
        dates.christTheHighPriest = pentecost.clone().add(4, 'days');

        // Прямые даты из yearOptions
        dates.ashWednesday = getMoment(opts.ashWednesday);
        dates.easterSunday = easter;
        dates.ascension = getMoment(opts.ascension);
        dates.pentecost = pentecost;
        dates.corpusChristi = getMoment(opts.corpusChristi); // Ваше поле 'corpuschristi'
        dates.firstAdventSunday = firstAdventSunday;

        dynamicDatesCache.value[year] = dates;
        return dates;
    }

    return { 
        getYearOptions, 
        getDynamicDates, 
        // Геттеры для доступа из компонентов
        optionsForYear: (year) => computed(() => yearOptionsCache.value[year]),
        dynamicDatesForYear: (year) => computed(() => dynamicDatesCache.value[year])
    };
});