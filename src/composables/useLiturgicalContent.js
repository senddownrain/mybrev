// src/composables/useLiturgicalContent.js
import { collection, query, where, getDocs } from 'firebase/firestore';
import moment from '@/utils/moment-be';
import { db } from '@/plugins/firebase';
import { retryFirestore } from '@/utils/retry';
import { logger } from '@/utils/logger';
import { useCalendarStore } from '@/stores/calendar';
import { PERIOD_LABEL_MAP, WEEKDAY_LABEL_MAP } from '@/constants/liturgical';

const contentCache = new Map();

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
  corpusChristi: 'corpuschristi',
  ascension: 'ascension',
};

function getCacheKeyForDate(date) {
  // date может быть Date или moment — нормализуем к YYYY-MM-DD
  return moment(date).startOf('day').format('YYYY-MM-DD');
}

export function useLiturgicalContent() {
  const calendarStore = useCalendarStore();

  const daysCollection = collection(db, 'days');
  const readingsCollection = collection(db, 'readings');

  const getMoment = (isoDateStr) => moment(isoDateStr, 'YYYY-MM-DD');

  const getItemsForPeriodQueryDays = (type, day, week) => {
    // В days поля недели/дня хранятся как строки
    return query(
      daysCollection,
      where('_periodType', '==', type),
      where('_dayOfWeek', '==', `${day}`),
      where('_periodWeekNumber', '==', `${week}`),
    );
  };

  const getItemsForPeriodQueryReadings = (type, day, week) => {
    // В readings после миграций можно хранить как числа.
    // Если у тебя строки – замени day/week на `${day}` / `${week}`.
    return query(
      readingsCollection,
      where('_periodType', '==', type),
      where('_dayOfWeek', '==', day),
      where('_periodWeekNumber', '==', week),
    );
  };

  const getPeriodQueries = (mDate, year) => {
    const opts = calendarStore.optionsForYear(year).value;
    const nextYearOpts = calendarStore.optionsForYear(year + 1).value;

    if (!opts) return null;

    const fa = getMoment(opts.firstAdventSunday);
    const christmas = moment(`${year}-12-25`, 'YYYY-MM-DD');

    // --- Advent ---
    if (mDate.isSameOrAfter(fa) && mDate.isBefore(christmas)) {
      const diff = mDate.diff(fa, 'days');
      const dayOfWeek = (diff % 7) + 1;
      const week = Math.floor(diff / 7) + 1;

      return {
        periodType: 'advent',
        periodWeek: week,
        dayOfWeek,
        queryDays: getItemsForPeriodQueryDays('advent', dayOfWeek, week),
        queryReadings: getItemsForPeriodQueryReadings('advent', dayOfWeek, week),
      };
    }

    // --- Christmas Time ---
    if (nextYearOpts && mDate.isSameOrAfter(christmas)) {
      const flNext = getMoment(nextYearOpts.ordintaryStart1);
      const weeksBefore = parseInt(nextYearOpts.ordintaryWeeks1);
      const lastChristmas = flNext
        .clone()
        .subtract(weeksBefore, 'weeks')
        .subtract(2, 'days');

      if (mDate.isSameOrBefore(lastChristmas)) {
        const diff = mDate.diff(christmas, 'days');
        const dayOfWeek = (diff % 7) + 1;
        const week = Math.floor(diff / 7) + 1;

        return {
          periodType: 'christmas',
          periodWeek: week,
          dayOfWeek,
          queryDays: getItemsForPeriodQueryDays('christmas', dayOfWeek, week),
          queryReadings: getItemsForPeriodQueryReadings('christmas', dayOfWeek, week),
        };
      }
    }

    const easter = getMoment(opts.easterSunday);
    const ash = getMoment(opts.ashWednesday);

    // --- Lent & Holy Week ---
    if (mDate.isSameOrAfter(ash) && mDate.isBefore(easter)) {
      const firstLentSunday = ash.clone().add(4, 'days');
      const lastLentSunday = easter.clone().subtract(1, 'week');

      const startDiff = mDate.diff(firstLentSunday, 'days');
      const endDiff = mDate.diff(lastLentSunday, 'days');

      if (startDiff < 0) {
        const dayOfWeek = 7 + startDiff + 1;
        const week = 0;

        return {
          periodType: 'lent',
          periodWeek: week,
          dayOfWeek,
          queryDays: getItemsForPeriodQueryDays('lent', dayOfWeek, week),
          queryReadings: getItemsForPeriodQueryReadings('lent', dayOfWeek, week),
        };
      }

      if (endDiff > 0 && endDiff < 8) {
        const dayOfWeek = endDiff + 1;
        const week = 1;

        return {
          periodType: 'holyweek',
          periodWeek: week,
          dayOfWeek,
          queryDays: getItemsForPeriodQueryDays('holyweek', dayOfWeek, week),
          queryReadings: getItemsForPeriodQueryReadings('holyweek', dayOfWeek, week),
        };
      }

      if (endDiff === 0) {
        // Пальмовая нядзеля — особый случай
        return {
          periodType: 'holyweek',
          periodWeek: 1,
          dayOfWeek: 1,
          queryDays: query(daysCollection, where('_feast', '==', 'palmsunday')),
          queryReadings: query(
            readingsCollection,
            where('_feast', '==', 'palmsunday'),
          ),
        };
      }

      const dayOfWeek = (startDiff % 7) + 1;
      const week = Math.floor(startDiff / 7) + 1;

      return {
        periodType: 'lent',
        periodWeek: week,
        dayOfWeek,
        queryDays: getItemsForPeriodQueryDays('lent', dayOfWeek, week),
        queryReadings: getItemsForPeriodQueryReadings('lent', dayOfWeek, week),
      };
    }

    const pentecost = getMoment(opts.pentecost);

    // --- Easter Time ---
    if (mDate.isSameOrAfter(easter) && mDate.isSameOrBefore(pentecost)) {
      const diff = mDate.diff(easter, 'days');
      const dayOfWeek = (diff % 7) + 1;
      const week = Math.floor(diff / 7) + 1;

      return {
        periodType: 'easter',
        periodWeek: week,
        dayOfWeek,
        queryDays: getItemsForPeriodQueryDays('easter', dayOfWeek, week),
        queryReadings: getItemsForPeriodQueryReadings('easter', dayOfWeek, week),
      };
    }

    // --- Ordinary Time ---
    const weeksBeforeOrd = parseInt(opts.ordintaryWeeks1) - 1;

    const fo = ash.clone()
      .subtract(2, 'days')
      .subtract(weeksBeforeOrd, 'weeks');

    if (mDate.isSameOrAfter(fo) && mDate.isBefore(ash)) {
      const diff = mDate.diff(fo, 'days');
      const dayOfWeek = (diff % 7) + 1;
      const week = Math.floor(diff / 7) + 1;

      return {
        periodType: 'ordinary',
        periodWeek: week,
        dayOfWeek,
        queryDays: getItemsForPeriodQueryDays('ordinary', dayOfWeek, week),
        queryReadings: getItemsForPeriodQueryReadings('ordinary', dayOfWeek, week),
      };
    }

    if (mDate.isAfter(pentecost) && mDate.isBefore(fa)) {
      const diff = mDate.diff(pentecost, 'days');
      const startWeek = parseInt(opts.ordintaryWeeks2);
      const dayOfWeek = (diff % 7) + 1;
      const week = Math.floor(diff / 7) + startWeek;

      return {
        periodType: 'ordinary',
        periodWeek: week,
        dayOfWeek,
        queryDays: getItemsForPeriodQueryDays('ordinary', dayOfWeek, week),
        queryReadings: getItemsForPeriodQueryReadings('ordinary', dayOfWeek, week),
      };
    }

    return null;
  };

  const getFixedFeastDaysQuery = (mDate) => {
    // days: _date = 'D.M'
    return query(daysCollection, where('_date', '==', mDate.format('D.M')));
  };

  const getFixedFeastReadingsQuery = (mDate) => {
    // readings: _date = 'DD.MM'
    return query(readingsCollection, where('_date', '==', mDate.format('DD.MM')));
  };

  const getDynamicFeastsDaysQueries = (mDate, year) => {
    const dynamicDates = calendarStore.dynamicDatesForYear(year).value || {};
    const queries = [];

    for (const feastKey in dynamicDates) {
      if (
        feastNameMap[feastKey] &&
        dynamicDates[feastKey].isSame(mDate, 'day')
      ) {
        queries.push({
          feastKey: feastNameMap[feastKey],
          query: query(daysCollection, where('_feast', '==', feastNameMap[feastKey])),
        });
      }
    }

    return queries;
  };

  const getDynamicFeastsReadingsQueries = (mDate, year) => {
    const dynamicDates = calendarStore.dynamicDatesForYear(year).value || {};
    const queries = [];

    for (const feastKey in dynamicDates) {
      if (
        feastNameMap[feastKey] &&
        dynamicDates[feastKey].isSame(mDate, 'day')
      ) {
        queries.push({
          feastKey: feastNameMap[feastKey],
          query: query(
            readingsCollection,
            where('_feast', '==', feastNameMap[feastKey]),
          ),
        });
      }
    }

    return queries;
  };

  function getCachedLiturgicalContentForDate(currentDate) {
    const cacheKey = getCacheKeyForDate(currentDate);
    return contentCache.get(cacheKey) || null;
  }

  const snapshotToDocs = (snapshot) => {
    const docs = [];
    snapshot.forEach((docEntry) => {
      docs.push({ id: docEntry.id, ...docEntry.data() });
    });
    return docs;
  };

  const buildPeriodTitle = (context) => {
    const periodName = PERIOD_LABEL_MAP[context.periodType] || 'Літургічны перыяд';
    const weekDayName = WEEKDAY_LABEL_MAP[context.dayOfWeek] || '';
    const weekChunk = context.periodWeek > -1 ? `${context.periodWeek} тыдз.` : '';
    return [periodName, weekChunk, weekDayName].filter(Boolean).join(', ');
  };

  async function getLiturgicalContentForDate(currentDate) {
    const cacheKey = getCacheKeyForDate(currentDate);

    // 1. Сначала пробуем кэш (на случай, если кто-то уже считал до нас)
    if (contentCache.has(cacheKey)) {
      logger.log(`[LiturgicalContent] Кэш хаты для ${cacheKey}`);
      return contentCache.get(cacheKey);
    }

    const mDate = moment(currentDate).startOf('day');
    const year = mDate.year();

    logger.log(
      `[LiturgicalContent] Вылічэнне для ${mDate.format('YYYY-MM-DD')}`,
    );

    // Гарантируем, что yearOptions и dynamicDates прогреты
    await calendarStore.getYearOptions(year);
    await calendarStore.getYearOptions(year + 1);
    await calendarStore.getDynamicDates(year);

    const periodInfo = getPeriodQueries(mDate, year);

    const context = {
      periodType: periodInfo ? periodInfo.periodType : 'ordinary',
      periodWeek: periodInfo ? periodInfo.periodWeek : -1,
      dayOfWeek: mDate.isoWeekday(),
    };

    const dynamicDayQueries = getDynamicFeastsDaysQueries(mDate, year);
    const dynamicReadingQueries = getDynamicFeastsReadingsQueries(mDate, year);

    const [
      periodDaysSnapshot,
      periodReadingsSnapshot,
      fixedDaysSnapshot,
      fixedReadingsSnapshot,
      dynamicDaySnapshots,
      dynamicReadingSnapshots,
    ] = await Promise.all([
      periodInfo
        ? retryFirestore(() => getDocs(periodInfo.queryDays))
        : Promise.resolve(null),
      periodInfo
        ? retryFirestore(() => getDocs(periodInfo.queryReadings))
        : Promise.resolve(null),
      retryFirestore(() => getDocs(getFixedFeastDaysQuery(mDate))),
      retryFirestore(() => getDocs(getFixedFeastReadingsQuery(mDate))),
      Promise.all(dynamicDayQueries.map((item) => retryFirestore(() => getDocs(item.query)))),
      Promise.all(dynamicReadingQueries.map((item) => retryFirestore(() => getDocs(item.query)))),
    ]);

    const daySnapshots = [
      ...(periodDaysSnapshot ? [periodDaysSnapshot] : []),
      fixedDaysSnapshot,
      ...dynamicDaySnapshots,
    ];

    const readingSnapshots = [
      ...(periodReadingsSnapshot ? [periodReadingsSnapshot] : []),
      fixedReadingsSnapshot,
      ...dynamicReadingSnapshots,
    ];

    const daysResults = new Map();
    daySnapshots.forEach((snap) => {
      snap.forEach((doc) => {
        if (!daysResults.has(doc.id)) {
          daysResults.set(doc.id, { id: doc.id, ...doc.data() });
        }
      });
    });

    const readingsResults = new Map();
    readingSnapshots.forEach((snap) => {
      snap.forEach((doc) => {
        if (!readingsResults.has(doc.id)) {
          readingsResults.set(doc.id, { id: doc.id, ...doc.data() });
        }
      });
    });

    const periodDaysDocs = periodDaysSnapshot ? snapshotToDocs(periodDaysSnapshot) : [];
    const periodReadingsDocs = periodReadingsSnapshot
      ? snapshotToDocs(periodReadingsSnapshot)
      : [];
    const fixedDaysDocs = snapshotToDocs(fixedDaysSnapshot);
    const fixedReadingsDocs = snapshotToDocs(fixedReadingsSnapshot);

    const dynamicDayDocsByFeast = new Map();
    dynamicDayQueries.forEach((dynamicItem, index) => {
      dynamicDayDocsByFeast.set(
        dynamicItem.feastKey,
        snapshotToDocs(dynamicDaySnapshots[index]),
      );
    });

    const dynamicReadingsDocsByFeast = new Map();
    dynamicReadingQueries.forEach((dynamicItem, index) => {
      dynamicReadingsDocsByFeast.set(
        dynamicItem.feastKey,
        snapshotToDocs(dynamicReadingSnapshots[index]),
      );
    });

    const liturgicalOptions = [];
    const periodDay = periodDaysDocs[0] || null;
    const periodReading = periodReadingsDocs[0] || null;

    liturgicalOptions.push({
      key: `period-${context.periodType}-${context.periodWeek}-${context.dayOfWeek}`,
      source: 'period',
      title: periodDay?._feastName || periodDay?.title || buildPeriodTitle(context),
      subtitle: 'Літургічны дзень па перыядзе',
      day: periodDay,
      reading: periodReading,
      order: 1,
    });

    const dynamicFeastKeys = [...new Set([
      ...dynamicDayDocsByFeast.keys(),
      ...dynamicReadingsDocsByFeast.keys(),
    ])];

    dynamicFeastKeys.forEach((feastKey) => {
      const day = dynamicDayDocsByFeast.get(feastKey)?.[0] || null;
      const reading = dynamicReadingsDocsByFeast.get(feastKey)?.[0] || null;
      if (!day && !reading) return;
      liturgicalOptions.push({
        key: `dynamic-${feastKey}`,
        source: 'dynamic',
        title: day?._feastName || day?.title || reading?.title || feastKey,
        subtitle: 'Рухомае свята',
        day,
        reading,
        order: 2,
      });
    });

    fixedDaysDocs.forEach((day) => {
      const reading = fixedReadingsDocs.find((item) => item.id === day.id) || null;
      liturgicalOptions.push({
        key: `fixed-${day.id}`,
        source: 'fixed',
        title: day._feastName || day.title || `Дата ${day._date}`,
        subtitle: 'Свята па фіксаванай даце',
        day,
        reading,
        order: 3,
      });
    });

    fixedReadingsDocs
      .filter((reading) => !fixedDaysDocs.find((day) => day.id === reading.id))
      .forEach((reading) => {
        liturgicalOptions.push({
          key: `fixed-reading-only-${reading.id}`,
          source: 'fixed',
          title: reading.title || `Дата ${reading._date}`,
          subtitle: 'Свята па фіксаванай даце',
          day: null,
          reading,
          order: 3,
        });
      });

    const dayOptions = liturgicalOptions
      .sort((a, b) => a.order - b.order)
      .map((option) => ({
        ...option,
        dayId: option.day?.id || null,
        readingId: option.reading?.id || null,
        hasLiturgicalDay: Boolean(option.day),
        hasReadings: Boolean(option.reading),
        disabled: !option.day || !option.reading,
      }));

    const result = {
      context,
      itemsDays: Array.from(daysResults.values()),
      itemsReadings: Array.from(readingsResults.values()),
      dayOptions,
    };

    // 2. Кладём в кэш, чтобы следующие вызовы по этой дате были мгновенными
    contentCache.set(cacheKey, result);

    return result;
  }

  return {
    getLiturgicalContentForDate,
    getCachedLiturgicalContentForDate,
    feastNameMap,
  };
}
