import moment from '@/utils/moment-be';
import { useCalendarStore } from '@/stores/calendar';

/**
 * Утилиты для определения литургического цикла
 */

/**
 * Определить литургический год для даты
 * Литургический год начинается с 1-го воскресенья Адвента
 * 
 * @param {Date|moment.Moment|string} date - Дата
 * @param {Object} options - Опции
 * @param {boolean} options.useCalendarStore - Использовать calendarStore для точного расчета (по умолчанию false)
 * @returns {number} Литургический год
 */
export async function getLiturgicalYear(date, options = {}) {
  const { useCalendarStore: useStore = false } = options;
  
  // Если нужно использовать calendarStore для точности
  if (useStore) {
    try {
      const calendarStore = useCalendarStore();
      const mDate = moment(date);
      const year = mDate.year();
      
      // Загружаем опции для текущего и следующего года
      await calendarStore.getYearOptions(year);
      await calendarStore.getYearOptions(year + 1);
      
      const opts = calendarStore.optionsForYear(year).value;
      if (opts && opts.firstAdventSunday) {
        const firstAdvent = moment(opts.firstAdventSunday, 'YYYY-MM-DD');
        // Если дата после начала Адвента, литургический год = год + 1
        if (mDate.isSameOrAfter(firstAdvent)) {
          return year + 1;
        }
        return year;
      }
    } catch (error) {
      console.warn('[liturgicalCycle] Не удалось использовать calendarStore, используем упрощенный расчет:', error);
    }
  }
  
  // Упрощенный расчет (fallback)
  const mDate = moment(date);
  const year = mDate.year();
  
  // Находим 1-е воскресенье Адвента для этого года
  // Адвент начинается в воскресенье ближайшее к 30 ноября
  const november30 = moment(`${year}-11-30`);
  const adventStart = november30.clone().startOf('week');
  
  // Если 30 ноября - воскресенье, то Адвент начинается в этот день
  // Иначе - следующее воскресенье
  if (november30.day() === 0) {
    // 30 ноября - воскресенье, Адвент начинается здесь
  } else {
    // Адвент начинается в следующее воскресенье
    adventStart.add(1, 'week');
  }
  
  // Если дата после начала Адвента, литургический год = год + 1
  if (mDate.isSameOrAfter(adventStart)) {
    return year + 1;
  }
  
  return year;
}

/**
 * Определить цикл для даты
 * @param {Date|moment.Moment|string} date - Дата
 * @param {number} liturgicalYear - Литургический год (опционально)
 * @param {number} dayOfWeek - День недели (1=воскресенье, 7=суббота, опционально)
 * @param {Object} options - Опции для getLiturgicalYear
 * @returns {string} Цикл: 'A', 'B', 'C' для воскресений, '1' или '2' для будней
 */
export async function getCycleForDate(date, liturgicalYear = null, dayOfWeek = null, options = {}) {
  const mDate = moment(date);
  
  if (!liturgicalYear) {
    liturgicalYear = await getLiturgicalYear(date, options);
  }
  
  if (dayOfWeek === null || dayOfWeek === undefined) {
    dayOfWeek = mDate.isoWeekday(); // 1=понедельник, 7=воскресенье в ISO
    // Конвертируем в формат где 1=воскресенье
    dayOfWeek = dayOfWeek === 7 ? 1 : dayOfWeek + 1;
  }
  
  // Воскресенье или большой праздник - цикл A/B/C
  if (dayOfWeek === 1) {
    // Цикл A/B/C определяется по литургическому году
    // 2025 = C, 2026 = A, 2027 = B, и т.д.
    const cycleIndex = ((liturgicalYear - 2025) % 3 + 3) % 3; // Обработка отрицательных чисел
    return ['C', 'A', 'B'][cycleIndex];
  }
  
  // Будни Ordinary Time - цикл 1/2
  // В 2025 был цикл 1
  const cycleIndex = ((liturgicalYear - 2025) % 2 + 2) % 2;
  return cycleIndex === 0 ? '1' : '2';
}

/**
 * Получить базовый год для расчета цикла
 * 2025 год был базовым (C для воскресений, 1 для будней)
 */
export const BASE_YEAR = 2025;
export const BASE_SUNDAY_CYCLE = 'C';
export const BASE_WEEKDAY_CYCLE = '1';

