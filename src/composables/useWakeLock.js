import { onUnmounted } from 'vue';
import { logger } from '@/utils/logger';

let wakeLock = null;

const requestWakeLock = async () => {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      logger.log('Screen Wake Lock is active.');
      wakeLock.addEventListener('release', () => {
        logger.log('Screen Wake Lock was released by the system.');
        wakeLock = null;
      });
    } catch (err) {
      logger.error(`Wake Lock request failed: ${err.name}, ${err.message}`);
      throw err;
    }
  } else {
    logger.warn('Wake Lock API is not supported by this browser.');
    throw new Error('Wake Lock API is not supported');
  }
};

const releaseWakeLock = async () => {
  if (wakeLock !== null) {
    try {
      await wakeLock.release();
      wakeLock = null;
      logger.log('Screen Wake Lock released.');
    } catch (err) {
      logger.error(`Wake Lock release failed: ${err.name}, ${err.message}`);
    }
  }
};

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

