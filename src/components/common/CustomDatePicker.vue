<template>
  <div class="custom-date-picker">
    <div class="calendar-header">
      <v-btn
        v-if="!hideHeader"
        icon="mdi-chevron-left"
        variant="text"
        size="default"
        class="month-nav-btn"
        aria-label="Папярэдні месяц"
        @click="previousMonth"
      />
      <div v-else aria-hidden="true"></div>
      
      <div class="calendar-period">
        <v-select
          v-model="selectedMonth"
          :items="months"
          variant="plain"
          density="compact"
          hide-details
          class="month-select"
          aria-label="Месяц"
          :menu-props="selectMenuProps"
          @update:model-value="onMonthChange"
        ></v-select>
        
        <v-select
          v-model="selectedYear"
          :items="years"
          variant="plain"
          density="compact"
          hide-details
          class="year-select"
          aria-label="Год"
          :menu-props="selectMenuProps"
          @update:model-value="onYearChange"
        ></v-select>
      </div>
      
      <v-btn
        v-if="!hideHeader"
        icon="mdi-chevron-right"
        variant="text"
        size="default"
        class="month-nav-btn"
        aria-label="Наступны месяц"
        @click="nextMonth"
      />
      <div v-else aria-hidden="true"></div>
    </div>

    <div class="weekday-row">
      <div
        v-for="(day, index) in weekDays"
        :key="`${day}-${index}`"
        class="weekday-header text-center"
        :class="{ 'weekend': index > 4 }"
      >
        {{ day }}
      </div>
    </div>

    <div class="calendar-grid">
      <div
        v-for="(week, weekIndex) in calendarWeeks"
        :key="weekIndex"
        class="calendar-week"
      >
        <div
          v-for="(day, dayIndex) in week"
          :key="day ? day.format('YYYY-MM-DD') : dayIndex"
          class="calendar-day text-center"
        >
          <v-btn
            v-if="day"
            variant="text"
            :class="{
              'is-selected': isSelected(day),
              'is-today': isToday(day),
              'is-adjacent': !isCurrentMonth(day),
              'is-weekend': dayIndex > 4,
              'day-btn--liturgical': liturgical
            }"
            :aria-label="dayLabel(day)"
            :aria-pressed="isSelected(day)"
            class="day-btn"
            :style="liturgical ? { '--day-colors': dayGradient(day) } : undefined"
            @click="selectDate(day)"
          >
            <span>{{ day.date() }}</span>
          </v-btn>
        </div>
      </div>
    </div>

    <!-- Legal options of the selected date: navigation happens only after
         one of them is chosen. -->
    <div v-if="liturgical && showOptions && selectedOptions.length" class="day-options" role="group" :aria-label="`Варыянты на ${selectedLabel}`">
      <p class="day-options__title">{{ selectedLabel }}</p>
      <button
        v-for="option in selectedOptions"
        :key="option.id"
        type="button"
        class="day-option"
        @click="emit('select-option', { option, date: selectedIso })"
      >
        <span class="day-option__dot" :style="{ background: option.swatch }" :title="option.colorLabel" aria-hidden="true"></span>
        <span class="day-option__copy">
          <span class="day-option__title">{{ option.title }}</span>
          <small v-if="option.rank || option.badges?.length">{{ [option.rank, ...(option.badges || [])].filter(Boolean).join(' · ') }}</small>
        </span>
        <v-icon icon="mdi-chevron-right" size="18" class="day-option__arrow"></v-icon>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import moment from '@/utils/moment-be'
import { ordoCalendarEpoch } from '@/utils/ordoCalendarState'
import { colorGradient, pickerColorsOf, pickerOptionsOf } from '@/utils/ordoDatePicker'
import { colorInfo } from '@/utils/ordoScreen'

const props = defineProps({
  modelValue: {
    type: [Date, String],
    default: null
  },
  color: {
    type: String,
    default: 'primary'
  },
  firstDayOfWeek: {
    type: Number,
    default: 1 // 1 = понедельник
  },
  hideHeader: {
    type: Boolean,
    default: false
  },
  showAdjacentMonths: {
    type: Boolean,
    default: false
  },
  // Liturgical calendar: every date carries the colour(s) of its legal
  // Offices, resolved for `diocese`.
  liturgical: {
    type: Boolean,
    default: false
  },
  // One diocese or the dioceses of Settings (colours and options of all).
  diocese: {
    type: [String, Array],
    default: ''
  },
  // List the legal options of the selected date under the grid.
  showOptions: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'select-option'])

const isoOf = (day) => day.format('YYYY-MM-DD')
const dayColors = (day) => (ordoCalendarEpoch.value, pickerColorsOf(isoOf(day), props.diocese))
const dayGradient = (day) => colorGradient(dayColors(day))
const dayLabel = (day) => {
  const date = day.format('D MMMM YYYY')
  if (!props.liturgical) return date
  return `${date}, ${dayColors(day).map((color) => colorInfo(color).label.toLowerCase()).join(' або ')}`
}
const selectedIso = computed(() => (props.modelValue && moment(props.modelValue).isValid() ? isoOf(moment(props.modelValue)) : ''))
const selectedLabel = computed(() => (selectedIso.value ? moment(selectedIso.value, 'YYYY-MM-DD').format('D MMMM, dddd') : ''))
const selectedOptions = computed(() => (props.liturgical && selectedIso.value
  ? (ordoCalendarEpoch.value, pickerOptionsOf(selectedIso.value, props.diocese)) : []))

// Глобальные стили меню скрывают overflow у всех v-select. Для календаря
// длинные списки (12 месяцев и диапазон лет) должны оставаться прокручиваемыми.
const selectMenuProps = {
  contentClass: 'date-picker-select-menu',
  maxHeight: 320
}

// Текущий месяц для отображения
const currentMonth = ref(moment())

// Выбранный месяц и год для селектов
const selectedMonth = ref(moment().month())
const selectedYear = ref(moment().year())

// Инициализация с modelValue
watch(() => props.modelValue, (newValue) => {
  if (newValue) {
    const mDate = moment(newValue)
    if (mDate.isValid()) {
      currentMonth.value = mDate.clone().startOf('month')
      selectedMonth.value = mDate.month()
      selectedYear.value = mDate.year()
    }
  }
}, { immediate: true })

// Синхронизация селектов при изменении currentMonth через навигацию
watch(currentMonth, (newMonth) => {
  selectedMonth.value = newMonth.month()
  selectedYear.value = newMonth.year()
})

// Список месяцев на белорусском
const months = computed(() => {
  const monthsList = []
  for (let i = 0; i < 12; i++) {
    const monthMoment = moment().month(i)
    monthsList.push({
      title: monthMoment.format('MMMM'),
      value: i
    })
  }
  return monthsList
})

// Список лет (от текущего года -10 до +10)
const years = computed(() => {
  const yearsList = []
  const currentYear = moment().year()
  for (let i = currentYear - 10; i <= currentYear + 10; i++) {
    yearsList.push({
      title: String(i),
      value: i
    })
  }
  return yearsList
})

// Обработка изменения месяца
const onMonthChange = (monthIndex) => {
  currentMonth.value = currentMonth.value.clone().month(monthIndex)
  selectedMonth.value = monthIndex
}

// Обработка изменения года
const onYearChange = (year) => {
  currentMonth.value = currentMonth.value.clone().year(year)
  selectedYear.value = year
}

// Дни недели на белорусском
const weekDays = computed(() => {
  const days = []
  const startDay = props.firstDayOfWeek ?? 1 // 0 = воскресенье, 1 = понедельник
  
  // Moment.js использует: 0 = воскресенье, 1 = понедельник, ..., 6 = суббота
  // Если firstDayOfWeek = 1 (понедельник), начинаем с понедельника (day = 1)
  // Если firstDayOfWeek = 0 (воскресенье), начинаем с воскресенья (day = 0)
  for (let i = 0; i < 7; i++) {
    const dayIndex = (startDay + i) % 7
    const dayMoment = moment().day(dayIndex)
    days.push(dayMoment.format('dd'))
  }
  
  return days
})

// Генерация календарных недель
const calendarWeeks = computed(() => {
  const weeks = []
  const start = currentMonth.value.clone().startOf('month')
  
  // Находим первый день недели для отображения
  // Moment.js: day() возвращает 0 (воскресенье) до 6 (суббота)
  // firstDayOfWeek: 0 = воскресенье, 1 = понедельник
  const firstDayOfWeek = props.firstDayOfWeek ?? 1
  let currentDay = start.clone()
  
  // Переходим к первому дню недели для отображения
  const dayOfWeek = currentDay.day() // 0-6, где 0 = воскресенье
  // Monday calendars shift Sunday by six cells; Sunday calendars use day() directly.
  const diff = firstDayOfWeek === 1
    ? (dayOfWeek === 0 ? 6 : dayOfWeek - 1)
    : dayOfWeek
  
  currentDay.subtract(diff, 'days')
  
  // Отрисовываем только недели, которые действительно занимает месяц.
  const daysInMonth = currentMonth.value.daysInMonth()
  const weekCount = Math.ceil((diff + daysInMonth) / 7)

  for (let weekIndex = 0; weekIndex < weekCount; weekIndex++) {
    const week = []
    
    for (let i = 0; i < 7; i++) {
      const isCurrentMonth = currentDay.isSame(currentMonth.value, 'month')
      
      if (props.showAdjacentMonths || isCurrentMonth) {
        week.push(currentDay.clone())
      } else {
        week.push(null)
      }
      currentDay.add(1, 'day')
    }
    
    weeks.push(week)
  }
  
  return weeks
})

// Проверка, является ли день выбранным
const isSelected = (day) => {
  if (!props.modelValue || !day) return false
  const selectedMoment = moment(props.modelValue)
  return day.isSame(selectedMoment, 'day')
}

// Проверка, является ли день сегодняшним
const isToday = (day) => {
  if (!day) return false
  return day.isSame(moment(), 'day')
}

// Проверка, относится ли день к текущему месяцу
const isCurrentMonth = (day) => {
  if (!day) return false
  return day.isSame(currentMonth.value, 'month')
}

// Выбор даты
const selectDate = (day) => {
  if (!day) return
  if (!isCurrentMonth(day)) {
    currentMonth.value = day.clone().startOf('month')
  }
  emit('update:modelValue', day.toDate())
}

// Навигация по месяцам
const previousMonth = () => {
  currentMonth.value = currentMonth.value.clone().subtract(1, 'month')
  selectedMonth.value = currentMonth.value.month()
  selectedYear.value = currentMonth.value.year()
}

const nextMonth = () => {
  currentMonth.value = currentMonth.value.clone().add(1, 'month')
  selectedMonth.value = currentMonth.value.month()
  selectedYear.value = currentMonth.value.year()
}
</script>

<style scoped>
.custom-date-picker {
  width: min(100%, 390px);
  min-width: 0;
  margin-inline: auto;
  box-sizing: border-box;
  padding: 6px 16px 18px;
  color: var(--nav-on-surface);
  container-type: inline-size;
}

.calendar-header {
  display: grid;
  --month-arrow-size: clamp(32px, 10cqw, 40px);
  grid-template-columns: var(--month-arrow-size) minmax(0, 1fr) var(--month-arrow-size);
  align-items: center;
  gap: 4px;
  min-height: 52px;
}

.calendar-period {
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(64px, 20cqw, 76px);
  align-items: center;
  gap: 0;
  min-width: 0;
  border: 1px solid var(--nav-border);
  border-radius: 24px;
  background: var(--nav-active);
  overflow: hidden;
}

.month-nav-btn {
  width: var(--month-arrow-size) !important;
  min-width: var(--month-arrow-size) !important;
  height: var(--month-arrow-size) !important;
  border: 1px solid var(--nav-border);
  color: var(--nav-on-surface);
  background: var(--nav-active);
  box-shadow: 0 2px 8px var(--nav-button-shadow);
  transition: transform 160ms ease, background-color 160ms ease;
}

.month-nav-btn:active {
  transform: scale(0.92);
}

.weekday-row,
.calendar-week {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.weekday-row {
  margin: 2px 0 7px;
  padding-bottom: 7px;
  border-bottom: 1px solid var(--nav-border);
}

.weekday-header {
  padding: 8px 0;
  color: var(--nav-muted);
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.weekday-header.weekend {
  color: var(--nav-on-surface);
}

.calendar-grid {
  display: grid;
  gap: 2px;
}

.calendar-week {
  min-height: 44px;
}

.calendar-day {
  min-width: 0;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.day-btn {
  min-width: 40px !important;
  width: 40px;
  height: 40px;
  padding: 0 !important;
  border-radius: 50%;
  font-size: 0.92rem;
  color: var(--nav-on-surface);
  font-weight: 620;
  letter-spacing: 0;
  transition: background-color 160ms ease, color 160ms ease, transform 160ms ease;
}

.day-btn:hover {
  background: var(--nav-active);
  transform: translateY(-1px);
}

.day-btn.is-selected {
  color: var(--calendar-on-accent, var(--nav-surface)) !important;
  background: var(--calendar-accent, var(--nav-on-surface));
  box-shadow: 0 6px 16px var(--nav-shadow);
  font-weight: 700;
}

.day-btn.is-today:not(.is-selected) {
  color: var(--calendar-accent, var(--nav-on-surface));
  background: var(--calendar-accent-soft, var(--nav-active));
  box-shadow: inset 0 0 0 1.5px var(--calendar-accent, var(--nav-on-surface));
  font-weight: 700;
}

/* Liturgical colour(s) of the date: a ring, so the number stays readable
   for every colour; several legal colours become segments of the ring. */
.day-btn--liturgical::before {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: var(--day-colors, transparent);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px));
  opacity: 0.95;
  pointer-events: none;
}

.day-btn--liturgical.is-selected::before {
  inset: -3px;
}

.day-btn--liturgical.is-today:not(.is-selected) {
  box-shadow: none;
}

.day-options {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--nav-border);
}

.day-options__title {
  margin: 0 4px 6px;
  color: var(--nav-muted);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.day-option {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  min-height: 46px;
  padding: 7px 8px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--nav-on-surface);
  font: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.day-option:hover,
.day-option:focus-visible {
  background: var(--nav-active);
  outline: none;
}

.day-option__dot {
  flex: 0 0 12px;
  width: 12px;
  height: 12px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  border-radius: 50%;
}

.day-option__copy {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: 1px;
}

.day-option__title {
  font-size: 0.88rem;
  font-weight: 620;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.day-option__copy small {
  color: var(--nav-muted);
  font-size: 0.72rem;
}

.day-option__arrow {
  color: var(--nav-muted);
}

.day-btn.is-weekend:not(.is-selected):not(.is-today) {
  color: var(--nav-on-surface);
}

.day-btn.is-adjacent {
  opacity: 0.28;
}

.month-select,
.year-select {
  width: 100%;
  min-width: 0;
  margin-bottom: 0 !important;
  text-align: center;
}

.month-select :deep(.v-field),
.year-select :deep(.v-field) {
  height: 46px !important;
  min-height: 46px !important;
  padding: 0 4px !important;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--nav-on-surface);
}

.month-select :deep(.v-field__input),
.year-select :deep(.v-field__input) {
  min-height: 44px !important;
  padding: 0 !important;
}

.month-select :deep(.v-select__selection),
.year-select :deep(.v-select__selection) {
  min-width: 0;
  color: var(--nav-on-surface);
  font-size: clamp(0.8125rem, 4.5cqw, 1rem) !important;
  font-weight: 760 !important;
  margin: 0 !important;
  text-align: center !important;
  justify-content: center !important;
  display: flex !important;
  align-items: center !important;
}

.month-select :deep(.v-field__input),
.year-select :deep(.v-field__input) {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.month-select :deep(.v-field__append-inner),
.year-select :deep(.v-field__append-inner) {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.month-select :deep(.v-select__selection-text),
.year-select :deep(.v-select__selection-text) {
  min-width: 0;
  overflow: hidden;
  text-align: center !important;
  width: 100% !important;
  display: flex !important;
  justify-content: center !important;
}

.month-select :deep(.v-field__append-inner),
.year-select :deep(.v-field__append-inner) {
  color: var(--nav-on-surface);
  opacity: 0.52;
  padding-inline-start: 0;
  font-size: 16px;
}

:global(.v-menu > .date-picker-select-menu.v-overlay__content > .v-list) {
  max-height: min(320px, calc(100vh - 32px));
  overflow-y: auto !important;
  overscroll-behavior: contain;
}

.month-select :deep(.v-field__append-inner .v-icon),
.year-select :deep(.v-field__append-inner .v-icon) {
  font-size: 16px;
  width: 16px;
  height: 16px;
}

/* Both segments keep their existing VSelect keyboard/focus behavior. */
.year-select { position: relative; }
.year-select::before {
  content: '';
  position: absolute;
  inset-block: 12px;
  inset-inline-start: 0;
  z-index: 1;
  width: 1px;
  background: var(--nav-border);
  pointer-events: none;
}

.month-select :deep(.v-field--focused),
.year-select :deep(.v-field--focused) {
  box-shadow: inset 0 -2px 0 var(--focus-ring) !important;
  background: var(--nav-active);
}

@media (max-width: 430px) {
  .custom-date-picker { padding-inline: 12px; }
}

@container (max-width: 350px) {
  .day-btn {
    min-width: 36px !important;
    width: 36px;
    height: 36px;
  }
}
</style>

