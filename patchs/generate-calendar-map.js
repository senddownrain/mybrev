#!/usr/bin/env node

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

const TARGET_PERIODS = ['ordinary', 'lent', 'easter', 'advent', 'christmas'];
const META_FIELDS = ['_dayOfWeek', '_periodType', '_periodWeekNumber', '_date', '_feast', '_psalmWeek', '_feastName', '_feastType'];
const CALENDAR_FIELDS = [
  '_dayOfWeek', '_periodType', '_periodWeekNumber', '_date', '_feast', '_psalmWeek', '_feastName', '_feastType',
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

function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

function parsePsalmWeek(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number') return Number.isInteger(raw) ? raw : null;

  const source = String(raw).toUpperCase().replace(/\s+/g, '').replace(/[ІI]/g, 'I');
  const match = source.match(/(IV|III|II|I|1|2|3|4)/);
  if (!match) return null;

  const value = match[1];
  if (value === 'I' || value === '1') return 1;
  if (value === 'II' || value === '2') return 2;
  if (value === 'III' || value === '3') return 3;
  if (value === 'IV' || value === '4') return 4;
  return null;
}

function indexBy(items, keyBuilder) {
  const index = new Map();
  for (const item of items) {
    const key = keyBuilder(item);
    if (!key) continue;
    if (!index.has(key)) index.set(key, item);
  }
  return index;
}

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  console.log('1/4 Загружаю данные...');
  const [daysSnap, templatesSnap, completoriumSnap, readingsSnap] = await Promise.all([
    db.collection('days').get(),
    db.collection('dayTemplates').get(),
    db.collection('completoriumTemplates').get(),
    db.collection('readings').get(),
  ]);

  const days = daysSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const templates = templatesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const completoriums = completoriumSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const readings = readingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  console.log('2/4 Строю индексы...');
  const templateByPeriodDayPsalm = indexBy(templates, (item) => {
    if (!item._periodType || !item._dayOfWeek || !item._psalmWeekNumber) return null;
    return `${item._periodType}|${Number(item._dayOfWeek)}|${Number(item._psalmWeekNumber)}`;
  });

  const compByPeriodDay = indexBy(completoriums, (item) => {
    if (!item._periodType || !item._dayOfWeek) return null;
    return `${item._periodType}|${Number(item._dayOfWeek)}`;
  });

  const readingByPeriodWeekDay = indexBy(readings, (item) => {
    if (!item._periodType || !item._periodWeekNumber || !item._dayOfWeek) return null;
    return `${item._periodType}|${Number(item._periodWeekNumber)}|${Number(item._dayOfWeek)}`;
  });

  console.log('3/4 Формирую calendarMap...');
  const docs = [];
  for (const day of days) {
    if (!TARGET_PERIODS.includes(day._periodType)) continue;

    const dayOfWeek = Number(day._dayOfWeek);
    const periodWeek = Number(day._periodWeekNumber ?? day._weekNum);
    const psalmWeek = parsePsalmWeek(day._psalmWeek);

    const template = templateByPeriodDayPsalm.get(`${day._periodType}|${dayOfWeek}|${psalmWeek}`);
    const comp = compByPeriodDay.get(`${day._periodType}|${dayOfWeek}`);
    const reading = readingByPeriodWeekDay.get(`${day._periodType}|${periodWeek}|${dayOfWeek}`);

    const payload = {
      templateRef: template?.id || null,
      compRef: comp?.id || null,
      readingRef: reading?.id || null,
    };

    for (const field of CALENDAR_FIELDS) {
      const dayValue = day[field] ?? null;
      if (field === '_periodWeekNumber') {
        payload[field] = Number.isFinite(periodWeek) ? periodWeek : null;
      } else if (META_FIELDS.includes(field)) {
        payload[field] = dayValue;
      } else if (template && hasValue(template[field])) {
        payload[field] = null;
      } else {
        payload[field] = dayValue;
      }
    }

    docs.push({ id: day.id, payload });
  }

  console.log(`Найдено элементов для генерации: ${docs.length}`);
  console.log('4/4 Сохраняю пакетами...');

  const chunkSize = 400;
  let committed = 0;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = docs.slice(i, i + chunkSize);
    const batch = db.batch();
    for (const item of chunk) {
      batch.set(db.collection('calendarMap').doc(item.id), item.payload, { merge: true });
    }
    await batch.commit();
    committed += chunk.length;
    console.log(`  Сохранено ${committed}/${docs.length}`);
  }

  console.log('Готово.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Ошибка генерации calendarMap:', e);
  process.exit(1);
});
