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
  orderBy,
} from 'firebase/firestore';
import { logger } from '@/utils/logger';
import { retryFirestore } from '@/utils/retry';
import { validateReading, normalizeReading } from '@/utils/readingsValidator';
import { getCachedReadings, cacheReadings } from '@/utils/readingsCache';
import moment from 'moment';

const READINGS_COLLECTION = 'readings';
const READINGS_DATA_COLLECTION = 'readingsData'; // Старая коллекция с существующими данными

/**
 * Получить коллекцию readings
 */
export function getReadingsCollection() {
  return collection(db, READINGS_COLLECTION);
}

/**
 * Получить коллекцию readingsData (старая коллекция)
 */
export function getReadingsDataCollection() {
  return collection(db, READINGS_DATA_COLLECTION);
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
 * Получить все чтения из коллекции readingsData
 * @returns {Promise<Array>} Массив всех чтений из readingsData
 */
export async function getAllReadingsData() {
  try {
    const snapshot = await retryFirestore(() => getDocs(getReadingsDataCollection()));
    const results = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      results.push({
        id: doc.id,
        text: data.text || data.content || '', // Поддержка разных полей
        _source: 'readingsData', // Метка источника
        ...data
      });
    });
    return results;
  } catch (error) {
    logger.error('[readingsService] Памылка атрымання readingsData:', error);
    return [];
  }
}

/**
 * Поиск в readingsData по дате (поле day в формате DD.MM.YYYY)
 * @param {string} dateStr - Дата в формате YYYY-MM-DD
 * @returns {Promise<Array>} Массив найденных чтений
 */
export async function searchReadingsDataByDate(dateStr) {
  try {
    // Преобразуем YYYY-MM-DD в разные форматы для поиска в readingsData
    const mDate = moment(dateStr, 'YYYY-MM-DD');
    if (!mDate.isValid()) {
      logger.error('[readingsService] Няверны фармат даты для пошуку ў readingsData:', dateStr);
      return [];
    }
    
    // Пробуем оба формата: с ведущими нулями и без
    const dayFormatWithZeros = mDate.format('DD.MM.YYYY'); // 23.04.2022
    const dayFormatWithoutZeros = mDate.format('D.M.YYYY'); // 23.4.2022
    
    logger.log('[readingsService] Пошук ў readingsData па даце:', dayFormatWithZeros, 'або', dayFormatWithoutZeros, '(з', dateStr, ')');
    
    // Пробуем найти по обоим форматам
    const queries = [
      query(getReadingsDataCollection(), where('day', '==', dayFormatWithZeros)),
      query(getReadingsDataCollection(), where('day', '==', dayFormatWithoutZeros))
    ];
    
    const snapshots = await Promise.all(
      queries.map(q => retryFirestore(() => getDocs(q)))
    );
    
    const results = [];
    const seenIds = new Set();
    
    snapshots.forEach((snapshot, index) => {
      snapshot.forEach(doc => {
        if (!seenIds.has(doc.id)) {
          seenIds.add(doc.id);
          const data = doc.data();
          results.push({
            id: doc.id,
            text: data.text || data.content || '',
            _source: 'readingsData',
            day: data.day, // Сохраняем оригинальную дату
            ...data
          });
        }
      });
    });
    
    logger.log('[readingsService] Знойдзена ў readingsData:', results.length, 'чытанняў для даты', dayFormatWithZeros);
    return results;
  } catch (error) {
    // Если поле day не существует или запрос не удался
    logger.error('[readingsService] Памылка пошуку ў readingsData:', error.message, error);
    return [];
  }
}

/**
 * Комплексный поиск чтений для конкретной даты
 * Сначала ищет в новой коллекции readings, затем в старой readingsData
 * @param {Date|moment.Moment|string} date - Дата
 * @param {Object} options - Опции поиска
 * @param {string} options.cycle - Цикл (A/B/C/1/2)
 * @param {string} options.periodType - Тип периода
 * @param {number} options.periodWeekNumber - Номер недели в периоде
 * @param {number} options.dayOfWeek - День недели (1-7)
 * @param {string} options.feastId - ID праздника
 * @param {boolean} options.useCache - Использовать кэш (по умолчанию true)
 * @param {boolean} options.includeReadingsData - Искать также в readingsData (по умолчанию true)
 * @returns {Promise<Array>} Массив найденных чтений
 */
export async function getReadingsForDate(date, options = {}) {
  const { cycle, periodType, periodWeekNumber, dayOfWeek, feastId, useCache = true, includeReadingsData = true } = options;
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
  
  // 1. Поиск в новой коллекции readings
  // 1.1. По дате
  queries.push(getReadingsByDateQuery(dateStr, cycle));
  
  // 1.2. По периоду (если указаны параметры)
  if (periodType && periodWeekNumber !== undefined && dayOfWeek) {
    queries.push(getReadingsByPeriodQuery(periodType, periodWeekNumber, dayOfWeek, cycle));
  }
  
  // 1.3. По празднику (если указан)
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
          _source: 'readings', // Метка источника
          ...doc.data()
        });
      });
    });
    
    // 2. Поиск в старой коллекции readingsData (если включено)
    if (includeReadingsData) {
      try {
        const readingsDataResults = await searchReadingsDataByDate(dateStr);
        logger.log('[readingsService] Вынікі з readingsData:', readingsDataResults.length);
        if (readingsDataResults.length > 0) {
          results.push(...readingsDataResults);
        }
      } catch (error) {
        logger.warn('[readingsService] Памылка пошуку ў readingsData:', error);
      }
    }
    
    logger.log('[readingsService] Усяго знойдзена да аб\'яднання:', results.length);
    
    // Удаляем дубликаты по ID
    const uniqueResults = Array.from(
      new Map(results.map(item => [item.id, item])).values()
    );
    
    logger.log('[readingsService] Пасля аб\'яднання:', uniqueResults.length, 'чытанняў');
    
    // Приоритет: readings (новая коллекция) > readingsData (старая)
    // НО если есть readingsData и нет readings, используем readingsData
    // Сортируем так, чтобы readings были первыми, но readingsData тоже учитывались
    uniqueResults.sort((a, b) => {
      if (a._source === 'readings' && b._source === 'readingsData') return -1;
      if (a._source === 'readingsData' && b._source === 'readings') return 1;
      return 0;
    });
    
    // Сохраняем в кэш
    if (useCache) {
      cacheReadings(date, options, uniqueResults);
    }
    
    logger.log('[readingsService] Фінальны вынік для даты', dateStr, ':', uniqueResults.length, 'чытанняў');
    
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

