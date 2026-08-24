<template>
  <div>
    <DevModeAdmin v-if="DEV_ADMIN_MODE" />
    <router-view v-else />
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { initTelegramWebApp } from '@/utils/telegram'
import DevModeAdmin from '@/views/DevModeAdmin.vue'
import { DEV_ADMIN_MODE } from '@/config/devMode'

onMounted(() => {
  if (!DEV_ADMIN_MODE) initTelegramWebApp()
})
</script>
