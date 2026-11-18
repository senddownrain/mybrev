export const LITURGICAL_HOURS = Object.freeze([
  {
    name: 'invitatorium',
    title: 'Заклік',
    subtitle: 'Invitatorium',
    icon: 'mdi-weather-sunset-up',
    tag: 'Уступ',
  },
  {
    name: 'morning',
    title: 'Агульная гадзіна',
    subtitle: 'Invitatorium · Officium lectionis · Laudes',
    icon: 'mdi-sun-clock-outline',
    tag: 'Раніца',
  },
  {
    name: 'lectionis',
    title: 'Гадзіна чытанняў',
    subtitle: 'Officium lectionis',
    icon: 'mdi-book-open-page-variant',
    tag: 'Разважанне',
  },
  {
    name: 'laudes',
    title: 'Ютрань',
    subtitle: 'Laudes matutinae',
    icon: 'mdi-weather-sunny',
    tag: 'Галоўная',
  },
  {
    name: 'terz',
    title: 'Малітва перад поўднем',
    subtitle: 'Tertia',
    icon: 'mdi-clock-time-nine-outline',
    tag: 'Малая',
  },
  {
    name: 'sext',
    title: 'Малітва апоўдні',
    subtitle: 'Sexta',
    icon: 'mdi-clock-time-twelve-outline',
    tag: 'Малая',
  },
  {
    name: 'non',
    title: 'Малітва пасля поўдня',
    subtitle: 'Nona',
    icon: 'mdi-clock-time-three-outline',
    tag: 'Малая',
  },
  {
    name: 'vesper',
    title: 'Нешпары',
    subtitle: 'Vesperae',
    icon: 'mdi-weather-night',
    tag: 'Галоўная',
  },
  {
    name: 'completorium',
    title: 'Камплета',
    subtitle: 'Completorium',
    icon: 'mdi-bed-clock',
    tag: 'Завяршэнне',
  },
]);

export const LITURGICAL_HOUR_TITLES = Object.freeze({
  ...Object.fromEntries(LITURGICAL_HOURS.map(({ name, title }) => [name, title])),
  oras: 'Літургія гадзінаў',
});

// Explicit reader-footer navigation (not the picker order).
// The combined morning Office and Compline are terminal; the Invitatory and
// Office of Readings both lead to Lauds. Keep the selected day/diocese/variant.
export const NEXT_LITURGICAL_HOUR = Object.freeze({
  invitatorium: 'laudes',
  lectionis: 'laudes',
  laudes: 'terz',
  terz: 'sext',
  sext: 'non',
  non: 'vesper',
  vesper: 'completorium',
});

export function liturgicalHourRoute(route, name, queryOverrides = {}) {
  const query = { ...route.query, ...queryOverrides };
  if (name !== 'vesper') delete query.firstVespersDayId;
  return { name, params: { day: route.params.day, id: route.params.id }, query };
}
