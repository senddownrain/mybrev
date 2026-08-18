<template>
  <div>
    <v-bottom-navigation 
      :model-value="activeIndex" 
      color="primary" 
      bg-color="surface"
      elevation="4"
      height="64"
    >
      <v-btn 
        v-for="(m, i) in menu" 
        :key="i" 
        :value="i"
        :active="activeIndex === i"
        @click="navigateTo(m.to)"
        variant="text"
        size="large"
        class="bottom-nav-btn"
      >
        <v-icon size="24">{{ m.icon }}</v-icon>
        <span class="text-caption font-weight-medium">{{ m.title }}</span>
      </v-btn>
      
      <v-btn 
        :value="2" 
        :active="activeIndex === 2"
        @click="toggleCalendarDialog()"
        variant="text"
        size="large"
        class="bottom-nav-btn"
      >
        <v-icon size="24">mdi-calendar-month</v-icon>
        <span class="text-caption font-weight-medium">Дзень</span>
      </v-btn>
    </v-bottom-navigation>

    <v-dialog 
      v-model="isCalendarDialogOpen" 
      width="calc(100% - 24px)" 
      max-width="420"
      scrim="black"
      :persistent="false"
      :z-index="110"
    >
      <v-card class="date-dialog-card" rounded="xl" elevation="18">
        <v-card-title class="date-dialog-title">
          <div>
            <div class="date-dialog-eyebrow">Каляндар</div>
            <div class="date-dialog-heading">Выбраць дату</div>
          </div>
          <v-btn icon="mdi-close" variant="text" size="small" aria-label="Закрыць" @click="toggleCalendarDialog"></v-btn>
        </v-card-title>
        <v-card-text class="pa-0">
          <CustomDatePicker
            v-model="selectedDate"
            color="primary"
            :first-day-of-week="1"
            show-adjacent-months
          ></CustomDatePicker>
        </v-card-text>
        <v-card-actions class="date-dialog-actions">
          <v-btn variant="text" prepend-icon="mdi-calendar-today" @click="selectToday">Сёння</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="flat" rounded="lg" class="select-date-btn" @click="loadDay">Выбраць</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import moment from '@/utils/moment-be'
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppBar } from '@/composables/useAppBar'
import CustomDatePicker from '@/components/common/CustomDatePicker.vue'

const route = useRoute()
const router = useRouter()
const { isCalendarDialogOpen, toggleCalendarDialog } = useAppBar()
const selectedDate = ref(new Date())

const currentRouteDate = computed(() => {
  if (route.name === 'Readings') {
    return moment().startOf('day')
  }
  if (route.params.date) {
    return moment(route.params.date, 'YYYY-MM-DD').startOf('day')
  }
  return moment().startOf('day')
})

const today = computed(() => moment().startOf('day'))

const menu = computed(() => [
  {
    title: "Выбраць",
    to: "/readings/picker",
    icon: "mdi-calendar-search"
  },
  {
    title: "Сёння",
    to: "/readings",
    icon: "mdi-calendar-today"
  },
])

const activeIndex = computed(() => {
  if (route.name === 'ReadingsPicker') {
    return 0
  }
  
  const routeDate = currentRouteDate.value
  const todayDate = today.value
  
  if (routeDate.isSame(todayDate, 'day')) {
    return 1
  } else {
    return 2
  }
})

function navigateTo(path) {
  router.push(path)
}

function selectToday() {
  selectedDate.value = new Date()
}

watch(isCalendarDialogOpen, (isOpen) => {
  if (isOpen) {
    const date = currentRouteDate.value
    if (date && date.isValid()) {
      selectedDate.value = date.toDate()
    } else {
      selectedDate.value = new Date()
    }
  }
})

function loadDay() {
  toggleCalendarDialog()
  if (!selectedDate.value) {
    return
  }
  const mDate = moment(selectedDate.value)
  if (!mDate.isValid()) {
    return
  }
  const dateString = mDate.format('YYYY-MM-DD')
  if (mDate.isSame(today.value, 'day')) {
    router.push('/readings')
  } else {
    router.push(`/readings/${dateString}`)
  }
}
</script>

<style scoped>
:deep(.v-bottom-navigation) {
  position: fixed !important;
  bottom: 0 !important;
  left: 0 !important;
  right: 0 !important;
  z-index: 100 !important;
}

.bottom-nav-btn {
  min-width: 80px;
  flex-direction: column;
  gap: 4px;
}

.bottom-nav-btn :deep(.v-btn__content) {
  flex-direction: column;
  gap: 4px;
}

.date-dialog-card {
  overflow: hidden;
  border: 1px solid rgba(var(--v-border-color), 0.14);
  background: rgb(var(--v-theme-surface));
}

.date-dialog-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 8px !important;
}

.date-dialog-eyebrow {
  color: rgb(var(--v-theme-primary));
  font-size: 0.7rem;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.date-dialog-heading {
  margin-top: 3px;
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.3;
}

.date-dialog-actions {
  padding: 10px 16px 16px !important;
  border-top: 1px solid rgba(var(--v-border-color), 0.1);
}

.select-date-btn {
  min-width: 112px;
  box-shadow: 0 5px 14px rgba(var(--v-theme-primary), 0.24);
}
</style>




