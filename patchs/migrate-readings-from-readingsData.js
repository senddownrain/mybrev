/**
 * interactive-migrate-readings.js
 *
 * Интерактивный скрипт миграции:
 *  - спрашивает год (например, 2025)
 *  - находит все документы readingsData за этот год (по полю day = 'DD.MM.YYYY' / 'D.M.YYYY')
 *  - по каждому документу:
 *      1) пытается автоматически распарсить заголовок -> дата/период
 *         - показывает распознанные поля
 *         - 1 – сохранить по автопарсингу (с проверкой дублей)
 *         - 2 – перейти в ручной режим (дата/период/feast)
 *         - [Enter] – пропустить (ничего не сохранять)
 *      2) если автопарсинг не удался или выбран ручной режим:
 *         - 1 – дата (_date = 'MM-DD')
 *         - 2 – период
 *         - 3 – праздник (_feastKey)
 *         - 4 – пропустить
 */

const admin = require('firebase-admin');
const moment = require('moment');
const { parse } = require('node-html-parser');
const readline = require('readline');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const READINGS_DATA_COLLECTION = 'readingsData';
const READINGS_COLLECTION = 'readings';

// feast map
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

const FEAST_ENTRIES = Object.entries(feastNameMap);

const PERIOD_OPTIONS = [
  'ordinary',
  'advent',
  'christmas',
  'lent',
  'easter',
  'holyweek',
];

// ---------- readline ----------

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

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

// ========== Вспомогательные функции для римских чисел ==========

function normalizeRomanLike(str) {
  if (!str) return '';
  // кириллическая "І" → латинская "I", и т.п.
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

  // Определяем type по словам
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

  // День недели (исправленный mapping)
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
    'дзясяты': 10,
    'адзінаццаты': 11,
    'дванаццаты': 12,
    'трынаццаты': 13,
    'чатырнаццаты': 14,
    'пятнаццаты': 15,
    'шаснаццаты': 16,
    'сямнаццаты': 17,
    'семнаццаты': 17,
    'васямнаццаты': 18,
    'васемнаццаты': 18,
    'дзевятнаццаты': 19,
    'дваццаты': 20,
    'дваццаць першы': 21,
    'дваццаць другі': 22,
    'дваццаць трэці': 23,
    'дваццаць чацвёрты': 24,
    'дваццаць пяты': 25,
    'дваццаць шосты': 26,
    'дваццаць сёмы': 27,
    'дваццаць восьмы': 28,
    'дваццаць дзевяты': 29,

    'трыццаты': 30,
    'трыццаць першы': 31,
    'трыццаць другі': 32,
    'трыццаць трэці': 33,
    'трыццаць чацвёрты': 34,
    

  'дваццаць  першы': 21,
    'дваццаць  другі': 22,
    'дваццаць  трэці': 23,
    'дваццаць  чацвёрты': 24,
    'дваццаць  пяты': 25,
    'дваццаць  шосты': 26,
    'дваццаць  сёмы': 27,
    'дваццаць  восьмы': 28,
    'дваццаць  дзевяты': 29,
    'трыццаць  першы': 31,
    'трыццаць  другі': 32,
    'трыццаць  трэці': 33,
    'трыццаць  чацвёрты': 34,
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

  // Полный период: есть тип, номер, день недели
  if (_periodType && _periodWeekNumber && _dayOfWeek) {
    return {
      mode: 'period',
      _periodType,
      _periodWeekNumber,
      _dayOfWeek,
      explanation: 'распознано как период по словам (тип периода), дню недели и номеру недели',
    };
  }

  // Спецкейс: "І Нядзеля Вялікага посту, Год А"
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

// ========== сохранение с проверкой дублей (авто/ручное) ==========

async function saveAsDateAuto(monthDay, title, html) {
  const docId = monthDay; // 'MM-DD'
  const docRef = db.collection(READINGS_COLLECTION).doc(docId);
  const existing = await docRef.get();

  if (existing.exists) {
    console.log(`⚠ Уже есть документ с _date=${monthDay} (id=${docId}).`);
    const exData = existing.data() || {};
    if (exData.title) {
      console.log(`  Текущий title: ${exData.title}`);
    }
    console.log('  1 – перезаписать/обновить');
    console.log('  2 – пропустить');
    const choice = await ask('Ваш выбор (1/2): ');
    if (choice === '2') {
      console.log('→ Пропускаем, существующий документ остаётся без изменений.');
      return;
    }
    if (choice !== '1') {
      console.log('→ Неверный выбор, по умолчанию пропускаем.');
      return;
    }
  }

  const payload = { _date: monthDay, title, text: html };
  await docRef.set(payload, { merge: true });
  console.log(`→ Сохранено как дата _date=${monthDay}`);
}

async function saveAsDateManual(monthDay, title, html) {
  const docId = monthDay;
  const docRef = db.collection(READINGS_COLLECTION).doc(docId);
  const existing = await docRef.get();

  if (existing.exists) {
    console.log(`⚠ Документ с _date=${monthDay} (id=${docId}) уже существует.`);
    const exData = existing.data() || {};
    if (exData.title) {
      console.log(`  Текущий title: ${exData.title}`);
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
      return;
    }
    console.log('→ Перезаписываем существующий документ.');
  }

  const payload = { _date: monthDay, title, text: html };
  await docRef.set(payload, { merge: true });
  console.log(`→ Сохранено как дата _date=${monthDay}`);
}

async function saveAsPeriodAuto(_periodType, _periodWeekNumber, _dayOfWeek, title, html) {
  const docId = `${_periodType}-w${_periodWeekNumber}-d${_dayOfWeek}`;
  const docRef = db.collection(READINGS_COLLECTION).doc(docId);
  const existing = await docRef.get();

  if (existing.exists) {
    console.log(`⚠ Уже есть документ для периода ${docId}.`);
    const exData = existing.data() || {};
    if (exData.title) {
      console.log(`  Текущий title: ${exData.title}`);
    }
    console.log('  1 – перезаписать/обновить');
    console.log('  2 – пропустить');
    const choice = await ask('Ваш выбор (1/2): ');
    if (choice === '2') {
      console.log('→ Пропускаем, существующий документ остаётся без изменений.');
      return;
    }
    if (choice !== '1') {
      console.log('→ Неверный выбор, по умолчанию пропускаем.');
      return;
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
  console.log(`→ Сохранено как период ${docId}`);
}

async function saveAsPeriodManual(_periodType, _periodWeekNumber, _dayOfWeek, title, html) {
  const docId = `${_periodType}-w${_periodWeekNumber}-d${_dayOfWeek}`;
  const docRef = db.collection(READINGS_COLLECTION).doc(docId);
  const existing = await docRef.get();

  if (existing.exists) {
    console.log(`⚠ Документ для периода ${docId} уже существует.`);
    const exData = existing.data() || {};
    if (exData.title) {
      console.log(`  Текущий title: ${exData.title}`);
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
      return;
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
  console.log(`→ Сохранено как период ${docId}`);
}

async function saveAsFeastWithDupCheck(feastKey, title, html) {
  const docId = `feast-${feastKey}`;
  const docRef = db.collection(READINGS_COLLECTION).doc(docId);
  const existing = await docRef.get();

  if (existing.exists) {
    console.log(`⚠ Документ для праздника ${feastKey} (id=${docId}) уже существует.`);
    const exData = existing.data() || {};
    if (exData.title) {
      console.log(`  Текущий title: ${exData.title}`);
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
      return;
    }
    console.log('→ Перезаписываем существующий документ.');
  }

  const payload = {
    _feastKey: feastKey,
    title,
    text: html,
  };
  await docRef.set(payload, { merge: true });
  console.log(`→ Сохранено как праздник _feastKey=${feastKey}`);
}

// ---------- выбор типа периода и праздника (ручной режим) ----------

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

// ========== обработка одного документа ==========

async function processOneDoc(doc) {
  const data = doc.data();
  const dayStr = data.day;
  const html = data.text;

  if (!dayStr || !html) {
    console.log(`Документ ${doc.id} пропущен — нет day или text`);
    return;
  }

  const parsedDay = parseDayRaw(dayStr);
  if (!parsedDay) {
    console.log(`Документ ${doc.id} пропущен — не удалось распарсить day=${dayStr}`);
    return;
  }

  const { fullDate, monthDay } = parsedDay;
  const titleCandidates = extractTitleCandidates(html);
  const firstTitle = titleCandidates[0] || '';

  console.log('\n----------------------------------------');
  console.log(`Документ: ${doc.id}`);
  console.log(`day:      ${dayStr}`);
  console.log(`fullDate: ${fullDate}`);
  console.log(`monthDay: ${monthDay} (MM-DD)`);

  if (titleCandidates.length > 0) {
    console.log('Возможные заголовки:');
    titleCandidates.forEach((t, idx) => {
      console.log(`  [${idx + 1}] ${t}`);
    });
  } else {
    console.log('Заголовки не найдены.');
  }

  // 1) Пытаемся авторазбор
  let auto = null;
  if (firstTitle) {
    auto = autoParseTitleLogic(firstTitle, parsedDay);
  }

  if (auto) {
    console.log('\nАвтоматически распознано:');
    console.log(`  Заголовок: ${firstTitle}`);
    console.log(`  Объяснение: ${auto.explanation}`);

    if (auto.mode === 'date') {
      console.log(`  Режим: дата`);
      console.log(`  _date: ${auto._date}`);
    } else if (auto.mode === 'period') {
      console.log(`  Режим: период`);
      console.log(`  _periodType: ${auto._periodType}`);
      console.log(`  _periodWeekNumber: ${auto._periodWeekNumber}`);
      console.log(`  _dayOfWeek: ${auto._dayOfWeek}`);
    }

    console.log('\nВыберите действие для автопарсинга:');
    console.log('  1 – сохранить по этим данным');
    console.log('  2 – перейти в ручной режим');
    console.log('  [Enter] – пропустить (ничего не сохранять)');

    const choice = await ask('Ваш выбор (1/2/[Enter]): ');
    if (choice === '1') {
      if (auto.mode === 'date') {
        await saveAsDateAuto(auto._date, firstTitle, html);
        return;
      } else if (auto.mode === 'period') {
        await saveAsPeriodAuto(
          auto._periodType,
          auto._periodWeekNumber,
          auto._dayOfWeek,
          firstTitle,
          html
        );
        return;
      }
    } else if (choice === '2') {
      // пойдём дальше в ручной режим
      console.log('→ Переход в ручной режим.');
    } else {
      console.log('→ Пропускаем запись целиком (по автопарсингу и без ручного).');
      return;
    }
  }

  // 2) Ручной режим

  console.log('\nРучной режим: выберите действие для этой записи:');
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
    return;
  }

  // Выбор/редактирование title
  let title = '';
  if (titleCandidates.length > 0) {
    if (titleCandidates.length === 1) {
      const def = titleCandidates[0];
      const answer = await ask(`Title [по умолчанию: "${def}"] (Enter, чтобы оставить): `);
      title = answer || def;
    } else {
      let done = false;
      while (!done) {
        const ans = await ask('Выберите заголовок 1/2 или введите свой текст: ');
        if (ans === '1' || ans === '2') {
          title = titleCandidates[Number(ans) - 1];
          done = true;
        } else if (ans.trim() === '') {
          title = titleCandidates[0];
          done = true;
        } else {
          title = ans;
          done = true;
        }
      }
    }
  } else {
    const ans = await ask('Введите title (можно пустым, просто Enter): ');
    title = ans;
  }

  if (mode === '1') {
    await saveAsDateManual(monthDay, title, html);
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

    await saveAsPeriodManual(_periodType, _periodWeekNumber, _dayOfWeek, title, html);
  } else if (mode === '3') {
    const feastKey = await chooseFeastKey();
    await saveAsFeastWithDupCheck(feastKey, title, html);
  }
}

// ========== основной цикл ==========

async function main() {
  try {
    const yearStr = await ask('Введите год (например, 2025): ');
    const year = Number(yearStr);
    if (!year || isNaN(year)) {
      console.error('Некорректный год.');
      rl.close();
      process.exit(1);
    }

    console.log(`\nЗагружаем документы из ${READINGS_DATA_COLLECTION} за ${year} год...`);

    const snap = await db.collection(READINGS_DATA_COLLECTION).get();
    const docsForYear = snap.docs.filter((doc) => {
      const data = doc.data();
      const dayStr = data.day;
      const parsed = parseDayRaw(dayStr || '');
      return parsed && parsed.year === year;
    });

    console.log(`Найдено документов за ${year}: ${docsForYear.length}`);

    for (const doc of docsForYear) {
      await processOneDoc(doc);
      const cont = (await ask('\nНажмите Enter для следующей записи или q для выхода: ')).toLowerCase();
      if (cont === 'q') {
        console.log('Выход по запросу пользователя.');
        break;
      }
    }

    console.log('\nГотово.');
    rl.close();
    process.exit(0);
  } catch (err) {
    console.error('Ошибка в интерактивной миграции:', err);
    rl.close();
    process.exit(1);
  }
}

main();