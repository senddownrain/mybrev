import test from 'node:test';
import assert from 'node:assert/strict';
import { auditFixedDates } from '../src/utils/liturgicalAudit.js';

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
