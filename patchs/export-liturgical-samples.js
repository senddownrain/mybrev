/**
 * export-liturgical-samples.js
 *
 * Скрипт специально подготовлен под конкретные выборки,
 * чтобы достать примеры из:
 *  - readings
 *  - days
 *  - yearOptions
 *
 * Параметры зафиксированы прямо в файле (см. SAMPLE_CONFIG).
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const moment = require('moment');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const SAMPLE_CONFIG = {
  // Конкретные комбинации из запроса пользователя
  periodRequests: [
    { dayOfWeek: 3, periodType: 'ordinary', periodWeekNumber: 1 },
    { dayOfWeek: 3, periodType: 'ordinary', periodWeekNumber: 3 },
    { dayOfWeek: 4, periodType: 'ordinary', periodWeekNumber: 2 },
    { dayOfWeek: 2, periodType: 'lent', periodWeekNumber: 3 },
    { dayOfWeek: 2, periodType: 'advent', periodWeekNumber: 4 },
    { dayOfWeek: 2, periodType: 'easter', periodWeekNumber: 4 },
  ],

  dateRequests: ['25.01', '25.12', '26.12'],

  feastRequests: ['pentecost', 'corpuschristi', 'ascension'],

  // Примеры yearOptions (можно поменять при необходимости)
  yearOptions: {
    mode: 'latest', // latest | years
    limit: 5,
    years: [2025, 2024, 2023],
  },

  outPath: './patchs/liturgical-samples-fixed.json',
};

function normalizeDateVariants(dateValue) {
  const m = moment(dateValue, ['D.M', 'DD.MM', 'YYYY-MM-DD', 'D.M.YYYY', 'DD.MM.YYYY'], true);
  if (!m.isValid()) {
    throw new Error(`Неверная дата в конфиге: "${dateValue}"`);
  }

  return {
    input: dateValue,
    dDotM: m.format('D.M'),
    mmDashDd: m.format('MM-DD'),
  };
}

async function getDocsByExactFieldVariants(collectionName, field, variants) {
  const uniqueValues = [...new Set(variants.filter((v) => v !== undefined && v !== null))];
  const docs = [];
  const seen = new Set();

  for (const value of uniqueValues) {
    const snap = await db.collection(collectionName).where(field, '==', value).get();
    snap.forEach((doc) => {
      if (seen.has(doc.id)) return;
      seen.add(doc.id);
      docs.push({ id: doc.id, ...doc.data() });
    });
  }

  return docs;
}

async function getDocsByPeriod(collectionName, periodType, periodWeekNumber, dayOfWeek) {
  const weekVariants = [periodWeekNumber, String(periodWeekNumber)];
  const dayVariants = [dayOfWeek, String(dayOfWeek)];

  const docs = [];
  const seen = new Set();

  for (const week of weekVariants) {
    for (const day of dayVariants) {
      const snap = await db
        .collection(collectionName)
        .where('_periodType', '==', periodType)
        .where('_periodWeekNumber', '==', week)
        .where('_dayOfWeek', '==', day)
        .get();

      snap.forEach((doc) => {
        if (seen.has(doc.id)) return;
        seen.add(doc.id);
        docs.push({ id: doc.id, ...doc.data() });
      });
    }
  }

  return docs;
}

async function getYearOptionsExamples() {
  if (SAMPLE_CONFIG.yearOptions.mode === 'years') {
    const results = [];
    const seen = new Set();

    for (const year of SAMPLE_CONFIG.yearOptions.years) {
      const snap = await db.collection('yearOptions').where('year', '==', Number(year)).get();
      snap.forEach((doc) => {
        if (seen.has(doc.id)) return;
        seen.add(doc.id);
        results.push({ id: doc.id, ...doc.data() });
      });
    }

    return results;
  }

  const snap = await db
    .collection('yearOptions')
    .orderBy('year', 'desc')
    .limit(Number(SAMPLE_CONFIG.yearOptions.limit) || 5)
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function main() {
  const normalizedDates = SAMPLE_CONFIG.dateRequests.map(normalizeDateVariants);

  const result = {
    generatedAt: new Date().toISOString(),
    config: SAMPLE_CONFIG,

    periodSamples: [],
    dateSamples: [],
    feastSamples: [],

    yearOptions: [],
    stats: {},
  };

  // 1) Периоды
  for (const req of SAMPLE_CONFIG.periodRequests) {
    const readings = await getDocsByPeriod('readings', req.periodType, req.periodWeekNumber, req.dayOfWeek);
    const days = await getDocsByPeriod('days', req.periodType, req.periodWeekNumber, req.dayOfWeek);

    result.periodSamples.push({
      request: req,
      readings,
      days,
      counts: {
        readings: readings.length,
        days: days.length,
      },
    });
  }

  // 2) Даты
  for (const dateInfo of normalizedDates) {
    const readings = await getDocsByExactFieldVariants('readings', '_date', [dateInfo.dDotM, dateInfo.mmDashDd]);
    const days = await getDocsByExactFieldVariants('days', '_date', [dateInfo.dDotM, dateInfo.mmDashDd]);

    result.dateSamples.push({
      request: dateInfo,
      readings,
      days,
      counts: {
        readings: readings.length,
        days: days.length,
      },
    });
  }

  // 3) Динамические праздники
  for (const feast of SAMPLE_CONFIG.feastRequests) {
    const readings = await getDocsByExactFieldVariants('readings', '_feast', [feast]);
    const days = await getDocsByExactFieldVariants('days', '_feast', [feast]);

    result.feastSamples.push({
      request: { feast },
      readings,
      days,
      counts: {
        readings: readings.length,
        days: days.length,
      },
    });
  }

  result.yearOptions = await getYearOptionsExamples();

  result.stats = {
    periodRequests: result.periodSamples.length,
    dateRequests: result.dateSamples.length,
    feastRequests: result.feastSamples.length,
    yearOptions: result.yearOptions.length,
    totalReadingsDocs:
      result.periodSamples.reduce((acc, x) => acc + x.counts.readings, 0)
      + result.dateSamples.reduce((acc, x) => acc + x.counts.readings, 0)
      + result.feastSamples.reduce((acc, x) => acc + x.counts.readings, 0),
    totalDaysDocs:
      result.periodSamples.reduce((acc, x) => acc + x.counts.days, 0)
      + result.dateSamples.reduce((acc, x) => acc + x.counts.days, 0)
      + result.feastSamples.reduce((acc, x) => acc + x.counts.days, 0),
  };

  const absoluteOut = path.resolve(SAMPLE_CONFIG.outPath);
  fs.mkdirSync(path.dirname(absoluteOut), { recursive: true });
  fs.writeFileSync(absoluteOut, JSON.stringify(result, null, 2), 'utf-8');

  console.log('Готово. Данные сохранены в файл:');
  console.log(absoluteOut);
  console.log('Краткая статистика:', JSON.stringify(result.stats, null, 2));
}

main()
  .catch((error) => {
    console.error('Ошибка выполнения:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await admin.app().delete();
  });
