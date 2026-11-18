/**
 * Editorial additions to the web presentation of the approved Belarusian PDF.
 *
 * Do not mutate proper-calendar.json: it is a byte-faithful extraction of the
 * published PDF, and build-proper-calendar.py --check verifies that invariant.
 * Editorial presentation corrections leave the source extraction unchanged.
 */
export const calendarAdditions = Object.freeze([
  Object.freeze({
    id: 'sv-juan-diego',
    month: 12,
    date: 9,
    title: 'Св. Хуана Дыега Куаўтлатаацына',
    rank: '', // In the published calendar, optional memorials have an empty rank column.
    ordoRank: 'memoria-ad-libitum',
  }),
  // The PDF has a typo in the 10 December title; correct only its presentation.
  Object.freeze({
    id: 'mother-of-god-loreto',
    month: 12,
    date: 10,
    title: 'Маці Божай Ларэтанскай',
    rank: '',
    ordoRank: 'memoria-ad-libitum',
  }),
]);

export function calendarAdditionFor(row) {
  return calendarAdditions.find(item => row.kind === 'line' && item.month === row.month && item.date === row.date) || null;
}
