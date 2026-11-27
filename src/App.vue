<template>
  <router-view v-slot="{ Component }">
    <component :is="Component" v-if="calendarRestored && Component" />
  </router-view>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { initTelegramWebApp } from '@/utils/telegram'

const props = defineProps({ calendarReady: { type: Promise, required: true } })
const calendarRestored = ref(false)
props.calendarReady.then(() => { calendarRestored.value = true })

onMounted(() => {
  initTelegramWebApp()
})
</script>
