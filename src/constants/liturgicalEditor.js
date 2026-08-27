const fields = (prefix, definitions) => definitions.map(([suffix, title]) => ({
  key: `${prefix}${suffix}`,
  title,
}));

const psalmody = [
  ['Ant1', 'Антыфона 1'],
  ['Ps1', 'Псальм 1'],
  ['Ant2', 'Антыфона 2'],
  ['Ps2', 'Псальм 2'],
  ['Ant3', 'Антыфона 3'],
  ['Ps3', 'Псальм 3'],
];

export const DAY_EDITOR_SECTIONS = Object.freeze([
  {
    key: 'officeOfReadings',
    title: 'Гадзіна чытанняў',
    note: 'Te Deum дадаецца аўтаматычна паводле календарнага правіла.',
    fields: fields('officeOfReadings', [
      ['Hymn', 'Гімн'],
      ...psalmody,
      ['Vers', 'Верш'],
      ['R1', 'Першае чытанне і рэспансорый'],
      ['R2', 'Другое чытанне і рэспансорый'],
      ['Pr', 'Малітва'],
    ]),
  },
  {
    key: 'laudes',
    title: 'Ютрань',
    fields: fields('laudes', [
      ['Hymn', 'Гімн'],
      ...psalmody,
      ['R', 'Кароткае чытанне і рэспансорый'],
      ['AntBen', 'Антыфона да песні Захарыі'],
      ['Inter', 'Просьбы'],
      ['Pr', 'Малітва'],
    ]),
  },
  ...[1, 2, 3].map((hour) => ({
    key: `sext${hour}`,
    title: ['Малітва перад поўднем', 'Малітва апоўдні', 'Малітва пасля поўдня'][hour - 1],
    fields: fields(`sext${hour}`, [
      ['Hymn', 'Гімн'],
      ...psalmody,
      ['R', 'Кароткае чытанне і рэспансорый'],
      ['Pr', 'Малітва'],
    ]),
  })),
  {
    key: 'vesper',
    title: 'Нешпары',
    fields: fields('vesper', [
      ['Hymn', 'Гімн'],
      ...psalmody,
      ['R', 'Кароткае чытанне і рэспансорый'],
      ['AntMag', 'Антыфона да песні Марыі'],
      ['Inter', 'Просьбы'],
      ['Pr', 'Малітва'],
    ]),
  },
  {
    key: 'vesper1',
    title: 'Першыя Нешпары',
    fields: fields('vesper1', [
      ['Hymn', 'Гімн'],
      ...psalmody,
      ['R', 'Кароткае чытанне і рэспансорый'],
      ['AntMag', 'Антыфона да песні Марыі'],
      ['Inter', 'Просьбы'],
      ['Pr', 'Малітва'],
    ]),
  },
]);

export const INVITATORIUM_EDITOR_FIELDS = Object.freeze(
  [1, 2, 3, 4, 5, 6].map((number) => ({
    key: `invitatoriumPs${number}`,
    title: `Частка псальма ${number}`,
  })),
);

export const COMPLETORIUM_EDITOR_FIELDS = Object.freeze([
  { key: 'compHymn', title: 'Гімн' },
  { key: 'compAnt1', title: 'Антыфона 1' },
  { key: 'compPs1', title: 'Псальм 1' },
  { key: 'compAnt2', title: 'Антыфона 2' },
  { key: 'compPs2', title: 'Псальм 2' },
  { key: 'compR', title: 'Кароткае чытанне' },
  { key: 'compResp', title: 'Рэспансорый' },
  { key: 'compAntS', title: 'Антыфона да песні Сімяона' },
  { key: 'compPr', title: 'Малітва' },
  { key: 'compAntM', title: 'Заключная малітва да Найсвяцейшай Панны Марыі' },
]);

export const WEEKDAY_ASSEMBLY_FIELDS = Object.freeze({
  1: 'sunday',
  2: 'monday',
  3: 'tuesday',
  4: 'wednesday',
  5: 'thursday',
  6: 'friday',
  7: 'saturday',
});

export const ALL_DIRECT_DAY_EDITOR_FIELDS = Object.freeze([
  'feastComment',
  'invitatoriumAnt',
  ...DAY_EDITOR_SECTIONS.flatMap((section) => section.fields.map((field) => field.key)),
]);
