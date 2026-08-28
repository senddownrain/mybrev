import moment from 'moment';

// Переопределяем стандартную белорусскую локаль с кастомными сокращениями месяцев
moment.defineLocale('be', {
  months: {
    // Назвы месяцаў без даты (напрыклад, загаловак календара).
    standalone: [
      'студзень', 'люты', 'сакавік', 'красавік', 'май', 'чэрвень',
      'ліпень', 'жнівень', 'верасень', 'кастрычнік', 'лістапад', 'снежань'
    ],
    // Родны склон для дат: «25 жніўня 2026».
    format: [
      'студзеня', 'лютага', 'сакавіка', 'красавіка', 'мая', 'чэрвеня',
      'ліпеня', 'жніўня', 'верасня', 'кастрычніка', 'лістапада', 'снежня'
    ],
    isFormat: /D[oD]?(\[[^\]]*\]|\s)+MMMM?/
  },
  monthsShort: [
    'студ', 'лют', 'сак', 'крас', 'май', 'чэрв',
    'ліп', 'жн', 'вер', 'кастр', 'ліст', 'снеж'
  ],
  weekdays: [
    'нядзеля', 'панядзелак', 'аўторак', 'серада', 'чацвер', 'пятніца', 'субота'
  ],
  weekdaysShort: [
    'нд', 'пн', 'ат', 'ср', 'чц', 'пт', 'сб'
  ],
  weekdaysMin: [
    'нд', 'пн', 'ат', 'ср', 'чц', 'пт', 'сб'
  ],
  longDateFormat: {
    LT: 'HH:mm',
    LTS: 'HH:mm:ss',
    L: 'DD.MM.YYYY',
    LL: 'D MMMM YYYY',
    LLL: 'D MMMM YYYY HH:mm',
    LLLL: 'dddd, D MMMM YYYY HH:mm'
  },
  calendar: {
    sameDay: '[Сёння ў] LT',
    nextDay: '[Заўтра ў] LT',
    nextWeek: 'dddd [ў] LT',
    lastDay: '[Учора ў] LT',
    lastWeek: '[У мінулую] dddd [ў] LT',
    sameElse: 'L'
  },
  relativeTime: {
    future: 'праз %s',
    past: '%s таму',
    s: 'некалькі секунд',
    m: 'хвіліна',
    mm: '%d хвілін',
    h: 'гадзіна',
    hh: '%d гадзін',
    d: 'дзень',
    dd: '%d дзён',
    M: 'месяц',
    MM: '%d месяцаў',
    y: 'год',
    yy: '%d гадоў'
  },
  dayOfMonthOrdinalParse: /\d{1,2}/,
  ordinal: '%d',
  week: {
    dow: 1, // Monday is the first day of the week.
    doy: 7  // The week that contains Jan 7th is the first week of the year.
  }
});

// Активируем переопределенную белорусскую локаль
moment.locale('be');

export default moment;
