/**
 * Валидация структуры документов readings
 */

import { PERIOD_TYPES, FEAST_NAME_MAP, DAY_OF_WEEK } from '@/constants/readings';
import { logger } from '@/utils/logger';
import moment from '@/utils/moment-be';

export function validateReading(data, options = {}) {
  const { partial = false } = options;

  if (!data || typeof data !== 'object') {
    return 'Данные чытання павінны быць аб\'ектам';
  }

  if (!partial && (!data.text || typeof data.text !== 'string' || data.text.trim().length === 0)) {
    return 'Поле text абавязковае і павінна змяшчаць тэкст';
  }

  if (data.text !== undefined && (typeof data.text !== 'string' || data.text.trim().length === 0)) {
    return 'Поле text павінна змяшчаць тэкст';
  }

  if (!partial) {
    const hasPeriod = data._periodType && data._periodWeekNumber !== undefined && data._dayOfWeek;
    const hasDate = !!data._date;
    const hasFeast = !!data._feast;

    if (!hasPeriod && !hasDate && !hasFeast) {
      return 'Павінен быць зададзены адзін з спосабаў ідэнтыфікацыі: перыяд, дата або свята';
    }
  }

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

  const hasDate = !!data._date;
  if (hasDate) {
    if (!/^\d{2}\.\d{2}$/.test(data._date)) {
      return `Няверны фармат даты: ${data._date}. Павінен быць DD.MM (напрыклад, 25.12)`;
    }
    const [day, month] = data._date.split('.').map(Number);
    if (month < 1 || month > 12) {
      return `Няверны месяц у даце: ${data._date}. Месяц павінен быць ад 1 да 12`;
    }
    if (day < 1 || day > 31) {
      return `Няверны дзень у даце: ${data._date}. Дзень павінен быць ад 1 да 31`;
    }
  }

  const hasFeast = !!data._feast;
  if (hasFeast) {
    if (typeof data._feast !== 'string' || data._feast.trim().length === 0) {
      return '_feast павінен быць непустым радком';
    }
    const validFeasts = Object.values(FEAST_NAME_MAP);
    if (!validFeasts.includes(data._feast.toLowerCase())) {
      logger.warn(`[readingsValidator] Невядомае значэнне _feast: ${data._feast}`);
    }
  }

  return true;
}

export function normalizeReading(data) {
  const normalized = { ...data };

  if (normalized._date) {
    if (normalized._date.includes('-')) {
      const mDate = moment(normalized._date);
      if (mDate.isValid()) {
        normalized._date = mDate.format('DD.MM');
      }
    } else {
      const match = String(normalized._date).trim().match(/^(\d{1,2})\.(\d{1,2})$/);
      if (match) {
        const day = Number(match[1]);
        const month = Number(match[2]);
        normalized._date = `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`;
      }
    }
  }

  if (normalized.feastId !== undefined) delete normalized.feastId;
  if (normalized.feastName !== undefined) delete normalized.feastName;
  if (normalized.feastDate !== undefined) delete normalized.feastDate;

  if (normalized._feast) {
    normalized._feast = normalized._feast.toLowerCase().trim();
  }

  if (normalized._periodWeekNumber !== undefined) {
    normalized._periodWeekNumber = Number.parseInt(normalized._periodWeekNumber, 10);
  }
  if (normalized._dayOfWeek !== undefined) {
    normalized._dayOfWeek = Number.parseInt(normalized._dayOfWeek, 10);
  }

  if (normalized.cycle !== undefined) {
    delete normalized.cycle;
  }

  if (normalized.text) {
    normalized.text = normalized.text.trim();
  }

  return normalized;
}
