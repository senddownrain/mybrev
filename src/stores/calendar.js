import { defineStore } from 'pinia';
import { ref, computed  } from 'vue';
import { collection, query, where, getDocs, getFirestore } from 'firebase/firestore';
import moment from '@/utils/moment-be';
import { logger } from '@/utils/logger';
import { retryFirestore } from '@/utils/retry';

export const useCalendarStore = defineStore('calendar', () => {
    const db = getFirestore();

    const yearOptionsCache = ref({});
    const dynamicDatesCache = ref({});

    async function getYearOptions(year) {
        if (yearOptionsCache.value[year]) {
            return yearOptionsCache.value[year];
        }
        
        logger.log(`[CalendarStore] Пошук наладаў для ${year} года ў Firestore...`);
        const q = query(collection(db, 'yearOptions'), where('year', '==', Number(year)));
        
        const querySnapshot = await retryFirestore(() => getDocs(q));
        
        if (querySnapshot.empty) {
            logger.error(`[CalendarStore] Налады для года ${year} не знойдзены!`);
            return null;
        }
        
        const options = querySnapshot.docs[0].data();
        yearOptionsCache.value[year] = options;
        logger.log(`[CalendarStore] Налады для года ${year} паспяхова загружаны.`);
        return options;
    }

    async function getDynamicDates(year) {
    logger.log(`[CalendarStore] Вычисление динамических дат для ${year} года...`);
    
    await getYearOptions(year); 
    const opts = yearOptionsCache.value[year];
    if (!opts) {
        logger.error(`[CalendarStore] Не удалось получить опции для ${year} года. Вычисление дат прервано.`);
        return {};
    }
    const dates = {};
    const getMoment = (isoDateStr) => moment(isoDateStr, 'YYYY-MM-DD');
    const easter = getMoment(opts.easterSunday);
    const pentecost = getMoment(opts.pentecost);
    const firstAdventSunday = getMoment(opts.firstAdventSunday);
    // Расчет дат до Пасхи
    dates.ashWednesday = getMoment(opts.ashWednesday);
    dates.palmSunday = easter.clone().subtract(7, 'days'); // ✅ ВЕРБНОЕ ВОСКРЕСЕНЬЕ
    // Расчет дат после Пасхи
    dates.easterSunday = easter;
    dates.pentecost = pentecost;
    dates.ascension = pentecost.clone().subtract(7, 'days'); // ✅ ВОЗНЕСЕНИЕ (7-е воскресенье Пасхи)
    
    const holyTrinitySunday = pentecost.clone().add(7, 'days');
    dates.holyTrinity = holyTrinitySunday;
    dates.corpusChristi = holyTrinitySunday.clone().add(4, 'days'); // ✅ ТЕЛО И КРОВЬ ХРИСТА (четверг после Троицы)
    // Расчет дат в "обычное время"
    dates.holyFamily = getMoment(opts.holyFamily);
    dates.baptismOfLord = getMoment(opts.baptismOfLord);
    dates.christKing = firstAdventSunday.clone().subtract(7, 'days');
    const sacredHeartOfJesus = pentecost.clone().add(19, 'days');
    dates.sacredHeartOfJesus = sacredHeartOfJesus;
    dates.immaculateHeartOfMary = sacredHeartOfJesus.clone().add(1, 'day'); // Следующий день
    dates.christTheHighPriest = pentecost.clone().subtract(11, 'days'); // Пн после Пятидесятницы - уточнить если нужно
    dynamicDatesCache.value[year] = dates;
    logger.log(`[CalendarStore] Динамические даты для ${year} года вычислены.`);
    return dates;
}

    // --- Функция для получения всех доступных годов из Firestore ---
    async function getAvailableYears() {
        try {
            const q = query(collection(db, 'yearOptions'));
            const snapshot = await retryFirestore(() => getDocs(q));
            const years = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.year) {
                    years.push(data.year);
                }
            });
            return years.sort((a, b) => b - a); // Сортируем по убыванию (новые первыми)
        } catch (error) {
            logger.error('[CalendarStore] Памылка пры атрыманні спісу гадоў:', error);
            return [];
        }
    }

    return { 
        getYearOptions, 
        getDynamicDates,
        getAvailableYears,
        optionsForYear: (year) => computed(() => yearOptionsCache.value[year]),
        dynamicDatesForYear: (year) => computed(() => dynamicDatesCache.value[year])
    };
});