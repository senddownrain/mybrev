import { CANONICAL_FIXED_CALENDAR_DATES } from '../constants/liturgicalFixedCalendarDates.js';
import { FEAST_NAME_MAP } from '../constants/liturgicalFeastsMap.js';

export function normalizeDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  const match = str.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (!match) return null;
  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  return `${day}.${month}`;
}

export function isMissingReadingText(reading) {
  const text = String(reading?.text || '').trim().toLowerCase();
  return !text || text === 'чтения' || text === '<p>чтения</p>' || text.includes('чтения пока нету');
}

function indexByDate(items) {
  const map = new Map();
  items.forEach((item) => {
    const date = normalizeDate(item?._date);
    if (!date) return;
    const list = map.get(date) || [];
    list.push(item);
    map.set(date, list);
  });
  return map;
}

function hasField(obj, field) {
  return Object.prototype.hasOwnProperty.call(obj || {}, field);
}

export function auditFixedDates(readingsDocs = [], daysDocs = [], options = {}) {
  const dates = options.dates || CANONICAL_FIXED_CALENDAR_DATES;
  const readingsByDate = indexByDate(readingsDocs);
  const daysByDate = indexByDate(daysDocs);

  const report = {
    readings: { missing: [], existing: [] },
    days: { missing: [], existing: [] },
  };

  dates.forEach((date) => {
    const rItems = readingsByDate.get(date) || [];
    const dItems = daysByDate.get(date) || [];

    const readingsMissingNameRank = rItems.filter((item) => !String(item?.title || '').trim() || !hasField(item, 'rank'));
    const hasAnyValidReadingText = rItems.some((item) => !isMissingReadingText(item));

    if (!rItems.length) {
      report.readings.missing.push({ _date: date, reason: 'missing-date' });
    } else if (readingsMissingNameRank.length) {
      report.readings.missing.push({ _date: date, reason: 'missing-title-or-rank-field', count: readingsMissingNameRank.length });
    } else if (!hasAnyValidReadingText) {
      report.readings.missing.push({ _date: date, reason: 'missing-reading-text' });
    } else {
      report.readings.existing.push({ _date: date, count: rItems.length });
    }

    const daysMissingNameRank = dItems.filter((item) => !String(item?._feastName || item?.title || '').trim()
      || (!hasField(item, '_feastType') && !hasField(item, 'rank')));

    if (!dItems.length) {
      report.days.missing.push({ _date: date, reason: 'missing-date' });
    } else if (daysMissingNameRank.length) {
      report.days.missing.push({ _date: date, reason: 'missing-feastName-or-feastType-field', count: daysMissingNameRank.length });
    } else {
      report.days.existing.push({ _date: date, count: dItems.length });
    }
  });

  return report;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildPeriodKey(item) {
  const period = normalizeText(item?._periodType);
  const week = Number(item?._periodWeekNumber);
  const day = Number(item?._dayOfWeek);
  if (!period || !Number.isFinite(week) || !Number.isFinite(day)) return null;
  return `${period}|${week}|${day}`;
}

function buildDateRankKeyForReadings(item) {
  const date = normalizeDate(item?._date);
  if (!date) return null;
  const title = normalizeText(item?.title);
  const rank = normalizeText(item?.rank);
  const place = normalizeText(item?.place);
  return `${date}|${title}|${rank}|${place}`;
}

function buildDateRankKeyForDays(item) {
  const date = normalizeDate(item?._date);
  if (!date) return null;
  const title = normalizeText(item?._feastName || item?.title);
  const rank = normalizeText(item?._feastType || item?.rank);
  const place = normalizeText(item?._place || item?.place);
  return `${date}|${title}|${rank}|${place}`;
}

function setDiff(left, right) {
  return [...left].filter((item) => !right.has(item));
}

function toSet(items, keyBuilder) {
  const set = new Set();
  items.forEach((item) => {
    const key = keyBuilder(item);
    if (key) set.add(key);
  });
  return set;
}

export function auditCrossCollectionCoverage(readingsDocs = [], daysDocs = []) {
  const readingsPeriodSet = toSet(readingsDocs, buildPeriodKey);
  const daysPeriodSet = toSet(daysDocs, buildPeriodKey);

  const period = {
    inReadings: readingsPeriodSet.size,
    inDays: daysPeriodSet.size,
    missingInReadings: setDiff(daysPeriodSet, readingsPeriodSet),
    missingInDays: setDiff(readingsPeriodSet, daysPeriodSet),
  };

  const expectedFeasts = new Set(Object.values(FEAST_NAME_MAP).map((value) => normalizeText(value)));
  const readingsFeasts = new Set(readingsDocs.map((item) => normalizeText(item?._feast)).filter(Boolean));
  const daysFeasts = new Set(daysDocs.map((item) => normalizeText(item?._feast)).filter(Boolean));

  const dynamic = {
    expected: [...expectedFeasts],
    missingInReadings: setDiff(expectedFeasts, readingsFeasts),
    missingInDays: setDiff(expectedFeasts, daysFeasts),
  };

  const readingsDateRankSet = toSet(readingsDocs, buildDateRankKeyForReadings);
  const daysDateRankSet = toSet(daysDocs, buildDateRankKeyForDays);
  const fixedDateRank = {
    inReadings: readingsDateRankSet.size,
    inDays: daysDateRankSet.size,
    missingInReadings: setDiff(daysDateRankSet, readingsDateRankSet),
    missingInDays: setDiff(readingsDateRankSet, daysDateRankSet),
  };

  const dateCoverage = {
    expectedDates: CANONICAL_FIXED_CALENDAR_DATES.length,
    missingDatesInReadings: CANONICAL_FIXED_CALENDAR_DATES.filter((date) => !readingsDocs.some((item) => normalizeDate(item?._date) === date)),
    missingDatesInDays: CANONICAL_FIXED_CALENDAR_DATES.filter((date) => !daysDocs.some((item) => normalizeDate(item?._date) === date)),
  };

  return {
    generatedAt: new Date().toISOString(),
    period,
    dynamic,
    fixedDateRank,
    dateCoverage,
  };
}

function renderList(items, max = 50) {
  if (!items.length) return '- ✅ Нет';
  const head = items.slice(0, max).map((item) => `- ${item}`).join('\n');
  const tail = items.length > max ? `\n- ... (+${items.length - max})` : '';
  return `${head}${tail}`;
}

export function buildCoverageMarkdownReport(report) {
  return `# Литургический аудит (readings + days)

- Сформирован: ${report.generatedAt}

## 1) Period keys (_periodType + _periodWeekNumber + _dayOfWeek)

- Всего keys в readings: **${report.period.inReadings}**
- Всего keys в days: **${report.period.inDays}**
- Отсутствуют в readings (есть в days): **${report.period.missingInReadings.length}**
- Отсутствуют в days (есть в readings): **${report.period.missingInDays.length}**

### Missing in readings
${renderList(report.period.missingInReadings)}

### Missing in days
${renderList(report.period.missingInDays)}

## 2) Dynamic feast keys (_feast)

- Ожидается ключей: **${report.dynamic.expected.length}**
- Отсутствуют в readings: **${report.dynamic.missingInReadings.length}**
- Отсутствуют в days: **${report.dynamic.missingInDays.length}**

### Missing feast keys in readings
${renderList(report.dynamic.missingInReadings)}

### Missing feast keys in days
${renderList(report.dynamic.missingInDays)}

## 3) Fixed dates coverage (_date)

- Канонических дат: **${report.dateCoverage.expectedDates}**
- Нет дат в readings: **${report.dateCoverage.missingDatesInReadings.length}**
- Нет дат в days: **${report.dateCoverage.missingDatesInDays.length}**

### Missing dates in readings
${renderList(report.dateCoverage.missingDatesInReadings)}

### Missing dates in days
${renderList(report.dateCoverage.missingDatesInDays)}

## 4) Fixed date + title + rank + place parity (между коллекциями)

- Уникальных комбинаций в readings: **${report.fixedDateRank.inReadings}**
- Уникальных комбинаций в days: **${report.fixedDateRank.inDays}**
- Нет в readings (но есть в days): **${report.fixedDateRank.missingInReadings.length}**
- Нет в days (но есть в readings): **${report.fixedDateRank.missingInDays.length}**

### Missing combinations in readings
${renderList(report.fixedDateRank.missingInReadings)}

### Missing combinations in days
${renderList(report.fixedDateRank.missingInDays)}
`;
}
