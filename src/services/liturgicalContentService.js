/** Assemble liturgical days from fixedDays with the still-separate readings. */
import { collection, query, where } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { getDocsOfflineAware } from '@/utils/firestoreRead';
import { logger } from '@/utils/logger';
import {
  PLACE_LABEL_MAP,
  RANK_LABEL_MAP,
  LITURGICAL_OPTION_SOURCE,
  getLiturgicalCelebrationPriority,
} from '@/constants/liturgical';
import { formatLiturgicalPeriodTitle } from '@/utils/liturgicalPeriodTitle';
import { fetchDaysForDate } from '@/services/liturgicalDayService';
import {
  getFixedCelebrationKey,
  groupFixedCelebrationDays,
  getTemplateLabel,
  isSeasonalDateDocumentId,
} from '@/utils/liturgicalDayResolution';

const READINGS_COLLECTION = 'readings';
const readingsCollection = () => collection(db, READINGS_COLLECTION);

function readingPeriodQueries(periodType, dayOfWeek, week) {
  const result = [];
  for (const dayValue of [dayOfWeek, `${dayOfWeek}`]) {
    for (const weekValue of [week, `${week}`]) {
      result.push(query(
        readingsCollection(),
        where('_periodType', '==', periodType),
        where('_dayOfWeek', '==', dayValue),
        where('_periodWeekNumber', '==', weekValue),
      ));
    }
  }
  return result;
}

const readingDateQuery = (value) => query(readingsCollection(), where('_date', '==', value));
const readingFeastQuery = (value) => query(readingsCollection(), where('_feast', '==', value));

async function queryDocuments(queries) {
  const snapshots = await Promise.all(queries.map((item) => getDocsOfflineAware(item)));
  const result = new Map();
  snapshots.forEach((snapshot) => snapshot.forEach((item) => result.set(item.id, { id: item.id, ...item.data() })));
  return [...result.values()];
}

function buildPeriodTitle(context) {
  return formatLiturgicalPeriodTitle({
    periodType: context.periodType,
    periodWeek: context.periodWeek,
    dayOfWeek: context.dayOfWeek,
  });
}

function buildDayTitle(day, context) {
  const hasCelebrationIdentity = day?._feast || day?._rank || day?._feastType;
  // Seasonal date documents were imported with headings from a particular
  // source year (for example a 21 December document may say "IV Sunday").
  // Their identity is the calendar date, so render the current calendar
  // context instead of leaking a stale weekday/title into another year.
  const isSeasonalCalendarDay = isSeasonalDateDocumentId(day?.id)
    && ['advent', 'christmas'].includes(day?._periodType);
  const isUntitledChristmasDay = day?._periodType === 'christmas' && !hasCelebrationIdentity;
  const isOfficeForDead = day?._kind === 'office-for-dead';
  const isPeriodDay = day?._periodType && !hasCelebrationIdentity && !isOfficeForDead;
  if (isPeriodDay || isSeasonalCalendarDay || isUntitledChristmasDay) {
    return buildPeriodTitle({
      ...context,
      periodType: day._periodType,
      periodWeek: day._periodWeekNumber ?? context.periodWeek,
      dayOfWeek: day._dayOfWeek ?? context.dayOfWeek,
    });
  }
  if (day?._feastName) return day._feastName;
  return day?._title || day?._dayName || buildPeriodTitle(context);
}

function matchingReading(day, readings) {
  return readings.find((item) => item.id === day?.id)
    || readings.find((item) => !item.place && !item._place)
    || readings[0]
    || null;
}

const normalizedFeastCode = (code) => String(code || '').replace(/^feast-/, '');

function fixedSubtitle(day, count) {
  const chunks = [];
  if (day?._rank) chunks.push(RANK_LABEL_MAP[day._rank] || day._rank);
  const places = Array.isArray(day?._place) ? day._place : [day?._place];
  chunks.push(...places.filter(Boolean).map((place) => PLACE_LABEL_MAP[place] || place));
  if (count > 1) chunks.push(`${count} варыянты`);
  return chunks.length ? chunks.join(' · ') : 'Літургічны дзень';
}

export async function fetchContentForDate(mDate, context, dynamicFeastCodes = []) {
  logger.log(`[liturgicalContentService] Fetching ${mDate.format('YYYY-MM-DD')}`);
  const hasPeriod = context.periodType && context.periodWeek !== undefined && context.dayOfWeek;
  const periodReadingQueries = hasPeriod
    ? readingPeriodQueries(context.periodType, context.dayOfWeek, context.periodWeek)
    : [];
  const dateReadingQueries = [...new Set([mDate.format('DD.MM'), mDate.format('D.M')])].map(readingDateQuery);
  const feastCodes = [...new Set(dynamicFeastCodes.flatMap((code) => {
    const normalized = String(code).replace(/^feast-/, '');
    return [normalized, `feast-${normalized}`];
  }))];

  const [daysResult, periodReadings, fixedReadings, dynamicReadingEntries] = await Promise.all([
    fetchDaysForDate(mDate, context, dynamicFeastCodes),
    queryDocuments(periodReadingQueries),
    queryDocuments(dateReadingQueries),
    Promise.all(feastCodes.map(async (code) => [code, await queryDocuments([readingFeastQuery(code)])])),
  ]);

  const visibleDynamicReadingEntries = daysResult.exclusiveFeastCode
    ? dynamicReadingEntries.filter(([code]) => normalizedFeastCode(code) === daysResult.exclusiveFeastCode)
    : dynamicReadingEntries;
  const dynamicReadings = visibleDynamicReadingEntries.flatMap(([, docs]) => docs);
  const visiblePeriodReadings = daysResult.exclusiveFeastCode || daysResult.exclusiveFixedDate
    ? []
    : periodReadings;
  const visibleFixedReadings = daysResult.exclusiveFeastCode
    ? []
    : fixedReadings.filter((item) => (
      !daysResult.exclusiveFixedDate || !isSeasonalDateDocumentId(item.id)
    ));
  const allDays = [
    ...daysResult.periodDays,
    ...daysResult.fixedDays,
    ...[...daysResult.dynamicDaysByFeast.values()].flat(),
    // Keep the period document addressable by an explicit route ID even when
    // a seasonal date exception (for example Advent 17–24) replaces it in the
    // calendar options. The picker opens the exact period template selected by
    // the user, while `dayOptions` below still exposes only the date's canonical
    // seasonal option.
    daysResult.periodFallback,
    daysResult.officeForDead,
  ].filter(Boolean);
  const dayMap = new Map(allDays.map((item) => [item.id, item]));
  const readingMap = new Map([
    ...visiblePeriodReadings,
    ...visibleFixedReadings,
    ...dynamicReadings,
  ].map((item) => [item.id, item]));
  const options = [];

  daysResult.periodDays.forEach((day) => options.push({
    key: `period-${day.id}`,
    source: LITURGICAL_OPTION_SOURCE.PERIOD,
    title: buildDayTitle(day, context),
    subtitle: 'Літургічны дзень',
    day,
    templates: [{ id: day.id, label: 'Перыяд', day }],
    reading: periodReadings[0] || null,
    order: 1,
    contextPeriodType: context.periodType,
  }));

  dynamicFeastCodes
    .filter((code) => !daysResult.exclusiveFeastCode
      || normalizedFeastCode(code) === daysResult.exclusiveFeastCode)
    .forEach((code) => {
    const days = daysResult.dynamicDaysByFeast.get(code) || [];
    days.forEach((day) => options.push({
      key: `dynamic-${day.id}`,
      source: LITURGICAL_OPTION_SOURCE.DYNAMIC,
      title: buildDayTitle(day, context) || code,
      subtitle: 'Свята',
      day,
      templates: [{ id: day.id, label: getTemplateLabel(day), day }],
      reading: matchingReading(day, dynamicReadings),
      order: 2,
      contextPeriodType: context.periodType,
    }));
    });

  groupFixedCelebrationDays(daysResult.fixedDays).forEach(({ day, templates }) => options.push({
    key: `fixed-${getFixedCelebrationKey(day)}`,
    source: LITURGICAL_OPTION_SOURCE.FIXED,
    title: buildDayTitle(day, context) || `Дата ${day._date}`,
    titleIncludesWeekday: isSeasonalDateDocumentId(day.id),
    subtitle: fixedSubtitle(day, templates.length),
    day,
    templates,
    reading: matchingReading(day, fixedReadings),
    order: 3,
    contextPeriodType: context.periodType,
  }));

  if (daysResult.officeForDead) options.push({
    key: 'office-for-dead',
    source: LITURGICAL_OPTION_SOURCE.OFFICE_FOR_DEAD,
    title: daysResult.officeForDead._feastName || 'Афіцый за памерлых',
    subtitle: 'Памінальны афіцый',
    day: daysResult.officeForDead,
    templates: [{
      id: daysResult.officeForDead.id,
      label: 'Афіцый за памерлых',
      day: daysResult.officeForDead,
    }],
    reading: periodReadings[0] || fixedReadings[0] || null,
    order: 99,
    contextPeriodType: context.periodType,
  });

  if (!options.length
    && !daysResult.exclusiveFeastCode
    && !daysResult.exclusiveFixedDate
    && periodReadings.length) options.push({
    key: `period-reading-${mDate.format('YYYY-MM-DD')}`,
    source: LITURGICAL_OPTION_SOURCE.PERIOD,
    title: buildPeriodTitle(context),
    subtitle: 'Ёсць толькі чытанні',
    day: null,
    templates: [],
    reading: periodReadings[0],
    order: 4,
    contextPeriodType: context.periodType,
  });

  const dayOptions = options.sort((a, b) => (
    getLiturgicalCelebrationPriority(a.day) - getLiturgicalCelebrationPriority(b.day)
      || a.order - b.order
  )).map((option) => ({
    ...option,
    dayId: option.day?.id || null,
    readingId: option.reading?.id || null,
    hasLiturgicalDay: Boolean(option.day),
    hasReadings: Boolean(option.reading),
    disabled: false,
  }));

  return {
    context,
    itemsDays: [...dayMap.values()],
    itemsReadings: [...readingMap.values()],
    dayOptions,
  };
}
