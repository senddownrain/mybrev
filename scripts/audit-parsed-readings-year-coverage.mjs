#!/usr/bin/env node

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';
import moment from '../src/utils/moment-be.js';
import {
  calculateBaptismOfLordDate,
  calculateHolyFamilyDate,
  computeLiturgicalContext,
  getDynamicFeastCodesForDate,
} from '../src/utils/liturgicalCalendar.js';
import {
  canonicalizeLegacyReadingMetadata,
  hasReadingDocumentContent,
  normalizeFeastCode,
  normalizeReadingCycle,
  selectCalendarDayVariants,
  selectReadingLectionaryVariants,
} from '../src/utils/parsedReadingsIdentity.js';
import {
  isChristmasDateExceptionExclusion,
  isSeasonalDateException,
} from '../src/utils/liturgicalDayResolution.js';

const require = createRequire(import.meta.url);
const serviceAccount = require('../patchs/serviceAccountKey.json');
const OUTPUT = path.resolve('reports/parsed-readings-year-coverage-audit.json');

function getMoment(value) {
  return moment(value, 'YYYY-MM-DD');
}

function buildDynamicDates(year, options) {
  const easter = getMoment(options.easterSunday);
  const pentecost = getMoment(options.pentecost);
  const firstAdventSunday = getMoment(options.firstAdventSunday);
  const holyTrinity = pentecost.clone().add(7, 'days');
  const configuredAscension = getMoment(options.ascension);
  const configuredCorpusChristi = getMoment(options.corpusChristi);
  const sacredHeartOfJesus = pentecost.clone().add(19, 'days');
  return {
    ashWednesday: getMoment(options.ashWednesday),
    palmSunday: easter.clone().subtract(7, 'days'),
    easterSunday: easter,
    pentecost,
    maryMotherChurch: pentecost.clone().add(1, 'day'),
    ascension: configuredAscension.isValid()
      ? configuredAscension
      : pentecost.clone().subtract(7, 'days'),
    holyTrinity,
    corpusChristi: configuredCorpusChristi.isValid()
      ? configuredCorpusChristi
      : holyTrinity.clone().add(4, 'days'),
    holyFamily: calculateHolyFamilyDate(Number(year)),
    baptismOfLord: calculateBaptismOfLordDate(Number(year)),
    christKing: firstAdventSunday.clone().subtract(7, 'days'),
    sacredHeartOfJesus,
    immaculateHeartOfMary: sacredHeartOfJesus.clone().add(1, 'day'),
    christTheHighPriest: pentecost.clone().add(4, 'days'),
  };
}

function cycleForLiturgicalYear(liturgicalYear, sunday) {
  if (sunday) {
    const index = ((liturgicalYear - 2025) % 3 + 3) % 3;
    return ['C', 'A', 'B'][index];
  }
  return ((liturgicalYear - 2025) % 2 + 2) % 2 === 0 ? '1' : '2';
}

function dateCycles(date, options, dayOfWeek) {
  const firstAdvent = getMoment(options.firstAdventSunday);
  const liturgicalYear = date.isSameOrAfter(firstAdvent, 'day') ? date.year() + 1 : date.year();
  return {
    cycle: cycleForLiturgicalYear(liturgicalYear, Number(dayOfWeek) === 1),
    sundayCycle: cycleForLiturgicalYear(liturgicalYear, true),
  };
}

function byDate(documents, value) {
  return documents.filter((document) => document._date === value);
}

function byFeasts(documents, codes) {
  const wanted = new Set(codes.map(normalizeFeastCode));
  return documents.filter((document) => wanted.has(normalizeFeastCode(document._feast)));
}

function byPeriod(documents, context) {
  return documents.filter((document) => document._periodType === context.periodType
    && Number(document._periodWeekNumber) === Number(context.periodWeek)
    && Number(document._dayOfWeek) === Number(context.dayOfWeek));
}

function resolveReadings(date, context, dynamicCodes, documents) {
  const cycles = dateCycles(date, context.options, context.dayOfWeek);
  const select = (items) => selectReadingLectionaryVariants(items, cycles);

  const dynamic = select(byFeasts(documents, dynamicCodes));
  if (dynamic.length) return { source: 'dynamic', documents: dynamic, ...cycles };

  const dateValue = date.format('DD.MM');
  const dateDocuments = select(selectCalendarDayVariants(byDate(documents, dateValue), context.dayOfWeek));
  const fixedDateOnly = isSeasonalDateException(date, context.periodType)
    || isChristmasDateExceptionExclusion(date);
  if (fixedDateOnly && dateDocuments.length) {
    return { source: 'seasonal-date', documents: dateDocuments, ...cycles };
  }

  const periodDocuments = select(byPeriod(documents, context));
  if (dateDocuments.length) {
    return { source: 'fixed-date+period', documents: [...dateDocuments, ...periodDocuments], ...cycles };
  }
  return { source: periodDocuments.length ? 'period' : 'missing', documents: periodDocuments, ...cycles };
}

function compactDateResult(date, context, dynamicCodes, resolved) {
  return {
    date: date.format('YYYY-MM-DD'),
    selector: `period:${context.periodType}:w${context.periodWeek}:d${context.dayOfWeek}`,
    dynamicFeasts: dynamicCodes,
    cycle: resolved.cycle,
    sundayCycle: resolved.sundayCycle,
    source: resolved.source,
    documentIds: resolved.documents.map((document) => document.id),
  };
}

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const [parsedSnapshot, optionsSnapshot] = await Promise.all([
    db.collection('parsedData').get(),
    db.collection('yearOptions').get(),
  ]);
  const documents = parsedSnapshot.docs
    .map((snapshot) => ({ id: snapshot.id, ...canonicalizeLegacyReadingMetadata(snapshot.data()) }))
    .map((document) => document.id === 'bn-4565'
      ? { ...document, _calendarDayOfWeek: 1, _variant: 'sunday' }
      : document)
    .filter(hasReadingDocumentContent);
  const optionsByYear = new Map(optionsSnapshot.docs.map((snapshot) => {
    const data = snapshot.data();
    return [Number(data.year), data];
  }));

  const years = [...optionsByYear.keys()].sort((left, right) => left - right);
  const yearReports = [];
  for (const year of years) {
    const options = optionsByYear.get(year);
    const nextOptions = optionsByYear.get(year + 1) ?? null;
    const dynamicDates = buildDynamicDates(year, options);
    const missing = [];
    const selectedCycleMismatches = [];
    const sourceCounts = {};
    let coveredDays = 0;

    for (let date = moment(`${year}-01-01`, 'YYYY-MM-DD'); date.year() === year; date.add(1, 'day')) {
      const current = date.clone();
      const context = computeLiturgicalContext(current, options, nextOptions, dynamicDates);
      context.options = options;
      const dynamicCodes = getDynamicFeastCodesForDate(current, dynamicDates);
      const resolved = resolveReadings(current, context, dynamicCodes, documents);
      sourceCounts[resolved.source] = (sourceCounts[resolved.source] ?? 0) + 1;
      if (!resolved.documents.length) {
        missing.push(compactDateResult(current, context, dynamicCodes, resolved));
        continue;
      }
      coveredDays += 1;

      const cycles = [...new Set(resolved.documents.map((document) => normalizeReadingCycle(document.year)).filter(Boolean))];
      const invalid = cycles.filter((cycle) => ['A', 'B', 'C'].includes(cycle)
        ? cycle !== resolved.sundayCycle
        : cycle !== resolved.cycle);
      if (invalid.length) {
        selectedCycleMismatches.push({
          ...compactDateResult(current, context, dynamicCodes, resolved),
          selectedCycles: cycles,
        });
      }
    }

    const totalDays = moment(`${year}-12-31`, 'YYYY-MM-DD').dayOfYear();
    yearReports.push({
      year,
      totalDays,
      coveredDays,
      coveragePercent: Number(((coveredDays / totalDays) * 100).toFixed(3)),
      sourceCounts,
      missing,
      selectedCycleMismatches,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    state: 'virtual canonical metadata with empty placeholders excluded',
    counts: {
      parsedDocuments: parsedSnapshot.size,
      usableDocuments: documents.length,
      years: years.length,
      calendarDays: yearReports.reduce((sum, year) => sum + year.totalDays, 0),
      coveredDays: yearReports.reduce((sum, year) => sum + year.coveredDays, 0),
      missingDays: yearReports.reduce((sum, year) => sum + year.missing.length, 0),
      selectedCycleMismatches: yearReports.reduce((sum, year) => sum + year.selectedCycleMismatches.length, 0),
    },
    years: yearReports,
  };
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report.counts, null, 2));
  for (const year of yearReports) {
    console.log(`${year.year}: ${year.coveredDays}/${year.totalDays}, missing=${year.missing.length}, cycle=${year.selectedCycleMismatches.length}`);
  }
  console.log(`Wrote ${OUTPUT}`);
  await admin.app().delete();
}

main().catch((error) => {
  console.error('parsedData year coverage audit failed:', error);
  process.exitCode = 1;
});
