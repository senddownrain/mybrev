#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fixedCalendar } from '../src/constants/fixedCalendar.js';
import {
  buildFixedComparisonKey,
  buildFixedDayId,
  normalizeFixedFeast,
  normalizePlaces,
  normalizeRank,
} from '../src/utils/fixedFeasts.js';

const ROOT = process.cwd();
const FEASTS_DIR = path.join(ROOT, 'patchs/feasts');
const TEMPLATES_DIR = path.join(FEASTS_DIR, 'common-texts');

function countBy(items, getKey, getTitle) {
  const result = new Map();
  items.forEach((item) => {
    const key = getKey(item);
    const current = result.get(key) || { count: 0, _feastName: getTitle(item) };
    current.count += 1;
    result.set(key, current);
  });
  return result;
}

function multisetDifference(left, right) {
  return [...left.entries()].flatMap(([key, entry]) => {
    const difference = entry.count - (right.get(key)?.count || 0);
    return difference > 0 ? [{ key, count: difference, _feastName: entry._feastName }] : [];
  });
}

function normalizedTitle(item) {
  return String(item._title ?? item._feastName ?? item.title ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function aggregateCalendarPlaces(items) {
  const groups = new Map();
  items.forEach((item) => {
    const identity = [item.date, normalizeRank(item.rank), normalizedTitle(item)].join('|');
    const current = groups.get(identity) || { ...item, _place: [] };
    current._place.push(...normalizePlaces(item.place));
    current._place = [...new Set(current._place)].sort();
    groups.set(identity, current);
  });
  return [...groups.values()];
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function main() {
  const strict = process.argv.includes('--strict');
  const names = (await fs.readdir(FEASTS_DIR))
    .filter((name) => name.endsWith('.json'))
    .sort();
  const feasts = await Promise.all(names.map(async (file) => ({
    file,
    raw: await readJson(path.join(FEASTS_DIR, file)),
  })));
  const templateNames = new Set(
    (await fs.readdir(TEMPLATES_DIR))
      .filter((name) => name.endsWith('.json') && name !== 'manifest.json')
      .map((name) => path.basename(name, '.json')),
  );

  const calendarEntries = aggregateCalendarPlaces(fixedCalendar);
  const calendarCounts = countBy(
    calendarEntries,
    buildFixedComparisonKey,
    (item) => item.title,
  );
  const feastCounts = countBy(
    feasts,
    ({ raw }) => buildFixedComparisonKey(raw),
    ({ raw }) => raw._title ?? raw._feastName ?? '',
  );
  const invalid = [];
  const ids = new Map();
  const missingTemplates = [];

  feasts.forEach(({ file, raw }) => {
    const slug = path.basename(file, '.json').replace(/^\d{2}-\d{2}-/, '');
    const normalized = normalizeFixedFeast(raw);
    const id = buildFixedDayId(normalized, slug);
    const errors = [];
    if (!normalized._date) errors.push('invalid _date');
    if (!normalizeRank(raw._rank)) errors.push(`unknown _rank: ${raw._rank}`);
    if (raw._place && !normalizePlaces(raw._place).length) errors.push(`unknown _place: ${raw._place}`);
    if (!normalized._title) errors.push('missing _title/_feastName');
    if (!id) errors.push('cannot build id');
    if (errors.length) invalid.push({ file, errors });
    if (id) {
      if (!ids.has(id)) ids.set(id, []);
      ids.get(id).push(file);
    }
    normalized._templates.forEach((template) => {
      if (!templateNames.has(template)) missingTemplates.push({ file, template });
    });
  });

  const report = {
    summary: {
      calendarEntries: fixedCalendar.length,
      aggregatedCalendarEntries: calendarEntries.length,
      feastFiles: feasts.length,
      templateFiles: templateNames.size,
    },
    missingInFeasts: multisetDifference(calendarCounts, feastCounts),
    extraInFeasts: multisetDifference(feastCounts, calendarCounts),
    duplicateIds: [...ids.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([id, files]) => ({ id, files })),
    missingTemplates,
    invalid,
  };

  console.log(JSON.stringify(report, null, 2));
  if (strict && (report.duplicateIds.length || report.missingTemplates.length || report.invalid.length)) {
    process.exitCode = 1;
  }
}

main();
