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
  const documentId = normalized.startsWith('feast-') ? normalized : `feast-${normalized}`;
  for (const feast of CANONICAL_FEAST_VALUES) {
    if (feast.toLowerCase() === documentId) return feast;
  }
  return documentId;
}

function toCanonicalDateString(date) {
  return moment(date).format('DD.MM');
}

/**
 * @typedef {Object} Reading
 * @property {string} id - Firestore document ID
 * @property {string} [_source] - Internal source tag, e.g. 'readings'
 * @property {string} [_date] - Fixed calendar date in D.M format (e.g. '25.12')
 * @property {string} [_feast] - Dynamic feast key (e.g. 'feast-eastersunday', 'feast-pentecost')
 * @property {string} [_periodType] - Liturgical period type (e.g. 'ordinary', 'lent', 'easter')
 * @property {number|string} [_periodWeekNumber] - Week number within the period
 * @property {number|string} [_dayOfWeek] - Day of week within the period (1 = Sunday)
 * @property {string} [cycle] - Lectionary cycle (e.g. 'A', 'B', 'C', '1', '2')
 * @property {string} [title] - Title of the reading
 * @property {string} [text] - Full text of the reading
 * @property {import('firebase/firestore').Timestamp} [createdAt] - Creation timestamp
 * @property {import('firebase/firestore').Timestamp} [updatedAt] - Last update timestamp
 */

/**
 * Get a reference to the 'readings' Firestore collection.
 *
 * @returns {import('firebase/firestore').CollectionReference} Firestore collection reference
 */
export function getReadingsCollection() {
  return collection(db, READINGS_COLLECTION);
}

/**
 * Build a Firestore query to search readings by liturgical period, week, day and optional cycle.
 *
 * @param {string} periodType - Liturgical period type (e.g. 'ordinary', 'lent')
 * @param {number|string} periodWeekNumber - Week number within the period
 * @param {number|string} dayOfWeek - Day of week (1 = Sunday)
 * @param {string|null} cycle - Lectionary cycle (A/B/C/1/2), or null to match any cycle
 * @returns {import('firebase/firestore').Query} Firestore query
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
 * Build a Firestore query to search readings by fixed calendar date (DD.MM format).
 *
 * @param {Date|import('moment').Moment|string} date - The date to search for
 * @returns {import('firebase/firestore').Query} Firestore query
 */
export function getReadingsByDateQuery(date) {
  const dateStr = toCanonicalDateString(date);
  logger.log(`[readingsService] Searching by date: _date="${dateStr}"`);
  return query(getReadingsCollection(), where('_date', '==', dateStr));
}

/**
 * Build a Firestore query to search readings by dynamic feast key.
 *
 * @param {string} _feast - Feast key matching the `_feast` field (e.g. 'feast-eastersunday', 'feast-pentecost')
 * @returns {import('firebase/firestore').Query} Firestore query
 */
export function getReadingsByFeastQuery(_feast) {
  const canonicalFeast = normalizeFeastValue(_feast);
  logger.log(`[readingsService] Searching by feast: _feast="${canonicalFeast}"`);
  return query(getReadingsCollection(), where('_feast', '==', canonicalFeast));
}

/**
 * Perform a comprehensive search for readings matching a given date.
 * Executes parallel Firestore queries by fixed date (DD.MM), liturgical period, and dynamic feast.
 * Deduplicates results by document ID; readings from the 'readings' collection are ranked first.
 *
 * @param {Date|import('moment').Moment|string} date - The date to find readings for
 * @param {Object} [options={}] - Search options
 * @param {string} [options.periodType] - Liturgical period type (e.g. 'ordinary', 'lent')
 * @param {number} [options.periodWeekNumber] - Week number within the liturgical period
 * @param {number} [options.dayOfWeek] - Day of week within the period (1–7, 1 = Sunday)
 * @param {string} [options._feast] - Dynamic feast key for feast-specific readings
 * @param {boolean} [options.useCache=true] - Reserved for future use
 * @returns {Promise<Reading[]>} Array of deduplicated reading objects sorted by source priority
 * @throws {Error} If all Firestore queries fail
 */
export async function getReadingsForDate(date, options = {}) {
  const { periodType, periodWeekNumber, dayOfWeek, _feast } = options;
  const mDate = moment(date).startOf('day');
  const dateStr = mDate.format('YYYY-MM-DD');

  const queries = [];

  logger.log(`[readingsService] Searching readings for date ${dateStr}`, {
    periodType,
    periodWeekNumber,
    dayOfWeek,
    _feast,
    dateFormatted: toCanonicalDateString(date),
  });

  queries.push(getReadingsByDateQuery(date));

  if (periodType && periodWeekNumber !== undefined && dayOfWeek !== undefined) {
    queries.push(getReadingsByPeriodQuery(periodType, periodWeekNumber, dayOfWeek));
    logger.log(`[readingsService] Period query: ${periodType}, week ${Number(periodWeekNumber)}, day ${Number(dayOfWeek)}`);
  } else {
    logger.log(`[readingsService] Period params incomplete: periodType="${periodType}", periodWeekNumber="${periodWeekNumber}", dayOfWeek="${dayOfWeek}"`);
  }

  if (_feast) {
    queries.push(getReadingsByFeastQuery(_feast));
    logger.log(`[readingsService] Feast query: _feast="${normalizeFeastValue(_feast)}"`);
  }

  try {
    const querySnapshots = await Promise.all(
      queries.map((q) => retryFirestore(() => getDocs(q))),
    );

    const results = [];
    let foundCount = 0;
    const seenIds = new Set();

    const queryTypes = ['date'];
    if (periodType && periodWeekNumber !== undefined && dayOfWeek !== undefined) {
      queryTypes.push('period');
    }
    if (_feast) {
      queryTypes.push('feast');
    }

    querySnapshots.forEach((snapshot, queryIndex) => {
      const queryType = queryTypes[queryIndex] || `query #${queryIndex + 1}`;
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
          logger.log(`[readingsService] ✓ Document found ${itemDoc.id} (${queryType}):`, {
            _date: docData._date || 'none',
            _periodType: docData._periodType || 'none',
            _periodWeekNumber: docData._periodWeekNumber ?? 'none',
            _dayOfWeek: docData._dayOfWeek ?? 'none',
            _feast: docData._feast || 'none',
          });
        }
      });
      if (queryResults.length === 0) {
        logger.log(`[readingsService] ✗ ${queryType}: no documents found`);
      } else {
        logger.log(`[readingsService] ✓ ${queryType}: found ${queryResults.length} document(s)`);
      }
      results.push(...queryResults);
    });

    logger.log(`[readingsService] Total documents found: ${foundCount}`);

    const uniqueResults = Array.from(new Map(results.map((item) => [item.id, item])).values());

    logger.log('[readingsService] After deduplication:', uniqueResults.length, 'readings');


    uniqueResults.sort((a, b) => {
      const aPrimary = a._source === 'readings';
      const bPrimary = b._source === 'readings';
      if (aPrimary && !bPrimary) return -1;
      if (!aPrimary && bPrimary) return 1;
      return 0;
    });

    logger.log('[readingsService] Final result for date', dateStr, ':', uniqueResults.length, 'readings');
    if (uniqueResults.length > 0) {
      const sources = uniqueResults.map((r) => r._source);
      logger.log('[readingsService] Sources:', [...new Set(sources)].join(', '));
      logger.log('[readingsService] First result from:', uniqueResults[0]._source);
    }

    return uniqueResults;
  } catch (error) {
    logger.error('[readingsService] Error searching readings:', error);
    throw error;
  }
}

/**
 * Add a new reading document to Firestore after validation and normalisation.
 *
 * @param {Omit<Reading, 'id'|'_source'|'createdAt'|'updatedAt'>} data - Reading data to save
 * @returns {Promise<import('firebase/firestore').DocumentReference>} Reference to the created document
 * @throws {Error} If validation fails or the Firestore write fails
 */
export async function addReading(data) {
  const validation = validateReading(data);
  if (validation !== true) {
    const error = new Error(`Validation failed: ${validation}`);
    logger.error('[readingsService]', error);
    throw error;
  }

  try {
    const normalizedData = normalizeReading(data);
    normalizedData.createdAt = serverTimestamp();
    normalizedData.updatedAt = serverTimestamp();
    const docRef = await retryFirestore(() => addDoc(getReadingsCollection(), normalizedData));
    logger.log('[readingsService] Reading added:', docRef.id);
    return docRef;
  } catch (error) {
    logger.error('[readingsService] Error adding reading:', error);
    throw error;
  }
}

/**
 * Update an existing reading document in Firestore after partial validation and normalisation.
 * The `id` field is stripped from the payload before writing.
 *
 * @param {string} id - Firestore document ID of the reading to update
 * @param {Partial<Omit<Reading, 'id'|'_source'|'createdAt'>>} data - Fields to update
 * @returns {Promise<void>}
 * @throws {Error} If partial validation fails or the Firestore update fails
 */
export async function updateReading(id, data) {
  const validation = validateReading(data, { partial: true });
  if (validation !== true) {
    const error = new Error(`Validation failed: ${validation}`);
    logger.error('[readingsService]', error);
    throw error;
  }

  try {
    const dataToUpdate = { ...data };
    delete dataToUpdate.id;

    const normalizedData = normalizeReading(dataToUpdate);
    normalizedData.updatedAt = serverTimestamp();

    await retryFirestore(() => updateDoc(doc(db, READINGS_COLLECTION, id), normalizedData));
    logger.log('[readingsService] Reading updated:', id);
  } catch (error) {
    logger.error('[readingsService] Error updating reading:', error);
    throw error;
  }
}

/**
 * Delete a reading document from Firestore by its ID.
 *
 * @param {string} id - Firestore document ID of the reading to delete
 * @returns {Promise<void>}
 * @throws {Error} If the Firestore delete fails
 */
export async function deleteReading(id) {
  try {
    await retryFirestore(() => deleteDoc(doc(db, READINGS_COLLECTION, id)));
    logger.log('[readingsService] Reading deleted:', id);
  } catch (error) {
    logger.error('[readingsService] Error deleting reading:', error);
    throw error;
  }
}

/**
 * Retrieve a single reading document from Firestore by its ID.
 *
 * @param {string} id - Firestore document ID of the reading to fetch
 * @returns {Promise<Reading|null>} The reading object with its `id`, or null if the document does not exist
 * @throws {Error} If the Firestore read fails
 */
export async function getReadingById(id) {
  try {
    const docRef = doc(db, READINGS_COLLECTION, id);
    const snapshot = await retryFirestore(() => getDoc(docRef));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...snapshot.data() };
  } catch (error) {
    logger.error('[readingsService] Error fetching reading:', error);
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
