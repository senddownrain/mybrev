/**
 * find-extra-dates-and-feasts.js
 *
 * Задачи:
 *  - пройти по годам 2016–2025 в коллекции `readingsData`
 *  - попытаться найти ещё:
 *      * фиксированные даты (_date='MM-DD'), которых нет в `readings`
 *        (по логике начала заголовка как даты, как раньше)
 *      * праздники:
 *          - immaculateHeartOfMary (текст "Сэрца Марыі")
 *          - christTheHighPriest (текст "Найвышэйшага і Вечнага Святара")
 *  - пропускать дни, если в title есть:
 *      * "у актаве Нараджэння Пана"
 *      * "адвэнт"
 */

const admin = require('firebase-admin');
const moment = require('moment');
const { parse } = require('node-html-parser');
const readline = require('readline');
const chalk = require('chalk');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const READINGS_DATA_COLLECTION = 'readingsData';
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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

// ---------- Цвета ----------

const fmtHeader = (t) => chalk.bold.cyan(t);
const fmtSubHeader = (t) => chalk.bold.blue(t);
const fmtOk = (t) => chalk.green(t);
const fmtWarn = (t) => chalk.yellow(t);
const fmtError = (t) => chalk.red(t);
const fmtInfo = (t) => chalk.magenta(t);

// ========== Парсинг day: "3.1.2020" / "23.1.2020" / "03.01.2020" ==========

function parseDayRaw(dayStr) {
  if (!dayStr) return null;
  const parts = dayStr.split('.');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  const day = d.padStart(2, '0');
  const month = m.padStart(2, '0');
  const year = y;
  const iso = `${year}-${month}-${day}`;
  const mObj = moment(iso, 'YYYY-MM-DD', true);
  if (!mObj.isValid()) return null;
  return {
    fullDate: iso,               // YYYY-MM-DD
    monthDay: `${month}-${day}`, // MM-DD
    year: Number(year),
  };
}

// ========== Парсинг HTML заголовков и текста ==========

function extractTitleCandidates(html) {
  if (!html) return [];
  try {
    const root = parse(html);
    const paragraphs = root.querySelectorAll('p');
    const candidates = [];

    for (const p of paragraphs) {
      const span = p.querySelector('span');
      let rawText = span ? span.text : p.text;
      if (!rawText) continue;

      const text = rawText.replace(/\s+/g, ' ').trim();
      if (!text || text.length < 5) continue;

      candidates.push(text);
      if (candidates.length >= 2) break;
    }

    return candidates;
  } catch (e) {
    console.warn('Ошибка парсинга HTML при поиске заголовков:', e.message);
    return [];
  }
}

function extractPlainText(html) {
  try {
    const root = parse(html);
    return root.text.replace(/\s+/g, ' ').trim().toLowerCase();
  } catch (e) {
    return '';
  }
}

// ========== Авторазбор title -> date/period (только часть про дату нужна) ==========

function autoParseTitleLogicForDate(title, parsedDay) {
  const t = title.toLowerCase();

  // Пропуск, если есть "у актаве Нараджэння Пана" или "адвэнт"
  if (t.includes('у актаве нараджэння пана') || t.includes('у актаве нараджэння панa')) return null;
  if (t.includes('у актаве нараджэння') && t.includes('пана')) return null;
  if (t.includes('у актаве нараджэння')) return null; // на всякий
  if (t.includes('адвэнт')) return null;

  const dateStartMatch = /^(\d{1,2})\s+[^\d]/.exec(title);
  if (dateStartMatch && parsedDay) {
    return {
      mode: 'date',
      _date: parsedDay.monthDay, // 'MM-DD'
      explanation: 'распознано как фиксированная дата по числу в начале заголовка',
    };
  }
  return null;
}

// ========== Сохранение (дата и feast) ==========

async function saveAsDateAuto(monthDay, title, html) {
  const docId = monthDay; // 'MM-DD'
  const docRef = db.collection(READINGS_COLLECTION).doc(docId);
  const existing = await docRef.get();

  if (existing.exists) {
    console.log(fmtWarn(`⚠ Уже есть документ с _date=${monthDay} (id=${docId}).`));
    const exData = existing.data() || {};
    if (exData.title) {
      console.log(fmtInfo(`  Текущий title: ${exData.title}`));
    }
    console.log('  1 – перезаписать/обновить');
    console.log('  2 – пропустить');
    const choice = await ask('Ваш выбор (1/2): ');
    if (choice === '2') {
      console.log('→ Пропускаем, существующий документ остаётся без изменений.');
      return false;
    }
    if (choice !== '1') {
      console.log('→ Неверный выбор, по умолчанию пропускаем.');
      return false;
    }
  }

  const payload = { _date: monthDay, title, text: html };
  await docRef.set(payload, { merge: true });
  console.log(fmtOk(`→ Сохранено как дата _date=${monthDay}`));
  return true;
}

async function saveAsFeastWithDupCheck(feastKey, title, html) {
  const docId = `feast-${feastKey}`;
  const docRef = db.collection(READINGS_COLLECTION).doc(docId);
  const existing = await docRef.get();

  if (existing.exists) {
    console.log(fmtWarn(`⚠ Документ для праздника ${feastKey} (id=${docId}) уже существует.`));
    const exData = existing.data() || {};
    if (exData.title) {
      console.log(fmtInfo(`  Текущий title: ${exData.title}`));
    }
    console.log('Выберите действие:');
    console.log('  1 – пропустить (оставить существующий)');
    console.log('  2 – перезаписать/обновить (merge)');
    let choice;
    while (true) {
      choice = await ask('Ваш выбор (1/2): ');
      if (choice === '1' || choice === '2') break;
    }
    if (choice === '1') {
      console.log('→ Пропускаем, существующий документ остаётся без изменений.');
      return false;
    }
    console.log('→ Перезаписываем существующий документ.');
  }

  const payload = {
    _feastKey: feastKey,
    title,
    text: html,
  };
  await docRef.set(payload, { merge: true });
  console.log(fmtOk(`→ Сохранено как праздник _feastKey=${feastKey}`));
  return true;
}

// ========== Ручной режим (минимальный) ==========

async function choosePeriodType() {
  const PERIOD_OPTIONS = [
    'ordinary',
    'advent',
    'christmas',
    'lent',
    'easter',
    'holyweek',
  ];
  console.log('\nТипы периодов:');
  PERIOD_OPTIONS.forEach((p, idx) => {
    console.log(`  ${idx + 1} – ${p}`);
  });
  console.log(`  ${PERIOD_OPTIONS.length + 1} – другой (ввести вручную)`);

  while (true) {
    const choice = await ask(`Выберите тип периода (1-${PERIOD_OPTIONS.length + 1}): `);
    const n = Number(choice);
    if (n >= 1 && n <= PERIOD_OPTIONS.length + 1) {
      if (n <= PERIOD_OPTIONS.length) {
        return PERIOD_OPTIONS[n - 1];
      }
      let custom;
      while (true) {
        custom = await ask('Введите _periodType вручную: ');
        if (custom) break;
      }
      return custom;
    }
  }
}

async function chooseFeastKey() {
  const FEAST_ENTRIES = Object.entries(feastNameMap);
  console.log('\nПраздники (ключевые слова):');
  FEAST_ENTRIES.forEach(([key, val], idx) => {
    console.log(`  ${idx + 1} – ${key} (${val})`);
  });

  while (true) {
    const choice = await ask(`Выберите праздник (1-${FEAST_ENTRIES.length}): `);
    const n = Number(choice);
    if (n >= 1 && n <= FEAST_ENTRIES.length) {
      const [, val] = FEAST_ENTRIES[n - 1];
      return val;
    }
  }
}

async function saveAsPeriodManual(_periodType, _periodWeekNumber, _dayOfWeek, title, html) {
  const docId = `${_periodType}-w${_periodWeekNumber}-d${_dayOfWeek}`;
  const docRef = db.collection(READINGS_COLLECTION).doc(docId);
  const existing = await docRef.get();

  if (existing.exists) {
    console.log(fmtWarn(`⚠ Документ для периода ${docId} уже существует.`));
    const exData = existing.data() || {};
    if (exData.title) {
      console.log(fmtInfo(`  Текущий title: ${exData.title}`));
    }
    console.log('Выберите действие:');
    console.log('  1 – пропустить (оставить существующий)');
    console.log('  2 – перезаписать/обновить (merge)');
    let choice;
    while (true) {
      choice = await ask('Ваш выбор (1/2): ');
      if (choice === '1' || choice === '2') break;
    }
    if (choice === '1') {
      console.log('→ Пропускаем, существующий документ остаётся без изменений.');
      return false;
    }
    console.log('→ Перезаписываем существующий документ.');
  }

  const payload = {
    _periodType,
    _periodWeekNumber: Number(_periodWeekNumber),
    _dayOfWeek: Number(_dayOfWeek),
    title,
    text: html,
  };
  await docRef.set(payload, { merge: true });
  console.log(fmtOk(`→ Сохранено как период ${docId}`));
  return true;
}

// минимальный ручной диалог (если нужно переопределить логику)
async function manualDialog(parsedDay, firstTitle, html) {
  console.log('\nРучной режим: выберите действие:');
  console.log('  1 – сохранить как дату (_date = MM-DD)');
  console.log('  2 – сохранить как период');
  console.log('  3 – сохранить как праздник (по ключевому слову)');
  console.log('  4 – пропустить');

  let mode;
  while (true) {
    mode = await ask('Ваш выбор (1/2/3/4): ');
    if (['1', '2', '3', '4', ''].includes(mode)) break;
  }
  if (mode === '' || mode === '4') {
    console.log('→ Пропущено.');
    return false;
  }

  let title = firstTitle;
  const ansTitle = await ask(`Title [по умолчанию: "${firstTitle}"] (Enter, чтобы оставить): `);
  if (ansTitle) title = ansTitle;

  if (mode === '1') {
    return await saveAsDateAuto(parsedDay.monthDay, title, html);
  } else if (mode === '2') {
    const _periodType = await choosePeriodType();

    let _periodWeekNumber;
    while (true) {
      _periodWeekNumber = await ask('Введите номер недели (_periodWeekNumber): ');
      if (_periodWeekNumber && !isNaN(Number(_periodWeekNumber))) break;
      console.log('Введите число, например 1, 2, 3...');
    }

    let _dayOfWeek;
    while (true) {
      _dayOfWeek = await ask('Введите день недели (_dayOfWeek, 1–7): ');
      const n = Number(_dayOfWeek);
      if (n >= 1 && n <= 7) break;
      console.log('Введите число от 1 до 7.');
    }

    return await saveAsPeriodManual(_periodType, _periodWeekNumber, _dayOfWeek, title, html);
  } else if (mode === '3') {
    const feastKey = await chooseFeastKey();
    return await saveAsFeastWithDupCheck(feastKey, title, html);
  }
}

// ========== Метаданные существующих дат и feast ==========

async function getExistingMeta() {
  const snap = await db.collection(READINGS_COLLECTION).get();
  const meta = {
    dates: new Set(),
    feasts: new Set(),
  };
  snap.forEach((doc) => {
    const data = doc.data();
    if (data._date) meta.dates.add(String(data._date));
    if (data._feastKey) meta.feasts.add(String(data._feastKey));
  });
  return meta;
}

// ========== Основная логика ==========

async function main() {
  try {
    console.log(fmtHeader('Поиск дополнительных дат и двух праздников в readingsData (2016–2025)...'));

    const existingMeta = await getExistingMeta();
    const years = [];
    for (let y = 2016; y <= 2025; y++) years.push(y);

    const snapData = await db.collection(READINGS_DATA_COLLECTION).get();
    const allDocs = snapData.docs;

    for (const year of years) {
      console.log('\n' + fmtHeader(`=== Год ${year} ===`));
      const docsForYear = allDocs.filter((doc) => {
        const data = doc.data();
        const dayStr = data.day;
        const parsed = parseDayRaw(dayStr || '');
        return parsed && parsed.year === year;
      });

      console.log(fmtInfo(`Найдено документов за ${year}: ${docsForYear.length}`));

      for (const doc of docsForYear) {
        const data = doc.data();
        const parsed = parseDayRaw(data.day);
        if (!parsed) continue;

        const html = data.text;
        if (!html) continue;

        const titles = extractTitleCandidates(html);
        if (titles.length === 0) continue;
        const firstTitle = titles[0];
        const tLow = firstTitle.toLowerCase();
        const plainText = extractPlainText(html);

        let handled = false;

        // --- 1) Кандидат даты (если _date ещё нет, title выглядит как дата, нет "у актаве..." / "адвэнт") ---
        // if (!existingMeta.dates.has(parsed.monthDay)) {
        //   const autoDate = autoParseTitleLogicForDate(firstTitle, parsed);
        //   if (autoDate && autoDate.mode === 'date') {
        //     console.log(
        //       fmtInfo(
        //         `\nКандидат фиксированной даты _date=${parsed.monthDay} (год ${year}, doc=${doc.id})`
        //       )
        //     );
        //     console.log(`  day:   ${data.day}`);
        //     console.log(`  title: ${firstTitle}`);
        //     console.log(`  объяснение: ${autoDate.explanation}`);

        //     console.log('\nВыберите действие:');
        //     console.log('  1 – сохранить как дату');
        //     console.log('  2 – перейти в ручной режим');
        //     console.log('  [Enter] – пропустить');

        //     const choice = await ask('Ваш выбор (1/2/[Enter]): ');
        //     if (choice === '1') {
        //       const ok = await saveAsDateAuto(parsed.monthDay, firstTitle, html);
        //       if (ok) existingMeta.dates.add(parsed.monthDay);
        //       handled = true;
        //     } else if (choice === '2') {
        //       await manualDialog(parsed, firstTitle, html);
        //       handled = true;
        //     } else {
        //       console.log('→ Пропущено.');
        //       handled = true;
        //     }
        //   }
        // }

        if (handled) continue;

        // --- 2) ImmaculateHeartOfMary: "Сэрца Марыі" ---
        if (
          !existingMeta.feasts.has('heartofmary') &&
          (plainText.includes('Сэрца Марыі') || plainText.includes('Сэрца Найсвяцейшай'))
        ) {
          console.log('\n' + fmtSubHeader('Кандидат: Няпорнае Сэрца Марыі'));
          console.log(`  Год ${year}, doc=${doc.id}`);
          console.log(`  day:   ${data.day}`);
          console.log(`  title: ${firstTitle}`);

          console.log('\nВыберите действие:');
          console.log('  1 – сохранить как feast (immaculateHeartOfMary)');
          console.log('  2 – перейти в ручной режим');
          console.log('  [Enter] – пропустить');

          const choice = await ask('Ваш выбор (1/2/[Enter]): ');
          if (choice === '1') {
            const ok = await saveAsFeastWithDupCheck('heartofmary', firstTitle, html);
            if (ok) existingMeta.feasts.add('heartofmary');
            handled = true;
          } else if (choice === '2') {
            await manualDialog(parsed, firstTitle, html);
            handled = true;
          } else {
            console.log('→ Пропущено.');
            handled = true;
          }
        }

        if (handled) continue;

        // --- 3) ChristTheHighPriest: "Найвышэйшага і Вечнага Святара" ---
        if (
          !existingMeta.feasts.has('christthehighpriest') &&
          plainText.includes('Найвышэйшага і Вечнага Святара') || plainText.includes('Найвышэйшага Святара'))
         {
          console.log('\n' + fmtSubHeader('Кандидат: Хрыстус Найвышэйшы і Вечны Святар'));
          console.log(`  Год ${year}, doc=${doc.id}`);
          console.log(`  day:   ${data.day}`);
          console.log(`  title: ${firstTitle}`);

          console.log('\nВыберите действие:');
          console.log('  1 – сохранить как feast (christTheHighPriest)');
          console.log('  2 – перейти в ручной режим');
          console.log('  [Enter] – пропустить');

          const choice = await ask('Ваш выбор (1/2/[Enter]): ');
          if (choice === '1') {
            const ok = await saveAsFeastWithDupCheck('christthehighpriest', firstTitle, html);
            if (ok) existingMeta.feasts.add('christthehighpriest');
            handled = true;
          } else if (choice === '2') {
            await manualDialog(parsed, firstTitle, html);
            handled = true;
          } else {
            console.log('→ Пропущено.');
            handled = true;
          }
        }
      }

      console.log('\n' + fmtInfo(`Завершили просмотр года ${year}.`));
    }

    console.log('\n' + fmtHeader('Готово. Поиск дополнительных дат и праздников завершён.'));
    rl.close();
    process.exit(0);
  } catch (err) {
    console.error(fmtError('Ошибка в скрипте find-extra-dates-and-feasts:'), err);
    rl.close();
    process.exit(1);
  }
}

main(); 