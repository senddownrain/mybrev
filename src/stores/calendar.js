import { defineStore } from 'pinia';
import { ref, computed  } from 'vue';
import { collection, query, where, getFirestore } from 'firebase/firestore';
import moment from '@/utils/moment-be';
import { logger } from '@/utils/logger';
import { getDocsOfflineAware } from '@/utils/firestoreRead';
import { publicContentCache, publicContentKey } from '@/utils/publicContentCache';
import { createReadSession } from '@/utils/contentCache';
import {
    calculateBaptismOfLordDate,
    calculateHolyFamilyDate,
} from '@/utils/liturgicalCalendar';

/**
 * @typedef {Object} YearOptions
 * @property {number} year - Calendar year (e.g. 2026)
 * @property {string} easterSunday - ISO date string for Easter Sunday (YYYY-MM-DD)
 * @property {string} pentecost - ISO date string for Pentecost (YYYY-MM-DD)
 * @property {string} firstAdventSunday - ISO date string for the first Sunday of Advent (YYYY-MM-DD)
 * @property {string} ashWednesday - ISO date string for Ash Wednesday (YYYY-MM-DD)
 * @property {string} holyFamily - ISO date string for the Feast of the Holy Family (YYYY-MM-DD)
 * @property {string} baptismOfLord - ISO date string for the Baptism of the Lord (YYYY-MM-DD)
 * @property {string} ordintaryStart1 - ISO date string for the start of the first Ordinary Time segment (YYYY-MM-DD)
 * @property {string|number} ordintaryWeeks1 - Number of Ordinary Time weeks before Lent
 * @property {string|number} ordintaryWeeks2 - Ordinary Time week number from which the post-Pentecost segment begins
 */

/**
 * @typedef {Object} DynamicDates
 * @property {import('moment').Moment} ashWednesday - Ash Wednesday
 * @property {import('moment').Moment} palmSunday - Palm Sunday (7 days before Easter)
 * @property {import('moment').Moment} easterSunday - Easter Sunday
 * @property {import('moment').Moment} pentecost - Pentecost Sunday
 * @property {import('moment').Moment} maryMotherChurch - Mary, Mother of the Church (Monday after Pentecost)
 * @property {import('moment').Moment} ascension - Ascension
 * @property {import('moment').Moment} holyTrinity - Holy Trinity Sunday (7 days after Pentecost)
 * @property {import('moment').Moment} corpusChristi - Corpus Christi (Thursday after Trinity Sunday)
 * @property {import('moment').Moment} holyFamily - Feast of the Holy Family
 * @property {import('moment').Moment} baptismOfLord - Baptism of the Lord
 * @property {import('moment').Moment} christKing - Christ the King Sunday (Sunday before Advent)
 * @property {import('moment').Moment} sacredHeartOfJesus - Sacred Heart of Jesus (19 days after Pentecost)
 * @property {import('moment').Moment} immaculateHeartOfMary - Immaculate Heart of Mary (day after Sacred Heart)
 * @property {import('moment').Moment} christTheHighPriest - Christ the High Priest (Thursday after Pentecost)
 */

export const useCalendarStore = defineStore('calendar', () => {
    const db = getFirestore();

    const yearOptionsCache = ref({});
    const dynamicDatesCache = ref({});
    const dynamicDatesRequests = new Map();

    /**
     * Fetch liturgical year options for the given year from Firestore.
     * Results are cached in memory; subsequent calls for the same year return the cached value.
     *
     * @param {number|string} year - The calendar year to fetch options for
     * @returns {Promise<YearOptions|null>} Year options object, or null if not found in Firestore
     */
    async function getYearOptions(year, session) {
        const entry = await publicContentCache.read(publicContentKey('year', Number(year)), async () => {
            const readSession = createReadSession();
            const q = query(collection(db, 'yearOptions'), where('year', '==', Number(year)));
            const snapshot = await getDocsOfflineAware(q, readSession);
            return { data: snapshot.empty ? null : snapshot.docs[0].data(), complete: readSession.complete };
        }, { fresh: Boolean(session) });
        if (session && !entry.complete) session.complete = false;
        if (JSON.stringify(yearOptionsCache.value[year]) !== JSON.stringify(entry.data)) {
            delete dynamicDatesCache.value[year];
        }
        yearOptionsCache.value[year] = entry.data;
        return entry.data;
    }

    /**
     * Compute all dynamic liturgical feast dates for the given year.
     * Depends on {@link getYearOptions} to retrieve the base dates from Firestore.
     * Results are cached in memory; subsequent calls for the same year return the cached value.
     *
     * @param {number|string} year - The calendar year to compute dates for
     * @returns {Promise<DynamicDates|{}>} Object mapping feast keys to moment date objects,
     *   or an empty object if year options are unavailable
     */
    async function getDynamicDates(year, session) {
    await getYearOptions(year, session);
    if (dynamicDatesCache.value[year]) {
        return dynamicDatesCache.value[year];
    }

    if (dynamicDatesRequests.has(year)) return dynamicDatesRequests.get(year);

    const request = (async () => {

    logger.log(`[CalendarStore] Computing dynamic dates for year ${year}...`);

    const opts = yearOptionsCache.value[year];
    if (!opts) {
        logger.error(`[CalendarStore] Failed to get options for year ${year}. Date computation aborted.`);
        return {};
    }
    const dates = {};
    const getMoment = (isoDateStr) => moment(isoDateStr, 'YYYY-MM-DD');
    const easter = getMoment(opts.easterSunday);
    const pentecost = getMoment(opts.pentecost);
    const firstAdventSunday = getMoment(opts.firstAdventSunday);
    // Расчёт дат да Вялікадня
    dates.ashWednesday = getMoment(opts.ashWednesday);
    dates.palmSunday = easter.clone().subtract(7, 'days'); // ✅ PALM SUNDAY
    // Расчёт дат пасля Вялікадня
    dates.easterSunday = easter;
    dates.pentecost = pentecost;
    dates.maryMotherChurch = pentecost.clone().add(1, 'day');
    const configuredAscension = getMoment(opts.ascension);
    dates.ascension = configuredAscension.isValid()
        ? configuredAscension
        : pentecost.clone().subtract(7, 'days');
    
    const holyTrinitySunday = pentecost.clone().add(7, 'days');
    dates.holyTrinity = holyTrinitySunday;
    const configuredCorpusChristi = getMoment(opts.corpusChristi);
    dates.corpusChristi = configuredCorpusChristi.isValid()
        ? configuredCorpusChristi
        : holyTrinitySunday.clone().add(4, 'days');
    // Расчёт дат у "звычайны час"
    dates.holyFamily = calculateHolyFamilyDate(Number(year));
    dates.baptismOfLord = calculateBaptismOfLordDate(Number(year));
    dates.christKing = firstAdventSunday.clone().subtract(7, 'days');
    const sacredHeartOfJesus = pentecost.clone().add(19, 'days');
    dates.sacredHeartOfJesus = sacredHeartOfJesus;
    dates.immaculateHeartOfMary = sacredHeartOfJesus.clone().add(1, 'day'); // Next day
    dates.christTheHighPriest = pentecost.clone().add(4, 'days');
    dynamicDatesCache.value[year] = dates;
    logger.log(`[CalendarStore] Dynamic dates for year ${year} computed.`);
    return dates;
    })();

    dynamicDatesRequests.set(year, request);
    try {
        return await request;
    } finally {
        dynamicDatesRequests.delete(year);
    }
}

    // --- Функцыя для атрымання ўсіх даступных гадоў з Firestore ---
    /**
     * Fetch all years that have liturgical options stored in Firestore.
     * Returns years sorted in descending order (most recent first).
     *
     * @returns {Promise<number[]>} Sorted array of available years, or an empty array on error
     */
    async function getAvailableYears(options = {}) {
        try {
            const entry = await publicContentCache.read(publicContentKey('years'), async () => {
            const session = createReadSession();
            const q = query(collection(db, 'yearOptions'));
            const snapshot = await getDocsOfflineAware(q, session);
            const years = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.year) {
                    years.push(data.year);
                }
            });
            return { data: years.sort((a, b) => b - a), complete: session.complete };
            }, options);
            if (options.requireFresh && !entry.complete) throw new Error('Не атрымалася абнавіць спіс гадоў.');
            return entry.data;
        } catch (error) {
            if (options.requireFresh) throw error;
            logger.error('[CalendarStore] Error fetching available years list:', error);
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
