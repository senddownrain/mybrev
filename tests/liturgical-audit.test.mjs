import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditFixedDates,
  auditCrossCollectionCoverage,
  buildCoverageMarkdownReport,
} from '../src/utils/liturgicalAudit.js';

test('auditFixedDates flags missing fixed date in both collections', () => {
  const report = auditFixedDates([], [], { dates: ['01.01'] });
  assert.equal(report.readings.missing.length, 1);
  assert.equal(report.days.missing.length, 1);
  assert.equal(report.readings.missing[0].reason, 'missing-date');
  assert.equal(report.days.missing[0].reason, 'missing-date');
});

test('auditFixedDates accepts empty rank value when rank field exists', () => {
  const readings = [{ _date: '01.01', title: 'Title', rank: '', text: 'valid text' }];
  const days = [{ _date: '01.01', _feastName: 'Name', _feastType: '' }];
  const report = auditFixedDates(readings, days, { dates: ['01.01'] });
  assert.equal(report.readings.missing.length, 0);
  assert.equal(report.days.missing.length, 0);
  assert.equal(report.readings.existing.length, 1);
  assert.equal(report.days.existing.length, 1);
});

test('auditFixedDates marks records without rank field as missing', () => {
  const readings = [{ _date: '01.01', title: 'Title', text: 'valid text' }];
  const days = [{ _date: '01.01', _feastName: 'Name' }];
  const report = auditFixedDates(readings, days, { dates: ['01.01'] });
  assert.equal(report.readings.missing[0].reason, 'missing-title-or-rank-field');
  assert.equal(report.days.missing[0].reason, 'missing-feastName-or-feastType-field');
});

test('auditCrossCollectionCoverage checks period + feast + date/rank parity', () => {
  const readings = [
    { _date: '01.01', title: 'A', rank: '', place: '', text: 'ok', _periodType: 'ordinary', _periodWeekNumber: 1, _dayOfWeek: 2, _feast: 'ash' },
  ];
  const days = [
    { _date: '01.01', _feastName: 'A', _feastType: '', _periodType: 'ordinary', _periodWeekNumber: 1, _dayOfWeek: 2, _feast: 'ash' },
  ];

  const report = auditCrossCollectionCoverage(readings, days);
  assert.equal(report.period.missingInReadings.length, 0);
  assert.equal(report.period.missingInDays.length, 0);
  assert.equal(report.fixedDateRank.missingInReadings.length, 0);
  assert.equal(report.fixedDateRank.missingInDays.length, 0);
});

test('buildCoverageMarkdownReport returns markdown sections', () => {
  const report = auditCrossCollectionCoverage([], []);
  const md = buildCoverageMarkdownReport(report);
  assert.ok(md.includes('# Литургический аудит (readings + days)'));
  assert.ok(md.includes('## 1) Period keys'));
  assert.ok(md.includes('## 2) Dynamic feast keys'));
});
