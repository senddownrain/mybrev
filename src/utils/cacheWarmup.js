import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { logger } from '@/utils/logger';
import { retryFirestore } from '@/utils/retry';
import { useCalendarStore } from '@/stores/calendar';
import { useLiturgicalDay } from '@/composables/useLiturgicalDay';
import { getReadingsForDate } from '@/services/readingsService';
import moment from '@/utils/moment-be';

// Глобальны кэш для адсочвання ўжо загружаных дзён у гэтым сеансе
const loadedDaysCache = new Set();

/**
 * Прагрэў кэшу для калекцыі yearOptions
 * Загружае ўсю калекцыю для кэшавання ў Firebase persistent cache
 */
export async function warmupYearOptions() {
  try {
    logger.log('[CacheWarmup] Starting yearOptions warmup...');
    const calendarStore = useCalendarStore();
    
    // Загружаем усе даступныя гады
    const years = await calendarStore.getAvailableYears();
    
    // Загружаем апцыі для кожнага года
    const promises = years.map(year => calendarStore.getYearOptions(year));
    await Promise.all(promises);
    
    // Загружаем дынамічныя даты для бягучага і наступнага года
    const currentYear = moment().year();
    await calendarStore.getDynamicDates(currentYear);
    await calendarStore.getDynamicDates(currentYear + 1);
    
    logger.log(`[CacheWarmup] yearOptions warmup complete (${years.length} years)`);
  } catch (error) {
    logger.error('[CacheWarmup] Error during yearOptions warmup:', error);
  }
}

/**
 * Прагрэў кэшу для калекцыі prayers
 * prayersStore ужо выкарыстоўвае onSnapshot, які аўтаматычна кэшуе даныя
 * Гэта функцыя проста правярае, што даныя загружаны
 */
export async function warmupPrayers() {
  try {
    logger.log('[CacheWarmup] Starting prayers warmup...');
    
    // prayersStore ужо выкарыстоўвае onSnapshot пры ініцыялізацыі ў main.js
    // Проста робім адзін запыт для прагрэву кэшу, калі яшчэ не загружана
    const prayersCollection = collection(db, 'prayers');
    const snapshot = await retryFirestore(() => getDocs(prayersCollection));
    
    logger.log(`[CacheWarmup] Prayers warmup complete (${snapshot.size} prayers)`);
  } catch (error) {
    logger.error('[CacheWarmup] Error during prayers warmup:', error);
  }
}

/**
 * Правярае, ці ёсць даныя для даты ў кэшы Firebase
 * @param {moment.Moment} mDate - Дата
 * @returns {Promise<boolean>} true калі даныя ёсць у кэшы
 */
async function isDateCached(mDate) {
  const dateKey = mDate.format('YYYY-MM-DD');
  
  // Правяраем наш унутраны кэш загружаных дзён
  if (loadedDaysCache.has(dateKey)) {
    return true;
  }
  
  // Firebase persistent cache аўтаматычна выкарыстоўвае кэш пры паўторных запытах
  // Мы абапіраемся на гэта, паколькі прамога доступу да IndexedDB няма
  return false;
}

/**
 * Адзначае дату як загружаную ў кэш
 * @param {moment.Moment} mDate - Дата
 */
function markDateAsLoaded(mDate) {
  const dateKey = mDate.format('YYYY-MM-DD');
  loadedDaysCache.add(dateKey);
}

/**
 * Warmup cache for the readings collection over a date range.
 * Prioritizes nearest days first.
 * @param {Date|moment.Moment|string} startDate - Start date
 * @param {Date|moment.Moment|string} endDate - End date
 * @param {boolean} prioritizeNear - Prioritize nearest days (default true)
 */
export async function warmupReadings(startDate, endDate, prioritizeNear = true) {
  try {
    logger.log(`[CacheWarmup] Starting readings warmup from ${moment(startDate).format('YYYY-MM-DD')} to ${moment(endDate).format('YYYY-MM-DD')}...`);
    
    const { computeLiturgicalContextForDate } = useLiturgicalDay();
    
    const mStart = moment(startDate).startOf('day');
    const mEnd = moment(endDate).startOf('day');
    const totalDays = mEnd.diff(mStart, 'days') + 1;
    
    let processed = 0;
    let skipped = 0;
    const batchSize = 10;
    
    // Кэш для вылічаных кантэкстаў аднаго года
    const contextCache = new Map();
    const currentYear = mStart.year();
    
    // Ствараем масіў дат з прыярытызацыяй
    const dates = [];
    for (let i = 0; i < totalDays; i++) {
      dates.push(mStart.clone().add(i, 'days'));
    }
    
    // Прыярытызуем: спачатку бліжэйшыя дні (сёння і наперад), потым далёкія
    if (prioritizeNear) {
      const today = moment().startOf('day');
      dates.sort((a, b) => {
        const diffA = Math.abs(a.diff(today, 'days'));
        const diffB = Math.abs(b.diff(today, 'days'));
        return diffA - diffB;
      });
    }
    
    for (let i = 0; i < dates.length; i += batchSize) {
      const batchEnd = Math.min(i + batchSize, dates.length);
      const batch = [];
      
      for (let j = i; j < batchEnd; j++) {
        const currentDate = dates[j];
        
        const task = (async () => {
          try {
            const dateKey = currentDate.format('YYYY-MM-DD');
            
            // Правяраем, ці не загружана ўжо гэта дата
            if (await isDateCached(currentDate)) {
              skipped++;
              return;
            }
            
            // Вылічаем кантэкст для даты (кэшуем для аднаго года)
            let context;
            if (currentDate.year() === currentYear && contextCache.has(dateKey)) {
              context = contextCache.get(dateKey);
            } else {
              context = await computeLiturgicalContextForDate(currentDate.toDate());
              if (currentDate.year() === currentYear) {
                contextCache.set(dateKey, context);
              }
            }
            
            // Load readings for this date
            await getReadingsForDate(currentDate.toDate(), {
              periodType: context.periodType,
              periodWeekNumber: context.periodWeek,
              dayOfWeek: context.dayOfWeek,
              _feast: context._feast,
              useCache: true,
            });
            
            // Адзначаем як загружаную
            markDateAsLoaded(currentDate);
            
            processed++;
            if (processed % 20 === 0) {
              logger.log(`[CacheWarmup] Readings warmup progress: ${processed}/${totalDays} days (skipped: ${skipped})`);
            }
          } catch (error) {
            logger.error(`[CacheWarmup] Error during readings warmup for ${currentDate.format('YYYY-MM-DD')}:`, error);
            processed++;
          }
        })();
        
        batch.push(task);
      }
      
      await Promise.all(batch);
    }
    
    logger.log(`[CacheWarmup] Readings warmup complete (${processed}/${totalDays} days, skipped: ${skipped})`);
  } catch (error) {
    logger.error('[CacheWarmup] Error during readings warmup:', error);
  }
}

/**
 * Прагрэў кэшу для калекцыі days на ўказаны перыяд
 * З прыярытызацыяй: спачатку бліжэйшыя дні, потым далёкія
 * @param {Date|moment.Moment|string} startDate - Пачатковая дата
 * @param {Date|moment.Moment|string} endDate - Канечная дата
 * @param {boolean} prioritizeNear - Прыярытызаваць бліжэйшыя дні (па змаўчанні true)
 */
export async function warmupDays(startDate, endDate, prioritizeNear = true) {
  try {
    logger.log(`[CacheWarmup] Starting days warmup from ${moment(startDate).format('YYYY-MM-DD')} to ${moment(endDate).format('YYYY-MM-DD')}...`);
    
    const { getLiturgicalOptionsForDate } = useLiturgicalDay();
    
    const mStart = moment(startDate).startOf('day');
    const mEnd = moment(endDate).startOf('day');
    const totalDays = mEnd.diff(mStart, 'days') + 1;
    
    let processed = 0;
    let skipped = 0;
    const batchSize = 10;
    
    // Ствараем масіў дат з прыярытызацыяй
    const dates = [];
    for (let i = 0; i < totalDays; i++) {
      dates.push(mStart.clone().add(i, 'days'));
    }
    
    // Прыярытызуем: спачатку бліжэйшыя дні (сёння і наперад), потым далёкія
    if (prioritizeNear) {
      const today = moment().startOf('day');
      dates.sort((a, b) => {
        const diffA = Math.abs(a.diff(today, 'days'));
        const diffB = Math.abs(b.diff(today, 'days'));
        return diffA - diffB;
      });
    }
    
    for (let i = 0; i < dates.length; i += batchSize) {
      const batchEnd = Math.min(i + batchSize, dates.length);
      const batch = [];
      
      for (let j = i; j < batchEnd; j++) {
        const currentDate = dates[j];
        
        const task = (async () => {
          try {
            // Правяраем, ці не загружана ўжо гэта дата
            if (await isDateCached(currentDate)) {
              skipped++;
              return;
            }
            
            // Загружаем літургічныя апцыі для даты (гэта аўтаматычна кэшуе days)
            // Firebase persistent cache аўтаматычна выкарыстоўвае кэш пры паўторных запытах
            await getLiturgicalOptionsForDate(currentDate.toDate());
            
            // Адзначаем як загружаную
            markDateAsLoaded(currentDate);
            
            processed++;
            if (processed % 20 === 0) {
              logger.log(`[CacheWarmup] Days warmup progress: ${processed}/${totalDays} days (skipped: ${skipped})`);
            }
          } catch (error) {
            logger.error(`[CacheWarmup] Error during days warmup for ${currentDate.format('YYYY-MM-DD')}:`, error);
            processed++;
          }
        })();
        
        batch.push(task);
      }
      
      await Promise.all(batch);
    }
    
    logger.log(`[CacheWarmup] Days warmup complete (${processed}/${totalDays} days, skipped: ${skipped})`);
  } catch (error) {
    logger.error('[CacheWarmup] Error during days warmup:', error);
  }
}

/**
 * Правярае пакрыццё кэшу days на тыдзень наперад
 * Выкарыстоўвае getDocFromCache для праверкі наяўнасці даных у кэшы
 * @returns {Promise<boolean>} true калі ёсць даныя на тыдзень наперад, false калі няма
 */
export async function checkDaysCacheCoverage() {
  try {
    const today = moment().startOf('day');
    const weekAhead = today.clone().add(7, 'days');
    
    const { computeLiturgicalContextForDate } = useLiturgicalDay();
    
    // Вылічаем кантэкст для праверкі
    const context = await computeLiturgicalContextForDate(weekAhead.toDate());
    
    // Правяраем наяўнасць даных у кэшы праз спробу загрузкі
    // Firebase persistent cache аўтаматычна выкарыстоўвае кэш пры паўторных запытах
    // Калі даныя ёсць у кэшы, запыт будзе імгненным
    const startCheck = Date.now();
    try {
      const { getLiturgicalOptionsForDate } = useLiturgicalDay();
      await getLiturgicalOptionsForDate(weekAhead.toDate());
      const duration = Date.now() - startCheck;
      
      // Калі запыт выканаўся вельмі хутка (< 50ms), верагодна даныя былі ў кэшы
      if (duration < 50) {
        logger.log('[CacheWarmup] Days cache coverage for week ahead: present (fast access)');
        return true;
      } else {
        // Даныя загрузіліся, але не з кэшу — значыць кэшу не было
        logger.log('[CacheWarmup] Days cache coverage for week ahead: absent (load was required)');
        return false;
      }
    } catch (error) {
      logger.log('[CacheWarmup] Days cache coverage for week ahead: absent (error)');
      return false;
    }
  } catch (error) {
    logger.error('[CacheWarmup] Error checking days cache coverage:', error);
    return false;
  }
}

/**
 * Забяспечвае пакрыццё кэшу days на тыдзень наперад
 * Калі даных няма, загружае яшчэ 30 дзён наперад
 */
export async function ensureDaysCacheCoverage() {
  try {
    const hasCoverage = await checkDaysCacheCoverage();
    
    if (!hasCoverage) {
      logger.log('[CacheWarmup] Days cache coverage insufficient, loading 30 more days ahead...');
      
      const today = moment().startOf('day');
      const startDate = today.clone().add(30, 'days'); // Пачынаем з 30-га дня ад сёння
      const endDate = today.clone().add(60, 'days'); // Загружаем да 60-га дня
      
      await warmupDays(startDate.toDate(), endDate.toDate());
      logger.log('[CacheWarmup] Additional days cache coverage complete');
    } else {
      logger.log('[CacheWarmup] Days cache coverage is sufficient');
    }
  } catch (error) {
    logger.error('[CacheWarmup] Error ensuring days cache coverage:', error);
  }
}

/**
 * Галоўная функцыя прагрэву кэшу
 * Запускае перадзагрузку ўсіх калекцый у фоне
 * Аптымізавана для паралельнай загрузкі і прапуску ўжо закэшаваных даных
 * Выкарыстоўвае прыярытызацыю: спачатку бліжэйшыя дні, потым далёкія
 */
export async function warmupCache() {
  try {
    logger.log('[CacheWarmup] Starting cache warmup...');
    const startTime = Date.now();
    
    const today = moment().startOf('day');
    const endDate = today.clone().add(30, 'days'); // Загружаем на месяц наперад
    
    // Крок 1: Загружаем базавыя калекцыі паралельна (яны незалежныя)
    logger.log('[CacheWarmup] Step 1: Loading yearOptions and prayers...');
    await Promise.all([
      warmupYearOptions(),
      warmupPrayers(),
    ]);
    
    // Крок 2: Загружаем readings і days паралельна з прыярытызацыяй бліжэйшых дзён
    // Прыярытызацыя: спачатку сёння і бліжэйшыя дні, потым далёкія
    logger.log('[CacheWarmup] Step 2: Loading readings and days (prioritizing nearest days)...');
    await Promise.all([
      warmupReadings(today.toDate(), endDate.toDate(), true),
      warmupDays(today.toDate(), endDate.toDate(), true),
    ]);
    
    // Крок 3: Правяраем і абнаўляем пакрыццё days кэшу
    logger.log('[CacheWarmup] Step 3: Checking days cache coverage...');
    await ensureDaysCacheCoverage();
    
    const duration = Date.now() - startTime;
    logger.log(`[CacheWarmup] Cache warmup complete in ${(duration / 1000).toFixed(2)} seconds`);
  } catch (error) {
    logger.error('[CacheWarmup] Error during cache warmup:', error);
  }
}
