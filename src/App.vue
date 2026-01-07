<template>
  <div>
    <!-- Экран загрузки -->
    <LoadingScreen v-if="isLoading" />
    
    <!-- Основное приложение -->
    <router-view v-else />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { logger } from '@/utils/logger';
import { isTelegramWebApp as checkTelegramWebApp, initTelegramWebApp } from '@/utils/telegram';
import LoadingScreen from '@/components/LoadingScreen.vue';

const isLoading = ref(true);

// Определяем, запущено ли приложение в Telegram WebApp
const isTelegramWebApp = computed(() => checkTelegramWebApp());

onMounted(async () => {
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
