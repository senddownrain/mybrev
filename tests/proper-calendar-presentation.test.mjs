import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { calendarAdditionFor } from '../src/data/documents/proper-calendar-additions.js';

const calendar = JSON.parse(
  readFileSync(new URL('../src/data/documents/proper-calendar.json', import.meta.url), 'utf8'),
);

function rowFor(month, date) {
  return calendar.pages
    .flatMap((page) => page.rows)
    .find((row) => row.kind === 'line' && row.month === month && row.date === date);
}

test('Loreto on December 10 is corrected in presentation without changing source extraction', () => {
  const row = rowFor(12, 10);
  assert.ok(row);
  assert.equal(row.runs.map((run) => run.text).join(''), 'Найсв. Панны Марыі Латэранскай');
  assert.equal(calendarAdditionFor(row)?.title, 'Маці Божай Ларэтанскай');
  assert.equal(calendarAdditionFor(row)?.rank, '');
});

test('December 9 approved post-PDF entry remains visible', () => {
  const row = rowFor(12, 9);
  assert.ok(row);
  assert.equal(calendarAdditionFor(row)?.title, 'Св. Хуана Дыега Куаўтлатаацына');
});
