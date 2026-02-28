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
 * Построить варианты запросов по периоду для смешанных типов данных (number/string)
 * В базе встречаются оба формата, поэтому формируем все уникальные комбинации.
 */
function getReadingsByPeriodQueries(periodType, periodWeekNumber, dayOfWeek, cycle) {
  const weekVariants = [periodWeekNumber, `${periodWeekNumber}`];
  const dayVariants = [dayOfWeek, `${dayOfWeek}`];
  const queryKeys = new Set();
  const periodQueries = [];

  weekVariants.forEach((week) => {
    dayVariants.forEach((day) => {
      const key = `${typeof week}:${week}|${typeof day}:${day}|${cycle || 'no-cycle'}`;
      if (!queryKeys.has(key)) {
        queryKeys.add(key);
        periodQueries.push(getReadingsByPeriodQuery(periodType, week, day, cycle));
      }
    });
  });

  return periodQueries;
}

/**
 * Поиск чтений по дате
 * Формат _date: D.M (день.месяц), унифицирован с коллекцией days
 */
export function getReadingsByDateQuery(date, cycle) {
  const dateStr = moment(date).format('D.M'); // Формат D.M вместо YYYY-MM-DD
  logger.log(`[readingsService] Поиск по дате: _date="${dateStr}", cycle="${cycle}"`);
  const conditions = [where('_date', '==', dateStr)];
  
  if (cycle) {
    conditions.push(where('cycle', '==', cycle));
  }
  
  return query(getReadingsCollection(), ...conditions);
}

/**
 * Поиск чтений по празднику (динамический праздник)
 * Использует поле _feast (унифицировано с коллекцией days)
 * @param {string} _feast - Значение поля _feast (например, 'eastersunday', 'pentecost')
 * @param {string} cycle - Цикл (A/B/C/1/2)
 */
export function getReadingsByFeastQuery(_feast, cycle) {
  logger.log(`[readingsService] Поиск по празднику: _feast="${_feast}", cycle="${cycle}"`);
  const conditions = [
    where('_feast', '==', _feast),
  ];
  
  if (cycle) {
    conditions.push(where('cycle', '==', cycle));
  }
  
  return query(getReadingsCollection(), ...conditions);
}


/**
 * Комплексный поиск чтений для конкретной даты
 * Коллекция readings: поиск по периоду, дате (D.M), празднику (_feast).
 *
 * @param {Date|moment.Moment|string} date - Дата
 * @param {Object} options - Опции поиска
 * @param {string} options.cycle - Цикл (A/B/C/1/2)
 * @param {string} options.periodType - Тип периода
 * @param {number} options.periodWeekNumber - Номер недели в периоде
 * @param {number} options.dayOfWeek - День недели (1-7)
 * @param {string} options._feast - Значение поля _feast для динамических праздников
 * @param {boolean} options.useCache - Использовать кэш (по умолчанию true)
 * @returns {Promise<Array>} Массив найденных чтений
 */
export async function getReadingsForDate(date, options = {}) {
  const { cycle, periodType, periodWeekNumber, dayOfWeek, _feast, useCache = true, } = options;
  const mDate = moment(date).startOf('day');
  const dateStr = mDate.format('YYYY-MM-DD');

  const queries = [];

  logger.log(`[readingsService] Поиск чтений для даты ${mDate.format('YYYY-MM-DD')}`, {
    cycle,
    periodType,
    periodWeekNumber,
    dayOfWeek,
    _feast,
    dateFormatted: moment(date).format('D.M')
  });

  // По дате (формат D.M)
  if (cycle) {
    queries.push(getReadingsByDateQuery(date, cycle)); // Сначала с cycle (более точный поиск)
  }
  queries.push(getReadingsByDateQuery(date, null));
  logger.log(`[readingsService] Запросы по дате: _date="${moment(date).format('D.M')}" (с cycle и без)`);

  // По периоду
  if (periodType && periodWeekNumber !== undefined && dayOfWeek !== undefined) {
    if (cycle) {
      queries.push(...getReadingsByPeriodQueries(periodType, periodWeekNumber, dayOfWeek, cycle));
    }
    queries.push(...getReadingsByPeriodQueries(periodType, periodWeekNumber, dayOfWeek, null));
    logger.log(`[readingsService] Запросы по периоду: ${periodType}, неделя ${periodWeekNumber}, день ${dayOfWeek}`);
  } else {
    logger.log(`[readingsService] Параметры периода неполные: periodType="${periodType}", periodWeekNumber="${periodWeekNumber}", dayOfWeek="${dayOfWeek}"`);
  }

  // По празднику
  if (_feast) {
    if (cycle) {
      queries.push(getReadingsByFeastQuery(_feast, cycle)); // Сначала с cycle (более точный поиск)
    }
    queries.push(getReadingsByFeastQuery(_feast, null));
    logger.log(`[readingsService] Запросы по празднику: _feast="${_feast}"`);
  }
  
  try {
    const querySnapshots = await Promise.all(
      queries.map(q => retryFirestore(() => getDocs(q)))
    );
    
    const results = [];
    let foundCount = 0;
    const seenIds = new Set();
    
    // Описываем типы запросов для логирования
    const queryTypes = [];
    if (cycle) queryTypes.push(`дата с cycle="${cycle}"`);
    queryTypes.push('дата без cycle');
    if (periodType && periodWeekNumber !== undefined && dayOfWeek !== undefined) {
      const periodQueriesWithCycle = cycle ? getReadingsByPeriodQueries(periodType, periodWeekNumber, dayOfWeek, cycle).length : 0;
      const periodQueriesWithoutCycle = getReadingsByPeriodQueries(periodType, periodWeekNumber, dayOfWeek, null).length;
      for (let i = 0; i < periodQueriesWithCycle; i++) {
        queryTypes.push(`период с cycle="${cycle}"`);
      }
      for (let i = 0; i < periodQueriesWithoutCycle; i++) {
        queryTypes.push('период без cycle');
      }
    }
    if (_feast) {
      if (cycle) queryTypes.push(`праздник с cycle="${cycle}"`);
      queryTypes.push('праздник без cycle');
    }
    
    querySnapshots.forEach((snapshot, queryIndex) => {
      const queryType = queryTypes[queryIndex] || `запрос #${queryIndex + 1}`;
      const queryResults = [];
      snapshot.forEach(doc => {
        if (!seenIds.has(doc.id)) {
          seenIds.add(doc.id);
          foundCount++;
          const docData = doc.data();
          queryResults.push({
            id: doc.id,
            _source: 'readings',
            ...docData
          });
          logger.log(`[readingsService] ✓ Найден документ ${doc.id} (${queryType}):`, {
            _date: docData._date || 'нет',
            _periodType: docData._periodType || 'нет',
            _periodWeekNumber: docData._periodWeekNumber ?? 'нет',
            _dayOfWeek: docData._dayOfWeek ?? 'нет',
            _feast: docData._feast || 'нет',
            cycle: docData.cycle || 'нет'
          });
        }
      });
      if (queryResults.length === 0) {
        logger.log(`[readingsService] ✗ ${queryType}: документов не найдено`);
      } else {
        logger.log(`[readingsService] ✓ ${queryType}: найдено ${queryResults.length} документов`);
      }
      results.push(...queryResults);
    });
    
    logger.log(`[readingsService] Найдено документов: ${foundCount}`);

    const uniqueResults = Array.from(
      new Map(results.map(item => [item.id, item])).values()
    );
    
    logger.log('[readingsService] Пасля аб\'яднання:', uniqueResults.length, 'чытанняў');

    // Приоритет: readings > readingsData (если когда-то будет fallback)
    uniqueResults.sort((a, b) => {
      const aPrimary = (a._source === 'readings');
      const bPrimary = (b._source === 'readings');
      if (aPrimary && !bPrimary) return -1;
      if (!aPrimary && bPrimary) return 1;
      return 0;
    });
    
    // Firebase persistent cache автоматически сохраняет результаты
    
    logger.log('[readingsService] Фінальны вынік для даты', dateStr, ':', uniqueResults.length, 'чытанняў');
    if (uniqueResults.length > 0) {
      const sources = uniqueResults.map(r => r._source);
      logger.log('[readingsService] Источники:', [...new Set(sources)].join(', '));
      logger.log('[readingsService] Первый результат из:', uniqueResults[0]._source);
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
