/**
 * GILH 200 and 236: daytime collects by celebration rank.
 * Use the approved sparse Belarusian Proper documents as regression cases.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLiturgicalDate } from '../src/utils/ordo/index.js';
import { CURRENT_DAY_CHOICE, assembleOffice } from '../src/utils/ordo/officeAssembly.js';
import { templatesFixture } from './helpers/ordo-days-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proper = (filename) => JSON.parse(fs.readFileSync(path.join(root, 'patchs/db-feasts', filename + '.json'), 'utf8'));
const templates = templatesFixture();
const currentDay = Object.fromEntries([1, 2, 3].map((hour) => [`sext${hour}Pr`, `weekday collect ${hour}`]));
const officeFor = (date, diocese, id) => {
  const resolved = resolveLiturgicalDate(date, { diocese });
  const office = [resolved.officeResolution.primary, ...resolved.officeResolution.alternatives]
    .find((item) => item.optionId === id);
  assert.ok(office, `${date} ${diocese} ${id}`);
  return office;
};

for (const [date, diocese, id, filename, rank] of [
  ['2026-11-12', 'vitebsk', 'sv-josaphat', '12-11-sv-josaphat-vitebsk', 'solemnity'],
  ['2026-11-12', 'pinsk', 'sv-josaphat', '12-11-sv-josaphat-minsk-mohilev-pinsk--pinsk', 'feast'],
  ['2026-11-16', 'grodno', 'our-lady-mother-mercy', '16-11-our-lady-mother-mercy-grodno', 'solemnity'],
]) {
  test(`${date} ${diocese}: ${rank} repeats own Lauds collect at all three daytime hours`, () => {
    const office = officeFor(date, diocese, id);
    assert.equal(office.officeKind, rank);
    const source = proper(filename);
    assert.ok(source.officeOfReadingsPr);
    for (const choice of source._templates) {
      const result = assembleOffice({ proper: source, office, templates, choice, currentDay });
      assert.equal(result.day.laudesPr, source.officeOfReadingsPr);
      for (const hour of [1, 2, 3]) {
        const field = `sext${hour}Pr`;
        assert.equal(result.day[field], result.day.laudesPr, `${choice}: ${field}`);
        assert.equal(result.provenance[field], 'ref:laudesPr');
      }
    }
  });
}

for (const [date, diocese, id, filename] of [
  ['2026-11-12', 'grodno', 'sv-josaphat', '12-11-sv-josaphat'],
  ['2026-11-16', 'vitebsk', 'our-lady-mother-mercy', '16-11-our-lady-mother-mercy'],
  ['2026-11-18', 'vitebsk', 'dedication-basilicas-peter-paul', '18-11-dedication-basilicas-peter-paul'],
]) {
  test(`${date} ${diocese}: memorial daytime collects stay of the weekday`, () => {
    const office = officeFor(date, diocese, id);
    assert.ok(['memorial', 'optional-memorial'].includes(office.officeKind));
    const source = { ...proper(filename), sext1Pr: 'wrong proper daytime collect' };
    for (const choice of [CURRENT_DAY_CHOICE, ...source._templates]) {
      const result = assembleOffice({ proper: source, office, templates, choice, currentDay });
      for (const hour of [1, 2, 3]) {
        const field = `sext${hour}Pr`;
        assert.equal(result.day[field], currentDay[field], `${choice}: ${field}`);
        assert.equal(result.provenance[field], CURRENT_DAY_CHOICE);
      }
    }
  });
}

test('explicit Proper daytime collect wins over Lauds; without own collect use the selected Common', () => {
  const office = officeFor('2026-11-12', 'vitebsk', 'sv-josaphat');
  const source = { ...proper('12-11-sv-josaphat-vitebsk'), sext2Pr: 'unique Sext prayer' };
  const result = assembleOffice({ proper: source, office, templates, currentDay });
  assert.equal(result.day.sext1Pr, source.officeOfReadingsPr);
  assert.equal(result.day.sext2Pr, 'unique Sext prayer');
  assert.equal(result.provenance.sext2Pr, 'proper');
  assert.equal(result.day.sext3Pr, source.officeOfReadingsPr);
});
