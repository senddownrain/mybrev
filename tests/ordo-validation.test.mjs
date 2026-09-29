import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runValidation } from '../scripts/ordo/validate.mjs';
import { STATUSES, normalizeOfficeFrom } from '../scripts/ordo/lib/validate.mjs';
import { renderValidationReport } from '../scripts/ordo/lib/validation-report.mjs';

const thresholds = JSON.parse(fs.readFileSync(new URL('../scripts/ordo/validation-thresholds.json', import.meta.url), 'utf8'));
const results = runValidation();

test('the validation runs over every published day of the four calendars', () => {
  assert.deepEqual(results.map((item) => item.diocese).sort(), ['grodno', 'minsk-mohilev', 'pinsk', 'vitebsk']);
  results.forEach(({ days, summary }) => {
    assert.ok(days.length >= 360);
    assert.equal(Object.values(summary.byStatus).reduce((a, b) => a + b, 0), days.length);
    days.forEach((day) => {
      assert.ok(STATUSES.includes(day.status));
      Object.values(day.checks).forEach((check) => assert.ok(STATUSES.includes(check.status)));
    });
  });
});

test('MATCH rate does not regress below the recorded threshold', () => {
  results.forEach(({ diocese, summary }) => {
    assert.ok(summary.matchRate >= thresholds.matchRate[diocese],
      `${diocese}: ${(100 * summary.matchRate).toFixed(1)}% < ${100 * thresholds.matchRate[diocese]}%`);
  });
});

test('every GENERATOR_MISMATCH has been investigated', () => {
  results.forEach(({ diocese, summary, days }) => {
    const open = days.filter((day) => day.status === 'GENERATOR_MISMATCH' && !day.reviewed)
      .map((day) => `${day.date}: ${JSON.stringify(day.checks)}`);
    assert.ok(summary.unreviewedMismatches <= thresholds.maxUnreviewedMismatches, `${diocese}\n${open.join('\n')}`);
  });
});

test('core liturgical checks agree with every calendar', () => {
  results.forEach(({ diocese, summary }) => {
    ['period', 'week'].forEach((check) => assert.equal(summary.byCheck[check].matchRate, 1, `${diocese} ${check}`));
    assert.ok(summary.byCheck.primary.matchRate >= 0.97, `${diocese} primary`);
  });
});

test('office types printed by the calendars are normalized', () => {
  assert.equal(normalizeOfficeFrom('ііі нядзелі'), 'sunday');
  assert.equal(normalizeOfficeFrom('панядзелку вялікага'), 'weekday');
  assert.equal(normalizeOfficeFrom('з успаміну'), 'memorial');
  assert.equal(normalizeOfficeFrom('выч'), null);
});

test('the markdown report renders the summary', () => {
  const markdown = renderValidationReport(results);
  assert.match(markdown, /Сводка по епархиям/);
  assert.match(markdown, /GENERATOR_MISMATCH/);
});
