import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLiturgicalYear, resolveLiturgicalDate } from '../src/utils/ordo/index.js';

const DIOCESES = [undefined, 'grodno', 'minsk-mohilev', 'pinsk', 'vitebsk'];

test('generates complete years 2025–2030 for every diocese without errors', () => {
  for (let year = 2025; year <= 2030; year += 1) {
    DIOCESES.forEach((diocese) => {
      const days = generateLiturgicalYear(year, { country: 'BY', diocese });
      assert.equal(days.length, year % 4 === 0 ? 366 : 365);
      days.forEach((day) => {
        const where = `${day.date} ${diocese || 'BY'}`;
        assert.ok(day.primary?.id, `primary ${where}`);
        assert.ok(Number.isInteger(day.week) && day.week >= 0, `week ${where}`);
        assert.ok([1, 2, 3, 4].includes(day.psalterWeek), `psalter ${where}`);
        assert.ok(['A', 'B', 'C'].includes(day.readingCycle.sunday), `cycle ${where}`);
        assert.equal(day.officeResolution.primary.optionId, day.primary.id, where);
        assert.equal(day.readingResolution.primary.optionId, day.primary.id, where);
        assert.equal(day.officeResolution.alternatives.length, day.alternatives.length, where);
      });
    });
  }
});

test('display invariants hold for a whole year', () => {
  const days = generateLiturgicalYear(2027, { country: 'BY', diocese: 'grodno' });
  days.forEach((day) => {
    const where = day.date;
    // A weekday is never an alternative, and never an option next to a memorial/feast/solemnity.
    assert.ok(day.alternatives.every((item) => item.kind !== 'temporal'), where);
    if (['memorial', 'feast', 'solemnity'].includes(day.primary.officeKind)) {
      assert.ok(day.alternatives.every((item) => item.officeKind === 'memorial'), where);
    }
    // Optional memorials are never primary.
    assert.notEqual(day.primary.officeKind, 'optional-memorial', where);
    // Commemorations exist only on privileged weekdays.
    if (day.commemorations.length) assert.equal(day.primary.precedence, 9, where);
    // Every active candidate ends up in exactly one bucket.
    const buckets = [day.primary, ...day.alternatives, ...day.commemorations, ...day.suppressed].map((item) => item.id);
    day.candidates.forEach((candidate) => assert.ok(buckets.includes(candidate.id), `${where} ${candidate.id}`));
  });
});

test('every Sunday and solemnity has I Vespers by right; feasts only on Sundays', () => {
  const days = generateLiturgicalYear(2026, { country: 'BY' });
  days.forEach((day) => {
    const office = day.officeResolution.primary;
    if (day.primary.officeKind === 'sunday') assert.equal(office.firstVespers.byRight, true, day.date);
    if (day.primary.officeKind === 'solemnity' && day.primary.id !== 'easter-sunday') {
      assert.equal(office.firstVespers.byRight, true, day.date);
    }
    if (day.primary.officeKind === 'feast' && day.dayOfWeek !== 1) assert.equal(office.firstVespers.byRight, false, day.date);
  });
});

test('resolution is deterministic and accepts Date/route formats', () => {
  const a = resolveLiturgicalDate('2026-08-15');
  const b = resolveLiturgicalDate('15-08-2026');
  const c = resolveLiturgicalDate(new Date(2026, 7, 15));
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
  assert.throws(() => resolveLiturgicalDate('2026-02-30'));
});
