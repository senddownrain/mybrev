import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateXiSundaySource, planXiSundayPatch, XI_FIELDS, XI_SOURCE_PATH } from '../scripts/liturgy/patch-xi-sunday-first-vespers.mjs';
import { assembleOrdinarySundayFirstVespers } from '../src/utils/liturgicalVespers.js';

const source = JSON.parse(fs.readFileSync(XI_SOURCE_PATH, 'utf8'));
const fields = validateXiSundaySource(source);
const empty = Object.fromEntries(XI_FIELDS.map((k) => [k, '']));

test('XI Sunday I Vespers: 11 fields from Belarusian volumes, psalms III week, real collect, and A/B/C Gospel antiphons', () => {
  assert.equal(XI_FIELDS.length, 11);
  assert.match(fields.vesper1AntMag, /Год А:[\s\S]+Год В:[\s\S]+Год С:/u);
  assert.match(fields.vesper1Ps1, /Псальм 113 \(112\)/u);
  assert.match(fields.vesper1Ps2, /Псальм 116, 10-19 \(115\)/u);
  assert.match(fields.vesper1Ps3, /Флп 2, 6-11/u);
  assert.match(fields.vesper1Pr, /Усемагутны Божа, наша моц і надзея/u);
  for (const ps of ['vesper1Ps1','vesper1Ps2','vesper1Ps3']) {
    assert.equal((fields[ps].match(/Хвала Айцу і Сыну/g) || []).length, 1);
  }
  assert.doesNotMatch(fields.vesper1Inter, /<p>1\.\s/u);
  assert.doesNotMatch(fields.vesper1Pr, /Ты спаслаў на свет свайго Сына/u);
});

test('Only missing I Vespers fields are patched, never overwrite a nonempty other text', () => {
  const day = { _periodType: 'ordinary', _periodWeekNumber: 11, _dayOfWeek: 1, ...empty };
  let plan = planXiSundayPatch(day, fields);
  assert.equal(plan.status, 'PATCH_NEEDED');
  assert.equal(Object.keys(plan.updates).length, 11);
  assert.deepEqual(plan.conflicts, []);
  plan = planXiSundayPatch({ ...day, ...fields }, fields);
  assert.equal(plan.status, 'ALREADY_APPLIED');
  assert.equal(Object.keys(plan.updates).length, 0);
  plan = planXiSundayPatch({ ...day, vesper1Pr: '<p>Some other collect</p>' }, fields);
  assert.deepEqual(plan.conflicts, ['vesper1Pr']);
  plan = planXiSundayPatch({ ...day, vesper1Pr: '  ' }, fields);
  assert.ok(plan.updates.vesper1Pr);
  assert.throws(() => planXiSundayPatch({ ...day, _periodWeekNumber: 10 }, fields));
});

test('Vespers model selects all eleven Sunday-specific fields instead of corrupted Saturday Trinity', () => {
  const saturday = Object.fromEntries(XI_FIELDS.map((k) => [k.replace('vesper1','vesper'), '<p>Trinity text</p>']));
  const sunday = { ...empty, ...fields, vesperPr: '<p>II Vespers of XI Sunday</p>' };
  const assembled = assembleOrdinarySundayFirstVespers(sunday, saturday);
  for (const key of XI_FIELDS) assert.equal(assembled[key.replace('vesper1','vesper')], fields[key]);
  assert.deepEqual(assembled._missingFirstVespersFields, []);
  assert.equal(assembled._firstVespersSource, 'vesper1+saturday-psalter');
});
