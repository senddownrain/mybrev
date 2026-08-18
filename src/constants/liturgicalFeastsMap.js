/**
 * Единая карта ключей динамических праздников → коды в Firestore.
 * Ключи должны совпадать с ключами в calendarStore.dynamicDatesForYear().
 * Re-export как feastNameMap для обратной совместимости в composables.
 */

export const FEAST_NAME_MAP = {
  holyFamily: 'feast-holyfamily',
  baptismOfLord: 'feast-buptismofthelord',
  holyTrinity: 'feast-trinity',
  christKing: 'feast-christking',
  sacredHeartOfJesus: 'feast-heartofjesus',
  immaculateHeartOfMary: 'feast-heartofmary',
  christTheHighPriest: 'feast-christthehighpriest',
  ashWednesday: 'feast-ash',
  easterSunday: 'feast-eastersunday',
  pentecost: 'feast-pentecost',
  palmSunday: 'feast-palmsunday',
  /** @deprecated используйте palmSunday (совпадает с calendar store) */
  palmsSnday: 'feast-palmsunday',
  corpusChristi: 'feast-corpuschristi',
  ascension: 'feast-ascension',
};

/** Алиас для совместимости с кодом, ожидающим feastNameMap */
export const feastNameMap = FEAST_NAME_MAP;
