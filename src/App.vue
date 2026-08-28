<template>
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue'
import { initTelegramWebApp } from '@/utils/telegram'

onMounted(() => {
  initTelegramWebApp()
})
</script>
