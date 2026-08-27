import { WEEKDAY_LABEL_MAP } from '../constants/liturgical.js';

const ROMAN_DIGITS = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

export function toRomanNumeral(value) {
  let remaining = Number(value);
  if (!Number.isInteger(remaining) || remaining < 1) return '';

  let result = '';
  ROMAN_DIGITS.forEach(([number, numeral]) => {
    while (remaining >= number) {
      result += numeral;
      remaining -= number;
    }
  });
  return result;
}

function weekLabel(periodType, periodWeek) {
  const week = toRomanNumeral(periodWeek);
  if (!week) return '';

  const labels = {
    ordinary: `${week} звычайны тыдзень`,
    advent: `${week} тыдзень Адвэнту`,
    lent: `${week} тыдзень Вялікага посту`,
    easter: `${week} велікодны тыдзень`,
    christmas: `${week} тыдзень перыяду Божага Нараджэння`,
  };
  return labels[periodType] || `${week} тыдзень`;
}

/** Whether an ISO or route date belongs to the Christmas octave. */
export function isChristmasOctaveDate(value) {
  const source = String(value || '');
  const isoMatch = source.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const routeMatch = source.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  const month = Number(isoMatch?.[2] ?? routeMatch?.[2]);
  const day = Number(isoMatch?.[3] ?? routeMatch?.[1]);
  return (month === 12 && day >= 25 && day <= 31) || (month === 1 && day === 1);
}

/** Адзіная карыстальніцкая назва дня літургічнага перыяду. */
export function formatLiturgicalPeriodTitle({ periodType, periodWeek, dayOfWeek, date }) {
  const dayName = WEEKDAY_LABEL_MAP[dayOfWeek] || '';
  const week = toRomanNumeral(periodWeek);

  if (periodType === 'christmas' && isChristmasOctaveDate(date)) {
    return `${dayName} у Актаве Нараджэння Пана`.trim();
  }

  if (Number(dayOfWeek) === 1 && week) {
    const sundayLabels = {
      ordinary: `${week} нядзеля звычайная`,
      advent: `${week} нядзеля Адвэнту`,
      lent: `${week} нядзеля Вялікага посту`,
      easter: `${week} велікодная нядзеля`,
      christmas: `${week} нядзеля пасля Нараджэння Пана`,
    };
    if (sundayLabels[periodType]) return sundayLabels[periodType];
  }

  const periodName = periodType === 'holyweek' ? 'Вялікі тыдзень' : weekLabel(periodType, periodWeek);
  const inlineDayName = dayName
    ? `${dayName.charAt(0).toLowerCase()}${dayName.slice(1)}`
    : '';

  return [periodName, inlineDayName].filter(Boolean).join(', ');
}
