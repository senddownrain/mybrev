import { collection, query, where, getDocs } from 'firebase/firestore';
import { useFirestore } from 'vuefire';
import { useCalendarStore } from '@/stores/calendar';
import moment from '@/utils/moment-be';
import { db } from '@/plugins/firebase';
import { retryFirestore } from '@/utils/retry';
import { logger } from '@/utils/logger';

export function useLiturgicalDay() {
    const calendarStore = useCalendarStore();
    const daysCollection = collection(db, 'days');
    
    const feastsCache = {};

    const feastNameMap = {
        holyFamily: 'holyfamily',
        baptismOfLord: 'buptismofthelord',
        holyTrinity: 'trinity',
        christKing: 'christking',
        sacredHeartOfJesus: 'heartofjesus',
        immaculateHeartOfMary: 'heartofmary',
        christTheHighPriest: 'christthehighpriest',
        ashWednesday: 'ash',
        easterSunday: 'eastersunday',
        pentecost: 'pentecost',
        palmsSnday: 'palmsunday',
        corpusChristi: 'palmsunday',
        ascension: 'ascension'
    };

    const getMoment = (isoDateStr) => moment(isoDateStr, 'YYYY-MM-DD');

    const getItemsForPeriodQuery = (type, day, week) => {
        return query(daysCollection,
            where("_periodType", "==", type),
            where("_dayOfWeek", "==", `${day}`),
            where("_periodWeekNumber", "==", `${week}`)
        );
    };

    const getPeriodQuery = (mDate, year) => {
        const opts = calendarStore.optionsForYear(year).value;
        const nextYearOpts = calendarStore.optionsForYear(year + 1).value;
        if (!opts) return null;

        const fa = getMoment(opts.firstAdventSunday);
        const christmas = moment(`${year}-12-25`, "YYYY-MM-DD");

        // --- Advent ---
        if (mDate.isSameOrAfter(fa) && mDate.isBefore(christmas)) {
            const diff = mDate.diff(fa, "days");
            return getItemsForPeriodQuery("advent", diff % 7 + 1, Math.floor(diff / 7) + 1);
        }

        // --- Christmas Time ---
        if (nextYearOpts && mDate.isSameOrAfter(christmas)) {
            const flNext = getMoment(nextYearOpts.ordintaryStart1);
            const weeksBefore = parseInt(nextYearOpts.ordintaryWeeks1);
            const lastChristmas = flNext.clone().subtract(weeksBefore, 'weeks').subtract(2, 'days');
            if (mDate.isSameOrBefore(lastChristmas)) {
                const diff = mDate.diff(christmas, "days");
                return getItemsForPeriodQuery("christmas", diff % 7 + 1, Math.floor(diff / 7) + 1);
            }
        }

        const easter = getMoment(opts.easterSunday);
        const ash = getMoment(opts.ashWednesday);

        // --- Lent & Holy Week ---
        if (mDate.isSameOrAfter(ash) && mDate.isBefore(easter)) {
            const firstLentSunday = ash.clone().add(4, "days");
            const lastLentSunday = easter.clone().subtract(1, "week");
            const startDiff = mDate.diff(firstLentSunday, "days");
            const endDiff = mDate.diff(lastLentSunday, "days");

            if (startDiff < 0) return getItemsForPeriodQuery('lent', 7 + startDiff + 1, 0);
            if (endDiff > 0 && endDiff < 8) return getItemsForPeriodQuery('holyweek', endDiff + 1, 1);
            if (endDiff === 0) return query(daysCollection, where('_feast', '==', 'palmSunday'));
            return getItemsForPeriodQuery('lent', startDiff % 7 + 1, Math.floor(startDiff / 7) + 1);
        }

        const pentecost = getMoment(opts.pentecost);

        // --- Easter Time ---
        if (mDate.isSameOrAfter(easter) && mDate.isSameOrBefore(pentecost)) {
            const diff = mDate.diff(easter, "days");
            return getItemsForPeriodQuery("easter", diff % 7 + 1, Math.floor(diff / 7) + 1);
        }

        // --- Ordinary Time ---
        const weeksBeforeOrd = parseInt(opts.ordintaryWeeks1) - 1;
        const fo = ash.clone().subtract(3, "days").subtract(weeksBeforeOrd, "weeks");
        if (mDate.isSameOrAfter(fo) && mDate.isBefore(ash)) {
            const diff = mDate.diff(fo, "days");
            return getItemsForPeriodQuery("ordinary", diff % 7 + 1, Math.floor(diff / 7) + 1);
        }

        if (mDate.isAfter(pentecost) && mDate.isBefore(fa)) {
            const diff = mDate.diff(pentecost, "days");
            const startWeek = parseInt(opts.ordintaryWeeks2);
            return getItemsForPeriodQuery("ordinary", diff % 7 + 1, Math.floor(diff / 7) + startWeek);
        }

        return null;
    };

    /**
     * Вычисляет литургический контекст для даты без запросов к коллекции days
     * Использует только yearOptions и вычисления дат
     * @param {Date|moment.Moment|string} currentDate - Дата
     * @returns {Promise<Object>} Объект с контекстом {periodType, periodWeek, dayOfWeek, _feast}
     */
    async function computeLiturgicalContextForDate(currentDate) {
        const mDate = moment(currentDate).startOf('day');
        const year = mDate.year();

        await calendarStore.getYearOptions(year);
        await calendarStore.getYearOptions(year + 1);
        await calendarStore.getDynamicDates(year);

        const opts = calendarStore.optionsForYear(year).value;
        const nextYearOpts = calendarStore.optionsForYear(year + 1).value;
        if (!opts) {
            return {
                periodType: 'ordinary',
                periodWeek: -1,
                dayOfWeek: mDate.isoWeekday() === 7 ? 1 : mDate.isoWeekday() + 1,
                _feast: null
            };
        }

        const context = {
            periodType: 'ordinary',
            periodWeek: -1,
            dayOfWeek: mDate.isoWeekday() === 7 ? 1 : mDate.isoWeekday() + 1,
            _feast: null
        };

        const fa = getMoment(opts.firstAdventSunday);
        const christmas = moment(`${year}-12-25`, "YYYY-MM-DD");
        const easter = getMoment(opts.easterSunday);
        const ash = getMoment(opts.ashWednesday);
        const pentecost = getMoment(opts.pentecost);

        // Проверяем динамические праздники
        const dynamicDates = calendarStore.dynamicDatesForYear(year).value || {};
        for (const feastKey in feastNameMap) {
            if (dynamicDates[feastKey] && dynamicDates[feastKey].isSame(mDate, 'day')) {
                context._feast = feastNameMap[feastKey];
                break;
            }
        }

        // --- Advent ---
        if (mDate.isSameOrAfter(fa) && mDate.isBefore(christmas)) {
            const diff = mDate.diff(fa, "days");
            context.periodType = "advent";
            context.periodWeek = Math.floor(diff / 7) + 1;
            context.dayOfWeek = (diff % 7) + 1;
            return context;
        }

        // --- Christmas Time ---
        if (nextYearOpts && mDate.isSameOrAfter(christmas)) {
            const flNext = getMoment(nextYearOpts.ordintaryStart1);
            const weeksBefore = parseInt(nextYearOpts.ordintaryWeeks1);
            const lastChristmas = flNext.clone().subtract(weeksBefore, 'weeks').subtract(2, 'days');
            if (mDate.isSameOrBefore(lastChristmas)) {
                const diff = mDate.diff(christmas, "days");
                context.periodType = "christmas";
                context.periodWeek = Math.floor(diff / 7) + 1;
                context.dayOfWeek = (diff % 7) + 1;
                return context;
            }
        }

        // --- Lent & Holy Week ---
        if (mDate.isSameOrAfter(ash) && mDate.isBefore(easter)) {
            const firstLentSunday = ash.clone().add(4, "days");
            const lastLentSunday = easter.clone().subtract(1, "week");
            const startDiff = mDate.diff(firstLentSunday, "days");
            const endDiff = mDate.diff(lastLentSunday, "days");

            if (startDiff < 0) {
                context.periodType = 'lent';
                context.periodWeek = 0;
                context.dayOfWeek = 7 + startDiff + 1;
                return context;
            }
            if (endDiff > 0 && endDiff < 8) {
                context.periodType = 'holyweek';
                context.periodWeek = 1;
                context.dayOfWeek = endDiff + 1;
                return context;
            }
            if (endDiff === 0) {
                context.periodType = 'holyweek';
                context.periodWeek = 1;
                context.dayOfWeek = 1;
                context._feast = 'palmSunday';
                return context;
            }
            context.periodType = 'lent';
            context.periodWeek = Math.floor(startDiff / 7) + 1;
            context.dayOfWeek = (startDiff % 7) + 1;
            return context;
        }

        // --- Easter Time ---
        if (mDate.isSameOrAfter(easter) && mDate.isSameOrBefore(pentecost)) {
            const diff = mDate.diff(easter, "days");
            context.periodType = "easter";
            context.periodWeek = Math.floor(diff / 7) + 1;
            context.dayOfWeek = (diff % 7) + 1;
            return context;
        }

        // --- Ordinary Time ---
        const weeksBeforeOrd = parseInt(opts.ordintaryWeeks1) - 1;
        const fo = ash.clone().subtract(3, "days").subtract(weeksBeforeOrd, "weeks");
        if (mDate.isSameOrAfter(fo) && mDate.isBefore(ash)) {
            const diff = mDate.diff(fo, "days");
            context.periodType = "ordinary";
            context.periodWeek = Math.floor(diff / 7) + 1;
            context.dayOfWeek = (diff % 7) + 1;
            return context;
        }

        if (mDate.isAfter(pentecost) && mDate.isBefore(fa)) {
            const diff = mDate.diff(pentecost, "days");
            const startWeek = parseInt(opts.ordintaryWeeks2);
            context.periodType = "ordinary";
            context.periodWeek = Math.floor(diff / 7) + startWeek;
            context.dayOfWeek = (diff % 7) + 1;
            return context;
        }

        return context;
    }

    async function computeLiturgicalOptionsForDate(currentDate) {
        const mDate = moment(currentDate).startOf('day');
        const year = mDate.year();

        await calendarStore.getYearOptions(year);
        await calendarStore.getYearOptions(year + 1);
        await calendarStore.getDynamicDates(year);

        const periodQuery = getPeriodQuery(mDate, year);
        const fixedFeastQuery = getFixedFeastQuery(mDate);
        const dynamicFeastsQueries = getDynamicFeastsQueries(mDate, year);

        const context = {
            periodType: 'ordinary',
            periodWeek: -1,
            dayOfWeek: mDate.isoWeekday() === 7 ? 1 : mDate.isoWeekday() + 1
        };

        if (periodQuery && periodQuery._query) {
            const typeFilter = periodQuery._query.filters.find(f => f.field.segments.includes('_periodType'));
            const weekFilter = periodQuery._query.filters.find(f => f.field.segments.includes('_periodWeekNumber'));
            
            context.periodType = typeFilter?.value.stringValue || 'ordinary';
            context.periodWeek = parseInt(weekFilter?.value.stringValue || '-1');
        }

        const queryPromises = [periodQuery, fixedFeastQuery, ...dynamicFeastsQueries].filter(p => p);
        const querySnapshots = await Promise.all(
            queryPromises.map(q => retryFirestore(() => getDocs(q)))
        );

        const results = new Map();
        querySnapshots.forEach(snapshot => {
            snapshot.forEach(doc => {
                if (!results.has(doc.id)) {
                    results.set(doc.id, { id: doc.id, ...doc.data() });
                }
            });
        });
        
        return {
            items: Array.from(results.values()),
            context: context
        };
    }

    async function getLiturgicalOptionsForDate(currentDate) {
        const mDate = moment(currentDate).startOf('day');
        
        logger.log(`[LiturgicalDay] Вылічэнне опцый для ${mDate.format('YYYY-MM-DD')}`);
        // Firebase persistent cache автоматически кэширует результаты запросов
        return await computeLiturgicalOptionsForDate(currentDate);
    }

    const getFixedFeastQuery = (mDate) => {
        return query(daysCollection, where('_date', '==', mDate.format('D.M')));
    };

     function getDynamicFeastsQueries(mDate, year) {
        const dynamicDates = calendarStore.dynamicDatesForYear(year).value || {};
        const queries = [];
        for (const feastKey in dynamicDates) {
            if (feastNameMap[feastKey] && dynamicDates[feastKey].isSame(mDate, 'day')) {
                queries.push(query(daysCollection, where('_feast', '==', feastNameMap[feastKey])));
            }
        }
        return queries;
    }

    async function runLiturgicalDiagnostics(currentDate) {
        const mDate = moment(currentDate).startOf('day');
        const year = mDate.year();

        await calendarStore.getYearOptions(year);
        await calendarStore.getYearOptions(year + 1);
        await calendarStore.getDynamicDates(year);

        const diagnostics = {};
        const periodQuery = getPeriodQuery(mDate, year);
        if (periodQuery) {
            diagnostics.periodParams = {
                periodType: periodQuery._query.filters.find(f => f.field.segments.includes('_periodType'))?.value.stringValue,
                periodWeek: parseInt(periodQuery._query.filters.find(f => f.field.segments.includes('_periodWeekNumber'))?.value.stringValue),
                dayOfWeek: parseInt(periodQuery._query.filters.find(f => f.field.segments.includes('_dayOfWeek'))?.value.stringValue)
            };
            const periodSnapshot = await getDocs(periodQuery);
            diagnostics.periodResult = periodSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } else {
            diagnostics.periodResult = [];
            diagnostics.periodParams = null;
        }

        const fixedFeastQuery = getFixedFeastQuery(mDate);
        const fixedSnapshot = await getDocs(fixedFeastQuery);
        diagnostics.fixedFeastResult = fixedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const dynamicFeastsQueries = getDynamicFeastsQueries(mDate, year);
        diagnostics.dynamicFeastsResults = [];
        if (dynamicFeastsQueries.length > 0) {
            const dynamicSnapshots = await Promise.all(dynamicFeastsQueries.map(q => getDocs(q)));
            dynamicSnapshots.forEach(snapshot => {
                snapshot.forEach(doc => {
                    diagnostics.dynamicFeastsResults.push({ id: doc.id, ...doc.data() });
                });
            });
        }

        return {
            diagnostics,
            rawOptions: {
                yearOptions: calendarStore.optionsForYear(year).value,
                dynamicDates: calendarStore.dynamicDatesForYear(year).value
            }
        };
    }

    async function auditYear(year, progressCallback) {
        logger.log(`[Audit] Пачатак праверкі ${year} года`);
        
        await calendarStore.getYearOptions(year);
        await calendarStore.getDynamicDates(year);
        
        const missing = {
            periodDays: [],
            feasts: [],
        };

        const dynamicDates = calendarStore.dynamicDatesForYear(year).value;
        for (const feastKey in feastNameMap) {
            const feastCode = feastNameMap[feastKey];
            const q = query(daysCollection, where('_feast', '==', feastCode));
            const snapshot = await retryFirestore(() => getDocs(q));
            
            if (snapshot.empty) {
                const date = dynamicDates[feastKey] ? dynamicDates[feastKey].format('DD.MM.YYYY') : 'Дата не вылічаная';
                missing.feasts.push({ name: feastCode, date });
            }
        }

        const startDate = moment().year(year).startOf('year');
        const endDate = moment().year(year).endOf('year');
        const totalDays = endDate.diff(startDate, 'days');

        for (let i = 0; i <= totalDays; i++) {
            const currentDate = startDate.clone().add(i, 'days');
            const periodQuery = getPeriodQuery(currentDate, year);

            if (periodQuery) {
                const snapshot = await retryFirestore(() => getDocs(periodQuery));
                if (snapshot.empty) {
                    const params = {
                        date: currentDate.format('DD.MM.YYYY (dddd)'),
                        type: periodQuery._query.filters.find(f => f.field.segments.includes('_periodType'))?.value,
                        week: periodQuery._query.filters.find(f => f.field.segments.includes('_periodWeekNumber'))?.value,
                        day: periodQuery._query.filters.find(f => f.field.segments.includes('_dayOfWeek'))?.value,
                    };
                    logger.warn(`[Audit] НЕ ЗНАЙДЗЕНЫ ДЗЕНЬ ПЕРЫЯДУ:`, params);
                    missing.periodDays.push(params);
                }
            }
            
            if (progressCallback) {
                progressCallback(Math.round((i / totalDays) * 100));
            }
        }
        
        logger.log('[Audit] Праверка завершаная.');
        return missing;
    }

    async function findDayByPeriod(periodType, periodWeekNumber, dayOfWeek) {
        const q = getItemsForPeriodQuery(periodType, dayOfWeek, periodWeekNumber);
        const snapshot = await retryFirestore(() => getDocs(q));
        
        if (snapshot.empty) {
            return null;
        }
        
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    }

    async function calculateDateForPeriod(year, periodType, periodWeekNumber, dayOfWeek) {
        await calendarStore.getYearOptions(year);
        await calendarStore.getYearOptions(year + 1);
        
        const opts = calendarStore.optionsForYear(year).value;
        const nextYearOpts = calendarStore.optionsForYear(year + 1).value;
        if (!opts) return null;

        const fa = getMoment(opts.firstAdventSunday);
        const christmas = moment(`${year}-12-25`, "YYYY-MM-DD");
        const easter = getMoment(opts.easterSunday);
        const ash = getMoment(opts.ashWednesday);
        const pentecost = getMoment(opts.pentecost);

        let baseDate = null;
        let targetDate = null;

        if (periodType === 'advent') {
            baseDate = fa.clone();
        } else if (periodType === 'christmas') {
            baseDate = christmas.clone();
        } else if (periodType === 'lent') {
            baseDate = ash.clone().add(4, "days");
        } else if (periodType === 'holyweek') {
            baseDate = easter.clone().subtract(1, "week");
        } else if (periodType === 'easter') {
            baseDate = easter.clone();
        } else if (periodType === 'ordinary') {
            const weeksBeforeOrd = parseInt(opts.ordintaryWeeks1) - 1;
            const fo = ash.clone().subtract(3, "days").subtract(weeksBeforeOrd, "weeks");
            const startWeek2 = parseInt(opts.ordintaryWeeks2);
            
            if (periodWeekNumber < parseInt(opts.ordintaryWeeks1)) {
                baseDate = fo.clone();
            } else {
                baseDate = pentecost.clone();
                periodWeekNumber = periodWeekNumber - startWeek2 + 1;
            }
        }

        if (!baseDate) return null;

        const baseIsoWeekday = baseDate.isoWeekday();
        const baseDayOfWeek = baseIsoWeekday === 7 ? 1 : baseIsoWeekday + 1;
        const daysToAdd = (periodWeekNumber - 1) * 7 + (dayOfWeek - baseDayOfWeek);
        targetDate = baseDate.clone().add(daysToAdd, 'days');

        return targetDate.format('YYYY-MM-DD');
    }

    async function getAllFeasts(year) {
        const cacheKey = `year_${year}`;
        if (feastsCache[cacheKey]) {
            logger.log(`[getAllFeasts] Выкарыстоўваем кэш для года ${year}`);
            return feastsCache[cacheKey];
        }

        await calendarStore.getYearOptions(year);
        await calendarStore.getYearOptions(year + 1);
        await calendarStore.getDynamicDates(year);
        
        const dynamicDates = calendarStore.dynamicDatesForYear(year).value || {};
        const allFeasts = [];
        const seenIds = new Set();
        
        const snapshot = await retryFirestore(() => getDocs(daysCollection));
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if ((data._feast || data._feastType) && !seenIds.has(doc.id)) {
                seenIds.add(doc.id);
                allFeasts.push({ id: doc.id, ...data });
            }
        });
        
        const result = allFeasts.map(feast => {
            const isDynamic = Object.keys(feastNameMap).some(key => {
                return feastNameMap[key] === feast._feast && dynamicDates[key];
            });
            
            return {
                ...feast,
                isDynamic,
                isFixed: !isDynamic && feast._date
            };
        });

        feastsCache[cacheKey] = result;
        logger.log(`[getAllFeasts] Загружана і закэшавана ${result.length} праздников для года ${year}`);
        
        return result;
    }

    return { 
        getLiturgicalOptionsForDate, 
        computeLiturgicalOptionsForDate,
        computeLiturgicalContextForDate,
        runLiturgicalDiagnostics, 
        auditYear,
        findDayByPeriod,
        calculateDateForPeriod,
        getAllFeasts,
        feastNameMap
    };
}
