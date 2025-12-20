/**
 * Валидация структуры документов readings
 */

import { PERIOD_TYPES, CYCLES, FEAST_NAME_MAP, DAY_OF_WEEK } from '@/constants/readings';
import { logger } from '@/utils/logger';

/**
 * Валидировать структуру чтения
 * @param {Object} data - Данные чтения
 * @param {Object} options - Опции валидации
 * @param {boolean} options.partial - Частичная валидация (для обновлений)
 * @returns {true|string} true если валидно, строка с ошибкой если нет
 */
export function validateReading(data, options = {}) {
  const { partial = false } = options;
  
  if (!data || typeof data !== 'object') {
    return 'Данные чытання павінны быць аб\'ектам';
  }

  // Проверка обязательного поля cycle (только если не частичное обновление)
  if (!partial && !data.cycle) {
    return 'Поле cycle абавязковае';
  }

  if (data.cycle !== undefined) {
    const validCycles = ['A', 'B', 'C', '1', '2'];
    if (!validCycles.includes(data.cycle)) {
      return `Цыкл павінен быць адным з: ${validCycles.join(', ')}`;
    }
  }

  // Проверка обязательного поля text (только если не частичное обновление)
  if (!partial && (!data.text || typeof data.text !== 'string' || data.text.trim().length === 0)) {
    return 'Поле text абавязковае і павінна змяшчаць тэкст';
  }

  if (data.text !== undefined && (typeof data.text !== 'string' || data.text.trim().length === 0)) {
    return 'Поле text павінна змяшчаць тэкст';
  }

  // Проверка наличия хотя бы одного способа идентификации (только если не частичное обновление)
  if (!partial) {
    const hasPeriod = data._periodType && data._periodWeekNumber !== undefined && data._dayOfWeek;
    const hasDate = !!data._date;
    const hasFeast = !!data._feast; // Используем _feast вместо feastId/feastName/feastDate

    if (!hasPeriod && !hasDate && !hasFeast) {
      return 'Павінен быць зададзены адзін з спосабаў ідэнтыфікацыі: перыяд, дата або свята';
    }
  }

  // Валидация варианта 1: по периоду
  const hasPeriod = data._periodType && data._periodWeekNumber !== undefined && data._dayOfWeek;
  if (hasPeriod) {
    if (!Object.values(PERIOD_TYPES).includes(data._periodType)) {
      return `Няверны тып перыяду: ${data._periodType}`;
    }
    if (typeof data._periodWeekNumber !== 'number' || data._periodWeekNumber < 1) {
      return 'Нумар тыдня павінен быць станоўчым лікам';
    }
    if (!Object.values(DAY_OF_WEEK).includes(data._dayOfWeek)) {
      return `Няверны дзень тыдня: ${data._dayOfWeek}. Павінен быць ад 1 да 7`;
    }
  }

  // Валидация варианта 2: по дате
  const hasDate = !!data._date;
  if (hasDate) {
    // Формат D.M (день.месяц), унифицирован с коллекцией days
    if (!/^\d{1,2}\.\d{1,2}$/.test(data._date)) {
      return `Няверны фармат даты: ${data._date}. Павінен быць D.M (напрыклад, 25.12)`;
    }
    // Проверяем, что дата валидна (месяц от 1 до 12, день от 1 до 31)
    const [day, month] = data._date.split('.').map(Number);
    if (month < 1 || month > 12) {
      return `Няверны месяц у даце: ${data._date}. Месяц павінен быць ад 1 да 12`;
    }
    if (day < 1 || day > 31) {
      return `Няверны дзень у даце: ${data._date}. Дзень павінен быць ад 1 да 31`;
    }
  }

  // Валидация варианта 3: по празднику (динамический праздник)
  const hasFeast = !!data._feast;
  if (hasFeast) {
    if (typeof data._feast !== 'string' || data._feast.trim().length === 0) {
      return '_feast павінен быць непустым радком';
    }
    // Проверяем, что значение _feast соответствует одному из известных праздников
    const validFeasts = Object.values(FEAST_NAME_MAP);
    if (!validFeasts.includes(data._feast.toLowerCase())) {
      logger.warn(`[readingsValidator] Невядомае значэнне _feast: ${data._feast}`);
      // Не возвращаем ошибку, так как могут быть новые праздники
    }
  }

  return true;
}

/**
 * Нормализовать данные чтения перед сохранением
 * @param {Object} data - Данные чтения
 * @returns {Object} Нормализованные данные
 */
export function normalizeReading(data) {
  const normalized = { ...data };

  // Нормализация даты: формат D.M (день.месяц)
  if (normalized._date) {
    // Если дата в формате YYYY-MM-DD или другом, преобразуем в D.M
    if (normalized._date.includes('-')) {
      const mDate = moment(normalized._date);
      if (mDate.isValid()) {
        normalized._date = mDate.format('D.M'); // Формат D.M
      }
    } else if (/^\d{1,2}\.\d{1,2}$/.test(normalized._date)) {
      // Уже в правильном формате, но убираем ведущие нули для единообразия
      const [day, month] = normalized._date.split('.').map(Number);
      normalized._date = `${day}.${month}`;
    }
  }

  // Удаляем старые поля feastId, feastName, feastDate (если есть)
  if (normalized.feastId !== undefined) {
    delete normalized.feastId;
  }
  if (normalized.feastName !== undefined) {
    delete normalized.feastName;
  }
  if (normalized.feastDate !== undefined) {
    delete normalized.feastDate;
  }

  // Нормализация _feast (если есть)
  if (normalized._feast) {
    normalized._feast = normalized._feast.toLowerCase().trim();
  }

  // Нормализация числовых полей
  if (normalized._periodWeekNumber !== undefined) {
    normalized._periodWeekNumber = parseInt(normalized._periodWeekNumber, 10);
  }
  if (normalized._dayOfWeek !== undefined) {
    normalized._dayOfWeek = parseInt(normalized._dayOfWeek, 10);
  }

  // Нормализация текста (удаление лишних пробелов)
  if (normalized.text) {
    normalized.text = normalized.text.trim();
  }

  return normalized;
}

