import { collection, query, where, getDocs } from 'firebase/firestore';
import { useFirestore } from 'vuefire';
import { useCalendarStore } from '@/stores/calendar';
import moment from 'moment';
import 'moment/dist/locale/be';
import { db } from '@/plugins/firebase';
import { cached } from '@/utils/cache';
import { retryFirestore } from '@/utils/retry';
import { logger } from '@/utils/logger'; 

export function useLiturgicalDay() {
    const calendarStore = useCalendarStore();
    const daysCollection = collection(db, 'days');
    moment.locale('be');

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
        const fo = ash.clone().subtract(2, "days").subtract(weeksBeforeOrd, "weeks");
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

    // --- Основная функция, используемая главной страницей (ItemsList.vue) ---
    async function getLiturgicalOptionsForDate(currentDate) {
        const mDate = moment(currentDate).startOf('day');
        const dateKey = mDate.format('YYYY-MM-DD');
        
        // Используем кэширование с TTL 5 минут
        return cached(
            `liturgical-options-${dateKey}`,
            async () => {
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
                    dayOfWeek: mDate.isoWeekday()
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
            },
            5 * 60 * 1000
        );
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
        logger.log(`[Audit] Пачатак праверкі ${year} года...`);
        
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
                const date = dynamicDates[feastKey] ? dynamicDates[feastKey].format('DD.MM.YYYY') : 'Дата не вылічана';
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
                    logger.warn(`[Audit] НЕ ЗНОЙДЗЕНЫ ДЗЕНЬ ПЕРЫЯДУ:`, params);
                    missing.periodDays.push(params);
                }
            }
            
            if (progressCallback) {
                progressCallback(Math.round((i / totalDays) * 100));
            }
        }
        
        logger.log('[Audit] Праверка завершана.');
        return missing;
    }

    return { getLiturgicalOptionsForDate, runLiturgicalDiagnostics, auditYear };
}