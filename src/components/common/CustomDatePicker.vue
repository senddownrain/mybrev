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
            :color="isSelected(day) ? color : undefined"
            :class="{
              'is-selected': isSelected(day),
              'is-today': isToday(day),
              'is-adjacent': !isCurrentMonth(day),
              'is-weekend': dayIndex > 4
            }"
            :aria-label="day.format('D MMMM YYYY')"
            :aria-pressed="isSelected(day)"
            class="day-btn"
            @click="selectDate(day)"
          >
            <span>{{ day.date() }}</span>
          </v-btn>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import moment from '@/utils/moment-be'

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
  }
})

const emit = defineEmits(['update:modelValue'])

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
  let diff = 0
  
  if (firstDayOfWeek === 1) {
    // Если начинаем с понедельника (1)
    // Нужно отступить назад до понедельника
    // dayOfWeek: 0 (вс) -> diff = 6, 1 (пн) -> diff = 0, 2 (вт) -> diff = 1, ...
    diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  } else {
    // Если начинаем с воскресенья (0)
    diff = dayOfWeek
  }
  
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
  min-width: 300px;
  padding: 8px 16px 16px;
  color: rgb(var(--v-theme-on-surface));
}

.calendar-header {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 4px;
  min-height: 64px;
}

.calendar-period {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 0;
}

.month-nav-btn {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
}

.weekday-row,
.calendar-week {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.weekday-row {
  margin: 2px 0 6px;
}

.weekday-header {
  padding: 8px 0;
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.weekday-header.weekend {
  color: rgba(var(--v-theme-primary), 0.75);
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
  font-weight: 500;
  letter-spacing: 0;
  transition: background-color 160ms ease, color 160ms ease, transform 160ms ease;
}

.day-btn:hover {
  background: rgba(var(--v-theme-primary), 0.09);
  transform: translateY(-1px);
}

.day-btn.is-selected {
  color: rgb(var(--v-theme-on-primary)) !important;
  background: rgb(var(--v-theme-primary));
  box-shadow: 0 5px 14px rgba(var(--v-theme-primary), 0.28);
  font-weight: 700;
}

.day-btn.is-today:not(.is-selected) {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-primary), 0.48);
  font-weight: 700;
}

.day-btn.is-weekend:not(.is-selected):not(.is-today) {
  color: rgb(var(--v-theme-primary));
}

.day-btn.is-adjacent {
  opacity: 0.34;
}

.month-select,
.year-select {
  flex: 0 0 auto;
  text-align: center;
}

.month-select {
  width: 132px;
}

.year-select {
  width: 82px;
}

.month-select :deep(.v-field),
.year-select :deep(.v-field) {
  padding: 0 !important;
  min-height: auto !important;
}

.month-select :deep(.v-field__input),
.year-select :deep(.v-field__input) {
  min-height: auto !important;
  padding: 0 !important;
}

.month-select :deep(.v-select__selection),
.year-select :deep(.v-select__selection) {
  font-size: 1.05rem !important;
  font-weight: 700 !important;
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
  text-align: center !important;
  width: 100% !important;
  display: flex !important;
  justify-content: center !important;
}

.month-select :deep(.v-field__append-inner),
.year-select :deep(.v-field__append-inner) {
  opacity: 0.45;
  padding-inline-start: 2px;
}

@media (max-width: 360px) {
  .custom-date-picker {
    min-width: 280px;
    padding-inline: 10px;
  }

  .calendar-header {
    grid-template-columns: 40px minmax(0, 1fr) 40px;
  }

  .month-select {
    width: 120px;
  }

  .year-select {
    width: 76px;
  }

  .day-btn {
    min-width: 36px !important;
    width: 36px;
    height: 36px;
  }
}
</style>

