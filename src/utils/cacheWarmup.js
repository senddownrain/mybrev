import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { logger } from '@/utils/logger';
import { retryFirestore } from '@/utils/retry';
import { useCalendarStore } from '@/stores/calendar';
import { useLiturgicalDay } from '@/composables/useLiturgicalDay';
import { getReadingsForDate } from '@/services/readingsService';
import moment from '@/utils/moment-be';

// Глобальный кэш для отслеживания уже загруженных дней в этом сеансе
const loadedDaysCache = new Set();
/**
 * Прогрев кэша для коллекции yearOptions
 * Загружает всю коллекцию для кэширования в Firebase persistent cache
 */
export async function warmupYearOptions() {
  try {
    logger.log('[CacheWarmup] Пачатак прагрэву yearOptions...');
    const calendarStore = useCalendarStore();
    
    // Загружаем все доступные годы
    const years = await calendarStore.getAvailableYears();
    
    // Загружаем опции для каждого года
    const promises = years.map(year => calendarStore.getYearOptions(year));
    await Promise.all(promises);
    
    // Загружаем динамические даты для текущего и следующего года
    const currentYear = moment().year();
    await calendarStore.getDynamicDates(currentYear);
    await calendarStore.getDynamicDates(currentYear + 1);
    
    logger.log(`[CacheWarmup] Прагрэў yearOptions завершаны (${years.length} гадоў)`);
  } catch (error) {
    logger.error('[CacheWarmup] Памылка пры прагрэве yearOptions:', error);
  }
}

/**
 * Прогрев кэша для коллекции prayers
 * prayersStore уже использует onSnapshot, который автоматически кэширует данные
 * Эта функция просто проверяет, что данные загружены
 */
export async function warmupPrayers() {
  try {
    logger.log('[CacheWarmup] Пачатак прагрэву prayers...');
    
    // prayersStore уже использует onSnapshot при инициализации в main.js
    // Просто делаем один запрос для прогрева кэша, если еще не загружено
    const prayersCollection = collection(db, 'prayers');
    const snapshot = await retryFirestore(() => getDocs(prayersCollection));
    
    logger.log(`[CacheWarmup] Прагрэў prayers завершаны (${snapshot.size} малітваў)`);
  } catch (error) {
    logger.error('[CacheWarmup] Памылка пры прагрэве prayers:', error);
  }
}

/**
 * Проверяет, есть ли данные для даты в кэше Firebase
 * @param {moment.Moment} mDate - Дата
 * @returns {Promise<boolean>} true если данные есть в кэше
 */
async function isDateCached(mDate) {
  const dateKey = mDate.format('YYYY-MM-DD');
  
  // Проверяем наш внутренний кэш загруженных дней
  if (loadedDaysCache.has(dateKey)) {
    return true;
  }
  
  // Firebase persistent cache автоматически использует кэш при повторных запросах
  // Мы полагаемся на это, так как прямого доступа к IndexedDB нет
  return false;
}

/**
 * Отмечает дату как загруженную в кэш
 * @param {moment.Moment} mDate - Дата
 */
function markDateAsLoaded(mDate) {
  const dateKey = mDate.format('YYYY-MM-DD');
  loadedDaysCache.add(dateKey);
}

/**
 * Прогрев кэша для коллекции readings на указанный период
 * С приоритизацией: сначала ближайшие дни, потом дальние
 * @param {Date|moment.Moment|string} startDate - Начальная дата
 * @param {Date|moment.Moment|string} endDate - Конечная дата
 * @param {boolean} prioritizeNear - Приоритизировать ближайшие дни (по умолчанию true)
 */
export async function warmupReadings(startDate, endDate, prioritizeNear = true) {
  try {
    logger.log(`[CacheWarmup] Пачатак прагрэву readings з ${moment(startDate).format('YYYY-MM-DD')} па ${moment(endDate).format('YYYY-MM-DD')}...`);
    
    const { computeLiturgicalContextForDate } = useLiturgicalDay();
    
    const mStart = moment(startDate).startOf('day');
    const mEnd = moment(endDate).startOf('day');
    const totalDays = mEnd.diff(mStart, 'days') + 1;
    
    let processed = 0;
    let skipped = 0;
    const batchSize = 10;
    
    // Кэш для вычисленных контекстов одного года
    const contextCache = new Map();
    const currentYear = mStart.year();
    
    // Создаем массив дат с приоритизацией
    const dates = [];
    for (let i = 0; i < totalDays; i++) {
      dates.push(mStart.clone().add(i, 'days'));
    }
    
    // Приоритизируем: сначала ближайшие дни (сегодня и вперед), потом дальние
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
            
            // Проверяем, не загружена ли уже эта дата
            if (await isDateCached(currentDate)) {
              skipped++;
              return;
            }
            
            // Вычисляем контекст для даты (кэшируем для одного года)
            let context;
            if (currentDate.year() === currentYear && contextCache.has(dateKey)) {
              context = contextCache.get(dateKey);
            } else {
              context = await computeLiturgicalContextForDate(currentDate.toDate());
              if (currentDate.year() === currentYear) {
                contextCache.set(dateKey, context);
              }
            }
            
            // Загружаем чтения для этой даты
            await getReadingsForDate(currentDate.toDate(), {
              periodType: context.periodType,
              periodWeekNumber: context.periodWeek,
              dayOfWeek: context.dayOfWeek,
              _feast: context._feast,
              useCache: true,
            });
            
            // Отмечаем как загруженную
            markDateAsLoaded(currentDate);
            
            processed++;
            if (processed % 20 === 0) {
              logger.log(`[CacheWarmup] Прагрэў readings: ${processed}/${totalDays} дзён (прапушчана: ${skipped})`);
            }
          } catch (error) {
            logger.error(`[CacheWarmup] Памылка пры прагрэве readings для ${currentDate.format('YYYY-MM-DD')}:`, error);
            processed++;
          }
        })();
        
        batch.push(task);
      }
      
      await Promise.all(batch);
    }
    
    logger.log(`[CacheWarmup] Прагрэў readings завершаны (${processed}/${totalDays} дзён, прапушчана: ${skipped})`);
  } catch (error) {
    logger.error('[CacheWarmup] Памылка пры прагрэве readings:', error);
  }
}

/**
 * Прогрев кэша для коллекции days на указанный период
 * С приоритизацией: сначала ближайшие дни, потом дальние
 * @param {Date|moment.Moment|string} startDate - Начальная дата
 * @param {Date|moment.Moment|string} endDate - Конечная дата
 * @param {boolean} prioritizeNear - Приоритизировать ближайшие дни (по умолчанию true)
 */
export async function warmupDays(startDate, endDate, prioritizeNear = true) {
  try {
    logger.log(`[CacheWarmup] Пачатак прагрэву days з ${moment(startDate).format('YYYY-MM-DD')} па ${moment(endDate).format('YYYY-MM-DD')}...`);
    
    const { getLiturgicalOptionsForDate } = useLiturgicalDay();
    
    const mStart = moment(startDate).startOf('day');
    const mEnd = moment(endDate).startOf('day');
    const totalDays = mEnd.diff(mStart, 'days') + 1;
    
    let processed = 0;
    let skipped = 0;
    const batchSize = 10;
    
    // Создаем массив дат с приоритизацией
    const dates = [];
    for (let i = 0; i < totalDays; i++) {
      dates.push(mStart.clone().add(i, 'days'));
    }
    
    // Приоритизируем: сначала ближайшие дни (сегодня и вперед), потом дальние
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
            // Проверяем, не загружена ли уже эта дата
            if (await isDateCached(currentDate)) {
              skipped++;
              return;
            }
            
            // Загружаем литургические опции для даты (это автоматически кэширует days)
            // Firebase persistent cache автоматически использует кэш при повторных запросах
            await getLiturgicalOptionsForDate(currentDate.toDate());
            
            // Отмечаем как загруженную
            markDateAsLoaded(currentDate);
            
            processed++;
            if (processed % 20 === 0) {
              logger.log(`[CacheWarmup] Прагрэў days: ${processed}/${totalDays} дзён (прапушчана: ${skipped})`);
            }
          } catch (error) {
            logger.error(`[CacheWarmup] Памылка пры прагрэве days для ${currentDate.format('YYYY-MM-DD')}:`, error);
            processed++;
          }
        })();
        
        batch.push(task);
      }
      
      await Promise.all(batch);
    }
    
    logger.log(`[CacheWarmup] Прагрэў days завершаны (${processed}/${totalDays} дзён, прапушчана: ${skipped})`);
  } catch (error) {
    logger.error('[CacheWarmup] Памылка пры прагрэве days:', error);
  }
}

/**
 * Проверяет покрытие кэша days на неделю вперед
 * Использует getDocFromCache для проверки наличия данных в кэше
 * @returns {Promise<boolean>} true если есть данные на неделю вперед, false если нет
 */
export async function checkDaysCacheCoverage() {
  try {
    const today = moment().startOf('day');
    const weekAhead = today.clone().add(7, 'days');
    
    const { computeLiturgicalContextForDate } = useLiturgicalDay();
    
    // Вычисляем контекст для проверки
    const context = await computeLiturgicalContextForDate(weekAhead.toDate());
    
    // Проверяем наличие данных в кэше через попытку загрузки
    // Firebase persistent cache автоматически использует кэш при повторных запросах
    // Если данные есть в кэше, запрос будет мгновенным
    const startCheck = Date.now();
    try {
      const { getLiturgicalOptionsForDate } = useLiturgicalDay();
      await getLiturgicalOptionsForDate(weekAhead.toDate());
      const duration = Date.now() - startCheck;
      
      // Если запрос выполнился очень быстро (< 50ms), вероятно данные были в кэше
      if (duration < 50) {
        logger.log('[CacheWarmup] Пакрыццё days кэшу на тыдзень наперад: ёсць (хуткі доступ)');
        return true;
      } else {
        // Данные загрузились, но не из кэша - значит кэша не было
        logger.log('[CacheWarmup] Пакрыццё days кэшу на тыдзень наперад: няма (патрабавалася загрузка)');
        return false;
      }
    } catch (error) {
      logger.log('[CacheWarmup] Пакрыццё days кэшу на тыдзень наперад: няма (памылка)');
      return false;
    }
  } catch (error) {
    logger.error('[CacheWarmup] Памылка пры праверцы пакрыцця days кэшу:', error);
    return false;
  }
}

/**
 * Обеспечивает покрытие кэша days на неделю вперед
 * Если данных нет, загружает еще 30 дней вперед
 */
export async function ensureDaysCacheCoverage() {
  try {
    const hasCoverage = await checkDaysCacheCoverage();
    
    if (!hasCoverage) {
      logger.log('[CacheWarmup] Пакрыцця days кэшу недастаткова, загружаем яшчэ 30 дзён наперад...');
      
      const today = moment().startOf('day');
      const startDate = today.clone().add(30, 'days'); // Начинаем с 30-го дня от сегодня
      const endDate = today.clone().add(60, 'days'); // Загружаем до 60-го дня
      
      await warmupDays(startDate.toDate(), endDate.toDate());
      logger.log('[CacheWarmup] Дадатковае пакрыццё days кэшу завершана');
    } else {
      logger.log('[CacheWarmup] Пакрыццё days кэшу дастатковае');
    }
  } catch (error) {
    logger.error('[CacheWarmup] Памылка пры забеспячэнні пакрыцця days кэшу:', error);
  }
}

/**
 * Главная функция прогрева кэша
 * Запускает предзагрузку всех коллекций в фоне
 * Оптимизирована для параллельной загрузки и пропуска уже закэшированных данных
 * Использует приоритизацию: сначала ближайшие дни, потом дальние
 */
export async function warmupCache() {
  try {
    logger.log('[CacheWarmup] Пачатак прагрэву кэшу...');
    const startTime = Date.now();
    
    const today = moment().startOf('day');
    const endDate = today.clone().add(30, 'days'); // Загружаем на месяц вперед
    
    // Шаг 1: Загружаем базовые коллекции параллельно (они независимы)
    logger.log('[CacheWarmup] Крок 1: Загрузка yearOptions і prayers...');
    await Promise.all([
      warmupYearOptions(),
      warmupPrayers(),
    ]);
    
    // Шаг 2: Загружаем readings и days параллельно с приоритизацией ближайших дней
    // Приоритизация: сначала сегодня и ближайшие дни, потом дальние
    logger.log('[CacheWarmup] Крок 2: Загрузка readings і days (з прыярытэтам бліжэйшых дзён)...');
    await Promise.all([
      warmupReadings(today.toDate(), endDate.toDate(), true),
      warmupDays(today.toDate(), endDate.toDate(), true),
    ]);
    
    // Шаг 3: Проверяем и обновляем покрытие days кэша
    logger.log('[CacheWarmup] Крок 3: Праверка пакрыцця days кэшу...');
    await ensureDaysCacheCoverage();
    
    const duration = Date.now() - startTime;
    logger.log(`[CacheWarmup] ✅ Прагрэў кэшу завершаны за ${(duration / 1000).toFixed(2)} секунд`);
  } catch (error) {
    logger.error('[CacheWarmup] Памылка пры прагрэве кэшу:', error);
  }
}

