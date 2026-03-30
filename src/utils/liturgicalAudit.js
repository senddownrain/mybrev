import { CANONICAL_FIXED_CALENDAR_DATES } from '../constants/liturgicalFixedCalendarDates.js';

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
