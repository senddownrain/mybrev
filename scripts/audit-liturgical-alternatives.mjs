import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'node-html-parser';
import { getLiturgicalAlternatives } from '../src/utils/liturgicalAlternatives.js';

const ROOT = process.cwd();
const SOURCES = [
  ['templates', path.join(ROOT, 'patchs', 'feasts', 'common-texts')],
  ['resolved feasts', path.join(ROOT, 'patchs', 'db-feasts')],
];

const boundaryPattern = /^(?:А\s*бо(?:\s+інш(?:ае|ая|ыя))?\s*:|(?:Пра|За|Для)\s+[^:]{1,72}:|У\s+[^:]{1,72}:)/iu;

function kindFor(field) {
  if (/Hymn$/u.test(field)) return 'hymn';
  if (/Pr$/u.test(field)) return 'prayer';
  if (/Inter$/u.test(field)) return 'intercession';
  if (/R\d?$|Vers$/u.test(field)) return 'reading';
  return 'generic';
}

function hasAlternativeSyntax(html) {
  const value = String(html || '');
  if ((value.match(/data-alternative-title=/gu) || []).length > 1) return true;
  if (/<hr\b/iu.test(value)) return true;
  const root = parse(value);
  const paragraphs = root.querySelectorAll('p').map((item) => item.text.replace(/\s+/g, ' ').trim());
  const boundaries = paragraphs.filter((text) => boundaryPattern.test(text));
  if (boundaries.some((text) => /^А\s*бо/iu.test(text)) || boundaries.length > 1) return true;
  return paragraphs.filter((text) => /^Кароткае\s+чытанне\b/iu.test(text)).length > 1;
}

const rows = [];
for (const [source, directory] of SOURCES) {
  for (const filename of (await fs.readdir(directory)).filter((name) => name.endsWith('.json') && name !== 'manifest.json')) {
    const document = JSON.parse(await fs.readFile(path.join(directory, filename), 'utf8'));
    if (source === 'resolved feasts' && !Array.isArray(document._templates)) continue;
    for (const [field, html] of Object.entries(document)) {
      if (field.startsWith('_') || typeof html !== 'string' || !hasAlternativeSyntax(html)) continue;
      const options = getLiturgicalAlternatives(html, kindFor(field));
      rows.push({ source, filename, field, options: options.length, titles: options.map(({ title }) => title) });
    }
  }
}

const unresolved = rows.filter((row) => row.options < 2);
const longTitles = rows.flatMap((row) => row.titles
  .filter((title) => title.length > 56 || /Калі\s+няма\s+ўласнай/iu.test(title))
  .map((title) => ({ ...row, title })));
const byField = Object.entries(rows.reduce((result, row) => {
  const key = `${row.source}: ${row.field}`;
  result[key] = (result[key] || 0) + 1;
  return result;
}, {})).sort(([left], [right]) => left.localeCompare(right));

console.log(`Alternative fields audited: ${rows.length}`);
console.log(`Selectable options found: ${rows.reduce((sum, row) => sum + row.options, 0)}`);
byField.forEach(([field, count]) => console.log(`  ${field}: ${count}`));

if (unresolved.length || longTitles.length) {
  if (unresolved.length) console.error('Unresolved alternative fields:', unresolved);
  if (longTitles.length) console.error('Invalid alternative titles:', longTitles);
  process.exitCode = 1;
}
