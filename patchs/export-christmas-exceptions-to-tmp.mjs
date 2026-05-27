#!/usr/bin/env node

import admin from 'firebase-admin';
import serviceAccount from './serviceAccountKey.json' with { type: 'json' };

const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const READ_CHUNK_SIZE = 50;
const WRITE_BATCH_SIZE = 50;
const MAX_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 1000;

const TARGET_COLLECTION = 'exceptionsTmp';
const SOURCE_COLLECTION = 'oldDays';
const C = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

function colorize(text, color) {
  return `${color}${text}${C.reset}`;
}

const FIELDS = [
  '_dayOfWeek', '_periodType', '_periodWeekNumber', '_dayName',
  '_date', '_feast', '_feastName', '_feastType',
  'invitatoriumAnt', 'feastComment',
  'officeOfReadingsHymn', 'officeOfReadingsAnt1', 'officeOfReadingsAnt2', 'officeOfReadingsAnt3',
  'officeOfReadingsPs1', 'officeOfReadingsPs2', 'officeOfReadingsPs3', 'officeOfReadingsVers',
  'officeOfReadingsR1', 'officeOfReadingsR2', 'officeOfReadingsTeDeum', 'officeOfReadingsPr',
  'laudesHymn', 'laudesAnt1', 'laudesAnt2', 'laudesAnt3', 'laudesPs1', 'laudesPs2', 'laudesPs3',
  'laudesR', 'laudesAntBen', 'laudesInter', 'laudesPr',
  'sext1Hymn', 'sext1Ant1', 'sext1Ant2', 'sext1Ant3', 'sext1Ps1', 'sext1Ps2', 'sext1Ps3', 'sext1R', 'sext1Pr',
  'sext2Hymn', 'sext2Ant1', 'sext2Ant2', 'sext2Ant3', 'sext2Ps1', 'sext2Ps2', 'sext2Ps3', 'sext2R', 'sext2Pr',
  'sext3Hymn', 'sext3Ant1', 'sext3Ant2', 'sext3Ant3', 'sext3Ps1', 'sext3Ps2', 'sext3Ps3', 'sext3R', 'sext3Pr',
  'vesperHymn', 'vesperAnt1', 'vesperAnt2', 'vesperAnt3', 'vesperPs1', 'vesperPs2', 'vesperPs3',
  'vesperR', 'vesperAntMag', 'vesperInter', 'vesperPr',
];

function formatDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function buildSourceIds() {
  const ids = [];
  for (const year of YEARS) {
    for (let d = 17; d <= 31; d += 1) ids.push(formatDate(year, 12, d));
    for (let d = 1; d <= 11; d += 1) ids.push(formatDate(year + 1, 1, d));
  }
  return ids;
}

function parseIdDate(id) {
  const match = String(id || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    ddmm: `${match[3]}.${match[2]}`,
  };
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function hasDateField(item) {
  return normalizeText(item?._date) !== '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableFirestoreError(error) {
  return [4, 8, 10, 13, 14].includes(Number(error?.code));
}

async function withRetry(label, fn) {
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    attempt += 1;
    try {
      return await fn();
    } catch (error) {
      const retryable = isRetryableFirestoreError(error);
      if (!retryable || attempt >= MAX_RETRIES) {
        console.error(colorize(`${label}: ошибка после попыток ${attempt}/${MAX_RETRIES}`, C.red));
        throw error;
      }
      const delay = RETRY_BASE_DELAY_MS * (2 ** (attempt - 1));
      console.warn(colorize(`${label}: ${error.message || error}. Повтор ${attempt + 1}/${MAX_RETRIES} через ${delay}ms...`, C.yellow));
      await sleep(delay);
    }
  }
  return null;
}

async function getOldDaysDocs(db, refs, from, to, total) {
  return withRetry(`Read ${SOURCE_COLLECTION} ${from}-${to} из ${total}`, async () => db.getAll(...refs));
}

async function commitWrites(db, writes, committed) {
  if (!writes.length) return committed;
  await withRetry(`Commit ${TARGET_COLLECTION} (${writes.length} docs)`, async () => {
    const batch = db.batch();
    writes.forEach(({ id, payload }) => {
      batch.set(db.collection(TARGET_COLLECTION).doc(id), payload, { merge: true });
    });
    await batch.commit();
  });

  const nextCommitted = committed + writes.length;
  console.log(colorize(`  Сохранено в ${TARGET_COLLECTION}: ${nextCommitted}`, C.green));
  return nextCommitted;
}

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  const sourceIds = buildSourceIds();
  console.log(colorize(`Миграция ${SOURCE_COLLECTION} -> ${TARGET_COLLECTION}`, C.cyan));
  console.log(colorize(`Годы: ${YEARS.join(', ')}`, C.magenta));
  console.log(colorize('Период: 17.12 — 11.01', C.magenta));
  console.log(colorize(`Будет проверено id: ${sourceIds.length}`, C.gray));
  console.log(colorize(`Первый id: ${sourceIds[0]}; последний id: ${sourceIds[sourceIds.length - 1]}`, C.gray));
  console.log(colorize(`Размер чтения: ${READ_CHUNK_SIZE}; размер записи: ${WRITE_BATCH_SIZE}; retry: ${MAX_RETRIES}`, C.gray));

  let checked = 0;
  let found = 0;
  let skippedMissing = 0;
  let skippedInvalidId = 0;
  let skippedEmptyDateField = 0;
  let written = 0;
  let committed = 0;
  let pendingWrites = [];

  for (let i = 0; i < sourceIds.length; i += READ_CHUNK_SIZE) {
    const chunkIds = sourceIds.slice(i, i + READ_CHUNK_SIZE);
    console.log(colorize(`Читаю ${SOURCE_COLLECTION} ${i + 1}-${i + chunkIds.length} из ${sourceIds.length}...`, C.cyan));
    const refs = chunkIds.map((id) => db.collection(SOURCE_COLLECTION).doc(id));
    const docs = await getOldDaysDocs(db, refs, i + 1, i + chunkIds.length, sourceIds.length);

    for (const sourceDoc of docs) {
      checked += 1;
      const idDate = parseIdDate(sourceDoc.id);
      if (!idDate) {
        skippedInvalidId += 1;
        continue;
      }

      if (!sourceDoc.exists) {
        skippedMissing += 1;
        continue;
      }

      const item = sourceDoc.data();
      if (!hasDateField(item)) {
        skippedEmptyDateField += 1;
        continue;
      }

      found += 1;
      const payload = {};
      FIELDS.forEach((field) => {
        payload[field] = item[field] ?? null;
      });
      payload._source = 'oldDays-christmas-exceptions';
      payload._sourceId = sourceDoc.id;
      payload._sourceYear = idDate.year;
      payload._fixedDate = idDate.ddmm;

      pendingWrites.push({ id: sourceDoc.id.toLowerCase(), payload });
      written += 1;

      if (pendingWrites.length >= WRITE_BATCH_SIZE) {
        committed = await commitWrites(db, pendingWrites, committed);
        pendingWrites = [];
      }
    }

    console.log(colorize(`  Прогресс: проверено=${checked}; найдено=${found}; missing=${skippedMissing}; invalidId=${skippedInvalidId}; пустой _date=${skippedEmptyDateField}; ожидает записи=${pendingWrites.length}`, C.yellow));
  }

  committed = await commitWrites(db, pendingWrites, committed);

  console.log(colorize('Готово.', C.green));
  console.log(colorize(`Проверено id: ${checked}`, C.green));
  console.log(colorize(`Найдено и подходит для миграции: ${found}`, C.green));
  console.log(colorize(`Запланировано/записано: ${written}/${committed}`, C.green));
  console.log(colorize(`Пропущено: нет документа=${skippedMissing}, invalidId=${skippedInvalidId}, пустой _date=${skippedEmptyDateField}`, C.yellow));
}

main().catch((error) => {
  console.error(colorize(`Ошибка миграции ${SOURCE_COLLECTION} -> ${TARGET_COLLECTION}:`, C.red), error);
  process.exit(1);
});
