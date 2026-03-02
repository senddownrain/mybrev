/**
 * Константы для системы чтений (readings)
 */

// Карта праздников — единый источник в constants/liturgicalFeastsMap.js
export { FEAST_NAME_MAP } from './liturgicalFeastsMap';

// Типы периодов литургического года
export const PERIOD_TYPES = {
  ADVENT: 'advent',
  CHRISTMAS: 'christmas',
  ORDINARY: 'ordinary',
  LENT: 'lent',
  EASTER: 'easter',
  HOLYWEEK: 'holyweek',
};


// Дни недели (1 = воскресенье, 7 = суббота)
export const DAY_OF_WEEK = {
  SUNDAY: 1,
  MONDAY: 2,
  TUESDAY: 3,
  WEDNESDAY: 4,
  THURSDAY: 5,
  FRIDAY: 6,
  SATURDAY: 7,
};

