/** Readings: audit statuses, reference-only notice, no silent substitution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  READING_STATUSES, auditCelebrationReadings, citationsOf, gospelKeysOf, properReadingLines,
} from '../scripts/lib/readings-audit.mjs';
import { CONTENT_STATUS, runReadingsAudit } from '../scripts/ordo/audit-readings.mjs';
import { planReadings, resolveRuntimeDay } from '../src/utils/ordo/runtime.js';
import { orderReadingsByPlan, readingsNotice } from '../src/utils/ordo/readingsPlan.js';

const celebration = { id: 'x', title: 'X', rankKind: 'solemnity', dayIds: ['15-08-x'] };
const doc = (extra = {}) => ({ id: 'r1', _date: '15.08', sectionsFound: ['reading1', 'gospel'], gospel: { bible: 'Лк 1, 39–56' }, ...extra });

test('citations are compared by book and chapter', () => {
  assert.deepEqual(citationsOf('1 чыт.: 1 Кар 15, 20-27. Ев. Лк 1, 39-56.'), [{ book: '1кар', chapter: 15 }, { book: 'лк', chapter: 1 }]);
  assert.deepEqual(gospelKeysOf('Сір 3, 2–6. 12–14; Клс 3, 12–21; Мц 2, 13–15. 19–23'), ['мц 2']);
  const lines = [{ text: '1 чыт.: Ер 30, 1-2' }, { text: 'Ев.: Мц 15, 1-2' }, { text: 'Або: 1 чыт.: Эзх 3, 16-21' }, { text: 'Ев.: Мц 9, 35' }];
  assert.deepEqual(properReadingLines(lines, { memorial: true }), ['1 чыт.: Эзх 3, 16-21', 'Ев.: Мц 9, 35']);
  assert.equal(properReadingLines(lines, { memorial: false }).length, 4);
  assert.deepEqual(properReadingLines(lines.slice(0, 2), { memorial: true }), []);
});

test('audit statuses', () => {
  const expected = ['Ев. Лк 1, 39-56.'];
  assert.deepEqual(READING_STATUSES.length, 7);
  assert.equal(auditCelebrationReadings(celebration, [doc()], expected).status, 'MATCH');
  assert.equal(auditCelebrationReadings(celebration, [doc()], expected).verified, true);
  assert.equal(auditCelebrationReadings(celebration, [doc()], []).verified, false);
  assert.equal(auditCelebrationReadings(celebration, [doc({ gospel: { bible: 'Лк 11, 27–28' } })], expected).status, 'WRONG_CITATION');
  assert.equal(auditCelebrationReadings(celebration, [doc({ _dayId: '16-08-other' })], expected).status, 'WRONG_LINK');
  assert.equal(auditCelebrationReadings(celebration, [doc({ _dayId: '15-08-x' })], expected).status, 'MATCH');
  assert.equal(auditCelebrationReadings(celebration, [doc(), doc({ id: 'r2' })], expected).status, 'AMBIGUOUS');
  assert.equal(auditCelebrationReadings(celebration, [doc({ year: 'A' }), doc({ id: 'r2', year: 'B' })], expected).status, 'MATCH');
  assert.equal(auditCelebrationReadings(celebration, [], expected).status, 'REFERENCE_ONLY');
  assert.equal(auditCelebrationReadings(celebration, [], expected).reference, 'Ев. Лк 1, 39-56.');
  assert.equal(auditCelebrationReadings(celebration, [], []).status, 'MISSING_CONTENT');
  assert.equal(auditCelebrationReadings(celebration, [doc({ sectionsFound: [], gospel: null })], expected).status, 'REFERENCE_ONLY');
  // A memorial that keeps the weekday readings is not missing anything.
  assert.equal(auditCelebrationReadings({ ...celebration, rankKind: 'memorial' }, [], []).status, 'WEEKDAY_DEFAULT');
  assert.deepEqual(Object.keys(CONTENT_STATUS).sort(), [...READING_STATUSES].sort());
});

test('the audit covers every primary / alternative celebration of the calendars', () => {
  const evidence = Object.fromEntries(['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'].map((diocese) => [
    diocese, JSON.parse(fs.readFileSync(new URL(`../src/data/ordo/evidence/${diocese}.json`, import.meta.url), 'utf8')),
  ]));
  // Without any readings document every celebration is still classified.
  const audit = runReadingsAudit({ readings: [], evidence });
  assert.ok(audit.results.length > 200);
  assert.equal(audit.summary.MATCH + audit.summary.WRONG_CITATION + audit.summary.WRONG_LINK + audit.summary.AMBIGUOUS, 0);
  assert.ok(audit.summary.WEEKDAY_DEFAULT > 100);
  assert.ok(audit.summary.REFERENCE_ONLY > 10, 'solemnities and feasts keep the citation of the calendars');
  const assumption = audit.results.find((item) => item.id === 'assumption-blessed-virgin-mary');
  assert.equal(assumption.status, 'REFERENCE_ONLY');
  assert.match(assumption.reference, /Лк 1, 39-56/);
  // The committed status index is what the definitions use.
  const status = JSON.parse(fs.readFileSync(new URL('../src/data/ordo/readings-status.json', import.meta.url), 'utf8'));
  assert.ok(Object.keys(status).length > 200);
  Object.values(status).forEach((item) => assert.ok(['full', 'weekday', 'reference-only', 'missing'].includes(item.readings)));
});

test('missing readings: the celebration is shown with its reference, nothing is substituted', () => {
  // Pinsk, 1 May: dedication of the cathedral (feast) — citation known, no text.
  const day = resolveRuntimeDay('2026-05-01', { diocese: 'pinsk' });
  assert.equal(day.primary.id, 'dedication-cathedral');
  const plan = planReadings(day);
  const option = plan.options[0];
  assert.equal(option.readingsStatus, 'reference-only');
  assert.match(option.readingsReference, /Мц 16/);
  // St Joseph the Worker has a readings document on the same date: not ours.
  const foreign = [{ id: '01-05-sv-joseph-worker', _date: '01.05', title: 'Св. Юзафа рамесніка', _dayId: '01-05-sv-joseph-worker', sectionsFound: ['gospel'] }];
  assert.deepEqual(orderReadingsByPlan(plan, foreign), []);
  const notice = readingsNotice(plan, foreign);
  assert.equal(notice.status, 'reference-only');
  assert.equal(notice.title, day.primary.title);
  assert.equal(notice.reference, option.readingsReference);
  // With its own document there is no notice.
  const own = [{ id: 'own', _date: '01.05', title: day.primary.title, _dayIds: day.primary.daysRef.dayIds }];
  assert.equal(readingsNotice(plan, own), null);
  assert.deepEqual(orderReadingsByPlan(plan, own).map((item) => item.id), ['own']);
});

test('a memorial keeps the weekday readings and gives no notice', () => {
  const day = resolveRuntimeDay('2026-08-04', { diocese: 'minsk' });
  const plan = planReadings(day);
  assert.equal(plan.options[0].officeKind, 'memorial');
  const weekday = [{ id: 'wd', _periodType: 'ordinary', _periodWeekNumber: 18, _dayOfWeek: 3 }];
  assert.deepEqual(orderReadingsByPlan(plan, weekday).map((item) => item.id), ['wd']);
  assert.equal(readingsNotice(plan, weekday), null);
});
