import { collection, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { logger } from './logger';
import { retryFirestore } from './retry';

/**
 * Создает ключ для даты в формате 'YYYY-MM-DD'
 */
function makeDateKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/**
 * Получает литургические опции из кэша Firestore
 * @param {Date} date - Дата для которой нужны опции
 * @returns {Promise<Object|null>} Кэшированные опции или null если нет в кэше
 */
export async function getLiturgicalOptionsFromCache(date) {
  try {
    const dateKey = makeDateKey(date);
    const liturgicalRef = collection(db, 'liturgicalDays');
    const docRef = doc(liturgicalRef, dateKey);
    
    // Используем getDoc без retry для кэшированных запросов - они быстрые
    const snap = await getDoc(docRef);
    
    if (snap.exists()) {
      const data = snap.data();
      logger.log(`[Cache] Знайдзены кэшыраваныя опцыі для ${dateKey}`);
      return data.liturgicalOptions || null;
    }
    
    return null;
  } catch (error) {
    logger.error(`[Cache] Памылка пры чытанні кэшу для ${makeDateKey(date)}:`, error);
    return null;
  }
}

/**
 * Сохраняет литургические опции в кэш Firestore
 * @param {Date} date - Дата
 * @param {Object} options - Литургические опции для сохранения
 */
export async function saveLiturgicalOptionsToCache(date, options) {
  try {
    const dateKey = makeDateKey(date);
    const liturgicalRef = collection(db, 'liturgicalDays');
    const docRef = doc(liturgicalRef, dateKey);
    
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    
    // Используем retry для сетевых операций записи
    await retryFirestore(async () => {
      await setDoc(docRef, {
        dateKey: dateKey,
        date: Timestamp.fromDate(d),
        year: d.getFullYear(),
        liturgicalOptions: options,
        createdAt: Timestamp.now(),
      });
    });
    
    logger.log(`[Cache] Захаваны кэшыраваныя опцыі для ${dateKey}`);
  } catch (error) {
    logger.error(`[Cache] Памылка пры захаванні кэшу для ${makeDateKey(date)}:`, error);
    // Не пробрасываем ошибку дальше, чтобы не блокировать основную логику
    // Firestore persistent cache сохранит данные локально даже при ошибке сети
  }
}

/**
 * Прогревает кэш на указанное количество дней вперед
 * @param {Function} computeLiturgicalOptionsForDate - Функция для вычисления опций (без проверки кэша)
 * @param {number} daysAhead - Количество дней для прогрева (по умолчанию 30)
 * @param {Function} progressCallback - Опциональный callback для отслеживания прогресса
 */
export async function warmupLiturgicalCache(computeLiturgicalOptionsForDate, daysAhead = 30, progressCallback = null) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  logger.log(`[Cache] Пачатак прагрэву кэшу на ${daysAhead} дзён наперад`);
  
  const totalDays = daysAhead + 1;
  let processed = 0;
  
  // Обрабатываем батчами по 5 дней одновременно
  const batchSize = 5;
  
  for (let batchStart = 0; batchStart < totalDays; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, totalDays);
    const batch = [];
    
    for (let i = batchStart; i < batchEnd; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateKey = makeDateKey(d);
      
      const task = (async () => {
        try {
          // Проверяем, есть ли уже в кэше
          const cached = await getLiturgicalOptionsFromCache(d);
          if (cached) {
            processed++;
            if (progressCallback) {
              progressCallback(Math.round((processed / totalDays) * 100));
            }
            return;
          }
          
          // Вычисляем опции напрямую (без проверки кэша)
          const options = await computeLiturgicalOptionsForDate(d);
          
          // Сохраняем в кэш
          await saveLiturgicalOptionsToCache(d, options);
          
          processed++;
          if (progressCallback) {
            progressCallback(Math.round((processed / totalDays) * 100));
          }
        } catch (error) {
          logger.error(`[Cache] Памылка пры прагрэве кэшу для ${dateKey}:`, error);
          processed++;
          if (progressCallback) {
            progressCallback(Math.round((processed / totalDays) * 100));
          }
        }
      })();
      
      batch.push(task);
    }
    
    // Ждем завершения текущего батча перед следующим
    await Promise.all(batch);
  }
  
  logger.log(`[Cache] Прагрэў кэшу завершаны (апрацавана ${processed}/${totalDays} дзён)`);
}

