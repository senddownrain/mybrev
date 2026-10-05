#!/usr/bin/env node
/**
 * Semantic audit of the published Ordo notes: every day of 2025–2032, every
 * diocese — a note shown on a day must not contradict its own text.
 *
 *   MONTH_MISMATCH   «Чэрвеньскае набажэнства» shown outside June
 *   DATE_MISMATCH    «… 1 кастрычніка …» shown on another day
 *   YEAR_MISMATCH    «… 2027 года …» shown in another year
 *
 * A high match rate with the calendars is not a success if the text says
 * June and the screen says October.
 *
 *   node scripts/liturgy/audit-notes.mjs [--from 2025 --to 2032]
 *
 * Output: reports/liturgy/notes-semantic-audit.json
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { resolveOrdoDay } from '../../src/utils/ordoScreen.js';
import { explicitDates } from '../ordo/lib/note-guards.mjs';
import { fold } from '../ordo/lib/text.mjs';
import { DIOCESES } from './audit-hours-sources.mjs';

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, 'reports', 'liturgy', 'notes-semantic-audit.json');
const arg = (name, fallback) => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : fallback; };

// Month BOUND by the text (a month devotion), not a month merely mentioned.
const MONTH_DEVOTIONS = [[/черв[еэ]ньск\S* набажэнств/u, 6], [/маёв\S* набажэнств|маев\S* набажэнств/u, 5], [/кастрычніцк\S* набажэнств/u, 10]];

const MONTHS = 'студзеня|лютага|сакавіка|красавіка|мая|чэрвеня|ліпеня|жніуня|верасня|кастрычніка|лістапада|снежня';
const MONTH_NUMBER = Object.fromEntries(MONTHS.split('|').map((word, index) => [word, index + 1]));
// «у чацвер, 1 кастрычніка», «Сёння, 4 студзеня», «пятніца, 8 мая»: the day the note is about.
const DAY_OF_NOTE = new RegExp(`(?:нядзел\\S*|панядзел\\S*|аутор\\S*|серад\\S*|чацвер|пятніц\\S*|субот\\S*|сення),?\\s+(\\d{1,2})\\s+(${MONTHS})`, 'u');
// A year of the notes (not «ад 2020 г.», not a decree of 1915): from the first calendar year on.
const FIRST_YEAR = 2025;

export function noteViolations(note, iso) {
  const text = fold(note.text);
  const [year, month, day] = iso.split('-').map(Number);
  const found = [];
  MONTH_DEVOTIONS.forEach(([pattern, expected]) => {
    if (pattern.test(text) && month !== expected) found.push({ kind: 'MONTH_MISMATCH', expected });
  });
  const named = text.match(DAY_OF_NOTE);
  if (named && !(Number(named[1]) === day && MONTH_NUMBER[named[2]] === month)) {
    found.push({ kind: 'DATE_MISMATCH', expected: `${named[1]} ${named[2]}` });
  }
  const years = [...text.matchAll(/(?<!ад\s)(?<!\d)(20\d{2})(?=\s*(?:года|г\.))/gu)].map((match) => Number(match[1]))
    .concat(explicitDates(note.text).dates.map((item) => item.year).filter(Boolean))
    .filter((value) => value >= FIRST_YEAR)
    // A year before the one the note was printed in is history («у гадавіну выбрання 2025 г.»).
    .filter((value) => value >= Math.min(...(note.observed || []).flatMap((item) => item.dates || []).map((date) => Number(date.slice(0, 4))), Infinity));
  if (years.length && !years.includes(year)) found.push({ kind: 'YEAR_MISMATCH', expected: [...new Set(years)].join(', ') });
  return found;
}

async function main() {
  const from = Number(arg('--from', '2025'));
  const to = Number(arg('--to', '2032'));
  const { notes } = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'ordo', 'notes.json'), 'utf8'));
  const violations = new Map();
  let shown = 0;
  for (let time = Date.UTC(from, 0, 1); time < Date.UTC(to + 1, 0, 1); time += 86_400_000) {
    const iso = new Date(time).toISOString().slice(0, 10);
    for (const diocese of DIOCESES) {
      resolveOrdoDay(iso, { diocese, notes }).ordoNotes.forEach((note) => {
        shown += 1;
        noteViolations(note, iso).forEach((violation) => {
          const key = `${note.id}|${violation.kind}`;
          const entry = violations.get(key) || { noteId: note.id, kind: violation.kind, expected: violation.expected, text: note.text.slice(0, 100), selector: note.selector, dates: [] };
          if (entry.dates.length < 6) entry.dates.push(`${iso}@${diocese}`);
          entry.count = (entry.count || 0) + 1;
          violations.set(key, entry);
        });
      });
    }
  }
  const list = [...violations.values()].sort((a, b) => b.count - a.count);
  const report = {
    generatedAt: new Date().toISOString(), range: { from, to }, notes: notes.length, shown,
    summary: list.reduce((acc, item) => ({ ...acc, [item.kind]: (acc[item.kind] || 0) + 1 }), {}),
    violations: list,
  };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 1)}\n`);
  console.log(JSON.stringify({ output: path.relative(ROOT, OUTPUT), shown, violations: list.length, ...report.summary }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
