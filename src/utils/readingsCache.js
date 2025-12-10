/**
 * Кэширование результатов запросов readings
 */

const CACHE_DURATION = 60 * 60 * 1000; // 1 час
const cache = new Map();

/**
 * Получить ключ кэша для даты и опций
 */
function getCacheKey(date, options = {}) {
  const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
  const optionsStr = JSON.stringify(options);
  return `${dateStr}:${optionsStr}`;
}

/**
 * Получить данные из кэша
 * @param {Date|string} date - Дата
 * @param {Object} options - Опции запроса
 * @returns {Array|null} Кэшированные данные или null
 */
export function getCachedReadings(date, options = {}) {
  const key = getCacheKey(date, options);
  const cached = cache.get(key);
  
  if (!cached) {
    return null;
  }
  
  // Проверяем срок действия кэша
  if (Date.now() - cached.timestamp > CACHE_DURATION) {
    cache.delete(key);
    return null;
  }
  
  return cached.data;
}

/**
 * Сохранить данные в кэш
 * @param {Date|string} date - Дата
 * @param {Object} options - Опции запроса
 * @param {Array} data - Данные для кэширования
 */
export function cacheReadings(date, options = {}, data) {
  const key = getCacheKey(date, options);
  cache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Очистить кэш
 */
export function clearReadingsCache() {
  cache.clear();
}

/**
 * Очистить устаревшие записи из кэша
 */
export function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      cache.delete(key);
    }
  }
}

