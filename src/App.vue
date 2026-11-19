<template>
  <router-view v-slot="{ Component }">
    <component :is="Component" v-if="calendarRestored && Component" />
    <div v-else class="launch-status" role="status">Загрузка…</div>
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

<style scoped>
.launch-status {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--nav-on-surface, CanvasText);
  font-family: system-ui, sans-serif;
}
</style>
