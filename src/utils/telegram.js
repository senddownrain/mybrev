/**
 * Утилиты для работы с Telegram WebApp
 */

/**
 * Определяет, запущено ли приложение в Telegram WebApp
 * @returns {boolean}
 */
export function isTelegramWebApp() {
  if (typeof window === 'undefined') return false;
  
  return (
    window.Telegram?.WebApp !== undefined ||
    navigator.userAgent.includes('Telegram') ||
    window.location.search.includes('tgWebApp') ||
    document.referrer.includes('telegram.org')
  );
}

/**
 * Получает объект Telegram WebApp API (если доступен)
 * @returns {Object|null}
 */
export function getTelegramWebApp() {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp || null;
}

/**
 * Инициализирует Telegram WebApp (если доступен)
 */
export function initTelegramWebApp() {
  const tg = getTelegramWebApp();
  if (tg) {
    tg.ready();
    tg.expand();
    return tg;
  }
  return null;
}



