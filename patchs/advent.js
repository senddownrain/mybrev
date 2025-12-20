/**
 * migrate-readings-from-readingsData.js
 *
 * Миграция чтений Адвента из `readingsData` в `readings`
 * без деления на год I / II и без годовой уникальности.
 *
 * В `readingsData`:
 *   - дата:   day  (формат 'DD.MM.YYYY')
 *   - текст:  text (HTML)
 *
 * В `readings`:
 *   - обычные дни:
 *       _periodType = 'advent'
 *       _periodWeekNumber (1..4)
 *       _dayOfWeek (1..7, isoWeekday)
 *       text
 *   - особые дни 17–25 декабря:
 *       _date = 'YYYY-MM-DD'
 *       _periodType = 'advent'
 *       text
 *
 * Уникальность:
 *   - обычные дни: (advent, week, dow) → ID: `advent-w{week}-d{dow}`
 *   - 17–25 декабря: по дате → ID = `_date`
 */

const admin = require('firebase-admin');
const moment = require('moment');

// serviceAccountKey.json должен лежать рядом со скриптом
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const READINGS_DATA_COLLECTION = 'readingsData';
const READINGS_COLLECTION = 'readings';

// Старт Адвента (1-е воскресенье Адвента) по годам:
const ADVENT_STARTS = {
  2023: '2023-12-03',
  2024: '2024-12-01',
  2025: '2025-11-30',
};

// Годы, по которым пробегаемся для обычных дней
const YEARS = [2023, 2024, 2025];

// Диапазон особых дней
const SPECIAL_START_DAY = 17; // 17 декабря
const SPECIAL_END_DAY = 25;   // 25 декабря

/**
 * Массив moment-дней Адвента для года (4 недели = 28 дней).
 */
function getAdventDays(firstAdventSundayStr) {
  const first = moment(firstAdventSundayStr, 'YYYY-MM-DD');
  const days = [];
  for (let i = 0; i < 28; i++) {
    days.push(first.clone().add(i, 'days'));
  }
  return days;
}

/**
 * weekNumber: 1..4, _dayOfWeek: 1..7 (isoWeekday)
 */
function getAdventWeekAndDow(firstAdventSundayStr, currentDate) {
  const first = moment(firstAdventSundayStr, 'YYYY-MM-DD').startOf('day');
  const cur = currentDate.clone().startOf('day');

  const diffDays = cur.diff(first, 'days'); // 0..27
  const weekNumber = Math.floor(diffDays / 7) + 1;
  const dayOfWeek = cur.isoWeekday(); // 1..7

  return { weekNumber, dayOfWeek };
}

/**
 * Получить чтение из readingsData по календарной дате.
 *
 * В readingsData:
 *   - дата: day, формат 'DD.MM.YYYY'
 *   - текст: text
 *
 * Здесь dateStr — 'YYYY-MM-DD':
 *   '2023-12-03' -> '03.12.2023'
 */
async function getReadingTextForDate(dateStr) {
  const m = moment(dateStr, 'YYYY-MM-DD');
  if (!m.isValid()) {
    console.warn(`Невалидная дата: ${dateStr}`);
    return null;
  }

  const formatted = m.format('DD.MM.YYYY'); // 03.12.2023
  const snap = await db
    .collection(READINGS_DATA_COLLECTION)
    .where('day', '==', formatted)
    .limit(1)
    .get();

  if (snap.empty) {
    console.warn(`Нет документа в ${READINGS_DATA_COLLECTION} для day=${formatted}`);
    return null;
  }

  const doc = snap.docs[0];
  const data = doc.data();

  const textHtml = data.text;
  if (!textHtml) {
    console.warn(`Документ ${doc.id} для ${formatted} не содержит поля text`);
  }

  return {
    textHtml: textHtml || '',
  };
}

/**
 * Обычный день Адвента (не 17–25.12).
 *
 * Уникальность только по:
 *   _periodType='advent', _periodWeekNumber, _dayOfWeek
 * ID = `advent-w{week}-d{dow}` (без года).
 *
 * Если документ уже есть — НЕ обновляем.
 */
async function upsertRegularAdventDay(firstAdventSundayStr, mDate, reading) {
  const { weekNumber, dayOfWeek } = getAdventWeekAndDow(
    firstAdventSundayStr,
    mDate
  );

  const docId = `advent-w${weekNumber}-d${dayOfWeek}`;
  const docRef = db.collection(READINGS_COLLECTION).doc(docId);

  const existing = await docRef.get();
  if (existing.exists) {
    console.log(
      `УЖЕ ЕСТЬ обычный день: ${docId} — пропускаем, дубля нет.`
    );
    return;
  }

  const payload = {
    _periodType: 'advent',
    _periodWeekNumber: weekNumber,
    _dayOfWeek: dayOfWeek,
    text: reading.textHtml,
  };

  await docRef.set(payload, { merge: false });
  console.log(`Создан обычный день Адвента: ${docId}`);
}

/**
 * Особый день (17–25.12).
 *
 * Уникальность по `_date`.
 * ID = `_date` = 'YYYY-MM-DD'.
 *
 * Мы явно пробегаем один раз по 17–25 декабря (например, 2023 года),
 * без цикла по трём годам, чтобы НЕ дублировать.
 */
async function upsertSpecialAdventDay(mDate, reading) {
  const dateStr = mDate.format('YYYY-MM-DD');
  const docId = dateStr;
  const docRef = db.collection(READINGS_COLLECTION).doc(docId);

  const existing = await docRef.get();
  if (existing.exists) {
    console.log(`УЖЕ ЕСТЬ особый день: ${docId} — пропускаем, дубля нет.`);
    return;
  }

  const payload = {
    _date: dateStr,
    _periodType: 'advent',
    text: reading.textHtml,
  };

  await docRef.set(payload, { merge: false });
  console.log(`Создан особый день Адвента: ${docId}`);
}

/**
 * Миграция обычных (НЕ 17–25.12) дней для одного года.
 *
 * Год влияет только на календарные даты, по которым ищем чтения,
 * но не входит в ID.
 */
async function migrateRegularDaysForYear(year) {
  console.log(`\n=== Миграция обычных дней для года ${year} ===`);

  const firstAdventSundayStr = ADVENT_STARTS[year];
  if (!firstAdventSundayStr) {
    console.error(`Нет стартовой даты Адвента для года ${year} в ADVENT_STARTS`);
    return;
  }

  const adventDays = getAdventDays(firstAdventSundayStr);

  for (const mDate of adventDays) {
    const month = mDate.month() + 1;
    const day = mDate.date();

    // Пропускаем 17–25 декабря — для них есть отдельный проход
    if (month === 12 && day >= SPECIAL_START_DAY && day <= SPECIAL_END_DAY) {
      continue;
    }

    const dateStr = mDate.format('YYYY-MM-DD');
    console.log(`\n[${year}] Обычный день: ${dateStr}...`);

    const reading = await getReadingTextForDate(dateStr);
    if (!reading) {
      console.warn(`Пропуск ${dateStr} — не найдено чтений в readingsData.`);
      continue;
    }

    await upsertRegularAdventDay(firstAdventSundayStr, mDate, reading);
  }

  console.log(`=== Обычные дни года ${year} завершены ===`);
}

/**
 * Миграция особых дней 17–25 декабря.
 *
 * Берём один год (например, 2023), считаем для него даты 17–25.12
 * и для каждой ищем чтение только ОДИН раз.
 */
async function migrateSpecialDays() {
  console.log(`\n=== Миграция особых дней 17–25 декабря (по году 2023) ===`);

  const baseYear = 2023;
  for (let d = SPECIAL_START_DAY; d <= SPECIAL_END_DAY; d++) {
    const mDate = moment(`${baseYear}-12-${String(d).padStart(2, '0')}`, 'YYYY-MM-DD');
    const dateStr = mDate.format('YYYY-MM-DD');
    console.log(`\nОсобый день: ${dateStr}...`);

    const reading = await getReadingTextForDate(dateStr);
    if (!reading) {
      console.warn(`Пропуск особого дня ${dateStr} — не найдено чтений в readingsData.`);
      continue;
    }

    await upsertSpecialAdventDay(mDate, reading);
  }

  console.log(`=== Особые дни 17–25 декабря завершены ===`);
}

/**
 * Точка входа.
 */
(async function main() {
  try {
    // 1) Сначала обычные дни по трём годам
    for (const year of YEARS) {
      await migrateRegularDaysForYear(year);
    }

    // 2) Потом один проход по 17–25 декабря (один год, без дублирования)
    await migrateSpecialDays();

    console.log('\nМиграция завершена.');
    process.exit(0);
  } catch (err) {
    console.error('Ошибка миграции:', err);
    process.exit(1);
  }
})();