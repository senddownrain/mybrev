<template>
  <v-container fluid class="pa-4 devmode-admin-root">
    <v-toolbar density="comfortable" rounded="lg" class="mb-4">
      <template v-if="activePage === 'menu'">
        <v-toolbar-title>DevModeAdmin</v-toolbar-title>
      </template>
      <template v-else>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="activePage = 'menu'">Назад</v-btn>
        <v-toolbar-title>{{ pageTitles[activePage] }}</v-toolbar-title>
      </template>
    </v-toolbar>

    <v-card v-if="activePage === 'menu'" rounded="lg" class="pa-4">
      <v-row>
        <v-col v-for="item in pageButtons" :key="item.key" cols="12" md="6" lg="4">
          <v-btn block size="large" color="primary" variant="tonal" @click="activePage = item.key">
            {{ item.label }}
          </v-btn>
        </v-col>
      </v-row>
    </v-card>

    <component :is="activeComponent" v-else />
  </v-container>
</template>

<script setup>
import { computed, ref } from 'vue'
import OrdinaryDev from '@/views/OrdinaryDev.vue'
import LentDev from '@/views/LentDev.vue'
import EasterDev from '@/views/EasterDev.vue'
import HolyweekDev from '@/views/HolyweekDev.vue'
import AdventDev from '@/views/AdventDev.vue'
import ChristmasDev from '@/views/ChristmasDev.vue'
import DatesDev from '@/views/DatesDev.vue'

const activePage = ref('menu')

const pageButtons = [
  { key: 'ordinary', label: 'OrdinaryDev' },
  { key: 'lent', label: 'LentDev' },
  { key: 'easter', label: 'EasterDev' },
  { key: 'holyweek', label: 'HolyweekDev' },
  { key: 'advent', label: 'AdventDev' },
  { key: 'christmas', label: 'ChristmasDev' },
  { key: 'dates', label: 'DatesDev' },
]

const pageTitles = {
  ordinary: 'OrdinaryDev',
  lent: 'LentDev',
  easter: 'EasterDev',
  holyweek: 'HolyweekDev',
  advent: 'AdventDev',
  christmas: 'ChristmasDev',
  dates: 'DatesDev',
}

const componentMap = {
  ordinary: OrdinaryDev,
  lent: LentDev,
  easter: EasterDev,
  holyweek: HolyweekDev,
  advent: AdventDev,
  christmas: ChristmasDev,
  dates: DatesDev,
}

const activeComponent = computed(() => componentMap[activePage.value] || null)
</script>
