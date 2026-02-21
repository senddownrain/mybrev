import { useLiturgicalDay } from '@/composables/useLiturgicalDay';
import { getReadingsForDate } from '@/services/readingsService';
import { getLiturgicalYear, getCycleForDate } from '@/utils/liturgicalCycle';
import { logger } from '@/utils/logger';
import moment from '@/utils/moment-be';

/**
 * Composable для работы с литургическими чтениями
 * Работает аналогично useLiturgicalDay, но для чтений
 * Использует ту же логику поиска: по периоду, по дате, по ключевому слову (динамические праздники)
 */
export function useLiturgicalReadings() {
  const { computeLiturgicalContextForDate, feastNameMap } = useLiturgicalDay();

  /**
   * Получить чтения для литургического дня (аналогично getLiturgicalOptionsForDate)
   * Использует ту же логику поиска, что и для литургических дней:
   * 1. По периоду (periodType, periodWeekNumber, dayOfWeek)
   * 2. По дате (фиксированные праздники)
   * 3. По ключевому слову (динамические праздники: Пасха, Пятидесятница и т.д.)
   * 
   * @param {Date|moment.Moment|string} currentDate - Дата
   * @param {Object} options - Дополнительные опции
   * @param {boolean} options.useCache - Использовать кэш (по умолчанию true)
   * @returns {Promise<{items: Array, context: Object}>} Объект с найденными чтениями и контекстом
   */
  async function getLiturgicalReadingsForDate(currentDate, options = {}) {
    const { useCache = true, } = options;
    const mDate = moment(currentDate).startOf('day');
    
    logger.log(`[LiturgicalReadings] Пошук чытанняў для ${mDate.format('YYYY-MM-DD')}`);
    
    try {
      // 1. Вычисляем литургический контекст для даты без запросов к коллекции days
      const context = await computeLiturgicalContextForDate(currentDate);
      
      // 2. Определяем цикл
      const liturgicalYear = await getLiturgicalYear(currentDate, { useCalendarStore: true });
      const cycle = await getCycleForDate(
        currentDate, 
        liturgicalYear, 
        context.dayOfWeek || mDate.isoWeekday(), 
        { useCalendarStore: true }
      );
      
      // 3. Используем _feast из контекста (уже вычислен в computeLiturgicalContextForDate)
      const _feast = context._feast || null;
      
      // 4. Ищем чтения с использованием вычисленного контекста
      logger.log(`[LiturgicalReadings] Контекст литургического дня:`, {
        periodType: context.periodType,
        periodWeek: context.periodWeek,
        dayOfWeek: context.dayOfWeek,
        cycle,
        _feast
      });
      
      const readingsOptions = {
        cycle,
        periodType: context.periodType,
        periodWeekNumber: context.periodWeek,
        dayOfWeek: context.dayOfWeek || mDate.isoWeekday(),
        _feast: _feast,
        useCache,
    };
      
      logger.log(`[LiturgicalReadings] Параметры поиска чтений:`, readingsOptions);
      
      const readings = await getReadingsForDate(currentDate, readingsOptions);
      
      logger.log(`[LiturgicalReadings] Знойдзена чытанняў: ${readings.length} для ${mDate.format('YYYY-MM-DD')}`);
      
      return {
        items: readings,
        context: {
          ...context,
          cycle,
          _feast,
        }
      };
    } catch (error) {
      logger.error(`[LiturgicalReadings] Памылка пошуку чытанняў для ${mDate.format('YYYY-MM-DD')}:`, error);
      throw error;
    }
  }

  /**
   * Получить чтения для сегодняшнего литургического дня
   */
  async function getLiturgicalReadingsForToday(options = {}) {
    return await getLiturgicalReadingsForDate(moment().toDate(), options);
  }

  return {
    getLiturgicalReadingsForDate,
    getLiturgicalReadingsForToday,
    feastNameMap, // Экспортируем для использования в компонентах
  };
}


