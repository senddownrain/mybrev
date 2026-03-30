#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { auditFixedDates } from '../src/utils/liturgicalAudit.js';

function parseArgs(argv) {
  const args = { readings: '', days: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--readings') args.readings = argv[i + 1] || '';
    if (token === '--days') args.days = argv[i + 1] || '';
  }
  return args;
}

async function readJsonArray(filePath) {
  const absolute = path.resolve(process.cwd(), filePath);
  const raw = await fs.readFile(absolute, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.readings || !args.days) {
    console.error('Usage: npm run audit:cli -- --readings ./readings.json --days ./days.json');
    process.exit(2);
  }

  const [readings, days] = await Promise.all([
    readJsonArray(args.readings),
    readJsonArray(args.days),
  ]);

  const report = auditFixedDates(readings, days);
  const readingsMissing = report.readings.missing.length;
  const daysMissing = report.days.missing.length;

  console.log(`Readings missing fixed-date checks: ${readingsMissing}`);
  console.log(`Days missing fixed-date checks: ${daysMissing}`);

  if (readingsMissing || daysMissing) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
}

main();
