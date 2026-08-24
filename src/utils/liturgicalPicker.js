import moment from './moment-be.js';

const pad = (value) => String(value).padStart(2, '0');

function makeOption(year, month, day) {
  const date = moment(`${year}-${pad(month)}-${pad(day)}`, 'YYYY-MM-DD', true);
  return {
    token: `${pad(day)}.${pad(month)}`,
    isoDate: date.format('YYYY-MM-DD'),
    year: date.format('YYYY'),
    day: date.format('D'),
    month: date.format('MMM').replace('.', ''),
    monthFull: date.format('MMMM'),
    weekday: date.format('dddd'),
    weekdayShort: date.format('dd'),
  };
}

/** Advent's privileged ferias are selected by date, not period/week/day. */
export function buildAdventDateOptions(year) {
  return Array.from({ length: 8 }, (_, index) => makeOption(Number(year), 12, 17 + index));
}

/** The database stores the Christmas season as 25 Dec–12 Jan date entities. */
export function buildChristmasDateOptions(year) {
  const december = Array.from({ length: 7 }, (_, index) => makeOption(Number(year), 12, 25 + index));
  const january = Array.from({ length: 12 }, (_, index) => makeOption(Number(year) + 1, 1, index + 1));
  return [...december, ...january];
}

export function buildDateOptionsForPeriod(year, periodType) {
  if (periodType === 'advent') return buildAdventDateOptions(year);
  if (periodType === 'christmas') return buildChristmasDateOptions(year);
  return [];
}
