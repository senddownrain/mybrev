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
      width="auto" 
      max-width="400"
      :scrim="false"
      location="top"
      :persistent="false"
      :z-index="99"
    >
      <v-card rounded="lg">
        <v-card-title class="d-flex justify-space-between align-center pa-4">
          <span class="text-h6">Выбраць дату</span>
          <v-btn icon="mdi-close" variant="text" size="small" @click="toggleCalendarDialog"></v-btn>
        </v-card-title>
        <v-divider></v-divider>
        <v-card-text class="pa-0">
          <v-date-picker 
            v-model="selectedDate" 
            color="primary"
            hide-header
            :first-day-of-week="1"
          ></v-date-picker>
        </v-card-text>
        <v-divider></v-divider>
        <v-card-actions class="pa-3">
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="toggleCalendarDialog">Адмена</v-btn>
          <v-btn color="primary" variant="flat" @click="loadDay">Выбраць</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import moment from 'moment'
import 'moment/dist/locale/be'
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppBar } from '@/composables/useAppBar'

const route = useRoute()
const router = useRouter()
const { isCalendarDialogOpen, toggleCalendarDialog } = useAppBar()
const selectedDate = ref(new Date())

const currentRouteDate = computed(() => {
  if (route.name === 'Today' || route.path === '/') {
    return moment().startOf('day')
  }
  if (route.params.day) {
    return moment(route.params.day, 'YYYY-MM-DD').startOf('day')
  }
  return moment().startOf('day')
})

const today = computed(() => moment().startOf('day'))

const menu = computed(() => [
  {
    title: "Выбраць",
    to: "/picker",
    icon: "mdi-calendar-search"
  },
  {
    title: "Сёння",
    to: "/",
    icon: "mdi-calendar-today"
  },
])

const activeIndex = computed(() => {
  if (route.name === 'LiturgicalPicker') {
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

watch(isCalendarDialogOpen, (isOpen) => {
  if (isOpen) {
    selectedDate.value = currentRouteDate.value.toDate()
  }
})

function loadDay() {
  toggleCalendarDialog()
  const dateString = moment(selectedDate.value).format('YYYY-MM-DD')
  if (moment(selectedDate.value).isSame(today.value, 'day')) {
    router.push('/')
  } else {
    router.push(`/day/${dateString}`)
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
</style>