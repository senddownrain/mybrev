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
  const { getLiturgicalOptionsForDate, feastNameMap } = useLiturgicalDay();

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
   * @param {boolean} options.includeReadingsData - Искать также в readingsData (по умолчанию true)
   * @returns {Promise<{items: Array, context: Object}>} Объект с найденными чтениями и контекстом
   */
  async function getLiturgicalReadingsForDate(currentDate, options = {}) {
    const { useCache = true, includeReadingsData = true } = options;
    const mDate = moment(currentDate).startOf('day');
    
    logger.log(`[LiturgicalReadings] Пошук чытанняў для ${mDate.format('YYYY-MM-DD')}`);
    
    try {
      // 1. Получаем литургический контекст для даты (используем ту же логику, что и для дней)
      const liturgicalData = await getLiturgicalOptionsForDate(currentDate);
      const context = liturgicalData?.context || {};
      
      // 2. Определяем цикл
      const liturgicalYear = await getLiturgicalYear(currentDate, { useCalendarStore: true });
      const cycle = await getCycleForDate(
        currentDate, 
        liturgicalYear, 
        context.dayOfWeek || mDate.isoWeekday(), 
        { useCalendarStore: true }
      );
      
      // 3. Определяем _feast для динамических праздников
      // Проверяем, есть ли в найденных днях динамический праздник
      let _feast = null;
      
      if (liturgicalData?.items && liturgicalData.items.length > 0) {
        // Ищем первый день с _feast (динамический праздник)
        const feastDay = liturgicalData.items.find(item => item._feast);
        if (feastDay && feastDay._feast) {
          _feast = feastDay._feast; // Используем значение _feast напрямую (например, 'eastersunday', 'pentecost')
          logger.log(`[LiturgicalReadings] Знойдзены дынамічны свята: ${_feast}`);
        }
      }
      
      // 4. Ищем чтения с использованием той же логики, что и для дней
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
        periodWeekNumber: context.periodWeek, // periodWeek из context
        dayOfWeek: context.dayOfWeek || mDate.isoWeekday(),
        _feast: _feast, // Используем _feast вместо feastId
        useCache,
        includeReadingsData: true, // Включаем fallback на readingsData, если в 'new' ничего не найдено
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


