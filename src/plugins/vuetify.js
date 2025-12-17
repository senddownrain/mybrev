
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

import { createVuetify } from 'vuetify'

// Кастомная локализация для белорусского языка
const beLocale = {
  datePicker: {
    itemsSelected: '{0} выбрана',
    nextMonth: 'Наступны месяц',
    prevMonth: 'Папярэдні месяц',
    nextYear: 'Наступны год',
    prevYear: 'Папярэдні год',
  },
  datePickerTable: {
    title: 'Выбраць дату',
    ok: 'OK',
    cancel: 'Адмена',
  },
  datePickerMonthTable: {
    title: 'Выбраць месяц',
    january: 'Студзень',
    february: 'Люты',
    march: 'Сакавік',
    april: 'Красавік',
    may: 'Травень',
    june: 'Чэрвень',
    july: 'Ліпень',
    august: 'Жнівень',
    september: 'Верасень',
    october: 'Кастрычнік',
    november: 'Лістапад',
    december: 'Снежань',
  },
  datePickerDateTable: {
    title: 'Выбраць дату',
    sunday: 'Нд',
    monday: 'Пн',
    tuesday: 'Аў',
    wednesday: 'Ср',
    thursday: 'Чц',
    friday: 'Пт',
    saturday: 'Сб',
  },
  datePickerYearTable: {
    title: 'Выбраць год',
  },
}

export default createVuetify({
  components: {
  },
  theme: {
    themes: {},
  },
  locale: {
    locale: 'be',
    fallback: 'en',
    messages: {
      be: beLocale,
    },
  },
  defaults: {
    VDatePicker: {
      locale: 'be',
    },
  },
})