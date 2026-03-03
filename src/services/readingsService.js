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
import moment from '@/utils/moment-be';
import { FEAST_NAME_MAP } from '@/constants/liturgicalFeastsMap';

const READINGS_COLLECTION = 'readings';
const CANONICAL_FEAST_VALUES = new Set(Object.values(FEAST_NAME_MAP));

function normalizeFeastValue(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  for (const feast of CANONICAL_FEAST_VALUES) {
    if (feast.toLowerCase() === normalized) return feast;
  }
  return normalized;
}

function toCanonicalDateString(date) {
  return moment(date).format('DD.MM');
}

/**
 * Получить коллекцию readings
 */
export function getReadingsCollection() {
  return collection(db, READINGS_COLLECTION);
}

/**
 * Поиск чтений по периоду и дню недели
 */
export function getReadingsByPeriodQuery(periodType, periodWeekNumber, dayOfWeek) {
  return query(
    getReadingsCollection(),
    where('_periodType', '==', periodType),
    where('_periodWeekNumber', '==', Number(periodWeekNumber)),
    where('_dayOfWeek', '==', Number(dayOfWeek)),
  );
}

/**
 * Поиск чтений по дате
 * Формат _date: DD.MM
 */
export function getReadingsByDateQuery(date) {
  const dateStr = toCanonicalDateString(date);
  logger.log(`[readingsService] Поиск по дате: _date="${dateStr}"`);
  return query(getReadingsCollection(), where('_date', '==', dateStr));
}

/**
 * Поиск чтений по празднику (динамический праздник)
 * Использует каноническое поле _feast
 */
export function getReadingsByFeastQuery(_feast) {
  const canonicalFeast = normalizeFeastValue(_feast);
  logger.log(`[readingsService] Поиск по празднику: _feast="${canonicalFeast}"`);
  return query(getReadingsCollection(), where('_feast', '==', canonicalFeast));
}

/**
 * Комплексный поиск чтений для конкретной даты
 */
export async function getReadingsForDate(date, options = {}) {
  const { periodType, periodWeekNumber, dayOfWeek, _feast } = options;
  const mDate = moment(date).startOf('day');
  const dateStr = mDate.format('YYYY-MM-DD');

  const queries = [];

  logger.log(`[readingsService] Поиск чтений для даты ${dateStr}`, {
    periodType,
    periodWeekNumber,
    dayOfWeek,
    _feast,
    dateFormatted: toCanonicalDateString(date),
  });

  queries.push(getReadingsByDateQuery(date));

  if (periodType && periodWeekNumber !== undefined && dayOfWeek !== undefined) {
    queries.push(getReadingsByPeriodQuery(periodType, periodWeekNumber, dayOfWeek));
    logger.log(`[readingsService] Запрос по периоду: ${periodType}, неделя ${Number(periodWeekNumber)}, день ${Number(dayOfWeek)}`);
  } else {
    logger.log(`[readingsService] Параметры периода неполные: periodType="${periodType}", periodWeekNumber="${periodWeekNumber}", dayOfWeek="${dayOfWeek}"`);
  }

  if (_feast) {
    queries.push(getReadingsByFeastQuery(_feast));
    logger.log(`[readingsService] Запрос по празднику: _feast="${normalizeFeastValue(_feast)}"`);
  }

  try {
    const querySnapshots = await Promise.all(
      queries.map((q) => retryFirestore(() => getDocs(q))),
    );

    const results = [];
    let foundCount = 0;
    const seenIds = new Set();

    const queryTypes = ['дата'];
    if (periodType && periodWeekNumber !== undefined && dayOfWeek !== undefined) {
      queryTypes.push('период');
    }
    if (_feast) {
      queryTypes.push('праздник');
    }

    querySnapshots.forEach((snapshot, queryIndex) => {
      const queryType = queryTypes[queryIndex] || `запрос #${queryIndex + 1}`;
      const queryResults = [];
      snapshot.forEach((itemDoc) => {
        if (!seenIds.has(itemDoc.id)) {
          seenIds.add(itemDoc.id);
          foundCount++;
          const docData = itemDoc.data();
          queryResults.push({
            id: itemDoc.id,
            _source: 'readings',
            ...docData,
          });
          logger.log(`[readingsService] ✓ Найден документ ${itemDoc.id} (${queryType})`, {
            _date: docData._date || 'нет',
            _periodType: docData._periodType || 'нет',
            _periodWeekNumber: docData._periodWeekNumber ?? 'нет',
            _dayOfWeek: docData._dayOfWeek ?? 'нет',
            _feast: docData._feast || 'нет',
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

    const uniqueResults = Array.from(new Map(results.map((item) => [item.id, item])).values());

    logger.log('[readingsService] Пасля аб\'яднання:', uniqueResults.length, 'чытанняў');

    uniqueResults.sort((a, b) => {
      const aPrimary = a._source === 'readings';
      const bPrimary = b._source === 'readings';
      if (aPrimary && !bPrimary) return -1;
      if (!aPrimary && bPrimary) return 1;
      return 0;
    });

    logger.log('[readingsService] Фінальны вынік для даты', dateStr, ':', uniqueResults.length, 'чытанняў');
    if (uniqueResults.length > 0) {
      const sources = uniqueResults.map((r) => r._source);
      logger.log('[readingsService] Источники:', [...new Set(sources)].join(', '));
      logger.log('[readingsService] Первый результат из:', uniqueResults[0]._source);
    }

    return uniqueResults;
  } catch (error) {
    logger.error('[readingsService] Памылка пошуку чытанняў:', error);
    throw error;
  }
}

export async function addReading(data) {
  const validation = validateReading(data);
  if (validation !== true) {
    const error = new Error(validation);
    logger.error('[readingsService]', error);
    throw error;
  }

  try {
    const normalizedData = normalizeReading(data);
    normalizedData.createdAt = serverTimestamp();
    normalizedData.updatedAt = serverTimestamp();
    const docRef = await retryFirestore(() => addDoc(getReadingsCollection(), normalizedData));
    logger.log('[readingsService] Чытанне дададзена:', docRef.id);
    return docRef;
  } catch (error) {
    logger.error('[readingsService] Памылка дадавання чытання:', error);
    throw error;
  }
}

export async function updateReading(id, data) {
  const validation = validateReading(data, { partial: true });
  if (validation !== true) {
    const error = new Error(validation);
    logger.error('[readingsService]', error);
    throw error;
  }

  try {
    const dataToUpdate = { ...data };
    delete dataToUpdate.id;

    const normalizedData = normalizeReading(dataToUpdate);
    normalizedData.updatedAt = serverTimestamp();

    await retryFirestore(() => updateDoc(doc(db, READINGS_COLLECTION, id), normalizedData));
    logger.log('[readingsService] Чытанне абноўлена:', id);
  } catch (error) {
    logger.error('[readingsService] Памылка абнаўлення чытання:', error);
    throw error;
  }
}

export async function deleteReading(id) {
  try {
    await retryFirestore(() => deleteDoc(doc(db, READINGS_COLLECTION, id)));
    logger.log('[readingsService] Чытанне выдалена:', id);
  } catch (error) {
    logger.error('[readingsService] Памылка выдалення чытання:', error);
    throw error;
  }
}

export async function getReadingById(id) {
  try {
    const docRef = doc(db, READINGS_COLLECTION, id);
    const snapshot = await retryFirestore(() => getDoc(docRef));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...snapshot.data() };
  } catch (error) {
    logger.error('[readingsService] Памылка атрымання чытання:', error);
    throw error;
  }
}

export async function getAllReadings(options = {}) {
  const { orderByField = 'createdAt', orderDirection = 'desc' } = options;
  try {
    const q = query(getReadingsCollection(), orderBy(orderByField, orderDirection));
    const snapshot = await retryFirestore(() => getDocs(q));
    return snapshot.docs.map((itemDoc) => ({ id: itemDoc.id, ...itemDoc.data() }));
  } catch (error) {
    logger.error('[readingsService] Памылка атрымання ўсіх чытанняў:', error);
    throw error;
  }
}
