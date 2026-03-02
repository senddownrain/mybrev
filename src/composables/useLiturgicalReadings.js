import { useLiturgicalDay } from '@/composables/useLiturgicalDay';
import { getReadingsForDate } from '@/services/readingsService';
import { logger } from '@/utils/logger';
import moment from '@/utils/moment-be';

/**
 * Composable для работы с литургическими чтениями
 */
export function useLiturgicalReadings() {
  const { computeLiturgicalContextForDate, feastNameMap } = useLiturgicalDay();

  async function getLiturgicalReadingsForDate(currentDate, options = {}) {
    const { useCache = true } = options;
    const mDate = moment(currentDate).startOf('day');

    logger.log(`[LiturgicalReadings] Пошук чытанняў для ${mDate.format('YYYY-MM-DD')}`);

    try {
      const context = await computeLiturgicalContextForDate(currentDate);
      const _feast = context._feast || null;

      const readingsOptions = {
        periodType: context.periodType,
        periodWeekNumber: context.periodWeek,
        dayOfWeek: context.dayOfWeek || mDate.isoWeekday(),
        _feast,
        useCache,
      };

      logger.log('[LiturgicalReadings] Параметры поиска чтений:', readingsOptions);

      const readings = await getReadingsForDate(currentDate, readingsOptions);

      logger.log(`[LiturgicalReadings] Знойдзена чытанняў: ${readings.length} для ${mDate.format('YYYY-MM-DD')}`);

      return {
        items: readings,
        context: {
          ...context,
          _feast,
        },
      };
    } catch (error) {
      logger.error(`[LiturgicalReadings] Памылка пошуку чытанняў для ${mDate.format('YYYY-MM-DD')}:`, error);
      throw error;
    }
  }

  async function getLiturgicalReadingsForToday(options = {}) {
    return await getLiturgicalReadingsForDate(moment().toDate(), options);
  }

  return {
    getLiturgicalReadingsForDate,
    getLiturgicalReadingsForToday,
    feastNameMap,
  };
}
