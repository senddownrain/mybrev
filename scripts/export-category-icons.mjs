#!/usr/bin/env node
/**
 * Export the category-icon contract for the Flutter app:
 *   <flutter>/assets/category_icons/catalog.json  (48 keys, labels, groups, kind)
 *   <flutter>/assets/category_icons/<key>.svg     (the 12 authored symbols)
 *   <flutter>/test/fixtures/prayer_category_icon_vectors.json (shared suggestion vectors)
 * Usage: node scripts/export-category-icons.mjs <path-to-ibreviarybyapp>
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { CATEGORY_ICONS, CATEGORY_ICON_GROUPS, DEFAULT_CATEGORY_ICON_KEY, SEED_CATEGORY_ICON_KEYS } from '../src/constants/prayerCategoryIcons.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function categoryIconCatalog() {
  return {
    version: 1,
    defaultKey: DEFAULT_CATEGORY_ICON_KEY,
    seeds: SEED_CATEGORY_ICON_KEYS,
    groups: CATEGORY_ICON_GROUPS,
    icons: CATEGORY_ICONS.map(({ key, label, group, source }) => ({ key, label, group, kind: source === 'svg' ? 'svg' : 'phosphor' })),
  };
}

async function main() {
  const target = process.argv[2];
  if (!target) throw new Error('Usage: node scripts/export-category-icons.mjs <flutter-repo>');
  const assets = path.join(path.resolve(target), 'assets', 'category_icons');
  await fs.mkdir(assets, { recursive: true });
  await fs.writeFile(path.join(assets, 'catalog.json'), `${JSON.stringify(categoryIconCatalog(), null, 2)}\n`);
  for (const icon of CATEGORY_ICONS.filter((i) => i.source === 'svg')) {
    await fs.copyFile(path.join(ROOT, 'src/assets/category-icons', icon.svg), path.join(assets, icon.svg));
  }
  const fixtures = path.join(path.resolve(target), 'test', 'fixtures');
  await fs.mkdir(fixtures, { recursive: true });
  await fs.copyFile(path.join(ROOT, 'tests/fixtures/prayer-category-icon-vectors.json'), path.join(fixtures, 'prayer_category_icon_vectors.json'));
  console.log(`Exported to ${assets}`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
