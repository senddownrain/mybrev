import { onUnmounted } from 'vue';
import { logger } from '@/utils/logger';
import { createScreenWakeLock } from '@/utils/screenWakeLock';

let controller;
function getController() {
  controller ||= createScreenWakeLock({
    navigator, document,
    onError: (error) => logger.warn(`[WakeLock] ${error.name}: ${error.message}`),
  });
  return controller;
}

const requestWakeLock = () => getController().setEnabled(true);
const releaseWakeLock = () => getController().setEnabled(false);

export function useWakeLock() {
  onUnmounted(() => {
    releaseWakeLock();
  });

  return {
    requestWakeLock,
    releaseWakeLock,
  };
}

// Экспортируем функции напрямую для использования в stores
export { requestWakeLock, releaseWakeLock };

