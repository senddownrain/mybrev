/**
 * Валидация структуры документов readings
 */

import { PERIOD_TYPES, CYCLES, FEAST_NAME_MAP, DAY_OF_WEEK } from '@/constants/readings';
import moment from 'moment';

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
    const hasFeast = !!(data.feastId && data.feastName && data.feastDate);

    if (!hasPeriod && !hasDate && !hasFeast) {
      return 'Павінен быць зададзены адзін з спосабаў ідэнтыфікацыі: перыяд, дата або свята';
    }
  }

  // Валидация варианта 1: по периоду
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
  if (hasDate) {
    if (!moment(data._date, 'YYYY-MM-DD', true).isValid()) {
      return `Няверны фармат даты: ${data._date}. Павінен быць YYYY-MM-DD`;
    }
  }

  // Валидация варианта 3: по празднику
  if (hasFeast) {
    if (!data.feastId || typeof data.feastId !== 'string') {
      return 'feastId павінен быць радком';
    }
    if (!data.feastName || typeof data.feastName !== 'string') {
      return 'feastName павінен быць радком';
    }
    if (!moment(data.feastDate, 'YYYY-MM-DD', true).isValid()) {
      return `Няверны фармат feastDate: ${data.feastDate}. Павінен быць YYYY-MM-DD`;
    }
    // Проверка соответствия feastName маппингу (опционально)
    if (FEAST_NAME_MAP[data.feastId] && FEAST_NAME_MAP[data.feastId] !== data.feastName) {
      return `feastName не адпавядае маппінгу для ${data.feastId}. Чакаецца: ${FEAST_NAME_MAP[data.feastId]}`;
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

  // Нормализация даты
  if (normalized._date) {
    normalized._date = moment(normalized._date).format('YYYY-MM-DD');
  }
  if (normalized.feastDate) {
    normalized.feastDate = moment(normalized.feastDate).format('YYYY-MM-DD');
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

