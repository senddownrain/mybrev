export const LITURGICAL_HOUR_TITLES = Object.freeze({
  invitatorium: 'Заклік',
  morning: 'Агульная гадзіна',
  lectionis: 'Гадзіна чытанняў',
  laudes: 'Ютрань',
  terz: 'Малітва перад поўднем',
  sext: 'Малітва апоўдні',
  non: 'Малітва пасля поўдня',
  vesper: 'Нешпары',
  completorium: 'Камплета',
  oras: 'Літургія гадзін',
});

// Canonical progression of the office. Invitatory is intentionally omitted:
// it belongs before either the Office of Readings or Lauds, so it has no one
// unambiguous successor. `morning` is the combined morning office.
export const NEXT_LITURGICAL_HOUR = Object.freeze({
  morning: 'terz',
  lectionis: 'laudes',
  laudes: 'terz',
  terz: 'sext',
  sext: 'non',
  non: 'vesper',
  vesper: 'completorium',
});
