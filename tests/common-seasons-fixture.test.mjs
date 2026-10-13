/** Flutter parity fixture: deterministic, consistent with the web resolver. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFixture, loadTemplates } from '../scripts/liturgy/common-seasons-fixture.mjs';
import { materializeCommonForSeason } from '../src/utils/ordo/commonSeasons.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = buildFixture();
const templates = loadTemplates();

test('fixture is deterministic and has the documented shape', () => {
  assert.deepEqual(buildFixture(), fixture);
  assert.equal(fixture.schema, 1);
  assert.ok(fixture.counts.cases > 1000 && fixture.counts.assembly >= 10 && fixture.counts.calendar === 48);
  const file = path.join(ROOT, 'reports', 'liturgy', 'common-seasons-flutter-fixture.json');
  if (fs.existsSync(file)) assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), JSON.parse(JSON.stringify(fixture)), 'run node scripts/liturgy/common-seasons-fixture.mjs');
});

test('fixture cases: Holy Week = Lent, Triduum and Ordinary Time = the flat base, no case without provenance', () => {
  fixture.cases.forEach(({ input, expected }) => {
    assert.match(expected.provenance, /^common:/);
    if (input.periodPhase === 'triduum' || input.period === 'ordinary') {
      assert.equal(expected.variant, null);
      assert.equal(expected.source, 'base');
    }
    if (input.period === 'holyweek' && input.periodPhase !== 'triduum') assert.equal(expected.variant, 'lent');
    const flat = materializeCommonForSeason(templates.get(input.templateId), { period: input.period, periodPhase: input.periodPhase });
    if (expected.source === 'base') assert.ok(!flat._seasonal?.fields?.includes(input.field));
  });
  const lent = fixture.cases.find((c) => c.input.templateId === 'church-dedication' && c.input.field === 'vesper1Ps3' && c.input.period === 'lent');
  const easter = fixture.cases.find((c) => c.input.templateId === 'church-dedication' && c.input.field === 'vesper1Ps3' && c.input.periodPhase === 'before-ascension');
  assert.notEqual(lent.expected.value.valueSha256, easter.expected.value.valueSha256);
  assert.match(lent.expected.value.plainStart, /Клс 1, 12-20/);
});

test('fixture assembly cases: own Proper wins; the memorial keeps the weekday', () => {
  const byName = (name) => fixture.assembly.find((a) => a.name === name);
  const own = byName('church-dedication with own vesper1Ant3 lent').expected;
  assert.equal(own.fields.vesper1Ant3.provenance, 'proper');
  assert.equal(own.fields.vesper1Ps3.provenance, 'common:church-dedication');
  assert.equal(own.seasonalFields.vesper1Ant3, undefined);
  const memorial = byName('memorial current-day easter').expected;
  assert.equal(memorial.fields.laudesHymn.provenance, 'current-day');
});
