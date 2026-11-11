/**
 * Editorial additions to the web presentation of the approved Belarusian PDF.
 *
 * Do not mutate proper-calendar.json: it is a byte-faithful extraction of the
 * published PDF, and build-proper-calendar.py --check verifies that invariant.
 * The liturgical entry itself already exists in the universal Ordo layer.
 */
export const calendarAdditions = Object.freeze([
  Object.freeze({
    id: 'sv-juan-diego',
    month: 12,
    date: 9,
    title: 'Св. Яна Дыега Куаўхтлатаацына',
    rank: 'Неабавязковы ўспамін',
    ordoRank: 'memoria-ad-libitum',
  }),
]);

export function calendarAdditionFor(row) {
  return calendarAdditions.find(item => row.kind === 'line' && item.month === row.month && item.date === row.date) || null;
}
