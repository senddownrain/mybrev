import { WEEKDAY_LABEL_MAP } from '@/constants/liturgical';

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

/** Адзіная карыстальніцкая назва дня літургічнага перыяду. */
export function formatLiturgicalPeriodTitle({ periodType, periodWeek, dayOfWeek }) {
  const dayName = WEEKDAY_LABEL_MAP[dayOfWeek] || '';

  if (periodType === 'christmas' && Number(periodWeek) === 1) {
    return `${dayName} у Актаве Нараджэння Пана`.trim();
  }

  const periodName = periodType === 'holyweek' ? 'Вялікі тыдзень' : weekLabel(periodType, periodWeek);
  const inlineDayName = dayName
    ? `${dayName.charAt(0).toLowerCase()}${dayName.slice(1)}`
    : '';

  return [periodName, inlineDayName].filter(Boolean).join(', ');
}
