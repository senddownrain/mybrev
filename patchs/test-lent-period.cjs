#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');
const chalk = require('chalk');

const serviceAccount = require('./serviceAccountKey.json');

const REPORT_MD_PATH = path.resolve(__dirname, '../reports/lent-period-validation-report.md');
const REPORT_JSON_PATH = path.resolve(__dirname, './json/lent-period-validation-report.json');

const EXPECTED_LENT_PERIOD_WEEKS = [1, 2, 3, 4, 5];
const EXPECTED_LENT_ZERO_WEEK_DAYS = [5, 6, 7]; // Thu/Fri/Sat after Ash Wednesday

const REQUIRED_DAY_TEMPLATE_FIELDS = [
  'laudesHymn',
  'laudesPs1',
  'laudesPs2',
  'laudesPs3',
  'sext1Hymn',
  'sext1Ps1',
  'sext1Ps2',
  'sext1Ps3',
  'sext2Hymn',
  'sext2Ps1',
  'sext2Ps2',
  'sext2Ps3',
  'sext3Hymn',
  'sext3Ps1',
  'sext3Ps2',
  'sext3Ps3',
  'vesperHymn',
  'vesperPs1',
  'vesperPs2',
  'vesperPs3',
];

const REQUIRED_DAY_TEMPLATE_SUNDAY_ONLY_FIELDS = [
  'vesper1Ps1',
  'vesper1Ps2',
  'vesper1Ps3',
];

const REQUIRED_COMPLETORIUM_FIELDS = [
  '_dayOfWeek',
  '_periodType',
  'compHymn',
  'compAnt1',
  'compAnt2',
  'compPs1',
  'compPs2',
  'compR',
  'compResp',
  'compAntS',
  'compPr',
];

const REQUIRED_CALENDAR_FIELDS = [
  'officeOfReadingsVers',
  'officeOfReadingsR1',
  'officeOfReadingsR2',
  'officeOfReadingsPr',
  'laudesR',
  'laudesAntBen',
  'laudesInter',
  'laudesPr',
  'sext1Ant1',
  'sext1R',
  'sext2Ant1',
  'sext2R',
  'sext3Ant1',
  'sext3R',
  'vesperR',
  'vesperAntMag',
  'vesperInter',
  'vesperPr',
  'readingRef',
  'templateRef',
  'compRef',
  '_psalmWeek',
];

const REQUIRED_CALENDAR_SUNDAY_ONLY_FIELDS = [
  'vesper1Ant1',
  'vesper1Ant2',
  'vesper1Ant3',
  'vesper1R',
  'vesper1AntMag',
  'vesper1Inter',
  'vesper1Pr',
  'vesperAnt1',
  'vesperAnt2',
  'vesperAnt3',
  'laudesAnt1',
  'laudesAnt2',
  'laudesAnt3',
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

function statusBadge(ok) {
  return ok
    ? '<span style="color:#0f9d58;font-weight:700">✅ PASS</span>'
    : '<span style="color:#d93025;font-weight:700">❌ FAIL</span>';
}

function markdownList(items) {
  if (!items.length) return '—';
  return items.map((item) => `- ${item}`).join('\n');
}

function normalizeRefId(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.id === 'string') return value.id;
  if (typeof value === 'object' && typeof value.path === 'string') {
    const parts = value.path.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  }
  return '';
}

function expectedLentReadingsSlots() {
  const slots = [];
  for (const week of EXPECTED_LENT_PERIOD_WEEKS) {
    for (let day = 1; day <= 7; day += 1) {
      slots.push({ week, day });
    }
  }
  for (const day of EXPECTED_LENT_ZERO_WEEK_DAYS) {
    slots.push({ week: 0, day });
  }
  return slots;
}

async function checkDayTemplates(db) {
  const snap = await db.collection('dayTemplates').where('_periodType', '==', 'lent').get();
  const docs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const byPsalmWeek = new Map();
  const invalidDocs = [];

  for (const doc of docs) {
    const psalmWeek = Number(doc._psalmWeekNumber ?? doc._psalmWeek);
    const dayOfWeek = Number(doc._dayOfWeek);

    if (Number.isFinite(psalmWeek) && Number.isFinite(dayOfWeek)) {
      if (!byPsalmWeek.has(psalmWeek)) byPsalmWeek.set(psalmWeek, new Set());
      byPsalmWeek.get(psalmWeek).add(dayOfWeek);
    }

    const requiredForDoc = [...REQUIRED_DAY_TEMPLATE_FIELDS];
    if (dayOfWeek === 1) requiredForDoc.push(...REQUIRED_DAY_TEMPLATE_SUNDAY_ONLY_FIELDS);

    const missing = getMissingFields(doc, requiredForDoc);
    if (missing.length) {
      invalidDocs.push({ id: doc.id, psalmWeek, dayOfWeek, missing });
    }
  }

  const psalmWeeks = Array.from(byPsalmWeek.keys()).sort((a, b) => a - b);
  const expectedPsalmWeeksOk = JSON.stringify(psalmWeeks) === JSON.stringify([1, 2, 3, 4]);

  return {
    count: docs.length,
    psalmWeeks,
    weekCoverage: psalmWeeks.map((week) => ({
      week,
      days: Array.from(byPsalmWeek.get(week)).sort((a, b) => a - b),
    })),
    invalidDocs,
    expectedPsalmWeeksOk,
  };
}

async function checkCompletoriumTemplates(db) {
  const snap = await db.collection('completoriumTemplates').where('_periodType', '==', 'lent').get();
  const docs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const byWeekday = new Map();
  const invalidDocs = [];

  for (const doc of docs) {
    const dayOfWeek = Number(doc._dayOfWeek);
    if (!byWeekday.has(dayOfWeek)) byWeekday.set(dayOfWeek, []);
    byWeekday.get(dayOfWeek).push(doc.id);

    const missing = getMissingFields(doc, REQUIRED_COMPLETORIUM_FIELDS);
    if (missing.length) invalidDocs.push({ id: doc.id, dayOfWeek, missing });
  }

  const weekdays = Array.from(byWeekday.keys()).sort((a, b) => a - b);
  const missingWeekdays = [];
  for (let d = 1; d <= 7; d += 1) if (!byWeekday.has(d)) missingWeekdays.push(d);

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
  const snap = await db.collection('readings').where('_periodType', '==', 'lent').get();
  const docs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const slotMap = new Map();
  for (const doc of docs) {
    const week = Number(doc._periodWeekNumber);
    const day = Number(doc._dayOfWeek);
    if (!Number.isFinite(week) || !Number.isFinite(day)) continue;
    const key = `${week}:${day}`;
    slotMap.set(key, (slotMap.get(key) || 0) + 1);
  }

  const missingSlots = [];
  for (const slot of expectedLentReadingsSlots()) {
    const key = `${slot.week}:${slot.day}`;
    if (!slotMap.has(key)) missingSlots.push(slot);
  }

  return {
    count: docs.length,
    coveredWeeks: Array.from(new Set(docs.map((d) => Number(d._periodWeekNumber)).filter(Number.isFinite))).sort((a, b) => a - b),
    missingSlots,
  };
}

async function checkCalendarMap(db) {
  const [calendarSnap, templatesSnap] = await Promise.all([
    db.collection('calendarMap').where('_periodType', '==', 'lent').get(),
    db.collection('dayTemplates').where('_periodType', '==', 'lent').get(),
  ]);

  const docs = calendarSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const templatesById = new Map(templatesSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }]));

  const slotMap = new Map();
  const invalidDocs = [];
  const zeroWeekPsalmIssues = [];
  const zeroWeekTemplateIssues = [];

  for (const doc of docs) {
    const week = Number(doc._periodWeekNumber);
    const day = Number(doc._dayOfWeek);
    if (!Number.isFinite(week) || !Number.isFinite(day)) continue;

    const key = `${week}:${day}`;
    if (!slotMap.has(key)) slotMap.set(key, []);
    slotMap.get(key).push(doc.id);

    const requiredForDoc = [...REQUIRED_CALENDAR_FIELDS];
    if (day === 1) requiredForDoc.push(...REQUIRED_CALENDAR_SUNDAY_ONLY_FIELDS);

    const missing = getMissingFields(doc, requiredForDoc);
    if (missing.length) invalidDocs.push({ id: doc.id, week, day, missing });

    if (week === 0) {
      if (Number(doc._psalmWeek) !== 4) {
        zeroWeekPsalmIssues.push({ id: doc.id, week, day, actualPsalmWeek: doc._psalmWeek });
      }

      const templateRefId = normalizeRefId(doc.templateRef);
      const template = templatesById.get(templateRefId);
      const templatePsalmWeek = Number(template?._psalmWeekNumber ?? template?._psalmWeek);
      if (!template || templatePsalmWeek !== 4) {
        zeroWeekTemplateIssues.push({
          id: doc.id,
          week,
          day,
          templateRefId,
          templatePsalmWeek: Number.isFinite(templatePsalmWeek) ? templatePsalmWeek : null,
          reason: !template ? 'template-not-found' : 'template-not-from-week-4',
        });
      }
    }
  }

  const missingSlots = [];
  for (const slot of expectedLentReadingsSlots()) {
    const key = `${slot.week}:${slot.day}`;
    if (!slotMap.has(key)) missingSlots.push(slot);
  }

  return {
    count: docs.length,
    coveredWeeks: Array.from(new Set(docs.map((d) => Number(d._periodWeekNumber)).filter(Number.isFinite))).sort((a, b) => a - b),
    missingSlots,
    invalidDocs,
    zeroWeekPsalmIssues,
    zeroWeekTemplateIssues,
  };
}

function buildReport(results) {
  const dayTemplatesOk =
    results.dayTemplates.expectedPsalmWeeksOk &&
    results.dayTemplates.invalidDocs.length === 0 &&
    results.dayTemplates.weekCoverage.every((w) => w.days.length === 7);

  const completoriumOk =
    results.completorium.missingWeekdays.length === 0 &&
    results.completorium.invalidDocs.length === 0;

  const readingsOk = results.readings.missingSlots.length === 0;

  const calendarOk =
    results.calendarMap.missingSlots.length === 0 &&
    results.calendarMap.invalidDocs.length === 0 &&
    results.calendarMap.zeroWeekPsalmIssues.length === 0 &&
    results.calendarMap.zeroWeekTemplateIssues.length === 0;

  const allOk = dayTemplatesOk && completoriumOk && readingsOk && calendarOk;

  const lines = [
    '# Lent Period Validation Report',
    '',
    `Дата: ${new Date().toISOString()}`,
    '',
    `Общий статус: ${statusBadge(allOk)}`,
    '',
    '## 1) dayTemplates',
    `Статус: ${statusBadge(dayTemplatesOk)}`,
    '- Правило: есть 4 недели псалтири (1..4), каждая с днями 1..7.',
    `- Найдено документов: **${results.dayTemplates.count}**`,
    `- Psalm weeks: **${results.dayTemplates.psalmWeeks.join(', ')}**`,
    '- Покрытие по дням:',
    ...results.dayTemplates.weekCoverage.map((w) => `  - week ${w.week}: [${w.days.join(', ')}]`),
    `- Проверенные поля (${REQUIRED_DAY_TEMPLATE_FIELDS.length}):`,
    markdownList(REQUIRED_DAY_TEMPLATE_FIELDS),
    `- Только для воскресенья (${REQUIRED_DAY_TEMPLATE_SUNDAY_ONLY_FIELDS.length}):`,
    markdownList(REQUIRED_DAY_TEMPLATE_SUNDAY_ONLY_FIELDS),
    `- Документы с незаполненными полями: **${results.dayTemplates.invalidDocs.length}**`,
    '',
    '## 2) completoriumTemplates',
    `Статус: ${statusBadge(completoriumOk)}`,
    '- Правило: по одному шаблону на каждый день недели (1..7).',
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
    '- Правило: покрыты недели 1..5 (все дни 1..7), плюс неделя 0: только 5/6/7 (чт/пт/сб после Пепельной среды).',
    `- Покрытые недели: **${results.readings.coveredWeeks.join(', ')}**`,
    `- Пропущенные слоты (week/day): **${results.readings.missingSlots.length}**`,
    '',
    '## 4) calendarMap',
    `Статус: ${statusBadge(calendarOk)}`,
    '- Правило покрытия: недели 1..5 (1..7), плюс неделя 0: 5/6/7.',
    '- На неделе 0: `_psalmWeek = 4` и `templateRef` должен указывать на шаблон 4-й недели.',
    `- Покрытые недели: **${results.calendarMap.coveredWeeks.join(', ')}**`,
    `- Пропущенные слоты (week/day): **${results.calendarMap.missingSlots.length}**`,
    `- Поля, которые должны быть заполнены (${REQUIRED_CALENDAR_FIELDS.length}):`,
    markdownList(REQUIRED_CALENDAR_FIELDS),
    `- Дополнительно только для воскресенья (${REQUIRED_CALENDAR_SUNDAY_ONLY_FIELDS.length}):`,
    markdownList(REQUIRED_CALENDAR_SUNDAY_ONLY_FIELDS),
    `- Документы calendarMap с незаполненными полями: **${results.calendarMap.invalidDocs.length}**`,
    `- Проблемы _psalmWeek на неделе 0: **${results.calendarMap.zeroWeekPsalmIssues.length}**`,
    `- Проблемы templateRef на неделе 0: **${results.calendarMap.zeroWeekTemplateIssues.length}**`,
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
    '### calendarMap: проблемы _psalmWeek на неделе 0',
    '```json',
    JSON.stringify(results.calendarMap.zeroWeekPsalmIssues.slice(0, 20), null, 2),
    '```',
    '',
    '### calendarMap: проблемы templateRef на неделе 0',
    '```json',
    JSON.stringify(results.calendarMap.zeroWeekTemplateIssues.slice(0, 20), null, 2),
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

  console.log(chalk.cyan.bold('Lent period validation started...'));

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
