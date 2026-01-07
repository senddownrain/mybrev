<template>
  <div class="custom-date-picker">
    <!-- Header с месяцем и годом -->
    <v-sheet :color="color" class="d-flex align-center justify-space-between pa-2">
      <v-btn
        v-if="!hideHeader"
        icon
        variant="text"
        size="small"
        @click="previousMonth"
      >
        <v-icon>mdi-chevron-left</v-icon>
      </v-btn>
      <div v-else></div>
      
      <div class="d-flex align-center justify-center gap-1 flex-1">
        <v-select
          v-model="selectedMonth"
          :items="months"
          variant="plain"
          density="compact"
          hide-details
          class="month-select text-h6"
          style="max-width: 140px;"
          @update:model-value="onMonthChange"
        ></v-select>
        
        <v-select
          v-model="selectedYear"
          :items="years"
          variant="plain"
          density="compact"
          hide-details
          class="year-select text-h6"
          style="max-width: 80px;"
          @update:model-value="onYearChange"
        ></v-select>
      </div>
      
      <v-btn
        v-if="!hideHeader"
        icon
        variant="text"
        size="small"
        @click="nextMonth"
      >
        <v-icon>mdi-chevron-right</v-icon>
      </v-btn>
      <div v-else></div>
    </v-sheet>

    <!-- Дни недели -->
    <v-sheet class="d-flex">
      <div
        v-for="day in weekDays"
        :key="day"
        class="weekday-header text-center"
        :style="{ width: `${100/7}%` }"
      >
        <div class="text-caption font-weight-medium pa-2">{{ day }}</div>
      </div>
    </v-sheet>

    <!-- Календарная сетка -->
    <v-sheet>
      <div
        v-for="(week, weekIndex) in calendarWeeks"
        :key="weekIndex"
        class="d-flex"
      >
        <div
          v-for="(day, dayIndex) in week"
          :key="dayIndex"
          class="calendar-day text-center"
          :style="{ width: `${100/7}%` }"
        >
          <v-btn
            v-if="day"
            :variant="isSelected(day) ? 'flat' : 'text'"
            :color="isSelected(day) ? color : undefined"
            :class="{ 'today': isToday(day), 'other-month': !isCurrentMonth(day) }"
            size="small"
            class="day-btn"
            @click="selectDate(day)"
          >
            {{ day.date() }}
          </v-btn>
        </div>
      </div>
    </v-sheet>
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
  currentMonth.value.month(monthIndex)
  selectedMonth.value = monthIndex
}

// Обработка изменения года
const onYearChange = (year) => {
  currentMonth.value.year(year)
  selectedYear.value = year
}

// Текущий месяц и год для заголовка
const currentMonthText = computed(() => {
  return currentMonth.value.format('MMMM')
})

const currentYear = computed(() => {
  return currentMonth.value.format('YYYY')
})

// Дни недели на белорусском
const weekDays = computed(() => {
  const days = []
  const startDay = props.firstDayOfWeek || 1 // 0 = воскресенье, 1 = понедельник
  
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
  const end = currentMonth.value.clone().endOf('month')
  
  // Находим первый день недели для отображения
  // Moment.js: day() возвращает 0 (воскресенье) до 6 (суббота)
  // firstDayOfWeek: 0 = воскресенье, 1 = понедельник
  const firstDayOfWeek = props.firstDayOfWeek || 1
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
  
  // Генерируем недели (максимум 6 недель)
  let weekCount = 0
  while (weekCount < 6) {
    const week = []
    let hasCurrentMonthDay = false
    
    for (let i = 0; i < 7; i++) {
      const isCurrentMonth = currentDay.isSame(currentMonth.value, 'month')
      
      if (props.showAdjacentMonths || isCurrentMonth) {
        week.push(currentDay.clone())
        if (isCurrentMonth) {
          hasCurrentMonthDay = true
        }
      } else {
        week.push(null)
      }
      currentDay.add(1, 'day')
    }
    
    weeks.push(week)
    weekCount++
    
    // Останавливаемся, если не показываем соседние месяцы и прошли весь месяц
    if (!props.showAdjacentMonths && !hasCurrentMonthDay && currentDay.isAfter(end)) {
      break
    }
    
    // Останавливаемся, если показываем соседние месяцы и прошли все нужные недели
    if (props.showAdjacentMonths && weekCount >= 6) {
      break
    }
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
  emit('update:modelValue', day.toDate())
}

// Навигация по месяцам
const previousMonth = () => {
  currentMonth.value.subtract(1, 'month')
  selectedMonth.value = currentMonth.value.month()
  selectedYear.value = currentMonth.value.year()
}

const nextMonth = () => {
  currentMonth.value.add(1, 'month')
  selectedMonth.value = currentMonth.value.month()
  selectedYear.value = currentMonth.value.year()
}
</script>

<style scoped>
.custom-date-picker {
  min-width: 300px;
}

.weekday-header {
  border-bottom: 1px solid rgba(var(--v-border-opacity), var(--v-border-opacity));
}

.calendar-day {
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid rgba(var(--v-border-opacity), var(--v-border-opacity));
}

.calendar-day:last-child {
  border-right: none;
}

.day-btn {
  min-width: 36px;
  height: 36px;
}

.day-btn.today {
  font-weight: bold;
}

.day-btn.other-month {
  opacity: 0.4;
}

.month-select,
.year-select {
  flex: 0 0 auto;
  text-align: center;
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
  font-size: 1.25rem !important;
  font-weight: 500 !important;
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
</style>

