#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');
const chalk = require('chalk');

const serviceAccount = require('./serviceAccountKey.json');

const REPORT_MD_PATH = path.resolve(__dirname, '../reports/ordinary-period-validation-report.md');
const REPORT_JSON_PATH = path.resolve(__dirname, './json/ordinary-period-validation-report.json');

const REQUIRED_CALENDAR_FIELDS = [
  'officeOfReadingsVers',
  'officeOfReadingsR1',
  'officeOfReadingsR2',
  'officeOfReadingsPr',
  'readingRef',
  'templateRef',
  'compRef',
  '_psalmWeek',
];

const REQUIRED_COMPLETORIUM_FIELDS = [
  '_dayOfWeek',
  '_periodType',
  'compHymn',
  'compAnt1',
  'compPs1',
  'compR',
  'compResp',
  'compAntS',
  'compPr',
];

const REQUIRED_DAY_TEMPLATE_FIELDS = [
  '_dayOfWeek',
  '_periodType',
  '_psalmWeekNumber',
  'laudesHymn',
  'laudesAnt1',
  'laudesAnt2',
  'laudesAnt3',
  'laudesPs1',
  'laudesPs2',
  'laudesPs3',
  'laudesR',
  'laudesAntBen',
  'laudesInter',
  'laudesPr',
  'sext1Hymn',
  'sext1Ant1',
  'sext1Ant2',
  'sext1Ant3',
  'sext1Ps1',
  'sext1Ps2',
  'sext1Ps3',
  'sext1R',
  'sext1Pr',
  'sext2Hymn',
  'sext2Ant1',
  'sext2Ant2',
  'sext2Ant3',
  'sext2Ps1',
  'sext2Ps2',
  'sext2Ps3',
  'sext2R',
  'sext2Pr',
  'sext3Hymn',
  'sext3Ant1',
  'sext3Ant2',
  'sext3Ant3',
  'sext3Ps1',
  'sext3Ps2',
  'sext3Ps3',
  'sext3R',
  'sext3Pr',
  'vesperHymn',
  'vesperAnt1',
  'vesperAnt2',
  'vesperAnt3',
  'vesperPs1',
  'vesperPs2',
  'vesperPs3',
  'vesperR',
  'vesperAntMag',
  'vesperInter',
  'vesperPr',
];

function isEmptyValue(value) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function getMissingFields(data, fields) {
  return fields.filter((field) => isEmptyValue(data[field]));
}

function expectedWeekDayPairs() {
  const pairs = [];
  for (let week = 1; week <= 34; week += 1) {
    for (let day = 1; day <= 7; day += 1) {
      const isAllowedMissingSunday = (week === 1 || week === 34) && day === 1;
      if (!isAllowedMissingSunday) {
        pairs.push({ week, day });
      }
    }
  }
  return pairs;
}

async function checkDayTemplates(db) {
  const snap = await db.collection('dayTemplates').where('_periodType', '==', 'ordinary').get();
  const docs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const byPsalmWeek = new Map();
  const invalidDocs = [];

  for (const doc of docs) {
    const psalmWeek = Number(doc._psalmWeekNumber ?? doc._psalmWeek);
    const dayOfWeek = Number(doc._dayOfWeek);

    if (!byPsalmWeek.has(psalmWeek)) {
      byPsalmWeek.set(psalmWeek, new Set());
    }
    byPsalmWeek.get(psalmWeek).add(dayOfWeek);

    const missing = getMissingFields(doc, REQUIRED_DAY_TEMPLATE_FIELDS);
    if (missing.length) {
      invalidDocs.push({ id: doc.id, psalmWeek, dayOfWeek, missing });
    }
  }

  const psalmWeeks = Array.from(byPsalmWeek.keys()).sort((a, b) => a - b);

  return {
    count: docs.length,
    psalmWeeks,
    weekCoverage: psalmWeeks.map((week) => ({
      week,
      days: Array.from(byPsalmWeek.get(week)).sort((a, b) => a - b),
    })),
    invalidDocs,
    expectedWeeksOk: JSON.stringify(psalmWeeks) === JSON.stringify([1, 2, 3, 4]),
  };
}

async function checkCompletoriumTemplates(db) {
  const snap = await db.collection('completoriumTemplates').where('_periodType', '==', 'ordinary').get();
  const docs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const byWeekday = new Map();
  const invalidDocs = [];

  for (const doc of docs) {
    const dayOfWeek = Number(doc._dayOfWeek);
    if (!byWeekday.has(dayOfWeek)) {
      byWeekday.set(dayOfWeek, []);
    }
    byWeekday.get(dayOfWeek).push(doc.id);

    const missing = getMissingFields(doc, REQUIRED_COMPLETORIUM_FIELDS);
    if (missing.length) {
      invalidDocs.push({ id: doc.id, dayOfWeek, missing });
    }
  }

  const weekdays = Array.from(byWeekday.keys()).sort((a, b) => a - b);
  const missingWeekdays = [];
  for (let d = 1; d <= 7; d += 1) {
    if (!byWeekday.has(d)) missingWeekdays.push(d);
  }

  const duplicates = Array.from(byWeekday.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([dayOfWeek, ids]) => ({ dayOfWeek, ids }));

  return {
    count: docs.length,
    weekdays,
    missingWeekdays,
    duplicates,
    invalidDocs,
  };
}

async function checkReadings(db) {
  const snap = await db.collection('readings').where('_periodType', '==', 'ordinary').get();
  const docs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const slotMap = new Map();
  for (const doc of docs) {
    const week = Number(doc._periodWeekNumber);
    const day = Number(doc._dayOfWeek);
    if (!Number.isFinite(week) || !Number.isFinite(day)) continue;
    slotMap.set(`${week}:${day}`, (slotMap.get(`${week}:${day}`) || 0) + 1);
  }

  const missingSlots = [];
  for (const slot of expectedWeekDayPairs()) {
    const key = `${slot.week}:${slot.day}`;
    if (!slotMap.has(key)) {
      missingSlots.push(slot);
    }
  }

  return {
    count: docs.length,
    coveredWeeks: Array.from(new Set(docs.map((doc) => Number(doc._periodWeekNumber)).filter(Number.isFinite))).sort((a, b) => a - b),
    missingSlots,
  };
}

async function checkCalendarMap(db) {
  const snap = await db.collection('calendarMap').where('_periodType', '==', 'ordinary').get();
  const docs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const slotMap = new Map();
  const invalidDocs = [];

  for (const doc of docs) {
    const week = Number(doc._periodWeekNumber);
    const day = Number(doc._dayOfWeek);
    if (!Number.isFinite(week) || !Number.isFinite(day)) continue;

    const key = `${week}:${day}`;
    if (!slotMap.has(key)) slotMap.set(key, []);
    slotMap.get(key).push(doc.id);

    const missing = getMissingFields(doc, REQUIRED_CALENDAR_FIELDS);
    if (missing.length) {
      invalidDocs.push({ id: doc.id, week, day, missing });
    }
  }

  const missingSlots = [];
  for (const slot of expectedWeekDayPairs()) {
    const key = `${slot.week}:${slot.day}`;
    if (!slotMap.has(key)) missingSlots.push(slot);
  }

  return {
    count: docs.length,
    coveredWeeks: Array.from(new Set(docs.map((doc) => Number(doc._periodWeekNumber)).filter(Number.isFinite))).sort((a, b) => a - b),
    missingSlots,
    invalidDocs,
  };
}

function statusBadge(ok) {
  return ok
    ? '<span style="color:#0f9d58;font-weight:700">✅ PASS</span>'
    : '<span style="color:#d93025;font-weight:700">❌ FAIL</span>';
}

function markdownList(items) {
  if (!items.length) return '—';
  return items.map((item) => `- ${item}`).join('\n');
}

function buildReport(results) {
  const dayTemplatesOk =
    results.dayTemplates.expectedWeeksOk &&
    results.dayTemplates.invalidDocs.length === 0 &&
    results.dayTemplates.weekCoverage.every((w) => w.days.length === 7);

  const completoriumOk =
    results.completorium.missingWeekdays.length === 0 &&
    results.completorium.invalidDocs.length === 0;

  const readingsOk = results.readings.missingSlots.length === 0;

  const calendarOk =
    results.calendarMap.missingSlots.length === 0 &&
    results.calendarMap.invalidDocs.length === 0 &&
    JSON.stringify(results.calendarMap.coveredWeeks) === JSON.stringify(Array.from({ length: 34 }, (_, i) => i + 1));

  const allOk = dayTemplatesOk && completoriumOk && readingsOk && calendarOk;

  const lines = [
    '# Ordinary Period Validation Report',
    '',
    `Дата: ${new Date().toISOString()}`,
    '',
    `Общий статус: ${statusBadge(allOk)}`,
    '',
    '## 1) dayTemplates',
    `Статус: ${statusBadge(dayTemplatesOk)}`,
    `- Найдено документов: **${results.dayTemplates.count}**`,
    `- Psalm weeks: **${results.dayTemplates.psalmWeeks.join(', ')}**`,
    `- Покрытие по дням:`,
    ...results.dayTemplates.weekCoverage.map((w) => `  - week ${w.week}: [${w.days.join(', ')}]`),
    `- Проверенные поля (${REQUIRED_DAY_TEMPLATE_FIELDS.length}):`,
    markdownList(REQUIRED_DAY_TEMPLATE_FIELDS),
    `- Документы с незаполненными полями: **${results.dayTemplates.invalidDocs.length}**`,
    '',
    '## 2) completoriumTemplates',
    `Статус: ${statusBadge(completoriumOk)}`,
    `- Найдено документов: **${results.completorium.count}**`,
    `- Найденные дни недели: **${results.completorium.weekdays.join(', ')}**`,
    `- Отсутствующие дни недели: **${results.completorium.missingWeekdays.join(', ') || 'нет'}**`,
    `- Дубликаты по дню недели: **${results.completorium.duplicates.length}**`,
    `- Проверенные поля (${REQUIRED_COMPLETORIUM_FIELDS.length}):`,
    markdownList(REQUIRED_COMPLETORIUM_FIELDS),
    `- Документы с незаполненными полями: **${results.completorium.invalidDocs.length}**`,
    '',
    '## 3) readings',
    `Статус: ${statusBadge(readingsOk)}`,
    '- Правило: покрытие всех 34 недель, исключения: **1 неделя / воскресенье** и **34 неделя / воскресенье**.',
    `- Покрытые недели: **${results.readings.coveredWeeks.join(', ')}**`,
    `- Пропущенные слоты (week/day) по правилу: **${results.readings.missingSlots.length}**`,
    '',
    '## 4) calendarMap',
    `Статус: ${statusBadge(calendarOk)}`,
    '- Правило покрытия: все 34 недели, исключения: **1 неделя / воскресенье** и **34 неделя / воскресенье**.',
    `- Покрытые недели: **${results.calendarMap.coveredWeeks.join(', ')}**`,
    `- Пропущенные слоты (week/day): **${results.calendarMap.missingSlots.length}**`,
    `- Поля, которые должны быть заполнены (${REQUIRED_CALENDAR_FIELDS.length}):`,
    markdownList(REQUIRED_CALENDAR_FIELDS),
    `- Документы calendarMap с незаполненными полями: **${results.calendarMap.invalidDocs.length}**`,
    '',
    '## Детали ошибок',
    '',
    '### dayTemplates: первые 20 проблем',
    '```json',
    JSON.stringify(results.dayTemplates.invalidDocs.slice(0, 20), null, 2),
    '```',
    '',
    '### completoriumTemplates: первые 20 проблем',
    '```json',
    JSON.stringify(results.completorium.invalidDocs.slice(0, 20), null, 2),
    '```',
    '',
    '### readings: первые 50 пропусков',
    '```json',
    JSON.stringify(results.readings.missingSlots.slice(0, 50), null, 2),
    '```',
    '',
    '### calendarMap: первые 20 проблем полей',
    '```json',
    JSON.stringify(results.calendarMap.invalidDocs.slice(0, 20), null, 2),
    '```',
    '',
    '### calendarMap: первые 50 пропусков week/day',
    '```json',
    JSON.stringify(results.calendarMap.missingSlots.slice(0, 50), null, 2),
    '```',
  ];

  return { markdown: lines.join('\n'), allOk };
}

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  console.log(chalk.cyan.bold('Ordinary period validation started...'));

  const results = {
    dayTemplates: await checkDayTemplates(db),
    completorium: await checkCompletoriumTemplates(db),
    readings: await checkReadings(db),
    calendarMap: await checkCalendarMap(db),
  };

  const { markdown, allOk } = buildReport(results);

  fs.mkdirSync(path.dirname(REPORT_MD_PATH), { recursive: true });
  fs.writeFileSync(REPORT_MD_PATH, markdown, 'utf8');

  fs.mkdirSync(path.dirname(REPORT_JSON_PATH), { recursive: true });
  fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(results, null, 2), 'utf8');

  console.log(chalk.green(`Report written: ${REPORT_MD_PATH}`));
  console.log(chalk.green(`JSON written: ${REPORT_JSON_PATH}`));

  if (!allOk) {
    console.log(chalk.red.bold('Validation failed. See report for details.'));
    process.exit(1);
  }

  console.log(chalk.green.bold('Validation passed.'));
}

main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
