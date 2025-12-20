/**
 * Константы для системы чтений (readings)
 */

// Типы периодов литургического года
export const PERIOD_TYPES = {
  ADVENT: 'advent',
  CHRISTMAS: 'christmas',
  ORDINARY: 'ordinary',
  LENT: 'lent',
  EASTER: 'easter',
  HOLYWEEK: 'holyweek',
};

// Циклы чтений
export const CYCLES = {
  SUNDAY_A: 'A',
  SUNDAY_B: 'B',
  SUNDAY_C: 'C',
  WEEKDAY_1: '1',
  WEEKDAY_2: '2',
};

// Маппинг праздников
export const FEAST_NAME_MAP = {
  holyFamily: 'holyfamily',
  baptismOfLord: 'buptismofthelord',
  holyTrinity: 'trinity',
  christKing: 'christking',
  sacredHeartOfJesus: 'heartofjesus',
  immaculateHeartOfMary: 'heartofmary',
  christTheHighPriest: 'christthehighpriest',
  ashWednesday: 'ash',
  easterSunday: 'eastersunday',
  pentecost: 'pentecost',
  palmsSnday: 'palmsunday',
  corpusChristi: 'corpuschristi',
  ascension: 'ascension',
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

