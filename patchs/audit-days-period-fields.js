/**
 * audit-days-period-fields.js
 *
 * Скрипт:
 * 1) Фильтрует коллекцию `days` по заданному `_periodType`.
 * 2) Проверяет список полей на пустые значения.
 * 3) Выводит строки формата:
 *    '{_periodWeekNumber} {_periodType} {_dayOfWeek} - [список пустых полей]'
 * 4) Сортирует результат по `_periodWeekNumber`, затем по `_dayOfWeek`.
 * 5) Подсвечивает цветом:
 *    - красным: пустые поля
 *    - зелёным: заполненные поля
 */

const admin = require('firebase-admin');
const chalk = require('chalk');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const DAYS_COLLECTION = 'days';

// === НАСТРОЙКИ ===
const PERIOD_TYPE = 'lent';

const FIELDS_TO_CHECK = [
  'sext2Ps1',
  'sext2Ps2',
  'sext2Ps3',
];

const WEEKDAY_LABEL_MAP = {
  1: 'Нядзеля',
  2: 'Панядзелак',
  3: 'Аўторак',
  4: 'Серада',
  5: 'Чацвер',
  6: 'Пятніца',
  7: 'Субота',
};

function isEmptyValue(value) {
  if (value == null) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim() === '';
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
}

function getMissingFields(dayData) {
  return FIELDS_TO_CHECK.filter((fieldName) => isEmptyValue(dayData[fieldName]));
}

function getFilledFields(dayData) {
  return FIELDS_TO_CHECK.filter((fieldName) => !isEmptyValue(dayData[fieldName]));
}

function getDayLabel(dayOfWeek) {
  return WEEKDAY_LABEL_MAP[dayOfWeek] || `Неизвестный день (${dayOfWeek})`;
}

async function main() {
  console.log(chalk.bold.cyan(`Проверка коллекции "${DAYS_COLLECTION}" для _periodType="${PERIOD_TYPE}"`));
  console.log(chalk.gray(`Поля для проверки: ${FIELDS_TO_CHECK.join(', ')}`));
  console.log('');

  const snapshot = await db
    .collection(DAYS_COLLECTION)
    .where('_periodType', '==', PERIOD_TYPE)
    .get();

  if (snapshot.empty) {
    console.log(chalk.yellow(`Документы с _periodType="${PERIOD_TYPE}" не найдены.`));
    return;
  }

  const rows = snapshot.docs.map((doc) => {
    const data = doc.data();
    const periodWeekNumber = Number(data._periodWeekNumber ?? Number.MAX_SAFE_INTEGER);
    const dayOfWeek = Number(data._dayOfWeek ?? Number.MAX_SAFE_INTEGER);

    return {
      docId: doc.id,
      periodType: data._periodType,
      periodWeekNumber,
      dayOfWeek,
      dayLabel: getDayLabel(dayOfWeek),
      missingFields: getMissingFields(data),
      filledFields: getFilledFields(data),
    };
  });

  rows.sort((a, b) => {
    if (a.periodWeekNumber !== b.periodWeekNumber) {
      return a.periodWeekNumber - b.periodWeekNumber;
    }

    return a.dayOfWeek - b.dayOfWeek;
  });

  rows.forEach((row) => {
    const base = `${row.periodWeekNumber} ${row.periodType} ${row.dayLabel}`;

    if (row.missingFields.length === 0) {
      const line = `${base} - []`;
      const filled = row.filledFields.length
        ? ` (полные: ${row.filledFields.join(', ')})`
        : '';

      console.log(chalk.green(line + filled));
      return;
    }

    const missingPart = chalk.red(`[${row.missingFields.join(', ')}]`);
    const filledPart = row.filledFields.length
      ? chalk.green(` (полные: ${row.filledFields.join(', ')})`)
      : '';

    console.log(`${base} - ${missingPart}${filledPart}`);
  });

  console.log('');
  console.log(chalk.bold('Итог:'));
  console.log(chalk.red(`  С пустыми полями: ${rows.filter((r) => r.missingFields.length > 0).length}`));
  console.log(chalk.green(`  Полностью заполнены: ${rows.filter((r) => r.missingFields.length === 0).length}`));
}

main().catch((error) => {
  console.error(chalk.red('Ошибка выполнения скрипта:'), error);
  process.exitCode = 1;
});
