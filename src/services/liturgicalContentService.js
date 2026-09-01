/** Assemble liturgical-day options without querying the independent readings collection. */
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

function buildPeriodTitle(context, date) {
  return formatLiturgicalPeriodTitle({
    periodType: context.periodType,
    periodWeek: context.periodWeek,
    dayOfWeek: context.dayOfWeek,
    date,
  });
}

function buildDayTitle(day, context, date) {
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
    }, date);
  }
  if (day?._feastName) return day._feastName;
  return day?._title || day?._dayName || buildPeriodTitle(context, date);
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

export async function fetchContentForDate(mDate, context, dynamicFeastCodes = [], session) {
  logger.log(`[liturgicalContentService] Fetching ${mDate.format('YYYY-MM-DD')}`);
  const daysResult = await fetchDaysForDate(mDate, context, dynamicFeastCodes, session);
  const allDays = [
    ...daysResult.periodDays,
    ...daysResult.fixedDateDays,
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
  const options = [];

  daysResult.periodDays.forEach((day) => options.push({
    key: `period-${day.id}`,
    source: LITURGICAL_OPTION_SOURCE.PERIOD,
    title: buildDayTitle(day, context, mDate.format('YYYY-MM-DD')),
    subtitle: 'Літургічны дзень',
    day,
    templates: [{ id: day.id, label: 'Перыяд', day }],
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
      title: buildDayTitle(day, context, mDate.format('YYYY-MM-DD')) || code,
      subtitle: 'Свята',
      day,
      templates: [{ id: day.id, label: getTemplateLabel(day), day }],
      order: 2,
      contextPeriodType: context.periodType,
    }));
    });

  groupFixedCelebrationDays(daysResult.fixedDateDays).forEach(({ day, templates }) => options.push({
    key: `fixed-${getFixedCelebrationKey(day)}`,
    source: LITURGICAL_OPTION_SOURCE.FIXED,
    title: buildDayTitle(day, context, mDate.format('YYYY-MM-DD')) || `Дата ${day._date}`,
    titleIncludesWeekday: isSeasonalDateDocumentId(day.id),
    subtitle: fixedSubtitle(day, templates.length),
    day,
    templates,
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
    order: 99,
    contextPeriodType: context.periodType,
  });

  const dayOptions = options.sort((a, b) => (
    getLiturgicalCelebrationPriority(a.day) - getLiturgicalCelebrationPriority(b.day)
      || a.order - b.order
  )).map((option) => ({
    ...option,
    dayId: option.day?.id || null,
    hasLiturgicalDay: Boolean(option.day),
    disabled: false,
  }));

  return {
    context,
    itemsDays: [...dayMap.values()],
    dayOptions,
  };
}
