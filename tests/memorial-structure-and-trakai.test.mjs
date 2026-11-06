/**
 * Owner decisions (Nov 2026):
 *  1. Te Deum and the festive structure belong to real feasts/solemnities only (GILH 68, 234-239);
 *     choosing a Common for a memorial never turns it into a feast.
 *  2. Our Lady of Trakai (Grodno): 5 July, `memoria`; 10 July is no longer a celebration of the diocese.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLiturgicalDate } from '../src/utils/ordo/index.js';
import { selectFixedDocuments } from '../src/utils/ordo/runtime.js';
import { CURRENT_DAY_CHOICE, assembleOffice, assemblyChoices } from '../src/utils/ordo/officeAssembly.js';
import { FIRST_VESPER_FIELDS, OFFICE_FIELD_SLOTS, OFFICE_TEXT_FIELDS, TE_DEUM_FIELD } from '../src/constants/officeFields.js';
import { shouldShowTeDeum } from '../src/utils/liturgicalOffice.js';
import { fixedCalendar } from '../src/constants/fixedCalendar.js';
import { DIOCESAN_LAYERS } from '../src/data/ordo/layers.js';
import { FIXED_IDENTITIES } from '../src/data/ordo/fixed-identities.js';
import { templatesFixture } from './helpers/ordo-days-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FEASTS = fs.readdirSync(path.join(ROOT, 'patchs/db-feasts')).filter((name) => name.endsWith('.json'))
  .map((name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'patchs/db-feasts', name), 'utf8')));
const feast = (id) => FEASTS.find((item) => item._id === id);
const TEMPLATES = templatesFixture();
const currentDay = Object.fromEntries(OFFICE_TEXT_FIELDS.map((field) => [field, `day:${field}`]));
const MAIN_HOURS = ['lauds', 'vespers', 'officeOfReadings'];
const optionOf = (date, id, diocese = 'minsk-mohilev') => {
  const { officeResolution } = resolveLiturgicalDate(date, { diocese });
  return [officeResolution.primary, ...officeResolution.alternatives].find((item) => item.optionId === id);
};
const optionIds = (date, diocese) => {
  const { officeResolution } = resolveLiturgicalDate(date, { diocese });
  return [officeResolution.primary, ...officeResolution.alternatives].map((item) => item.optionId);
};

/** The invariants of a memorial, whatever Common was selected. */
function assertMemorialStructure(proper, office, choice, label) {
  const { day, provenance } = assembleOffice({ proper, office, templates: TEMPLATES, choice, currentDay });
  assert.ok(!day[TE_DEUM_FIELD], `${label}: Te Deum flag`);
  assert.equal(shouldShowTeDeum({ ...day, _ordo: { teDeum: office.teDeum } }), false, `${label}: Te Deum`);
  assert.ok(FIRST_VESPER_FIELDS.every((field) => !(field in day)), `${label}: no I Vespers`);
  assert.equal(day._rank, proper._rank, `${label}: rank unchanged`);
  for (const field of OFFICE_TEXT_FIELDS) {
    const [hour, component] = OFFICE_FIELD_SLOTS[field];
    if (!MAIN_HOURS.includes(hour) || proper[field] || proper._fieldRules?.[field]) continue;
    const slot = office.hours[hour][component];
    if (slot.choice) continue; // hymn, short reading, canticle antiphon, intercessions: day or Common
    if (field === 'officeOfReadingsR2' || /Pr$/.test(field)) continue;
    // psalms, their antiphons, versicle and the FIRST reading with its responsory: weekday
    assert.equal(day[field], currentDay[field], `${label}: ${field} is of the weekday`);
    assert.equal(provenance[field], CURRENT_DAY_CHOICE, `${label}: ${field} provenance`);
  }
  return day;
}

test('memoria and memoria-ad-libitum × Proper/Common: never a festive structure (GILH 235-238)', () => {
  const cases = [
    ['2026-10-19', 'sv-paul-of-cross', 'optional-memorial', 'minsk-mohilev'],
    ['2026-10-01', 'sv-teresa-lisieux', 'memorial', 'minsk-mohilev'],
    ['2027-07-05', 'our-lady-trakai', 'memorial', 'grodno'],
  ];
  for (const [date, id, kind, diocese] of cases) {
    const office = optionOf(date, id, diocese);
    assert.equal(office.officeKind, kind, `${date} ${id}`);
    const proper = feast(Object.values(FIXED_IDENTITIES).find((item) => item.id === id).dayIds[0]);
    for (const choice of assemblyChoices(proper, office)) assertMemorialStructure(proper, office, choice, `${date} ${id} ${choice}`);
  }
});

test('every memorial of 2026-2027 keeps the weekday structure for each selectable Common', () => {
  let checked = 0;
  for (const diocese of ['minsk-mohilev', 'grodno', 'pinsk', 'vitebsk']) {
    for (let day = new Date(Date.UTC(2026, 0, 1)); day < new Date(Date.UTC(2028, 0, 1)); day = new Date(day.getTime() + 864e5)) {
      const date = day.toISOString().slice(0, 10);
      const { officeResolution } = resolveLiturgicalDate(date, { diocese });
      for (const office of [officeResolution.primary, ...officeResolution.alternatives]) {
        if (!['memorial', 'optional-memorial'].includes(office.officeKind)) continue;
        const dayIds = office.sources?.proper?.dayIds || [];
        const proper = dayIds.map(feast).find(Boolean);
        if (!proper || !proper._templates?.length) continue;
        for (const choice of assemblyChoices(proper, office).filter((item) => item !== CURRENT_DAY_CHOICE)) {
          assertMemorialStructure(proper, office, choice, `${date} ${diocese} ${office.optionId} ${choice}`);
          checked += 1;
        }
      }
    }
  }
  assert.ok(checked > 300, `only ${checked} memorial/Common combinations checked`);
});

test('real feasts and solemnities keep Te Deum and the festive structure', () => {
  const lateran = optionOf('2026-11-09', 'dedication-lateran-basilica');
  assert.equal(lateran.officeKind, 'feast');
  assert.equal(lateran.teDeum, true);
  const proper = feast('09-11-dedication-lateran-basilica');
  const { day } = assembleOffice({ proper, office: lateran, templates: TEMPLATES, currentDay });
  assert.equal(day[TE_DEUM_FIELD], true);
  assert.equal(shouldShowTeDeum({ ...day, _ordo: { teDeum: lateran.teDeum } }), true);
  const solemnity = resolveLiturgicalDate('2026-08-15', { diocese: 'minsk-mohilev' }).officeResolution.primary;
  assert.equal(solemnity.officeKind, 'solemnity');
  assert.equal(solemnity.teDeum, true);
});

test('Trakai: the canonical calendar source says 05.07, memoria; 10.07 is gone', () => {
  const entries = fixedCalendar.filter((item) => /Тракельск/.test(item.title));
  assert.deepEqual(entries.map((item) => [item.date, item.rank, item.place]), [['05.07', 'Успамін', 'Гродзенская дыяцэзія']]);
  const layer = [...DIOCESAN_LAYERS.grodno.add, ...DIOCESAN_LAYERS.grodno.modify];
  assert.ok(!layer.some((item) => item.id === 'our-lady-trakai' && (item.mmdd === '07-10' || item.rank === 'festum')));
  const definitions = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ordo/calendar-definitions.json'), 'utf8'));
  const trakai = [...definitions.celebrations, ...definitions.dioceseOverrides].filter((item) => item.celebrationId === 'our-lady-trakai');
  assert.equal(trakai.length, 1, 'one definition, in the Grodno overrides');
  const [item] = trakai;
  assert.equal(item.dioceseId, 'grodno');
  assert.equal(item.rank, 'memoria');
  assert.deepEqual([item.dateRule.month, item.dateRule.day], [7, 5]);
  assert.equal(item.daysRef._rank, 'memoria');
  assert.deepEqual(item.daysRef.dayIds, ['05-07-our-lady-trakai-grodno']);
});

test('Trakai: exactly one active Proper — the obsolete memoria-ad-libitum variant is never offered', () => {
  const grodno = FEASTS.filter((item) => item._celebrationId === 'our-lady-trakai' && item._place === 'grodno');
  const active = grodno.filter((item) => item._obsolete !== true);
  assert.deepEqual(active.map((item) => [item._id, item._date, item._rank, item._place]), [['05-07-our-lady-trakai-grodno', '05.07', 'memoria', 'grodno']]);
  const retired = grodno.find((item) => item._id === '05-07-our-lady-trakai-grodno-memoria-ad-libitum');
  assert.equal(retired._obsolete, true);
  assert.deepEqual(retired._supersededBy, ['05-07-our-lady-trakai-grodno']);
  // The two documents differ only in id, rank and the retirement markers: no text was changed.
  const strip = ({ _id, _rank, _obsolete, _obsoleteReason, _supersededBy, ...rest }) => rest;
  assert.deepEqual(strip(retired), strip(active[0]));
});

test('Trakai: document choice does not depend on the order of the bundle or on publication state', () => {
  const sanctuary = feast('05-07-our-lady-trakai-sanctuary');
  const published = [feast('05-07-our-lady-trakai-grodno'), feast('05-07-our-lady-trakai-grodno-memoria-ad-libitum'), sanctuary]
    .map((doc) => ({ ...doc, id: doc._id }));
  // Production still holds the retired variant WITHOUT the `_obsolete` mark until the owner publishes it.
  const unmarked = published.map(({ _obsolete, _obsoleteReason, _supersededBy, ...rest }) => rest);
  for (const docs of [published, unmarked]) {
    for (const order of [docs, [...docs].reverse(), [docs[1], docs[2], docs[0]]]) {
      const option = resolveLiturgicalDate('2027-07-05', { diocese: 'grodno' }).candidates.find((item) => item.id === 'our-lady-trakai');
      const selected = selectFixedDocuments(option, order, { diocese: 'grodno' });
      assert.deepEqual(selected.map((doc) => doc.id), ['05-07-our-lady-trakai-grodno']);
    }
  }
});

test('Trakai: 2025-2035 — Grodno only, one memoria card on 5 July (Sunday keeps priority), nothing on 10 July', () => {
  for (let year = 2025; year <= 2035; year += 1) {
    const grodno = resolveLiturgicalDate(`${year}-07-05`, { diocese: 'grodno' });
    const all = [grodno.officeResolution.primary, ...grodno.officeResolution.alternatives];
    const cards = all.filter((item) => item.optionId === 'our-lady-trakai');
    const sunday = new Date(`${year}-07-05T12:00:00Z`).getUTCDay() === 0;
    if (sunday) {
      assert.equal(cards.length, 0, `${year}: the Sunday is not displaced by a memorial`);
      assert.equal(grodno.officeResolution.primary.officeKind, 'sunday', `${year}`);
    } else {
      assert.equal(cards.length, 1, `${year}: one card`);
      assert.equal(cards[0].officeKind, 'memorial', `${year}: obligatory memorial`);
      assert.equal(grodno.candidates.find((item) => item.id === 'our-lady-trakai').rank, 'memoria', `${year}: rank`);
    }
    assert.ok(!optionIds(`${year}-07-10`, 'grodno').includes('our-lady-trakai'), `${year}-07-10`);
    for (const diocese of ['minsk-mohilev', 'pinsk', 'vitebsk']) {
      assert.ok(!optionIds(`${year}-07-05`, diocese).includes('our-lady-trakai'), `${year} ${diocese}`);
      assert.ok(!optionIds(`${year}-07-10`, diocese).includes('our-lady-trakai'), `${year} ${diocese} 10.07`);
    }
  }
  const monday = optionIds('2027-07-05', 'grodno');
  assert.equal(monday[0], 'our-lady-trakai', 'the obligatory memorial leads and displaces the optional Zaccaria');
  assert.ok(!monday.includes('sv-anthony-mary-zaccaria'));
});

test('Trakai memorial uses the Marian Common without a festive structure', () => {
  const office = optionOf('2027-07-05', 'our-lady-trakai', 'grodno');
  assert.equal(office.teDeum, false);
  const proper = feast('05-07-our-lady-trakai-grodno');
  const day = assertMemorialStructure(proper, office, 'blessed-virgin-mary', 'trakai');
  assert.equal(day.laudesPr, proper.officeOfReadingsPr, 'own prayer at Lauds');
  assert.equal(day.vesperPr, proper.officeOfReadingsPr, 'own prayer at Vespers');
});
