#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import admin from 'firebase-admin';
import { fixedCalendar } from '../src/constants/fixedCalendar.js';
import { FEAST_NAME_MAP } from '../src/constants/liturgicalFeastsMap.js';
import { PERIOD_LABEL_MAP, WEEKDAY_LABEL_MAP } from '../src/constants/liturgical.js';
import { normalizeFeastCode } from '../src/utils/parsedReadingsIdentity.js';

const require = createRequire(import.meta.url);
const serviceAccount = require('../patchs/serviceAccountKey.json');

const PARSED_COLLECTION = 'parsedData';
const READINGS_COLLECTION = 'readings';
const DEFAULT_OUTPUT_PATH = 'reports/parsed-data-catalog.json';

const PERIOD_TITLE_MAP = {
  ordinary: 'звычайнага перыяду',
  advent: 'Адвэнту',
  lent: 'Вялікага посту',
  easter: 'велікоднага перыяду',
  christmas: 'перыяду Божага Нараджэння',
  holyweek: 'Вялікага тыдня',
};

const EXPECTED_PERIOD_WEEKS = {
  ordinary: [1, 34],
  advent: [1, 4],
  lent: [1, 5],
  easter: [1, 7],
  christmas: [1, 2],
  holyweek: [1, 1],
};

function cleanGospelText(value) {
  if (typeof value !== 'string') return value;

  return value
    .replace(/^\s*У той час:\s*/u, '')
    .replace(/\s*Гэта слова Пана\.\s*$/u, '')
    .trim();
}

function present(value) {
  return value !== undefined && value !== null && value !== '';
}

function selectorKey(item) {
  if (present(item._date)) return `date:${String(item._date).trim()}`;
  if (present(item._feast)) return `feast:${normalizeFeastCode(item._feast)}`;
  if (present(item._periodType)) {
    const week = present(item._periodWeekNumber) ? Number(item._periodWeekNumber) : 0;
    const day = present(item._dayOfWeek) ? Number(item._dayOfWeek) : 0;
    return `period:${String(item._periodType).trim().toLowerCase()}:w${week}:d${day}`;
  }
  return null;
}

function readingSourceView(item) {
  return {
    _id: item._id,
    title: item.title,
    hasText: item.hasText,
    hasGospelHeading: item.hasGospelHeading,
  };
}

function normalizedTitle(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('be')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function pickExportFields(documentId, data) {
  const result = { _id: documentId };

  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('_')) result[key] = value;
  }

  if (Object.hasOwn(data, 'year')) result.year = data.year;
  if (Object.hasOwn(data, 'title')) result.title = data.title;

  if (data.gospel && typeof data.gospel === 'object') {
    const gospel = {};
    if (Object.hasOwn(data.gospel, 'bible')) gospel.bible = data.gospel.bible;
    if (Object.hasOwn(data.gospel, 'text')) gospel.text = cleanGospelText(data.gospel.text);
    if (Object.keys(gospel).length > 0) result.gospel = gospel;
  }

  return result;
}

function groupBy(items, getKey) {
  const groups = new Map();

  for (const item of items) {
    const key = getKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  return groups;
}

function romanNumeral(value) {
  const numerals = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let number = Number(value);
  let result = '';

  if (!Number.isInteger(number) || number < 1 || number > 39) return String(value ?? '');

  for (const [amount, numeral] of numerals) {
    while (number >= amount) {
      result += numeral;
      number -= amount;
    }
  }

  return result;
}

function lowerFirst(value) {
  const text = String(value ?? '');
  return text ? `${text[0].toLocaleLowerCase('be')}${text.slice(1)}` : text;
}

function buildPeriodTitle(periodType, weekNumber, dayOfWeek) {
  const periodLabel = PERIOD_TITLE_MAP[periodType]
    ?? lowerFirst(PERIOD_LABEL_MAP[periodType] ?? periodType);
  const weekdayLabel = lowerFirst(WEEKDAY_LABEL_MAP[dayOfWeek] ?? dayOfWeek);

  if (weekNumber === null || weekNumber === undefined || weekNumber === '') {
    return `${periodLabel}, ${weekdayLabel}`;
  }

  return `${romanNumeral(weekNumber)} тыдзень ${periodLabel}, ${weekdayLabel}`;
}

function sortReadings(readings) {
  return [...readings].sort((left, right) => {
    const leftKey = `${String(left.year ?? '').padStart(4, '0')}\u0000${left._id}`;
    const rightKey = `${String(right.year ?? '').padStart(4, '0')}\u0000${right._id}`;
    return leftKey.localeCompare(rightKey);
  });
}

function buildFixedItems(parsedData, readingDocuments = []) {
  const readingsByDate = groupBy(
    parsedData.filter((item) => item._date),
    (item) => item._date,
  );
  const calendarByDate = groupBy(fixedCalendar, (item) => item.date);
  const sourcesByDate = groupBy(
    readingDocuments.filter((item) => item._date),
    (item) => item._date,
  );

  return [...calendarByDate.entries()].map(([date, days]) => {
    const matchedSources = sourcesByDate.get(date) ?? [];

    return {
      type: 'fixed',
      _date: date,
      days: days.map(({ title, rank, place }) => ({
        title,
        rank,
        place,
        readingSourceIds: matchedSources
          .filter((source) => normalizedTitle(source.title) === normalizedTitle(title))
          .map((source) => source._id),
      })),
      readingSources: matchedSources.map(readingSourceView),
      readings: sortReadings(readingsByDate.get(date) ?? []),
    };
  });
}

function buildMovableItems(parsedData, titleDocuments) {
  const readingsByFeast = groupBy(
    parsedData.filter((item) => item._feast),
    (item) => normalizeFeastCode(item._feast),
  );
  const titlesByFeast = groupBy(
    titleDocuments.filter((item) => item._feast),
    (item) => normalizeFeastCode(item._feast),
  );
  const feastKeysByCode = new Map();

  for (const [key, rawCode] of Object.entries(FEAST_NAME_MAP)) {
    const code = normalizeFeastCode(rawCode);
    if (!feastKeysByCode.has(code)) feastKeysByCode.set(code, []);
    feastKeysByCode.get(code).push(key);
  }

  return [...feastKeysByCode.entries()].map(([feast, feastKeys]) => {
    const matchedSources = titlesByFeast.get(feast) ?? [];
    const titleSources = matchedSources
      .filter((item) => item.title)
      .map(({ _id, title }) => ({ _id, title }));
    const uniqueTitles = [...new Set(titleSources.map((item) => item.title))];

    return {
      type: 'movable',
      _feast: feast,
      feastKeys,
      title: uniqueTitles[0] ?? null,
      ...(uniqueTitles.length > 1 ? { titles: uniqueTitles } : {}),
      titleSources,
      readingSources: matchedSources.map(readingSourceView),
      readings: sortReadings(readingsByFeast.get(feast) ?? []),
    };
  });
}

function periodKey(item) {
  const week = present(item._periodWeekNumber) ? Number(item._periodWeekNumber) : 0;
  const day = present(item._dayOfWeek) ? Number(item._dayOfWeek) : 0;
  return `${item._periodType}\u0000${week}\u0000${day}`;
}

function buildPeriodItems(parsedData, readingDocuments = []) {
  const groups = groupBy(
    parsedData.filter((item) => item._periodType),
    periodKey,
  );
  const sourcesByPeriod = groupBy(
    readingDocuments.filter((item) => item._periodType),
    periodKey,
  );
  const expectedSelectors = expectedPeriodCombinations();
  const expectedKeys = new Set(expectedSelectors.map(periodKey));
  const extraSelectors = [...groups.values()]
    .map((readings) => readings[0])
    .filter((item) => !expectedKeys.has(periodKey(item)))
    .map(({ _periodType, _periodWeekNumber, _dayOfWeek }) => ({
      _periodType,
      _periodWeekNumber,
      _dayOfWeek,
    }));

  return expectedSelectors
    .concat(extraSelectors)
    .map(({ _periodType, _periodWeekNumber, _dayOfWeek }) => {
      const readings = groups.get(periodKey({ _periodType, _periodWeekNumber, _dayOfWeek })) ?? [];
      return {
        type: 'period',
        _periodType,
        _periodWeekNumber,
        _dayOfWeek,
        title: buildPeriodTitle(_periodType, _periodWeekNumber, _dayOfWeek),
        readingSources: (sourcesByPeriod.get(periodKey({
          _periodType,
          _periodWeekNumber,
          _dayOfWeek,
        })) ?? []).map(readingSourceView),
        readings: sortReadings(readings),
      };
    })
    .sort((left, right) =>
      String(left._periodType).localeCompare(String(right._periodType))
      || Number(left._periodWeekNumber ?? 0) - Number(right._periodWeekNumber ?? 0)
      || Number(left._dayOfWeek ?? 0) - Number(right._dayOfWeek ?? 0),
    );
}

function expectedPeriodCombinations() {
  const result = [];

  for (const [periodType, [firstWeek, lastWeek]] of Object.entries(EXPECTED_PERIOD_WEEKS)) {
    for (let weekNumber = firstWeek; weekNumber <= lastWeek; weekNumber += 1) {
      for (let dayOfWeek = 1; dayOfWeek <= 7; dayOfWeek += 1) {
        result.push({
          _periodType: periodType,
          _periodWeekNumber: weekNumber,
          _dayOfWeek: dayOfWeek,
        });
      }
    }
  }

  return result;
}

function buildReport(parsedData, fixedItems, movableItems, periodItems, readingDocuments) {
  const fixedDates = new Set(fixedItems.map((item) => item._date));
  const movableFeasts = new Set(movableItems.map((item) => item._feast));
  const expectedPeriodKeys = new Set(expectedPeriodCombinations().map(periodKey));
  const expectedMissingPeriods = periodItems
    .filter((item) => expectedPeriodKeys.has(periodKey(item)) && item.readings.length === 0)
    .map(({ _periodType, _periodWeekNumber, _dayOfWeek, title }) => ({
      _periodType,
      _periodWeekNumber,
      _dayOfWeek,
      title,
    }));
  const years = [...new Set(
    parsedData.map((item) => item.year).filter((value) => value !== undefined),
  )].sort((left, right) => String(left).localeCompare(String(right)));
  const readingIds = new Set(readingDocuments.map((item) => item._id));
  const parsedSourceIds = new Set(parsedData.map((item) => item._sourceId).filter(Boolean));
  const readingSelectors = new Set(readingDocuments.map(selectorKey).filter(Boolean));
  const parsedSelectors = new Set(parsedData.map(selectorKey).filter(Boolean));
  const selectorsOnlyInReadings = [...readingSelectors]
    .filter((selector) => !parsedSelectors.has(selector))
    .sort();
  const selectorsOnlyInParsedData = [...parsedSelectors]
    .filter((selector) => !readingSelectors.has(selector))
    .sort();

  return {
    generatedAt: new Date().toISOString(),
    source: {
      parsedCollection: PARSED_COLLECTION,
      parsedDocuments: parsedData.length,
      readingsCollection: READINGS_COLLECTION,
      readingDocuments: readingDocuments.length,
      movableTitleDocuments: readingDocuments
        .filter((item) => item._feast && item.title)
        .length,
      yearValues: years,
    },
    output: {
      totalItems: fixedItems.length + movableItems.length + periodItems.length,
      fixedDates: fixedItems.length,
      movableFeasts: movableItems.length,
      periodCombinations: periodItems.length,
      readingVariants: fixedItems.concat(movableItems, periodItems)
        .reduce((sum, item) => sum + item.readings.length, 0),
    },
    coverage: {
      fixedDatesWithReadings: fixedItems.filter((item) => item.readings.length > 0).length,
      fixedDatesWithReadingSource: fixedItems.filter((item) => item.readingSources.length > 0).length,
      fixedDatesWithReadingSourceButWithoutParsedGospel: fixedItems
        .filter((item) => item.readingSources.length > 0 && item.readings.length === 0)
        .length,
      fixedDatesTotal: fixedItems.length,
      fixedCalendarDaysMatchedToReadingSource: fixedItems
        .flatMap((item) => item.days)
        .filter((day) => day.readingSourceIds.length > 0)
        .length,
      fixedCalendarDaysTotal: fixedItems.reduce((sum, item) => sum + item.days.length, 0),
      movableFeastsWithReadings: movableItems.filter((item) => item.readings.length > 0).length,
      movableFeastsWithReadingSource: movableItems
        .filter((item) => item.readingSources.length > 0)
        .length,
      movableFeastsWithTitle: movableItems.filter((item) => item.title).length,
      movableFeastsTotal: movableItems.length,
      periodCombinationsWithReadings: periodItems.filter((item) => item.readings.length > 0).length,
      periodCombinationsWithReadingSource: periodItems
        .filter((item) => item.readingSources.length > 0)
        .length,
      periodCombinationsTotal: periodItems.length,
      parsedReadingsWithBible: parsedData.filter((item) => item.gospel?.bible).length,
      parsedReadingsWithText: parsedData.filter((item) => item.gospel?.text).length,
      parsedReadingsWithNonEmptyYear: parsedData
        .filter((item) => Object.hasOwn(item, 'year') && item.year !== null && item.year !== '')
        .length,
    },
    missing: {
      fixedDatesWithoutReadings: fixedItems
        .filter((item) => item.readings.length === 0)
        .map((item) => item._date),
      fixedDatesWithoutAnyReadingSource: fixedItems
        .filter((item) => item.readingSources.length === 0)
        .map((item) => item._date),
      fixedDatesWithReadingSourceButWithoutParsedGospel: fixedItems
        .filter((item) => item.readingSources.length > 0 && item.readings.length === 0)
        .map((item) => item._date),
      fixedCalendarDaysWithoutReadingSource: fixedItems.flatMap((item) =>
        item.days
          .filter((day) => day.readingSourceIds.length === 0)
          .map((day) => ({ _date: item._date, title: day.title }))
      ),
      movableFeastsWithoutReadings: movableItems
        .filter((item) => item.readings.length === 0)
        .map((item) => item._feast),
      movableFeastsWithoutTitle: movableItems
        .filter((item) => !item.title)
        .map((item) => item._feast),
      expectedPeriodCombinationsWithoutReadings: expectedMissingPeriods,
      readingsWithoutBible: parsedData
        .filter((item) => !item.gospel?.bible)
        .map((item) => item._id),
      readingsWithoutText: parsedData
        .filter((item) => !item.gospel?.text)
        .map((item) => item._id),
      readingsWithoutYear: parsedData
        .filter((item) => !Object.hasOwn(item, 'year') || item.year === null || item.year === '')
        .map((item) => item._id),
    },
    crossCollection: {
      readingSelectors: readingSelectors.size,
      parsedSelectors: parsedSelectors.size,
      selectorsInBoth: [...parsedSelectors]
        .filter((selector) => readingSelectors.has(selector))
        .length,
      selectorsOnlyInReadings,
      selectorsOnlyInParsedData,
      parsedDocumentsLinkedBySourceId: parsedData
        .filter((item) => item._sourceId && readingIds.has(item._sourceId))
        .length,
      parsedDocumentsWithUnknownSourceId: parsedData
        .filter((item) => item._sourceId && !readingIds.has(item._sourceId))
        .map((item) => ({ _id: item._id, _sourceId: item._sourceId })),
      readingDocumentsReferencedByParsedData: readingDocuments
        .filter((item) => parsedSourceIds.has(item._id))
        .length,
      readingDocumentsWithGospelHeading: readingDocuments
        .filter((item) => item.hasGospelHeading)
        .length,
      readingOnlySelectorsWithGospelHeading: selectorsOnlyInReadings.filter((selector) =>
        readingDocuments.some((item) => selectorKey(item) === selector && item.hasGospelHeading)
      ),
    },
    unmatched: {
      parsedFixedDatesOutsideCalendar: [...new Set(
        parsedData.filter((item) => item._date && !fixedDates.has(item._date)).map((item) => item._date),
      )].sort(),
      parsedMovableFeastsOutsideMap: [...new Set(
        parsedData
          .filter((item) => item._feast && !movableFeasts.has(normalizeFeastCode(item._feast)))
          .map((item) => normalizeFeastCode(item._feast)),
      )].sort(),
      parsedDocumentsWithoutSelector: parsedData
        .filter((item) => !item._date && !item._feast && !item._periodType)
        .map((item) => item._id),
    },
    notes: {
      periodMatrix: 'Проверка строит полную матрицу 7 дней для диапазонов недель каждого периода. Некоторые пропуски ожидаемо представлены отдельными фиксированными или движимыми праздниками.',
      textCleanup: 'Удалены только вводная фраза «У той час:» в начале и «Гэта слова Пана.» в конце gospel.text.',
    },
  };
}

async function loadReadingDocuments(db) {
  const snapshot = await db.collection(READINGS_COLLECTION).get();

  return snapshot.docs.map((document) => {
    const data = document.data();
    return {
      _id: document.id,
      _date: data._date ?? null,
      _feast: data._feast ?? null,
      _periodType: data._periodType ?? null,
      _periodWeekNumber: data._periodWeekNumber ?? null,
      _dayOfWeek: data._dayOfWeek ?? null,
      title: data.title ?? null,
      hasText: typeof data.text === 'string' && data.text.trim().length > 0,
      hasGospelHeading: typeof data.text === 'string'
        && /ЕВАНГЕЛ|ЭВАНГЕЛ/u.test(data.text.toUpperCase()),
    };
  });
}

function reportPathFor(outputPath) {
  const extension = path.extname(outputPath);
  const base = extension ? outputPath.slice(0, -extension.length) : outputPath;
  return `${base}-report${extension || '.json'}`;
}

async function main() {
  const outputPath = path.resolve(process.argv[2] ?? DEFAULT_OUTPUT_PATH);
  const reportPath = reportPathFor(outputPath);

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

  const db = admin.firestore();
  const [parsedSnapshot, readingDocuments] = await Promise.all([
    db.collection(PARSED_COLLECTION).get(),
    loadReadingDocuments(db),
  ]);
  const parsedData = parsedSnapshot.docs.map((document) =>
    pickExportFields(document.id, document.data()),
  );
  const fixedItems = buildFixedItems(parsedData, readingDocuments);
  const movableItems = buildMovableItems(parsedData, readingDocuments);
  const periodItems = buildPeriodItems(parsedData, readingDocuments);
  const result = [...fixedItems, ...movableItems, ...periodItems];
  const report = buildReport(parsedData, fixedItems, movableItems, periodItems, readingDocuments);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await Promise.all([
    writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8'),
    writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
  ]);

  console.log(`Exported ${result.length} catalog items to ${outputPath}`);
  console.log(`Wrote coverage report to ${reportPath}`);
  console.log(JSON.stringify(report.output, null, 2));
}

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  main().catch((error) => {
    console.error('Failed to export parsedData catalog:', error);
    process.exitCode = 1;
  });
}

export {
  buildFixedItems,
  buildMovableItems,
  buildPeriodItems,
  buildPeriodTitle,
  buildReport,
  cleanGospelText,
  pickExportFields,
};
