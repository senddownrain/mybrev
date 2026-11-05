
import '@/styles/mdi-subset.css'
import 'vuetify/styles'

import { createVuetify } from 'vuetify'
import { APP_THEME_COLORS } from '@/constants/appearance'

// Кастомная локализация для белорусского языка с белорусскими сокращениями месяцев
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
    january: 'студ',
    february: 'лют',
    march: 'сак',
    april: 'крас',
    may: 'трав',
    june: 'чэрв',
    july: 'ліп',
    august: 'жн',
    september: 'вер',
    october: 'кастр',
    november: 'ліст',
    december: 'снеж',
  },
  datePickerDateTable: {
    title: 'Выбраць дату',
    sunday: 'нд',
    monday: 'пн',
    tuesday: 'ат',
    wednesday: 'ср',
    thursday: 'чц',
    friday: 'пт',
    saturday: 'сб',
  },
  datePickerYearTable: {
    title: 'Выбраць год',
  },
}

const originalWarn = console.warn
console.warn = (...args) => {
  const message = args.map(arg => {
    try {
      return typeof arg === 'string' ? arg : String(arg)
    } catch {
      return '[object]'
    }
  }).join(' ')

  if (message.includes('Vuetify: Translation key "$vuetify.datePicker.ariaLabel.') && message.includes('not found in "be"')) {
    return
  }
  originalWarn(...args)
}

export default createVuetify({
  components: {
  },
  theme: {
    themes: {
      light: {
        dark: false,
        colors: { ...APP_THEME_COLORS.light },
      },
      marian: {
        dark: false,
        colors: { ...APP_THEME_COLORS.marian },
      },
      dark: {
        dark: true,
        colors: { ...APP_THEME_COLORS.dark },
      },
    },
  },
  locale: {
    locale: 'be',
    fallback: 'en',
    messages: {
      be: {
        ...beLocale,
        badge: 'Значок',
        open: 'Адкрыць',
        close: 'Закрыць',
        loading: 'Загрузка...',
        input: {
          clear: 'Ачысціць',
          prependAction: 'Дадатковае дзеянне перад полем',
          appendAction: 'Дадатковае дзеянне пасля поля',
        },
        datePicker: {
          ...beLocale.datePicker,
          ariaLabel: {
            selectDate: 'Выбраць дату',
            selectMonth: 'Выбраць месяц',
            selectYear: 'Выбраць год',
            nextMonth: 'Наступны месяц',
            previousMonth: 'Папярэдні месяц',
            nextYear: 'Наступны год',
            previousYear: 'Папярэдні год',
            currentDate: 'Бягучая дата: {0}',
          },
          monthTable: {
            jan: 'студ',
            feb: 'лют',
            mar: 'сак',
            apr: 'крас',
            may: 'трав',
            jun: 'чэрв',
            jul: 'ліп',
            aug: 'жн',
            sep: 'вер',
            oct: 'кастр',
            nov: 'ліст',
            dec: 'снеж',
          }
        },
      },
    },
  },
  defaults: {
    VDatePicker: {
      locale: 'be',
    },
    global: {
      disableVuetifyWarnings: true,
      hideVuetifyTranslationWarnings: true,
    },
  },
})
