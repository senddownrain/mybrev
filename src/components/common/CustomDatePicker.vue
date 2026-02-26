<template>
  <div class="custom-date-picker">
    <v-sheet
      class="header d-flex align-center justify-space-between px-2 py-1"
      :color="color"
      rounded="0"
    >
      <v-btn
        v-if="!hideHeader"
        icon="mdi-chevron-left"
        variant="tonal"
        size="small"
        @click="previousMonth"
      ></v-btn>
      <div v-else></div>

      <div class="d-flex align-center justify-center ga-2 flex-1 px-1">
        <v-select
          v-model="selectedMonth"
          :items="months"
          variant="outlined"
          density="compact"
          hide-details
          class="month-select"
          bg-color="surface"
          style="max-width: 170px"
          @update:model-value="onMonthChange"
        ></v-select>

        <v-select
          v-model="selectedYear"
          :items="years"
          variant="outlined"
          density="compact"
          hide-details
          class="year-select"
          bg-color="surface"
          style="max-width: 95px"
          @update:model-value="onYearChange"
        ></v-select>
      </div>

      <v-btn
        v-if="!hideHeader"
        icon="mdi-chevron-right"
        variant="tonal"
        size="small"
        @click="nextMonth"
      ></v-btn>
      <div v-else></div>
    </v-sheet>

    <div class="d-flex justify-center py-2" v-if="showTodayButton">
      <v-btn
        variant="text"
        density="comfortable"
        prepend-icon="mdi-calendar-today"
        @click="goToToday"
      >
        Сёння
      </v-btn>
    </div>

    <v-sheet class="d-flex weekday-row">
      <div
        v-for="day in weekDays"
        :key="day"
        class="weekday-header text-center"
        :style="{ width: `${100 / 7}%` }"
      >
        <div class="text-caption font-weight-bold py-2">{{ day }}</div>
      </div>
    </v-sheet>

    <v-sheet class="calendar-grid pb-1">
      <div
        v-for="(week, weekIndex) in calendarWeeks"
        :key="weekIndex"
        class="d-flex"
      >
        <div
          v-for="(day, dayIndex) in week"
          :key="dayIndex"
          class="calendar-day text-center"
          :style="{ width: `${100 / 7}%` }"
        >
          <v-btn
            v-if="day"
            :variant="isSelected(day) ? 'flat' : 'text'"
            :color="isSelected(day) ? color : undefined"
            :class="dayClasses(day)"
            size="default"
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
    default: 1
  },
  hideHeader: {
    type: Boolean,
    default: false
  },
  showAdjacentMonths: {
    type: Boolean,
    default: false
  },
  showTodayButton: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['update:modelValue'])

const currentMonth = ref(moment())
const selectedMonth = ref(moment().month())
const selectedYear = ref(moment().year())

watch(
  () => props.modelValue,
  (newValue) => {
    if (!newValue) return

    const mDate = moment(newValue)
    if (mDate.isValid()) {
      currentMonth.value = mDate.clone().startOf('month')
      selectedMonth.value = mDate.month()
      selectedYear.value = mDate.year()
    }
  },
  { immediate: true }
)

watch(currentMonth, (newMonth) => {
  selectedMonth.value = newMonth.month()
  selectedYear.value = newMonth.year()
})

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

const years = computed(() => {
  const yearsList = []
  const baseYear = selectedYear.value || moment().year()
  for (let i = baseYear - 75; i <= baseYear + 25; i++) {
    yearsList.push({ title: String(i), value: i })
  }
  return yearsList
})

const onMonthChange = (monthIndex) => {
  if (typeof monthIndex !== 'number') return
  currentMonth.value = currentMonth.value.clone().month(monthIndex)
  selectedMonth.value = monthIndex
}

const onYearChange = (year) => {
  if (typeof year !== 'number') return
  currentMonth.value = currentMonth.value.clone().year(year)
  selectedYear.value = year
}

const weekDays = computed(() => {
  const days = []
  const startDay = props.firstDayOfWeek || 1

  for (let i = 0; i < 7; i++) {
    const dayIndex = (startDay + i) % 7
    const dayMoment = moment().day(dayIndex)
    days.push(dayMoment.format('dd'))
  }

  return days
})

const calendarWeeks = computed(() => {
  const weeks = []
  const start = currentMonth.value.clone().startOf('month')
  const end = currentMonth.value.clone().endOf('month')

  const firstDayOfWeek = props.firstDayOfWeek || 1
  const currentDay = start.clone()

  const dayOfWeek = currentDay.day()
  let diff = 0

  if (firstDayOfWeek === 1) {
    diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  } else {
    diff = dayOfWeek
  }

  currentDay.subtract(diff, 'days')

  let weekCount = 0
  while (weekCount < 6) {
    const week = []
    let hasCurrentMonthDay = false

    for (let i = 0; i < 7; i++) {
      const currentMonthDay = currentDay.isSame(currentMonth.value, 'month')

      if (props.showAdjacentMonths || currentMonthDay) {
        week.push(currentDay.clone())
        if (currentMonthDay) {
          hasCurrentMonthDay = true
        }
      } else {
        week.push(null)
      }
      currentDay.add(1, 'day')
    }

    weeks.push(week)
    weekCount++

    if (!props.showAdjacentMonths && !hasCurrentMonthDay && currentDay.isAfter(end)) {
      break
    }

    if (props.showAdjacentMonths && weekCount >= 6) {
      break
    }
  }

  return weeks
})

const isSelected = (day) => {
  if (!props.modelValue || !day) return false
  const selectedMoment = moment(props.modelValue)
  return day.isSame(selectedMoment, 'day')
}

const isToday = (day) => {
  if (!day) return false
  return day.isSame(moment(), 'day')
}

const isCurrentMonth = (day) => {
  if (!day) return false
  return day.isSame(currentMonth.value, 'month')
}

const isWeekend = (day) => {
  if (!day) return false
  const dayOfWeek = day.day()
  return dayOfWeek === 0 || dayOfWeek === 6
}

const dayClasses = (day) => ({
  today: isToday(day),
  'other-month': !isCurrentMonth(day),
  weekend: isWeekend(day)
})

const selectDate = (day) => {
  if (!day) return
  emit('update:modelValue', day.toDate())
}

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

const goToToday = () => {
  const today = moment().startOf('day')
  currentMonth.value = today.clone().startOf('month')
  selectedMonth.value = today.month()
  selectedYear.value = today.year()
  emit('update:modelValue', today.toDate())
}
</script>

<style scoped>
.custom-date-picker {
  min-width: 300px;
}

.header {
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.weekday-header {
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.calendar-day {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.day-btn {
  min-width: 38px;
  height: 38px;
  border-radius: 10px;
}

.day-btn.today {
  border: 1px solid rgba(var(--v-theme-primary), 0.7);
}

.day-btn.other-month {
  opacity: 0.5;
}

.day-btn.weekend {
  color: rgb(var(--v-theme-error));
}

.month-select,
.year-select {
  flex: 0 0 auto;
  text-align: center;
}

.month-select :deep(.v-field),
.year-select :deep(.v-field) {
  padding: 0 6px !important;
  min-height: auto !important;
}

.month-select :deep(.v-field__input),
.year-select :deep(.v-field__input) {
  min-height: auto !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.month-select :deep(.v-select__selection),
.year-select :deep(.v-select__selection) {
  font-size: 1rem !important;
  font-weight: 600 !important;
  margin: 0 !important;
  text-align: center !important;
  justify-content: center !important;
  display: flex !important;
  align-items: center !important;
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

.calendar-grid {
  background: rgba(var(--v-theme-surface), 1);
}

.weekday-row {
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
</style>
