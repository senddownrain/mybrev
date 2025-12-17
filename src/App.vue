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
import { useLiturgicalDay } from '@/composables/useLiturgicalDay';
import { warmupLiturgicalCache } from '@/utils/liturgicalCache';
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
    // Для Telegram: прогреваем только на 7 дней и в фоне
    // Для обычного браузера: прогреваем на 30 дней, но не блокируем загрузку
    const { computeLiturgicalOptionsForDate } = useLiturgicalDay();
    const daysToWarmup = isTelegramWebApp.value ? 7 : 30;
    
    // Прогрев кэша в фоне - не блокируем загрузку приложения
    setTimeout(() => {
      warmupLiturgicalCache(computeLiturgicalOptionsForDate, daysToWarmup).then(() => {
        logger.log(`[App] Прагрэў кэшу літургічных дзён завершаны (фонавы, ${daysToWarmup} дзён)`);
      }).catch(err => {
        logger.error('[App] Памылка пры прагрэве кэшу (фонавы):', err);
      });
    }, 50); // Небольшая задержка, чтобы не мешать основной загрузке
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
