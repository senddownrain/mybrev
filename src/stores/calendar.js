import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import moment from '@/utils/moment-be';
import { buildYearOptions, getGeneratableYears, getMovableFeastDates } from '@/utils/liturgicalMovableDates';

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

/**
 * Year anchors of the liturgical calendar. `YearOptions` is a computed DTO:
 * every field comes from the Ordo engine (`src/utils/ordo/movableFeasts.js`),
 * so any year is available offline and no Firestore `yearOptions` document is
 * read. One-year exceptions are `liturgicalYearOverrides`, not year options.
 */
export const useCalendarStore = defineStore('calendar', () => {
    const yearOptionsCache = ref({});
    const dynamicDatesCache = ref({});

    /**
     * Computed liturgical year options. Async only for API compatibility.
     *
     * @param {number|string} year - The calendar year
     * @returns {Promise<YearOptions>} Year options (never null)
     */
    async function getYearOptions(year) {
        if (!yearOptionsCache.value[year]) yearOptionsCache.value[year] = buildYearOptions(Number(year));
        return yearOptionsCache.value[year];
    }

    /**
     * Movable feast dates of the year as moments, computed by the Ordo engine.
     *
     * @param {number|string} year - The calendar year to compute dates for
     * @returns {Promise<DynamicDates>} Object mapping feast keys to moment date objects
     */
    async function getDynamicDates(year) {
        await getYearOptions(year);
        if (!dynamicDatesCache.value[year]) {
            const dates = Object.fromEntries(Object.entries(getMovableFeastDates(Number(year)))
                .map(([key, value]) => [key, moment(value, 'YYYY-MM-DD')]));
            delete dates.firstAdventSunday;
            dynamicDatesCache.value[year] = dates;
        }
        return dynamicDatesCache.value[year];
    }

    /**
     * Years offered by the pickers, most recent first. The calendar is
     * generated, so the list is not limited to stored documents.
     *
     * @returns {Promise<number[]>}
     */
    async function getAvailableYears() {
        return getGeneratableYears();
    }

    return {
        getYearOptions,
        getDynamicDates,
        getAvailableYears,
        optionsForYear: (year) => computed(() => yearOptionsCache.value[year]),
        dynamicDatesForYear: (year) => computed(() => dynamicDatesCache.value[year])
    };
});
