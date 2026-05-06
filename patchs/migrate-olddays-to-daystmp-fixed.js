#!/usr/bin/env node

import admin from 'firebase-admin';
import serviceAccount from './serviceAccountKey.json' with { type: 'json' };
import { FIXED_CALENDAR_DATES } from '../src/constants/fixedCalendar.js';

const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const FIELDS = ['_date','_feastName','_feastType','_feast','feastComment','invitatoriumAnt','officeOfReadingsHymn','officeOfReadingsAnt1','officeOfReadingsAnt2','officeOfReadingsAnt3','officeOfReadingsPs1','officeOfReadingsPs2','officeOfReadingsPs3','officeOfReadingsVers','officeOfReadingsR1','officeOfReadingsR2','officeOfReadingsTeDeum','officeOfReadingsPr','laudesHymn','laudesAnt1','laudesAnt2','laudesAnt3','laudesPs1','laudesPs2','laudesPs3','laudesR','laudesAntBen','laudesInter','laudesPr','sext1Hymn','sext1Ant1','sext1Ant2','sext1Ant3','sext1Ps1','sext1Ps2','sext1Ps3','sext1R','sext1Pr','sext2Hymn','sext2Ant1','sext2Ant2','sext2Ant3','sext2Ps1','sext2Ps2','sext2Ps3','sext2R','sext2Pr','sext3Hymn','sext3Ant1','sext3Ant2','sext3Ant3','sext3Ps1','sext3Ps2','sext3Ps3','sext3R','sext3Pr','vesperHymn','vesperAnt1','vesperAnt2','vesperAnt3','vesperPs1','vesperPs2','vesperPs3','vesperR','vesperAntMag','vesperInter','vesperPr','vesper1Hymn','vesper1Ant1','vesper1Ant2','vesper1Ant3','vesper1Ps1','vesper1Ps2','vesper1Ps3','vesper1R','vesper1AntMag','vesper1Inter','vesper1Pr'];

function parseIdDate(id) {
  const match = String(id || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    ddmm: `${match[3]}.${match[2]}`,
  };
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function hasDateField(item) {
  return normalizeText(item._date) !== '';
}

async function commitBatch(batch, pending, committed) {
  if (!pending) return committed;
  await batch.commit();
  const nextCommitted = committed + pending;
  console.log(`  Сохранено в daysTmp: ${nextCommitted}`);
  return nextCommitted;
}

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const allowedDates = [...FIXED_CALENDAR_DATES].sort();

  console.log('Миграция fixed-calendar oldDays -> daysTmp');
  console.log(`Годы: ${YEARS.join(', ')}`);
  console.log(`Фиксированных дат для отбора: ${allowedDates.length}`);

  const sourceIds = YEARS.flatMap((year) => (
    allowedDates.map((date) => {
      const [day, month] = date.split('.');
      return `${year}-${month}-${day}`;
    })
  ));

  console.log(`Будет проверено oldDays по id: ${sourceIds.length}`);
  console.log(`Первый id: ${sourceIds[0]}; последний id: ${sourceIds[sourceIds.length - 1]}`);

  let checked = 0;
  let found = 0;
  let skippedMissing = 0;
  let skippedEmptyDateField = 0;
  let written = 0;
  let committed = 0;
  let batch = db.batch();
  let pending = 0;

  const readChunkSize = 300;
  for (let i = 0; i < sourceIds.length; i += readChunkSize) {
    const chunkIds = sourceIds.slice(i, i + readChunkSize);
    console.log(`Читаю oldDays ${i + 1}-${i + chunkIds.length} из ${sourceIds.length}...`);
    const refs = chunkIds.map((id) => db.collection('oldDays').doc(id));
    const docs = await db.getAll(...refs);

    for (const sourceDoc of docs) {
      checked += 1;
      const idDate = parseIdDate(sourceDoc.id);

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
      FIELDS.forEach((field) => { payload[field] = item[field] ?? null; });
      payload._source = 'oldDays-fixed-calendar';
      payload._sourceId = sourceDoc.id;
      payload._sourceYear = idDate.year;
      payload._fixedDate = idDate.ddmm;

      batch.set(db.collection('daysTmp').doc(sourceDoc.id.toLowerCase()), payload, { merge: true });
      pending += 1;
      written += 1;

      if (pending >= 400) {
        committed = await commitBatch(batch, pending, committed);
        batch = db.batch();
        pending = 0;
      }
    }

    console.log(`  Прогресс: проверено=${checked}; найдено=${found}; missing=${skippedMissing}; пустой _date=${skippedEmptyDateField}; ожидает записи=${pending}`);
  }

  committed = await commitBatch(batch, pending, committed);

  console.log('Готово.');
  console.log(`Проверено id: ${checked}`);
  console.log(`Найдено и подходит для миграции: ${found}`);
  console.log(`Запланировано/записано: ${written}/${committed}`);
  console.log(`Пропущено: нет документа=${skippedMissing}, пустой _date=${skippedEmptyDateField}`);
}
main().catch((error) => {
  console.error('Ошибка миграции oldDays -> daysTmp:', error);
  process.exit(1);
});
