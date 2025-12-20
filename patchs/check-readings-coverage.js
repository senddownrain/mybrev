/**
 * check-readings-coverage.js
 *
 * Скрипт проверки коллекции `readings`:
 *
 * 1) Периоды:
 *    - группирует документы по _periodType / _periodWeekNumber / _dayOfWeek
 *    - выводит, какие недели есть у каждого периода
 *    - для каждой недели показывает, какие дни 1–7 есть и ЧЕГО НЕ ХВАТАЕТ
 *    - всё это с подсветкой цветом
 *
 * 2) Праздники (feast):
 *    - проверяет наличие документов по списку feastNameMap
 *    - ищет либо по id='feast-<value>', либо по полю _feastKey='<value>'
 *    - подсвечивает OK / MISSING цветами
 */

const admin = require('firebase-admin');
const chalk = require('chalk');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const READINGS_COLLECTION = 'readings';

const feastNameMap = {
  holyFamily: 'holyfamily',
  baptismOfLord: 'buptismofthelord',
  holyTrinity: 'trinity',
  christKing: 'christking',
  sacredHeartOfJesus: 'heartofjesus',
  immaculateHeartOfMary: 'heartofmary',
  christTheHighPriest: 'christthehighpriest',
  ashWednesday: 'ash',
  easterSunday: 'eastersunday',
  pentecost: 'pentecost',
  palmsSnday: 'palmsunday',
  corpusChristi: 'corpuschristi',
  ascension: 'ascension',
};

// Ожидаемое количество недель (ориентировочно, для информации в отчёте)
const EXPECTED_PERIOD_WEEKS = {
  ordinary: 34,
  advent: 4,
  christmas: 2,
  lent: 6,     // 6–7
  easter: 6,   // 5–6
  holyweek: 1,
};

function fmtHeader(text) {
  return chalk.bold.cyan(text);
}

function fmtSubHeader(text) {
  return chalk.bold.blue(text);
}

function fmtOk(text) {
  return chalk.green(text);
}

function fmtWarn(text) {
  return chalk.yellow(text);
}

function fmtError(text) {
  return chalk.red(text);
}

/**
 * Проверка периодов: строим структуру вида:
 * periodMap[periodType][weekNumber] = Set(dayOfWeek)
 */
async function checkPeriods() {
  console.log(fmtHeader('=== Проверка периодов ==='));

  const snap = await db.collection(READINGS_COLLECTION).get();

  const periodMap = {};

  snap.forEach((doc) => {
    const data = doc.data();
    const type = data._periodType;
    const week = data._periodWeekNumber;
    const dow = data._dayOfWeek;

    if (!type || week == null || dow == null) {
      return;
    }

    if (!periodMap[type]) {
      periodMap[type] = {};
    }
    if (!periodMap[type][week]) {
      periodMap[type][week] = new Set();
    }
    periodMap[type][week].add(dow);
  });

  const periodTypes = Object.keys(periodMap);
  if (periodTypes.length === 0) {
    console.log(fmtWarn('В коллекции нет документов с полями _periodType/_periodWeekNumber/_dayOfWeek.'));
    return;
  }

  for (const type of periodTypes) {
    const weeksObj = periodMap[type];
    const weekNumbers = Object.keys(weeksObj)
      .map((w) => Number(w))
      .sort((a, b) => a - b);

    console.log('');
    console.log(fmtSubHeader(`Период: ${type}`));

    if (EXPECTED_PERIOD_WEEKS[type] != null) {
      const exp = EXPECTED_PERIOD_WEEKS[type];
      const diff = weekNumbers.length - exp;

      let expLine = `  Ожидаемо недель: ~${exp}, найдено: ${weekNumbers.length}`;
      if (diff === 0) {
        expLine = fmtOk(expLine + ' (совпадает)');
      } else if (diff > 0) {
        expLine = fmtWarn(expLine + ` (на ${diff} больше ожидаемого)`);
      } else {
        expLine = fmtError(expLine + ` (на ${Math.abs(diff)} меньше ожидаемого)`);
      }
      console.log(expLine);
    } else {
      console.log(`  Найдено недель: ${weekNumbers.length}`);
    }

    console.log(`  Список недель: ${weekNumbers.join(', ') || '(нет)'}`);

    for (const w of weekNumbers) {
      const daysSet = weeksObj[w];
      const daysArr = Array.from(daysSet).sort((a, b) => a - b);
      const missing = [];
      for (let d = 1; d <= 7; d++) {
        if (!daysSet.has(d)) missing.push(d);
      }

      if (missing.length === 0) {
        console.log(
          '    ' +
            fmtOk(
              `Неделя ${w}: все дни на месте [${daysArr.join(', ')}]`
            )
        );
      } else {
        console.log(
          '    ' +
            fmtError(
              `Неделя ${w}: есть дни [${daysArr.join(', ')}], НЕ ХВАТАЕТ дней [${missing.join(', ')}]`
            )
        );
      }
    }
  }

  console.log('');
  console.log(fmtHeader('=== Конец проверки периодов ==='));
}

/**
 * Проверка праздников (feast):
 * ищем либо по doc.id='feast-<value>', либо по _feastKey='<value>'.
 */
async function checkFeasts() {
  console.log('');
  console.log(fmtHeader('=== Проверка праздников (feast) ==='));

  for (const [key, val] of Object.entries(feastNameMap)) {
    const expectedId = `feast-${val}`;

    // 1) Проверяем по ID
    const byId = await db.collection(READINGS_COLLECTION).doc(expectedId).get();

    if (byId.exists) {
      const data = byId.data() || {};
      const line =
        `[OK] ${key} (${val}): найден по id=${expectedId}, title="${data.title || '—'}"`;
      console.log('  ' + fmtOk(line));
      continue;
    }

    // 2) Проверяем по полю _feastKey
    const snap = await db
      .collection(READINGS_COLLECTION)
      .where('_feastKey', '==', val)
      .limit(1)
      .get();

    if (!snap.empty) {
      const doc = snap.docs[0];
      const data = doc.data() || {};
      const line =
        `[OK] ${key} (${val}): найден по _feastKey в doc.id="${doc.id}", title="${data.title || '—'}"`;
      console.log('  ' + fmtOk(line));
    } else {
      const line =
        `[MISSING] ${key} (${val}): НЕ найден ни по id=${expectedId}, ни по _feastKey`;
      console.log('  ' + fmtError(line));
    }
  }

  console.log('');
  console.log(fmtHeader('=== Конец проверки праздников ==='));
}

/**
 * main
 */
async function main() {
  try {
    await checkPeriods();
    await checkFeasts();
    process.exit(0);
  } catch (err) {
    console.error(fmtError('Ошибка проверки:'), err);
    process.exit(1);
  }
}

main();