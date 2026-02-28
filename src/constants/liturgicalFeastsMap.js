/**
 * Единая карта ключей динамических праздников → коды в Firestore.
 * Ключи должны совпадать с ключами в calendarStore.dynamicDatesForYear().
 * Re-export как feastNameMap для обратной совместимости в composables.
 */

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
  palmSunday: 'palmsunday',
  /** @deprecated используйте palmSunday (совпадает с calendar store) */
  palmsSnday: 'palmsunday',
  corpusChristi: 'corpuschristi',
  ascension: 'ascension',
};

/** Алиас для совместимости с кодом, ожидающим feastNameMap */
export const feastNameMap = FEAST_NAME_MAP;
