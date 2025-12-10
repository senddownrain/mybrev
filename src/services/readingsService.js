import { db } from '@/plugins/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { logger } from '@/utils/logger';
import { retryFirestore } from '@/utils/retry';
import { validateReading, normalizeReading } from '@/utils/readingsValidator';
import { getCachedReadings, cacheReadings } from '@/utils/readingsCache';
import moment from 'moment';

const READINGS_COLLECTION = 'readings';

/**
 * Получить коллекцию readings
 */
export function getReadingsCollection() {
  return collection(db, READINGS_COLLECTION);
}

/**
 * Поиск чтений по периоду и дню недели
 */
export function getReadingsByPeriodQuery(periodType, periodWeekNumber, dayOfWeek, cycle) {
  const conditions = [
    where('_periodType', '==', periodType),
    where('_periodWeekNumber', '==', periodWeekNumber),
    where('_dayOfWeek', '==', dayOfWeek),
  ];
  
  if (cycle) {
    conditions.push(where('cycle', '==', cycle));
  }
  
  return query(getReadingsCollection(), ...conditions);
}

/**
 * Поиск чтений по дате
 */
export function getReadingsByDateQuery(date, cycle) {
  const dateStr = moment(date).format('YYYY-MM-DD');
  const conditions = [where('_date', '==', dateStr)];
  
  if (cycle) {
    conditions.push(where('cycle', '==', cycle));
  }
  
  return query(getReadingsCollection(), ...conditions);
}

/**
 * Поиск чтений по празднику
 */
export function getReadingsByFeastQuery(feastId, feastDate, cycle) {
  const dateStr = moment(feastDate).format('YYYY-MM-DD');
  const conditions = [
    where('feastId', '==', feastId),
    where('feastDate', '==', dateStr),
  ];
  
  if (cycle) {
    conditions.push(where('cycle', '==', cycle));
  }
  
  return query(getReadingsCollection(), ...conditions);
}

/**
 * Комплексный поиск чтений для конкретной даты
 * Пробует все три способа идентификации
 * @param {Date|moment.Moment|string} date - Дата
 * @param {Object} options - Опции поиска
 * @param {string} options.cycle - Цикл (A/B/C/1/2)
 * @param {string} options.periodType - Тип периода
 * @param {number} options.periodWeekNumber - Номер недели в периоде
 * @param {number} options.dayOfWeek - День недели (1-7)
 * @param {string} options.feastId - ID праздника
 * @param {boolean} options.useCache - Использовать кэш (по умолчанию true)
 * @returns {Promise<Array>} Массив найденных чтений
 */
export async function getReadingsForDate(date, options = {}) {
  const { cycle, periodType, periodWeekNumber, dayOfWeek, feastId, useCache = true } = options;
  const mDate = moment(date).startOf('day');
  const dateStr = mDate.format('YYYY-MM-DD');
  
  // Проверяем кэш
  if (useCache) {
    const cached = getCachedReadings(date, options);
    if (cached !== null) {
      logger.log('[readingsService] Выкарыстаны кэш для даты:', dateStr);
      return cached;
    }
  }
  
  const queries = [];
  
  // 1. По дате
  queries.push(getReadingsByDateQuery(dateStr, cycle));
  
  // 2. По периоду (если указаны параметры)
  if (periodType && periodWeekNumber !== undefined && dayOfWeek) {
    queries.push(getReadingsByPeriodQuery(periodType, periodWeekNumber, dayOfWeek, cycle));
  }
  
  // 3. По празднику (если указан)
  if (feastId) {
    queries.push(getReadingsByFeastQuery(feastId, dateStr, cycle));
  }
  
  try {
    const querySnapshots = await Promise.all(
      queries.map(q => retryFirestore(() => getDocs(q)))
    );
    
    const results = [];
    querySnapshots.forEach(snapshot => {
      snapshot.forEach(doc => {
        results.push({
          id: doc.id,
          ...doc.data()
        });
      });
    });
    
    // Удаляем дубликаты по ID
    const uniqueResults = Array.from(
      new Map(results.map(item => [item.id, item])).values()
    );
    
    // Сохраняем в кэш
    if (useCache) {
      cacheReadings(date, options, uniqueResults);
    }
    
    return uniqueResults;
  } catch (error) {
    logger.error('[readingsService] Памылка пошуку чытанняў:', error);
    throw error;
  }
}

/**
 * Добавить новое чтение
 * @param {Object} data - Данные чтения
 * @returns {Promise<DocumentReference>} Ссылка на созданный документ
 * @throws {Error} Если валидация не прошла или произошла ошибка сохранения
 */
export async function addReading(data) {
  // Валидация данных
  const validation = validateReading(data);
  if (validation !== true) {
    const error = new Error(`Валідацыя не прайшла: ${validation}`);
    logger.error('[readingsService]', error);
    throw error;
  }

  try {
    // Нормализация данных
    const normalizedData = normalizeReading(data);
    
    const docRef = await retryFirestore(() => addDoc(getReadingsCollection(), {
      ...normalizedData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    logger.log('[readingsService] Чытанне дададзена:', docRef.id);
    return docRef;
  } catch (error) {
    logger.error('[readingsService] Памылка дадавання чытання:', error);
    throw error;
  }
}

/**
 * Обновить чтение
 * @param {string} id - ID документа
 * @param {Object} data - Данные для обновления
 * @throws {Error} Если валидация не прошла или произошла ошибка обновления
 */
export async function updateReading(id, data) {
  // Валидация данных (частичная валидация для обновлений)
  const validation = validateReading(data, { partial: true });
  if (validation !== true) {
    const error = new Error(`Валідацыя не прайшла: ${validation}`);
    logger.error('[readingsService]', error);
    throw error;
  }

  try {
    const dataToUpdate = { ...data };
    delete dataToUpdate.id;
    
    // Нормализация данных
    const normalizedData = normalizeReading(dataToUpdate);
    normalizedData.updatedAt = serverTimestamp();
    
    await retryFirestore(() => updateDoc(doc(db, READINGS_COLLECTION, id), normalizedData));
    logger.log('[readingsService] Чытанне абноўлена:', id);
  } catch (error) {
    logger.error('[readingsService] Памылка абнаўлення чытання:', error);
    throw error;
  }
}

/**
 * Удалить чтение
 */
export async function deleteReading(id) {
  try {
    await retryFirestore(() => deleteDoc(doc(db, READINGS_COLLECTION, id)));
    logger.log('[readingsService] Чытанне выдалена:', id);
  } catch (error) {
    logger.error('[readingsService] Памылка выдалення чытання:', error);
    throw error;
  }
}

/**
 * Получить чтение по ID
 */
export async function getReadingById(id) {
  try {
    const docRef = doc(db, READINGS_COLLECTION, id);
    const docSnap = await retryFirestore(() => getDoc(docRef));
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      };
    }
    
    return null;
  } catch (error) {
    logger.error('[readingsService] Памылка атрымання чытання:', error);
    throw error;
  }
}

