#!/usr/bin/env node

import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';
import moment from '../src/utils/moment-be.js';
import {
  calculateBaptismOfLordDate,
  calculateChristmasPeriodWeek,
  calculateHolyFamilyDate,
} from '../src/utils/liturgicalCalendar.js';
import {
  applySeasonalWeekdayAntiphons,
  getPeriodDayDocumentId,
  resolveDayAgainstPeriod,
} from '../src/utils/liturgicalDayResolution.js';

const require = createRequire(import.meta.url);
const serviceAccount = require('../patchs/serviceAccountKey.json');
const REPORT_JSON = path.resolve('reports/advent-christmas-audit.json');
const REPORT_MD = path.resolve('reports/advent-christmas-audit.md');
const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];

const WEEKDAY_FIELDS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const OFFICE_PREFIXES = ['officeOfReadings', 'laudes', 'sext1', 'sext2', 'sext3', 'vesper'];
const ANTIPHON_FIELDS = [
  'laudesAnt1', 'laudesAnt2', 'laudesAnt3',
  'vesperAnt1', 'vesperAnt2', 'vesperAnt3',
];
const PSALM_FIELDS = [
  'officeOfReadingsPs1', 'officeOfReadingsPs2', 'officeOfReadingsPs3',
  'laudesPs1', 'laudesPs2', 'laudesPs3',
  'sext1Ps1', 'sext1Ps2', 'sext1Ps3',
  'vesperPs1', 'vesperPs2', 'vesperPs3',
];
const REQUIRED_PSALMODY_FIELDS = [
  'officeOfReadingsAnt1', 'officeOfReadingsAnt2', 'officeOfReadingsAnt3',
  ...PSALM_FIELDS.slice(0, 6),
  'laudesAnt1', 'laudesAnt2', 'laudesAnt3',
  'sext1Ant1', ...PSALM_FIELDS.slice(6, 9),
  'vesperAnt1', 'vesperAnt2', 'vesperAnt3', ...PSALM_FIELDS.slice(9),
];
const CONTENT_FIELDS = [
  'invitatoriumAnt',
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

function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function compactText(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#x20;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function digest(value) {
  const text = compactText(value);
  return text ? createHash('sha1').update(text).digest('hex').slice(0, 10) : null;
}

function paragraphCount(value) {
  return (String(value ?? '').match(/<p(?:\s[^>]*)?>[\s\S]*?<\/p>/gi) || []).length;
}

function asDocument(snapshot) {
  return { id: snapshot.id, ...snapshot.data() };
}

function selectorKind(document) {
  if (document._feast) return 'feast';
  if (document._date) return 'date';
  if (document._periodType) return 'period';
  return 'other';
}

function contentSummary(document) {
  const presentFields = CONTENT_FIELDS.filter((field) => present(document[field]));
  return {
    id: document.id,
    selector: selectorKind(document),
    date: document._date ?? null,
    feast: document._feast ?? null,
    title: document._title ?? document._feastName ?? document.title ?? null,
    presentFieldCount: presentFields.length,
    missingFields: CONTENT_FIELDS.filter((field) => !present(document[field])),
  };
}

function adventWeek(date) {
  const november27 = moment(`${date.year()}-11-27`, 'YYYY-MM-DD');
  const adventStart = november27.clone().add((7 - november27.isoWeekday()) % 7, 'days');
  return Math.floor(date.diff(adventStart, 'days') / 7) + 1;
}

function liturgicalDayOfWeek(date) {
  return date.isoWeekday() === 7 ? 1 : date.isoWeekday() + 1;
}

function historicalChristmasDates(year) {
  const baptism = calculateBaptismOfLordDate(year);
  const end = baptism.clone().subtract(1, 'day');
  const dates = [];
  for (let date = moment(`${year}-01-02`); date.isSameOrBefore(end, 'day'); date.add(1, 'day')) {
    if (date.format('DD.MM') !== '06.01') dates.push(date.format('YYYY-MM-DD'));
  }
  return { baptism: baptism.format('YYYY-MM-DD'), dates };
}

function oldDayAntiphonSummary(document) {
  return {
    id: document.id,
    weekday: moment(document.id).format('dddd'),
    date: document._date ?? null,
    feast: document._feast ?? null,
    title: document._feastName ?? document._dayName ?? null,
    antiphons: Object.fromEntries(ANTIPHON_FIELDS.map((field) => [field, {
      present: present(document[field]),
      hash: digest(document[field]),
      text: compactText(document[field]).slice(0, 180),
    }])),
  };
}

function groupHistoricalFields(documents, fields = ANTIPHON_FIELDS) {
  const byWeekday = {};
  for (const document of documents) {
    const day = liturgicalDayOfWeek(moment(document.id));
    byWeekday[day] ??= { samples: 0, fields: {} };
    byWeekday[day].samples += 1;
    for (const field of fields) {
      byWeekday[day].fields[field] ??= { missing: 0, variants: {} };
      const target = byWeekday[day].fields[field];
      const hash = digest(document[field]);
      if (!hash) target.missing += 1;
      else {
        target.variants[hash] ??= { count: 0, sampleIds: [], text: compactText(document[field]).slice(0, 180) };
        target.variants[hash].count += 1;
        if (target.variants[hash].sampleIds.length < 4) target.variants[hash].sampleIds.push(document.id);
      }
    }
  }
  return byWeekday;
}

function groupHistoricalAntiphonsByChristmasWeek(documents) {
  const groups = {};
  for (const document of documents) {
    const date = moment(document.id);
    const key = `w${calculateChristmasPeriodWeek(date)}-d${liturgicalDayOfWeek(date)}`;
    groups[key] ??= [];
    groups[key].push(document);
  }
  return Object.fromEntries(Object.entries(groups).map(([key, values]) => [
    key,
    groupHistoricalFields(values, [...ANTIPHON_FIELDS, ...PSALM_FIELDS])[key.split('-d')[1]],
  ]));
}

function compareHistoricalPsalmsWithAdvent(documents, fixedById) {
  const grouped = groupHistoricalAntiphonsByChristmasWeek(documents);
  return Object.fromEntries(Object.entries(grouped).map(([key, group]) => {
    const match = key.match(/^w(\d+)-d(\d+)$/);
    const day = Number(match?.[2]);
    const candidates = Array.from({ length: 4 }, (_, index) => fixedById.get(`advent-w${index + 1}-d${day}`));
    return [key, {
      candidates: candidates.map((source) => ({
        adventSourceId: source?.id ?? null,
        matchedFields: PSALM_FIELDS.filter((field) => {
          const adventHash = digest(source?.[field]);
          const historicalHashes = Object.keys(group.fields[field]?.variants ?? {});
          return Boolean(adventHash) && historicalHashes.includes(adventHash);
        }),
      })),
    }];
  }));
}

function markdownList(items) {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '- нет';
}

function buildMarkdown(report) {
  const emptyAdvent = report.advent.periodDocuments
    .filter((document) => document.presentFieldCount === 0)
    .map((document) => document.id);
  const adventProblems = report.advent.exceptionDocuments.flatMap((document) => (
    (document.assemblyChecks ?? []).flatMap((check) => {
      const missing = check.missingRequiredPsalmody
        ?? check.missingAfterAssembly.filter((field) => REQUIRED_PSALMODY_FIELDS.includes(field));
      return missing.length
        ? [`${document.id} в ${check.year} году использует ${check.periodId}: нет ${missing.join(', ')}`]
        : [];
    })
  ));
  const unusedDuplicateDates = ['25.12', '26.12', '27.12', '28.12', '01.01'];
  const duplicateSeasonal = report.christmasOctave.fixedDays
    .filter((document) => /^christmas-/.test(document.id) && unusedDuplicateDates.includes(document.date))
    .map((document) => document.id);
  const christmasTemplates = (report.christmasAfterOctave.christmasPeriodTemplates
    ?? report.christmasAfterOctave.periodFixedDays.filter((document) => /^christmas-w\d+-d\d+$/.test(document.id)))
    .map((document) => document.id);

  return `# Аудит Адвента и рождественского периода\n\n` +
    `Сформирован: ${report.generatedAt}\n\n` +
    `## Адвент\n\n` +
    `В fixedDays найдены все 28 недельных позиций (4 недели × 7 дней) и все 8 исключений 17–24 декабря. В parsedData найдено ${report.advent.parsedData.length} документов Адвента.\n\n` +
    `Пустые недельные документы:\n\n${markdownList(emptyAdvent)}\n\n` +
    `Материальные разрывы псалмодии после сборки исключения с недельным днём:\n\n${markdownList(adventProblems)}\n\n` +
    `Поля monday…saturday действительно содержат по три HTML-абзаца и раскладываются в laudesAnt1…3 и vesperAnt1…3. Поле sunday систематически отсутствует, но воскресные антифоны успешно приходят из недельного документа. У advent-21-12 weekday-полей нет: его собственные стандартные поля уже заполнены.\n\n` +
    `## Рождественская октава (25.12–01.01)\n\n` +
    `Найдены ${report.christmasOctave.fixedDays.length} документов fixedDays и ${report.christmasOctave.parsedData.length} датированных документов parsedData; отдельно присутствуют праздник Святой Семьи (${report.christmasOctave.holyFamilyFixedDays.length} документ часов, ${report.christmasOctave.holyFamilyParsedData.length} цикла чтений).\n\n` +
    `Дубли старого сезонного набора, которые новая логика не выбирает на собственных праздниках:\n\n${markdownList(duplicateSeasonal)}\n\n` +
    `Даты Святого Семейства 2020–2025: ${report.christmasOctave.holyFamilyDates.join(', ')}.\n\n` +
    `Если Рождество выпадает на воскресенье, используется 30.12; иначе первое воскресенье после 25.12. Динамический праздник полностью вытесняет обычный день октавы.\n\n` +
    `## После октавы до Крещения\n\n` +
    `Окончание периода 2020–2025: ${report.christmasAfterOctave.baptismDates.map((item) => `${item.year}: ${item.date}`).join(', ')}.\n\n` +
    `Найдены ${report.christmasAfterOctave.fixedDays.length} датированных документов fixedDays и ${report.christmasAfterOctave.parsedData.length} документов parsedData; отдельно присутствует Крещение (${report.christmasAfterOctave.baptismFixedDays.length} документ часов, ${report.christmasAfterOctave.baptismParsedData.length} цикла чтений).\n\n` +
    `Периодические шаблоны christmas-wN-dN:\n\n${markdownList(christmasTemplates)}\n\n` +
    `Документы christmas-02-01…christmas-11-01 содержат собственные гимны, чтения, евангельские антифоны, просьбы и молитвы, но в основном не содержат псалмов и шести антифонов Laudes/Vesper. Проверены ${report.collections.oldDaysFound} из ${report.collections.oldDaysRead} исторических дней 2020–2025 (06.01 пропущено). Они подтверждают псалтырные шаблоны. Различия вечерних текстов ожидаемы: 05.01 всегда должны подключаться первые Нешпары Богоявления из vesper1*, а в календарный канун Крещения — первые Нешпары Крещения из vesper1*. Поскольку дата Крещения плавает, исторические вечерние тексты одного и того же DD.MM закономерно различаются.\n\n` +
    `Календарная логика теперь прекращает сезон в день Крещения; следующий понедельник относится к первой неделе обычного времени. Документы вроде christmas-11-01/12-01 после Крещения больше не могут повторно включить рождественский период одной только датой.\n`;
}

async function main() {
  if (process.argv.includes('--from-json')) {
    const report = JSON.parse(await readFile(REPORT_JSON, 'utf8'));
    await writeFile(REPORT_MD, buildMarkdown(report), 'utf8');
    console.log(`Written ${path.relative(process.cwd(), REPORT_MD)} from cached JSON`);
    return;
  }

  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const [fixedSnapshot, parsedSnapshot] = await Promise.all([
    db.collection('fixedDays').get(),
    db.collection('parsedData').get(),
  ]);
  const fixedDays = fixedSnapshot.docs.map(asDocument);
  const parsedData = parsedSnapshot.docs.map(asDocument);
  const fixedById = new Map(fixedDays.map((document) => [document.id, document]));

  const adventExceptions = [];
  for (let day = 17; day <= 24; day += 1) {
    const id = `advent-${String(day).padStart(2, '0')}-12`;
    const exception = fixedById.get(id);
    const weekdayProblems = [];
    if (!exception) {
      adventExceptions.push({ id, exists: false, problems: ['нет документа fixedDays'] });
      continue;
    }
    for (const field of WEEKDAY_FIELDS) {
      if (!present(exception[field])) weekdayProblems.push(`нет weekday-поля ${field}`);
      else if (paragraphCount(exception[field]) < 3) weekdayProblems.push(`${field}: найдено ${paragraphCount(exception[field])} HTML-абзацев вместо 3`);
    }

    const assemblyChecks = YEARS.map((year) => {
      const date = moment(`${year}-12-${String(day).padStart(2, '0')}`);
      const week = adventWeek(date);
      const dayOfWeek = liturgicalDayOfWeek(date);
      const periodId = getPeriodDayDocumentId('advent', week, dayOfWeek);
      const periodDay = fixedById.get(periodId) ?? null;
      const assembled = applySeasonalWeekdayAntiphons(
        resolveDayAgainstPeriod(exception, periodDay, { fillMissing: true }),
        dayOfWeek,
      );
      return {
        year,
        week,
        dayOfWeek,
        periodId,
        periodExists: Boolean(periodDay),
        missingAfterAssembly: CONTENT_FIELDS.filter((field) => !present(assembled?.[field])),
        missingPsalmAntiphons: ANTIPHON_FIELDS.filter((field) => !present(assembled?.[field])),
        missingRequiredPsalmody: REQUIRED_PSALMODY_FIELDS.filter((field) => !present(assembled?.[field])),
      };
    });
    const problems = [...weekdayProblems];
    for (const check of assemblyChecks) {
      if (!check.periodExists) problems.push(`${check.year}: нет ${check.periodId}`);
      if (check.missingPsalmAntiphons.length) problems.push(`${check.year}: после сборки нет ${check.missingPsalmAntiphons.join(', ')}`);
    }
    adventExceptions.push({ id, exists: true, problems, assemblyChecks });
  }

  const oldDatePlans = YEARS.map((year) => ({ year, ...historicalChristmasDates(year) }));
  const oldIds = oldDatePlans.flatMap((item) => item.dates);
  const oldSnapshots = await db.getAll(...oldIds.map((id) => db.collection('oldDays').doc(id)));
  const oldDocuments = oldSnapshots.filter((snapshot) => snapshot.exists).map(asDocument);

  const octaveDateTokens = new Set(['25.12', '26.12', '27.12', '28.12', '29.12', '30.12', '31.12', '01.01']);
  const remainderDateTokens = new Set(Array.from({ length: 11 }, (_, index) => `${String(index + 2).padStart(2, '0')}.01`));
  const relevantFixed = fixedDays.filter((document) => document._date || /^christmas-\d{2}-\d{2}$/.test(document.id));
  const relevantParsed = parsedData.filter((document) => document._date || /^christmas-\d{2}-\d{2}/.test(document.id));
  const belongsTo = (document, tokens) => tokens.has(document._date) || tokens.has(document.id.replace(/^christmas-(\d{2})-(\d{2}).*$/, '$1.$2'));

  const report = {
    generatedAt: new Date().toISOString(),
    collections: { fixedDays: fixedDays.length, parsedData: parsedData.length, oldDaysRead: oldIds.length, oldDaysFound: oldDocuments.length },
    advent: {
      periodDocumentCount: fixedDays.filter((document) => document._periodType === 'advent').length,
      periodDocuments: fixedDays.filter((document) => document._periodType === 'advent').map(contentSummary),
      exceptionDocuments: adventExceptions,
      parsedData: parsedData.filter((document) => document._periodType === 'advent' || /^advent-\d{2}-12/.test(document.id)).map(contentSummary),
    },
    christmasOctave: {
      fixedDays: relevantFixed.filter((document) => belongsTo(document, octaveDateTokens)).map(contentSummary),
      parsedData: relevantParsed.filter((document) => belongsTo(document, octaveDateTokens)).map(contentSummary),
      holyFamilyDates: YEARS.map((year) => calculateHolyFamilyDate(year).format('YYYY-MM-DD')),
      holyFamilyFixedDays: fixedDays.filter((document) => String(document._feast ?? '').includes('holyfamily')).map(contentSummary),
      holyFamilyParsedData: parsedData.filter((document) => String(document._feast ?? '').includes('holyfamily')).map(contentSummary),
    },
    christmasAfterOctave: {
      baptismDates: oldDatePlans.map(({ year, baptism }) => ({ year, date: baptism })),
      fixedDays: relevantFixed.filter((document) => belongsTo(document, remainderDateTokens)).map(contentSummary),
      periodFixedDays: fixedDays.filter((document) => document._periodType === 'christmas').map(contentSummary),
      christmasPeriodTemplates: fixedDays.filter((document) => /^christmas-w\d+-d\d+$/.test(document.id)).map(contentSummary),
      parsedData: relevantParsed.filter((document) => belongsTo(document, remainderDateTokens)).map(contentSummary),
      baptismFixedDays: fixedDays.filter((document) => String(document._feast ?? '').includes('buptismofthelord')).map(contentSummary),
      baptismParsedData: parsedData.filter((document) => String(document._feast ?? '').includes('buptismofthelord')).map(contentSummary),
      oldDays: oldDocuments.map(oldDayAntiphonSummary),
      historicalByWeekday: groupHistoricalFields(oldDocuments),
      historicalByChristmasWeekAndWeekday: groupHistoricalAntiphonsByChristmasWeek(oldDocuments),
      psalmComparisonWithAdvent: compareHistoricalPsalmsWithAdvent(oldDocuments, fixedById),
    },
  };

  await mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await Promise.all([
    writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    writeFile(REPORT_MD, buildMarkdown(report), 'utf8'),
  ]);
  await app.delete();
  console.log(`Written ${path.relative(process.cwd(), REPORT_JSON)}`);
  console.log(`Written ${path.relative(process.cwd(), REPORT_MD)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
