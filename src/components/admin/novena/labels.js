/** Belarusian labels shared by the novena admin screens. */
import { EXCLUDED } from '@/utils/novena/core.mjs';

export const EVENT_LABELS = {
  'good-friday': 'Вялікая пятніца',
  pentecost: 'Спасланне Духа Святога',
  trinity: 'Найсвяцейшая Тройца',
  'corpus-christi': 'Божае Цела',
  'sacred-heart': 'Найсвяцейшае Сэрца Езуса',
  'immaculate-heart': 'Беззаганнае Сэрца Марыі',
  'christ-king': 'Езус Хрыстус, Валадар Сусвету',
  'holy-family': 'Святая Сям’я',
};

export const TYPE_LABELS = {
  manual: 'Без прапановы (ручны пачатак)',
  fixedFeast: 'Ад фіксаванага свята',
  fixedStart: 'Фіксаваная дата пачатку',
  liturgical: 'Ад рухомага свята',
};

export const isExcluded = (id) => Object.hasOwn(EXCLUDED, id);

const pad = (value) => String(value).padStart(2, '0');

export function scheduleLabel(schedule) {
  if (!schedule) return '—';
  if (!schedule.enabled) return 'Прапанова выключана';
  const offset = schedule.offsetDays ? ` ${schedule.offsetDays > 0 ? '+' : '−'}${Math.abs(schedule.offsetDays)} дз.` : '';
  if (schedule.type === 'fixedFeast') return `Свята ${pad(schedule.day)}.${pad(schedule.month)}${offset}`;
  if (schedule.type === 'fixedStart') return `Пачатак ${pad(schedule.day)}.${pad(schedule.month)}`;
  if (schedule.type === 'liturgical') return `${EVENT_LABELS[schedule.event] || schedule.event}${offset}`;
  return schedule.extraDates?.length ? 'Разавыя даты' : 'Ручны пачатак';
}

export const formatDate = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

const ERRORS = [
  [/^missing-or-closed-prayer:(.*)$/, (id) => `Малітва адсутнічае або закрытая: ${id}`],
  [/^missing-section:[^:]*:(.*)$/, (heading) => `Раздзел не знойдзены: ${heading}`],
  [/^day-empty:(.*)$/, (day) => `Пусты дзень ${day}`],
  [/^source-prayer-missing-or-closed$/, () => 'Зыходная малітва адсутнічае або закрытая'],
  [/^unlinked-reference:(.*)$/, (item) => `Спасылка без малітвы: ${item}`],
  [/^decision-outdated:(.*)$/, (marker) => `Рашэнне па гэтай навэнне састарэла: тэкст малітвы змяніўся (${marker})`],
  [/^no-stated-order$/, () => 'У малітве няма парадку навэнны'],
  [/^uncovered-lines:(\d+):(.*)$/, (count, line) => `Тэкст па-за парадкам (радкоў: ${count}): ${line}`],
  [/^order-item-without-section:(.*)$/, (item) => `Пункт парадку без раздзела: ${item}`],
  [/^day-headings:(.*)$/, (days) => `Загалоўкі дзён: ${days}`],
  [/^template-empty$/, () => 'Парадак дня пусты'],
  [/^template-blocks$/, () => 'У парадку дня ёсць незапоўнены блок'],
  [/^day-blocks$/, () => 'Ва ўласных блоках дня ёсць незапоўнены блок'],
  [/^days$/, () => 'Спіс дзён не адпавядае колькасці дзён'],
  [/^durationDays$/, () => 'Колькасць дзён: ад 1 да 31'],
  [/^title$/, () => 'Пустая назва'],
  [/^schedule/, () => 'Каляндарнае правіла запоўнена няправільна'],
  [/^order-has-no-day-item$/, () => 'У парадку няма месца для малітваў дня'],
];

export function errorLabel(code) {
  for (const [pattern, label] of ERRORS) {
    const match = pattern.exec(code);
    if (match) return label(...match.slice(1));
  }
  return code;
}
