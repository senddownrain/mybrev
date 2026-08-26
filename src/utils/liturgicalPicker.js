import moment from './moment-be.js';
import { calculateBaptismOfLordDate } from './liturgicalCalendar.js';

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

/** Christmas ends with the Baptism of the Lord, not on a fixed January date. */
export function buildChristmasDateOptions(year) {
  const start = moment(`${Number(year)}-12-25`, 'YYYY-MM-DD');
  const end = calculateBaptismOfLordDate(Number(year) + 1);
  const options = [];
  for (const date = start.clone(); date.isSameOrBefore(end, 'day'); date.add(1, 'day')) {
    options.push(makeOption(date.year(), date.month() + 1, date.date()));
  }
  return options;
}

export function buildDateOptionsForPeriod(year, periodType) {
  if (periodType === 'advent') return buildAdventDateOptions(year);
  if (periodType === 'christmas') return buildChristmasDateOptions(year);
  return [];
}
