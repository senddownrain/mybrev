#!/usr/bin/env node
/** Guard ALL Firebase Hosting deploy entrypoints against a missing/stale catalog. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePublicPrayerCatalog } from '../src/utils/publicPrayerCatalog.mjs';

export function verifyHostingCatalog(catalog, now = Date.now()) {
  validatePublicPrayerCatalog(catalog);
  if (catalog.prayers.length < 50 || catalog.categories.length < 1) {
    throw new Error('Public prayer catalog is unexpectedly small');
  }
  const timestamp = Date.parse(catalog.publishedAt);
  if (!Number.isFinite(timestamp) || timestamp > now + 5 * 60 * 1000
    || now - timestamp > 24 * 60 * 60 * 1000) {
    throw new Error('Public prayer catalog must be generated in the last 24 hours');
  }
  return { prayers: catalog.prayers.length, categories: catalog.categories.length };
}

async function main() {
  const input = process.argv[2] || 'dist/public-prayers-v1.json';
  const catalog = JSON.parse(await fs.readFile(input, 'utf8'));
  const result = verifyHostingCatalog(catalog);
  console.log('Firebase Hosting catalog gate passed:', result);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error('Hosting release BLOCKED:', error.message); process.exitCode = 1; });
}
