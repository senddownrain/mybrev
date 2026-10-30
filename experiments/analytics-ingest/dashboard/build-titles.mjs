#!/usr/bin/env node
/**
 * R05: builds dashboard/public-titles.json = { id: title } ONLY for ids of the published inventory
 * (src/utils/analytics/public-inventory.json), from the same PUBLISHED app bundle the inventory is built from.
 *   node experiments/analytics-ingest/dashboard/build-titles.mjs --bundle <Flutter assets/content> [--check]
 * Titles of private / priest-only / unpublished materials cannot appear: an id that is not in the inventory is skipped, and closed docs are not in it.
 * Local files only; no Firestore, no network. Songs are identified by title only (their ids are hashes).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { BIBLE_BOOKS } from '../../../src/constants/bible.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..', '..');
const hasControl = (text) => [...text].some((ch) => ch.charCodeAt(0) < 32);
const OUT = path.join(here, 'public-titles.json');
const HOURS = { invitatorium: 'Invitatorium', morning: 'Раніца', lectionis: 'Лекцыі', laudes: 'Ранішняя малітва', terz: 'Тэрцыя', sext: 'Секста', non: 'Нона', vesper: 'Вячэрняя', completorium: 'Малітва перад сном' };

export function buildTitles({ bundle, inventory }) {
  const read = (name) => JSON.parse(gunzipSync(fs.readFileSync(path.join(bundle, `${name}.json.gz`))).toString('utf8')).docs;
  const ids = new Set(inventory.ids);
  const titles = {};
  const put = (id, title) => { if (ids.has(id) && typeof title === 'string' && title.trim() && !hasControl(title)) titles[id] = title.trim(); };
  for (const [id, doc] of Object.entries(read('prayers'))) {
    const v = doc.titleVersions || {};
    put(`prayer:${id}`, v.bel || v.be || v.ru || Object.values(v).find((x) => typeof x === 'string'));
  }
  for (const [id, doc] of Object.entries(read('songs'))) put(`song:${id}`, doc.title);
  for (const doc of Object.values(read('compendium'))) {
    put(`comp:${doc.id}`, doc.title);
    if (doc.partId) put(`comp:${doc.partId}`, doc.partTitle ? `${doc.partLabel ? `${doc.partLabel}. ` : ''}${doc.partTitle}` : undefined);
  }
  for (const [language, books] of Object.entries(BIBLE_BOOKS)) for (const book of books) put(`bible:${language}:${book.id}`, book.name || book.title || book.short);
  for (const [hour, title] of Object.entries(HOURS)) put(`hour:${hour}`, title);
  put('mass:order', 'Парадак Імшы');
  put('reading:day', 'Чытанні дня');
  return Object.fromEntries(Object.entries(titles).sort(([a], [b]) => a.localeCompare(b)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const bundle = args[args.indexOf('--bundle') + 1];
  if (!bundle || args.indexOf('--bundle') < 0) { console.error('usage: --bundle <dir> [--check]'); process.exit(2); }
  const inventory = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/utils/analytics/public-inventory.json'), 'utf8'));
  const titles = buildTitles({ bundle, inventory });
  const text = `${JSON.stringify({ inventory_sha256: inventory.sha256, titles }, null, 1)}\n`;
  if (args.includes('--check')) { console.log(fs.readFileSync(OUT, 'utf8') === text ? 'titles up to date' : 'titles OUT OF DATE'); process.exit(fs.readFileSync(OUT, 'utf8') === text ? 0 : 1); }
  fs.writeFileSync(OUT, text);
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${Object.keys(titles).length} of ${inventory.ids.length} inventory ids have a title`);
}
