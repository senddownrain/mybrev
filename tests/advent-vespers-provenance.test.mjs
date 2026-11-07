import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import moment from '../src/utils/moment-be.js';
import { OFFICE_CONTENT_FIELDS } from '../src/constants/officeFields.js';
import reviewed from '../src/data/liturgical/advent-vespers-by.json' with { type: 'json' };
import { applyReviewedAdventVespers } from '../src/utils/adventVespers.js';
import { contentFor } from '../scripts/liturgy/lib/snapshot-content.mjs';
import { checkAdventProvenance } from '../scripts/liturgy/lib/advent-provenance.mjs';
import { eveningVespersModel } from '../src/utils/liturgicalVespers.js';
import { plain } from '../scripts/liturgy/lib/lh-catholic-by.mjs';
import { fixedDocsFor, templatesFixture } from './helpers/ordo-days-fixture.mjs';
import { documentHash, planAdventVespers } from '../scripts/liturgy/plan-advent-vespers.mjs';

const fixture = JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('./fixtures/advent-vespers-days.json.gz', import.meta.url))));
export const source = {
  days: fixture.days, daysById: new Map(fixture.days.map((day) => [day.id, day])),
  readings: [], properDocs: fixedDocsFor('25.12', { migrated: true }), templates: templatesFixture(),
};
const DIOCESES = ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'];
function evening(date, diocese = DIOCESES[0]) {
  const content = contentFor(source, date, { diocese });
  const option = content.dayOptions[0];
  const tomorrow = contentFor(source, moment(date).add(1, 'day').format('YYYY-MM-DD'), { diocese });
  const model = eveningVespersModel({ ...option.day, _ordo: option.ordo }, tomorrow);
  return { content, model, day: model.firstVespers?.day || option.day };
}

test('issue #200: the four reported evenings use the actual proper texts and source slots', () => {
  for (const diocese of DIOCESES) {
    const first = evening('2026-12-19', diocese);
    assert.ok(first.model.firstVespers);
    assert.match(plain(first.day.vesperR), /1 Тэс 5, 23-24/);
    assert.match(plain(first.day.vesperPs1), /122 \(121\)/);
    assert.match(plain(first.day.vesperAntMag), /О корань Есэя/);
    assert.equal(first.day._fieldSources.vesperR.document, 'advent-w4-d1');
    assert.equal(first.day._fieldSources.vesperR.field, 'vesper1R');
    const second = evening('2026-12-20', diocese);
    assert.ok(second.model.second);
    assert.match(plain(second.day.vesperR), /Флп 4, 4-5/);
    assert.match(plain(second.day.vesperPs1), /110 \(109\)/);
    assert.match(plain(second.day.vesperAntMag), /О ключ Давіда/);
    const monday = evening('2026-12-21', diocese);
    assert.match(plain(monday.day.vesperR), /1 Кар 4, 5/);
    assert.match(plain(monday.day.vesperR), /Прыйдзі, каб вызваліць нас/);
    assert.doesNotMatch(plain(monday.day.vesperR), /Пакажы нам, Пане/);
    assert.match(plain(monday.day.vesperInter), /які адкупіў нас ад цемры грахоў/);
    assert.match(plain(monday.day.vesperPr), /^Міласэрны Ойча/);
    for (const field of ['vesperR', 'vesperInter', 'vesperPr']) {
      assert.equal(monday.day._fieldSources[field].document, 'advent-21-12');
      assert.equal(monday.day._fieldSources[field].field, field, 'explicit evening field, no Lauds fallback');
    }
    const wednesday = evening('2026-12-23', diocese);
    assert.match(plain(wednesday.day.vesperPs1), /139 \(138\)/);
    assert.match(plain(wednesday.day.vesperPs3), /Клс 1, 12-20/);
    assert.match(plain(wednesday.day.vesperAntMag), /О Эммануэль/);
    for (const field of ['vesperPs1', 'vesperPs2', 'vesperPs3']) {
      assert.equal(wednesday.day._fieldSources[field].document, 'ordinary-w4-d4');
      assert.equal(wednesday.day[field], source.daysById.get('ordinary-w4-d4')[field]);
    }
  }
});

test('2025–2032, all dioceses: every late-Advent source assertion, Sunday rotation and commemorations', () => {
  const sundays = [21, 20, 19, 24, 23, 22, 21, 19];
  let checked = 0;
  for (let year = 2025; year <= 2032; year++) {
    assert.equal(moment(`${year}-12-${sundays[year - 2025]}`).day(), 0);
    for (const diocese of DIOCESES) {
      for (let day = 17; day <= 24; day++) {
        const date = `${year}-12-${day}`;
        const c = contentFor(source, date, { diocese });
        const report = checkAdventProvenance(source, date, diocese, c);
        assert.deepEqual(report.fields.filter((field) => field.status !== 'PASS'), [], `${date} ${diocese}`);
        assert.equal(c.resolved.primary.kind, 'temporal');
        assert.ok(![c.resolved.primary, ...c.resolved.alternatives].some((o) => ['memorial', 'optional-memorial'].includes(o.rankKind)));
        if (day === 21 && moment(date).day() !== 0) {
          assert.ok(c.dayOptions[0].ordo.commemorations.some((item) => item.id === 'sv-peter-canisius'));
        }
        assert.equal(c.dayOptions[0].day.laudesAntBen, source.daysById.get(`advent-${day}-12`).laudesAntBen);
        checked++;
      }
      const first = evening(`${year}-12-${sundays[year - 2025] - 1}`, diocese);
      assert.ok(first.model.firstVespers);
      // If Sunday is 24 December (2028), its evening is Christmas I Vespers.
      const sunday = evening(`${year}-12-${sundays[year - 2025]}`, diocese);
      assert.ok(sundays[year - 2025] === 24 ? sunday.model.firstVespers : sunday.model.second);
    }
  }
  assert.equal(checked, 256);
});

test('semantic audit rejects nonempty wrong-source text, including identical values and embedded responsory', () => {
  for (const [date, field, wrongSource, wrongField] of [
    ['2026-12-20', 'vesperHymn', 'advent-20-12', 'vesperHymn'],
    ['2026-12-21', 'vesperR', 'advent-w4-d2', 'vesperR'],
    ['2026-12-21', 'vesperInter', 'advent-w4-d2', 'vesperInter'],
    ['2026-12-21', 'vesperPr', 'advent-21-12', 'laudesPr'],
    ['2026-12-23', 'vesperPs1', 'advent-w4-d4', 'vesperPs1'],
  ]) {
    const c = contentFor(source, date);
    c.dayOptions[0].day[field] = source.daysById.get(wrongSource)[wrongField];
    c.dayOptions[0].day._fieldSources[field] = { document: wrongSource, field: wrongField };
    assert.ok(checkAdventProvenance(source, date, DIOCESES[0], c).fields.some((row) => row.field === field && row.status === 'WRONG_SOURCE'));
  }
});

test('weekday psalmody ignores materialized date psalms, other proper fields are preserved', () => {
  const changed = structuredClone(fixture.days);
  const date = changed.find((d) => d.id === 'advent-23-12');
  date.vesperPs1 = 'stale source-year Christmas psalm';
  const poisoned = { ...source, days: changed, daysById: new Map(changed.map((d) => [d.id, d])) };
  const day = contentFor(poisoned, '2026-12-23').dayOptions[0].day;
  assert.equal(day.vesperPs1, source.daysById.get('ordinary-w4-d4').vesperPs1);
  for (const field of OFFICE_CONTENT_FIELDS.filter((f) => !f.startsWith('vesper') && date[f])) {
    assert.equal(day[field], date[field], field);
  }
});

test('canonical document id does not bless newly corrupted proper text', () => {
  const days = structuredClone(fixture.days);
  days.find((day) => day.id === 'advent-21-12').vesperR = source.daysById.get('advent-w4-d2').vesperR;
  const changed = { ...source, days, daysById: new Map(days.map((day) => [day.id, day])) };
  const report = checkAdventProvenance(changed, '2026-12-21', DIOCESES[0]);
  assert.ok(report.fields.some((row) => row.field === 'vesperR' && row.status === 'WRONG_SOURCE'));
});

test('reviewed data bridge preserves future edits and becomes inert after the patch', () => {
  const raw = source.daysById.get('advent-21-12');
  const fixed = applyReviewedAdventVespers(raw);
  for (const [field, correction] of Object.entries(reviewed.documents[raw.id])) assert.equal(fixed[field], correction.value);
  const future = { ...raw, vesperPr: 'reviewed future edition' };
  assert.equal(applyReviewedAdventVespers(future).vesperPr, future.vesperPr);
  assert.deepEqual(applyReviewedAdventVespers(fixed), fixed);
});

test('every restored Belarusian field is verbatim from its recorded original source', () => {
  for (const fields of Object.values(reviewed.documents)) {
    for (const { value, source: origin } of Object.values(fields)) {
      assert.equal(value, source.daysById.get(origin.document)[origin.field], `${origin.document}.${origin.field}`);
    }
  }
});

test('offline migration plan backs up originals, refuses drift and is idempotent after publication', () => {
  const entries = Object.keys(reviewed.documents).map((id) => ({ id, data: source.daysById.get(id) }));
  const plan = planAdventVespers(entries);
  assert.equal(plan.changes.length, 2);
  assert.equal(plan.changes.reduce((n, doc) => n + Object.keys(doc.fields).length, 0), 13);
  assert.deepEqual(plan.conflicts, []);
  assert.equal(plan.writes, 0);
  assert.equal(Boolean(plan.productionReady), false, 'bundle has no live updateTime');
  assert.deepEqual(plan.backup.map((doc) => doc.data), entries.map((doc) => doc.data));
  assert.equal(documentHash({ a: 1, b: 2 }), documentHash({ b: 2, a: 1 }));
  const changed = structuredClone(entries);
  changed[0].data.vesperPr = 'independent editor changed this';
  assert.ok(planAdventVespers(changed).conflicts.some((item) => item.field === 'vesperPr'));
  const published = entries.map((entry) => ({ ...entry, data: applyReviewedAdventVespers(entry.data) }));
  assert.deepEqual(planAdventVespers(published).changes, []);
});
