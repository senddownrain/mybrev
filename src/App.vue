<template>
  <div>
    <DevModeAdmin v-if="DEV_ADMIN_MODE" />

    <!-- Экран загрузки -->
    <LoadingScreen v-else-if="isLoading" />
    
    <!-- Основное приложение -->
    <router-view v-else />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { logger } from '@/utils/logger';
import { isTelegramWebApp as checkTelegramWebApp, initTelegramWebApp } from '@/utils/telegram';
import LoadingScreen from '@/components/LoadingScreen.vue';
import DevModeAdmin from '@/views/DevModeAdmin.vue'
import { DEV_ADMIN_MODE } from '@/config/devMode'

const isLoading = ref(true);

// Определяем, запущено ли приложение в Telegram WebApp
const isTelegramWebApp = computed(() => checkTelegramWebApp());

onMounted(async () => {
  if (DEV_ADMIN_MODE) {
    isLoading.value = false
    return
  }

  // Инициализируем Telegram WebApp (если доступен)
  initTelegramWebApp();
  
  // Минимальная задержка для показа экрана загрузки (меньше для Telegram)
  const minLoadTime = isTelegramWebApp.value ? 200 : 300;
  const startTime = Date.now();
  
  try {
    // Warmup cache будет инициализирован в main.js
  } catch (error) {
    logger.error('[App] Памылка пры ініцыялізацыі:', error);
  } finally {
    // Обеспечиваем минимальное время показа экрана загрузки
    const elapsed = Date.now() - startTime;
    if (elapsed < minLoadTime) {
      await new Promise(resolve => setTimeout(resolve, minLoadTime - elapsed));
    }
    isLoading.value = false;
  }
});
</script>
