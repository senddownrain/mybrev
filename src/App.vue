<template>
  <div>
    <!-- Экран загрузки -->
    <LoadingScreen v-if="isLoading" />
    
    <!-- Основное приложение -->
    <router-view v-else />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useLiturgicalDay } from '@/composables/useLiturgicalDay';
import { warmupLiturgicalCache } from '@/utils/liturgicalCache';
import { logger } from '@/utils/logger';
import LoadingScreen from '@/components/LoadingScreen.vue';

const isLoading = ref(true);

onMounted(async () => {
  // Минимальная задержка для показа экрана загрузки (минимум 500мс для плавности)
  const minLoadTime = 500;
  const startTime = Date.now();
  
  try {
    // Прогреваем кэш литургических дней на 30 дней вперед в фоновом режиме
    const { computeLiturgicalOptionsForDate } = useLiturgicalDay();
    
    await warmupLiturgicalCache(computeLiturgicalOptionsForDate, 30);
    logger.log('[App] Прагрэў кэшу літургічных дзён завершаны');
  } catch (error) {
    logger.error('[App] Памылка пры прагрэве кэшу:', error);
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
