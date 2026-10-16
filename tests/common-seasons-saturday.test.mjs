/**
 * D-2 (owner decision): the optional Saturday memorial of the Blessed Virgin Mary strictly by the rubrics.
 *  - the CALENDAR offers it only on Saturdays of Ordinary Time without an obligatory memorial (candidates.js / display.js);
 *  - the TEXTS of the Marian Common: the stored fields merge the main section of Volume III with the Saturday section;
 *    every celebration of the Common except the Saturday memorial itself shows the main section only (`_mainSection`),
 *    the Saturday memorial shows the whole stored field, nothing is deleted from the storage.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRuntimeDay } from '../src/utils/ordo/runtime.js';
import { assembleOffice } from '../src/utils/ordo/officeAssembly.js';
import { OFFICE_TEXT_FIELDS } from '../src/constants/officeFields.js';
import { htmlToPlain } from '../scripts/liturgy/common-seasons/lib/html.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES = new Map(fs.readdirSync(path.join(ROOT, 'patchs', 'db-templates')).filter((n) => n.endsWith('.json')).map((name) => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'patchs', 'db-templates', name), 'utf8'));
  return [data._id, data];
}));
const COMMON = JSON.parse(fs.readFileSync(path.join(ROOT, 'patchs', 'feasts', 'common-texts', 'blessed-virgin-mary.json'), 'utf8'));
const plain = (value) => htmlToPlain(Array.isArray(value) ? value.join('\n') : String(value || '')).replace(/\s+/g, ' ').trim();
const currentDay = Object.fromEntries(OFFICE_TEXT_FIELDS.map((field) => [field, `<p>day:${field}</p>`]));
const SPLIT = ['invitatoriumAnt', 'officeOfReadingsHymn', 'officeOfReadingsR2', 'laudesHymn', 'laudesR', 'laudesAntBen', 'laudesInter', 'laudesPr'];
const SAT_HEADING = /УСПАМІН НАЙСВ\. ПАННЫ МАРЫІ Ў СУБОТУ/;

const offices = (iso, diocese = 'minsk-mohilev') => {
  const day = resolveRuntimeDay(iso, { diocese });
  return { day, all: [day.officeResolution.primary, ...day.officeResolution.alternatives] };
};
const assemble = (iso, optionId, proper, choice) => {
  const { day, all } = offices(iso);
  const office = all.find((o) => o.optionId === optionId);
  assert.ok(office, `${iso} offers ${optionId}`);
  return assembleOffice({
    proper: { _schema: 2, _celebrationId: optionId, _templates: ['blessed-virgin-mary'], _defaultTemplate: 'blessed-virgin-mary', _rank: 'memoria-ad-libitum', ...proper },
    office, templates: TEMPLATES, currentDay, choice, season: { period: day.period, periodPhase: day.periodPhase },
  });
};

test('calendar: the Saturday memorial is offered on free Saturdays of Ordinary Time only, never in the other seasons or against an obligatory memorial', () => {
  const offered = (iso) => offices(iso).all.some((o) => o.optionId === 'saturday-blessed-virgin-mary');
  ['2026-02-07', '2026-05-30', '2026-10-24', '2026-11-07'].forEach((iso) => assert.equal(offered(iso), true, iso));
  // Advent, Christmas, Lent, Holy Saturday, Easter
  ['2026-12-05', '2026-12-12', '2026-12-19', '2026-01-03', '2026-02-21', '2026-03-28', '2026-04-04', '2026-04-18', '2026-05-16'].forEach((iso) => assert.equal(offered(iso), false, iso));
  // an obligatory memorial (St Ignatius of Antioch) and a solemnity (Assumption) of Ordinary Time
  ['2026-10-17', '2026-08-15'].forEach((iso) => assert.equal(offered(iso), false, iso));
  // all four dioceses give the same answer on a free Saturday
  ['minsk-mohilev', 'grodno', 'pinsk', 'vitebsk'].forEach((diocese) => assert.equal(offices('2026-10-24', diocese).all.some((o) => o.optionId === 'saturday-blessed-virgin-mary'), true, diocese));
});

test('storage: the Saturday section stays in the stored fields (nothing is deleted); _mainSection is the prefix that Volume III prints as the main section', () => {
  assert.deepEqual(Object.keys(COMMON._mainSection).sort(), [...SPLIT].sort());
  SPLIT.forEach((field) => {
    const merged = plain(COMMON[field]);
    const main = plain(COMMON._mainSection[field]);
    assert.ok(merged.startsWith(main.slice(0, 80)), `${field}: the main section is the beginning of the stored field`);
    assert.ok(main.length < merged.length, `${field}: the stored field is longer than its main section`);
    assert.doesNotMatch(main, SAT_HEADING, field);
  });
  // independent expectations typed from Volume III (lines 1285 ff.), not computed by the splitter
  assert.match(plain(COMMON.invitatoriumAnt), SAT_HEADING);
  assert.equal(plain(COMMON._mainSection.invitatoriumAnt), 'Ант. Хадземце, паклонімся Хрысту, / Сыну Марыі. Або: Адзначаючы свята Найсвяцейшай Панны Марыі, / заспяваем Пану.');
  assert.match(plain(COMMON.invitatoriumAnt), /Адзначаючы ўспамін Найсвяцейшай Панны Марыі, \/ праславім Пана/);
  assert.doesNotMatch(plain(COMMON._mainSection.invitatoriumAnt), /ўспамін Найсвяцейшай/);
  assert.equal(plain(COMMON._mainSection.laudesAntBen), 'Ант. да песні Захарыі: Брамы раю праз Еву былі зачынены для ўсіх, * а праз Дзеву Марыю яны для ўсіх расчыніліся.');
  assert.match(plain(COMMON.laudesAntBen), /1\. Адзначаем успамін Найсвяцейшай Дзевы Марыі/);
  assert.doesNotMatch(plain(COMMON._mainSection.laudesAntBen), /Адзначаем успамін/);
  // the main hymn of the Office of Readings: one hymn; the Saturday section and its alternatives follow in the stored field
  assert.match(plain(COMMON._mainSection.officeOfReadingsHymn), /^Таго, хто ў Тройцы валадарыць/);
  assert.doesNotMatch(plain(COMMON._mainSection.officeOfReadingsHymn), /О Дзева, Маці і Дачка/);
  assert.match(plain(COMMON.officeOfReadingsHymn), /О Дзева, Маці і Дачка/);
});

test('assembly: a Marian celebration of Ordinary Time shows the main section only; the Saturday memorial shows the whole field', () => {
  const feast = assemble('2026-08-15', 'assumption-blessed-virgin-mary', { _rank: 'sollemnitas' });
  SPLIT.forEach((field) => {
    assert.equal(feast.day[field], COMMON._mainSection[field], `Assumption: ${field}`);
    assert.doesNotMatch(plain(feast.day[field]), SAT_HEADING);
  });
  assert.deepEqual([...feast.mainSection.fields].sort(), [...SPLIT].sort());
  assert.equal(feast.mainSection.saturdaySection, false);
  // fields that are not split keep their text
  assert.equal(feast.day.vesper1Hymn, COMMON.vesper1Hymn);

  // a memorial offers «З дня» first; the Common is the other choice
  const saturday = assemble('2026-10-24', 'saturday-blessed-virgin-mary', {}, 'blessed-virgin-mary');
  SPLIT.forEach((field) => assert.equal(saturday.day[field], COMMON[field], `Saturday memorial: ${field}`));
  assert.match(plain(saturday.day.invitatoriumAnt), SAT_HEADING);
  assert.equal(saturday.mainSection.saturdaySection, true);
  assert.deepEqual(saturday.mainSection.fields, []);

  // the own text of a celebration still wins over both
  const own = assemble('2026-08-15', 'assumption-blessed-virgin-mary', { laudesHymn: '<p>OWN</p>' });
  assert.equal(own.day.laudesHymn, '<p>OWN</p>');
});

test('seasons: a Marian celebration of Advent / Lent / Easter uses the season\'s volume text, never the Saturday section; the Saturday memorial is not offered there', () => {
  // 2026-12-08 Immaculate Conception (Advent): the seasonal variants of Volume I are the main section already
  const { day, all } = offices('2026-12-08');
  const immaculate = all.find((o) => /immaculate/.test(o.optionId));
  assert.ok(immaculate, 'Immaculate Conception is an Office option');
  const proper = { _schema: 2, _celebrationId: immaculate.optionId, _templates: ['blessed-virgin-mary'], _defaultTemplate: 'blessed-virgin-mary', _rank: 'sollemnitas' };
  const advent = assembleOffice({ proper, office: immaculate, templates: TEMPLATES, currentDay, season: { period: day.period, periodPhase: day.periodPhase } });
  SPLIT.forEach((field) => {
    assert.doesNotMatch(plain(advent.day[field]), SAT_HEADING, field);
    assert.ok(plain(advent.day[field]).length > 10, field);
  });
  // a field that has an Advent variant is the variant (not the main section of Volume III); a field that has none falls to the main section
  Object.keys(TEMPLATES.get('blessed-virgin-mary')._seasonalVariants.advent).filter((f) => SPLIT.includes(f)).forEach((field) => {
    assert.deepEqual(advent.day[field], TEMPLATES.get('blessed-virgin-mary')._seasonalVariants.advent[field], field);
  });
  SPLIT.filter((f) => !(f in TEMPLATES.get('blessed-virgin-mary')._seasonalVariants.advent)).forEach((field) => assert.equal(advent.day[field], COMMON._mainSection[field], field));
});
