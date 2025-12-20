/**
 * fill-missing-readings-fixed.js
 *
 * СТАТИЧЕСКАЯ версия:
 *  - ВКОДЕ зафиксирован список недостающих слотов по периодам:
 *      * advent, christmas, easter, lent, ordinary (по твоему отчёту)
 *  - Скрипт проходит по годам 2023, 2024, 2025 в коллекции `readingsData`
 *  - Для каждого документа:
 *      * автопарсит заголовок -> период/дату
 *      * если авторазбор попадает в ОДИН ИЗ НЕДОСТАЮЩИХ СЛОТОВ:
 *          - предлагает 1 (сохранить), 2 (ручной режим), Enter (пропустить)
 *          - при успешном сохранении помечает слот как закрытый (в памяти)
 *  - Дополнительно:
 *      * ищет 2 недостающих праздника:
 *          - immaculateHeartOfMary ("Сэрца Марыі")
 *          - christTheHighPriest ("Найвышэйшага і Вечнага Святара")
 *      * ищет праздники по датам (_date='MM-DD'), которых ещё нет в `readings`
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

// === ФИКСИРОВАННЫЕ недостающие слоты по результатам check-readings-coverage ===
//
// Формат: FIXED_MISSING_SLOTS[periodType][week] = [missingDays]
//
const FIXED_MISSING_SLOTS = {
  easter: {
    1: [6],
    6: [5],
  },
  ordinary: {
    1: [1],
    11: [1],
    18: [4],
  },
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

// ========== Парсинг HTML заголовков ==========

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

// ========== Римские числа ==========

function normalizeRomanLike(str) {
  if (!str) return '';
  return str
    .replace(/І/g, 'I')
    .replace(/і/g, 'i');
}

function romanToInt(romanRaw) {
  if (!romanRaw) return null;
  const roman = normalizeRomanLike(romanRaw.toUpperCase());
  const map = { I:1, V:5, X:10, L:50, C:100, D:500, M:1000 };
  let res = 0;
  for (let i = 0; i < roman.length; i++) {
    const curr = map[roman[i]] || 0;
    const next = map[roman[i+1]] || 0;
    if (curr < next) {
      res -= curr;
    } else {
      res += curr;
    }
  }
  return res || null;
}

// ========== Авторазбор title -> date/period ==========

function autoParseTitleLogic(title, parsedDay) {
  const t = title.toLowerCase();

  // Вариант: "24 снежня — звычайны дзень Адвэнту"
  const dateStartMatch = /^(\d{1,2})\s+[^\d]/.exec(title);
  if (dateStartMatch && parsedDay) {
    return {
      mode: 'date',
      _date: parsedDay.monthDay, // 'MM-DD'
      explanation: 'распознано как фиксированная дата по числу в начале заголовка',
    };
  }

  // Определяем тип периода по словам
  let _periodType = null;
  if (t.includes('звычайн')) {
    _periodType = 'ordinary';
  } else if (t.includes('адвэн')) {
    _periodType = 'advent';
  } else if (t.includes('вялікага посту') || t.includes('вялікі пост')) {
    _periodType = 'lent';
  } else if (t.includes('велікодн')) {
    _periodType = 'easter';
  }

  // День недели
  const weekdayMap = {
    'нядзеля': 1,
    'панядзелак': 2,
    'аўторак': 3,
    'серада': 4,
    'чацвер': 5,
    'пятніца': 6,
    'субота': 7,
  };

  let _dayOfWeek = null;
  for (const [w, val] of Object.entries(weekdayMap)) {
    if (t.includes(w)) {
      _dayOfWeek = val;
      break;
    }
  }

  // Номер недели: белорусские числа + римские
  const belNumMap = {
    'першы': 1,
    'першая': 1,
    'другі': 2,
    'другая': 2,
    'трэці': 3,
    'трэцяя': 3,
    'чацвёрты': 4,
    'чацвёртая': 4,
    'пяты': 5,
    'шосты': 6,
    'сёмы': 7,
    'восьмы': 8,
    'дзявяты': 9,
    'дзесяты': 10,
    'адзінаццаты': 11,
    'дванаццаты': 12,
    'трынаццаты': 13,
    'чатырнаццаты': 14,
    'пятнаццаты': 15,
    'шаснаццаты': 16,
    'сямнаццаты': 17,
    'васямнаццаты': 18,
    'дзевятнаццаты': 19,
    'двайцаты': 20,
    'дваццаць першы': 21,
    'дваццаць другі': 22,
    'дваццаць трэці': 23,
    'трыццаць першы': 31,
    'трыццаць другі': 32,
    'трыццаць трэці': 33,
  };

  let _periodWeekNumber = null;

  for (const [phrase, num] of Object.entries(belNumMap)) {
    if (t.includes(phrase)) {
      _periodWeekNumber = num;
      break;
    }
  }

  if (_periodWeekNumber == null) {
    const romanMatch = /([LXIVCDMІ]+)/i.exec(title);
    if (romanMatch) {
      const roman = romanMatch[1];
      _periodWeekNumber = romanToInt(roman);
    }
  }

  if (_periodType && _periodWeekNumber && _dayOfWeek) {
    return {
      mode: 'period',
      _periodType,
      _periodWeekNumber,
      _dayOfWeek,
      explanation: 'распознано как период по словам (тип периода), дню недели и номеру недели',
    };
  }

  if (!_dayOfWeek && t.includes('нядзеля') && _periodType && _periodWeekNumber) {
    return {
      mode: 'period',
      _periodType,
      _periodWeekNumber,
      _dayOfWeek: 1,
      explanation: 'распознано как "Нядзеля" соответствующего периода с номером недели',
    };
  }

  return null;
}

// ========== Сохранение (авто/ручное, с проверкой дублей) ==========

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

async function saveAsDateManual(monthDay, title, html) {
  const docId = monthDay;
  const docRef = db.collection(READINGS_COLLECTION).doc(docId);
  const existing = await docRef.get();

  if (existing.exists) {
    console.log(fmtWarn(`⚠ Документ с _date=${monthDay} (id=${docId}) уже существует.`));
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

  const payload = { _date: monthDay, title, text: html };
  await docRef.set(payload, { merge: true });
  console.log(fmtOk(`→ Сохранено как дата _date=${monthDay}`));
  return true;
}

async function saveAsPeriodAuto(_periodType, _periodWeekNumber, _dayOfWeek, title, html) {
  const docId = `${_periodType}-w${_periodWeekNumber}-d${_dayOfWeek}`;
  const docRef = db.collection(READINGS_COLLECTION).doc(docId);
  const existing = await docRef.get();

  if (existing.exists) {
    console.log(fmtWarn(`⚠ Уже есть документ для периода ${docId}.`));
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

// ========== Вспомогательные для недостающих слотов ==========

function cloneMissingSlots() {
  const res = {};
  for (const type of Object.keys(FIXED_MISSING_SLOTS)) {
    res[type] = {};
    for (const w of Object.keys(FIXED_MISSING_SLOTS[type])) {
      res[type][w] = new Set(FIXED_MISSING_SLOTS[type][w]);
    }
  }
  return res;
}

function isMissingSlot(missing, type, week, day) {
  if (!missing[type]) return false;
  if (!missing[type][week]) return false;
  return missing[type][week].has(day);
}

function markSlotFilled(missing, type, week, day) {
  if (!missing[type]) return;
  if (!missing[type][week]) return;
  missing[type][week].delete(day);
  if (missing[type][week].size === 0) {
    delete missing[type][week];
  }
}

// ---------- выбор типа периода и праздника (ручной режим) ----------

const PERIOD_OPTIONS = [
  'ordinary',
  'advent',
  'christmas',
  'lent',
  'easter',
  'holyweek',
];

const FEAST_ENTRIES = Object.entries(feastNameMap);

async function choosePeriodType() {
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

// ========== Помощник: авто/ручной диалог для одного документа readingsData ==========

async function handleOneCandidate(doc, parsedDay, firstTitle, html, auto, missing) {
  console.log('\n' + fmtSubHeader(`Документ-кандидат: ${doc.id}`));
  console.log(`  day:      ${doc.data().day}`);
  console.log(`  fullDate: ${parsedDay.fullDate}`);
  console.log(`  monthDay: ${parsedDay.monthDay}`);
  console.log(`  title:    ${firstTitle}`);

  if (auto) {
    console.log('\n' + fmtInfo('Автоматическое предложение:'));
    console.log(`  Заголовок: ${firstTitle}`);
    console.log(`  Объяснение: ${auto.explanation}`);

    if (auto.mode === 'date') {
      console.log(fmtInfo(`  Режим: дата, _date=${auto._date}`));
    } else if (auto.mode === 'period') {
      console.log(
        fmtInfo(
          `  Режим: период, _periodType=${auto._periodType}, week=${auto._periodWeekNumber}, day=${auto._dayOfWeek}`
        )
      );
    }

    console.log('\nВыберите действие:');
    console.log('  1 – сохранить по этим данным');
    console.log('  2 – перейти в ручной режим');
    console.log('  [Enter] – пропустить (ничего не сохранять)');

    const choice = await ask('Ваш выбор (1/2/[Enter]): ');
    if (choice === '1') {
      if (auto.mode === 'date') {
        const ok = await saveAsDateAuto(auto._date, firstTitle, html);
        return ok;
      } else if (auto.mode === 'period') {
        const ok = await saveAsPeriodAuto(
          auto._periodType,
          auto._periodWeekNumber,
          auto._dayOfWeek,
          firstTitle,
          html
        );
        if (ok) {
          markSlotFilled(missing, auto._periodType, auto._periodWeekNumber, auto._dayOfWeek);
        }
        return ok;
      }
    } else if (choice === '2') {
      console.log('→ Переход в ручной режим.');
    } else {
      console.log('→ Пропущено.');
      return false;
    }
  } else {
    console.log(fmtWarn('Не удалось автоматически распознать режим/поля.'));
  }

  // Ручной режим
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
    const ok = await saveAsDateManual(parsedDay.monthDay, title, html);
    return ok;
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

    const ok = await saveAsPeriodManual(_periodType, _periodWeekNumber, _dayOfWeek, title, html);
    if (ok) {
      markSlotFilled(missing, _periodType, Number(_periodWeekNumber), Number(_dayOfWeek));
    }
    return ok;
  } else if (mode === '3') {
    const feastKey = await chooseFeastKey();
    const ok = await saveAsFeastWithDupCheck(feastKey, title, html);
    return ok;
  }
}

// ========== Основная логика ==========

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

async function main() {
  try {
    console.log(fmtHeader('Заполнение недостающих чтений по фиксированным слотам.'));
    console.log(fmtInfo('Будем проходить по годам: 2023, 2024, 2025.'));

    const years = [2020, 2021, 2022];
    const missing = cloneMissingSlots();
    const existingMeta = await getExistingMeta();

    console.log(fmtInfo('Начальные недостающие слоты:'));
    for (const type of Object.keys(missing)) {
      const weeks = Object.keys(missing[type]);
      if (weeks.length === 0) continue;
      console.log(fmtSubHeader(`  ${type}:`));
      for (const w of weeks) {
        const missDays = Array.from(missing[type][w]).sort((a, b) => a - b);
        console.log(`    неделя ${w}: не хватает дней [${missDays.join(', ')}]`);
      }
    }

    for (const year of years) {
      console.log('\n' + fmtHeader(`=== Год ${year} ===`));

      const snapData = await db.collection(READINGS_DATA_COLLECTION).get();
      const docsForYear = snapData.docs.filter((doc) => {
        const data = doc.data();
        const dayStr = data.day;
        const parsed = parseDayRaw(dayStr || '');
        return parsed && parsed.year === year;
      });

      console.log(fmtInfo(`Найдено документов в readingsData за ${year}: ${docsForYear.length}`));

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

        let handled = false;

        // 1) Попытка автопарсинга в период и проверка, входит ли этот слот в FIXED_MISSING_SLOTS
        let auto = autoParseTitleLogic(firstTitle, parsed);

        if (auto && auto.mode === 'period') {
          const type = auto._periodType;
          const week = auto._periodWeekNumber;
          const day = auto._dayOfWeek;

          if (isMissingSlot(missing, type, week, day)) {
            console.log(
              fmtInfo(
                `\nНайден кандидат для недостающего слота: ${type}-w${week}-d${day} (год ${year})`
              )
            );
            await handleOneCandidate(doc, parsed, firstTitle, html, auto, missing);
            handled = true;
          }
        }

        if (handled) continue;

        // 2) Особые праздники по словам, если ещё нет таких _feastKey
        if (!existingMeta.feasts.has('heartofmary') &&
            (tLow.includes('сэрца марыі') || tLow.includes('няпорнага сэрца марыі'))) {
          console.log('\n' + fmtSubHeader('Кандидат: Няпорнае Сэрца Марыі'));
          console.log(`  Год ${year}`);
          console.log(`  Заголовок: ${firstTitle}`);
          console.log('  Предлагается сохранить как праздник immaculateHeartOfMary');

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
            await handleOneCandidate(doc, parsed, firstTitle, html, null, missing);
            handled = true;
          } else {
            console.log('→ Пропущено.');
            handled = true;
          }
        }

        if (!handled &&
            !existingMeta.feasts.has('christthehighpriest') &&
            tLow.includes('найвышэйшага і вечнага святара')) {
          console.log('\n' + fmtSubHeader('Кандидат: Хрыстус Найвышэйшы и Вечны Святар'));
          console.log(`  Год ${year}`);
          console.log(`  Заголовок: ${firstTitle}`);
          console.log('  Предлагается сохранить как праздник christTheHighPriest');

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
            await handleOneCandidate(doc, parsed, firstTitle, html, null, missing);
            handled = true;
          } else {
            console.log('→ Пропущено.');
            handled = true;
          }
        }

        if (handled) continue;

        // 3) Праздники по датам: если _date ещё не занята и заголовок выглядит как фиксированная дата
        const autoDate = autoParseTitleLogic(firstTitle, parsed);
        const hasDateDoc = existingMeta.dates.has(parsed.monthDay);
        if (autoDate && autoDate.mode === 'date' && !hasDateDoc) {
          console.log(
            fmtInfo(
              `\nКандидат фиксированной даты, которой ещё нет в readings: _date=${parsed.monthDay} (год ${year})`
            )
          );
          const ok = await handleOneCandidate(doc, parsed, firstTitle, html, autoDate, missing);
          if (ok) {
            existingMeta.dates.add(parsed.monthDay);
          }
        }
      }

      console.log('\n' + fmtInfo(`Завершили просмотр года ${year}.`));
    }

    console.log('\n' + fmtHeader('Все выбранные годы обработаны. Текущий список недостающих слотов:'));
    for (const type of Object.keys(missing)) {
      const weeks = Object.keys(missing[type]);
      if (weeks.length === 0) continue;
      console.log(fmtSubHeader(`  ${type}:`));
      for (const w of weeks) {
        const missDays = Array.from(missing[type][w]).sort((a, b) => a - b);
        console.log(`    неделя ${w}: не хватает дней [${missDays.join(', ')}]`);
      }
    }

    rl.close();
    process.exit(0);
  } catch (err) {
    console.error(fmtError('Ошибка в скрипте fill-missing-readings-fixed:'), err);
    rl.close();
    process.exit(1);
  }
}

main();